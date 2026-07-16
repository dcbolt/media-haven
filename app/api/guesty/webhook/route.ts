import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * Guesty webhook receiver. Register this URL in Guesty → Integrations →
 * Webhooks with the shared secret from GUESTY_WEBHOOK_SECRET.
 *
 * On check-out we revoke the stay's guest tokens and purge cached reservation
 * data. Scope honesty: this clears PORTAL data only. TV app logins
 * (Netflix on the Roku, etc.) are outside any web app's reach — that wipe is
 * Roku Guest Mode's job, configured on the device.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.GUESTY_WEBHOOK_SECRET;
  if (!secret || req.headers.get("x-webhook-secret") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const payload = (await req.json()) as {
    event?: string;
    reservation?: { _id?: string; status?: string };
  };

  const reservationGuestyId = payload.reservation?._id;
  if (!reservationGuestyId) {
    return NextResponse.json({ error: "missing reservation id" }, { status: 400 });
  }

  const db = supabaseAdmin();
  if (!db) {
    return NextResponse.json({ error: "storage not configured" }, { status: 503 });
  }

  const isCheckout =
    payload.event === "reservation.checked_out" ||
    payload.reservation?.status === "checked_out";

  if (isCheckout) {
    const { data: reservation } = await db
      .from("reservations")
      .select("id")
      .eq("guesty_id", reservationGuestyId)
      .maybeSingle();

    if (reservation) {
      await db.from("guest_tokens").delete().eq("reservation_id", reservation.id);
      await db
        .from("reservations")
        .update({ status: "checked_out" })
        .eq("id", reservation.id);
    }
  }

  return NextResponse.json({ ok: true });
}
