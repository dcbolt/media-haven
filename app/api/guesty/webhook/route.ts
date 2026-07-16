import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { ensureGuestToken } from "@/lib/tokens";

/**
 * Guesty webhook receiver. Guesty delivers webhooks via Svix, which signs
 * each request (svix-id / svix-timestamp / svix-signature headers). Set
 * GUESTY_WEBHOOK_SECRET to the whsec_… signing secret from Guesty's
 * webhook settings (or their get-secret endpoint). An x-webhook-secret
 * header with the same value is accepted as a manual-testing fallback.
 *
 * On check-out we revoke the stay's guest tokens and purge cached reservation
 * data. Scope honesty: this clears PORTAL data only. TV app logins are
 * outside any web app's reach — clearing them is the host's turnover
 * checklist (DECISIONS.md), not software.
 */

const TIMESTAMP_TOLERANCE_S = 300; // reject replays older/newer than 5 min

function verifySvix(req: NextRequest, rawBody: string, secret: string): boolean {
  const id = req.headers.get("svix-id");
  const timestamp = req.headers.get("svix-timestamp");
  const signatures = req.headers.get("svix-signature");
  if (!id || !timestamp || !signatures) return false;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(Date.now() / 1000 - ts) > TIMESTAMP_TOLERANCE_S) return false;

  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest("base64");
  const expectedBuf = Buffer.from(expected);

  // Header holds space-separated versioned signatures: "v1,<base64> …"
  return signatures.split(" ").some((part) => {
    const sig = part.split(",")[1] ?? "";
    const sigBuf = Buffer.from(sig);
    return sigBuf.length === expectedBuf.length && timingSafeEqual(sigBuf, expectedBuf);
  });
}

export async function POST(req: NextRequest) {
  const secret = process.env.GUESTY_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const rawBody = await req.text();
  const manualOk = req.headers.get("x-webhook-secret") === secret;
  if (!manualOk && !verifySvix(req, rawBody, secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = JSON.parse(rawBody) as {
    event?: string;
    reservation?: {
      _id?: string;
      listingId?: string;
      status?: string;
      checkIn?: string;
      checkOut?: string;
      guest?: { firstName?: string; fullName?: string };
    };
  };

  const reservation = parsed.reservation;
  if (!reservation?._id) {
    return NextResponse.json({ error: "missing reservation id" }, { status: 400 });
  }

  const db = supabaseAdmin();
  if (!db) {
    return NextResponse.json({ error: "storage not configured" }, { status: 503 });
  }

  const isCheckout =
    parsed.event === "reservation.checked_out" ||
    reservation.status === "checked_out";

  if (isCheckout) {
    const { data: existing } = await db
      .from("reservations")
      .select("id")
      .eq("guesty_id", reservation._id)
      .maybeSingle();

    if (existing) {
      await db.from("guest_tokens").delete().eq("reservation_id", existing.id);
      await db
        .from("reservations")
        .update({ status: "checked_out", updated_at: new Date().toISOString() })
        .eq("id", existing.id);
    }
    return NextResponse.json({ ok: true, action: "checkout" });
  }

  // Everything else (created/updated/confirmed): upsert the reservation so
  // the TV welcome and host dashboard stay current without polling.
  if (reservation.listingId && reservation.checkIn && reservation.checkOut) {
    const { data: property } = await db
      .from("properties")
      .select("id")
      .eq("guesty_id", reservation.listingId)
      .maybeSingle();

    if (property) {
      const firstName =
        reservation.guest?.firstName ??
        reservation.guest?.fullName?.split(" ")[0] ??
        null;
      const { data: upserted } = await db
        .from("reservations")
        .upsert(
          {
            guesty_id: reservation._id,
            property_id: property.id,
            guest_first_name: firstName,
            check_in: reservation.checkIn,
            check_out: reservation.checkOut,
            status: reservation.status ?? "confirmed",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "guesty_id" }
        )
        .select("id")
        .maybeSingle();
      // Every reservation gets a guest link automatically — no host clicks.
      if (upserted) await ensureGuestToken(upserted.id, reservation.checkOut);
      return NextResponse.json({ ok: true, action: "upsert" });
    }
    return NextResponse.json({ ok: true, action: "unknown-listing" });
  }

  return NextResponse.json({ ok: true, action: "ignored" });
}
