import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * Guesty webhook receiver. Register this URL in Guesty → Integrations →
 * Webhooks with the shared secret from GUESTY_WEBHOOK_SECRET.
 *
 * On check-out we revoke the stay's guest tokens and purge cached reservation
 * data. Scope honesty: this clears PORTAL data only. TV app logins are
 * outside any web app's reach — clearing them is the host's turnover
 * checklist (DECISIONS.md), not software.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.GUESTY_WEBHOOK_SECRET;
  if (!secret || req.headers.get("x-webhook-secret") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const payload = (await req.json()) as {
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

  const reservation = payload.reservation;
  if (!reservation?._id) {
    return NextResponse.json({ error: "missing reservation id" }, { status: 400 });
  }

  const db = supabaseAdmin();
  if (!db) {
    return NextResponse.json({ error: "storage not configured" }, { status: 503 });
  }

  const isCheckout =
    payload.event === "reservation.checked_out" ||
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
      await db.from("reservations").upsert(
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
      );
      return NextResponse.json({ ok: true, action: "upsert" });
    }
    return NextResponse.json({ ok: true, action: "unknown-listing" });
  }

  return NextResponse.json({ ok: true, action: "ignored" });
}
