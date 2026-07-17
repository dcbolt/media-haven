import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getListings, getUpcomingReservations, guestyConfigured } from "@/lib/guesty";
import { isHostAuthenticated, verifyAccessCode } from "@/lib/host-auth";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * Read-only Guesty connection diagnostics. Reports configuration flags,
 * token-cache state, and listing/reservation counts + titles — never
 * credentials or tokens. Uses the shared cached OAuth token (max ~1 mint/day)
 * so polling this cannot burn Guesty's 5-mints/24h budget.
 *
 * Auth: host session cookie OR ?code=<HOST_ACCESS_CODE> (lets external
 * monitors and cookie-less fetchers check health).
 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code") ?? "";
  const authed =
    (await isHostAuthenticated()) ||
    (code.length > 0 && (await verifyAccessCode(code)));
  if (!authed) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const db = supabaseAdmin();
  const health: Record<string, unknown> = {
    guestyConfigured: guestyConfigured(),
    supabaseConfigured: Boolean(db),
    wifiFieldIdsConfigured: Boolean(
      process.env.GUESTY_WIFI_SSID_FIELD_ID && process.env.GUESTY_WIFI_PASSWORD_FIELD_ID
    ),
    webhookSecretConfigured: Boolean(process.env.GUESTY_WEBHOOK_SECRET),
    dbUrlConfigured: Boolean(
      (process.env.SUPABASE_DB_URL || process.env.DATABASE_URL) &&
        !(process.env.SUPABASE_DB_URL || process.env.DATABASE_URL)!.includes(
          "[YOUR-PASSWORD]"
        )
    ),
  };

  if (db) {
    const { data } = await db
      .from("guesty_tokens")
      .select("expires_at, updated_at")
      .eq("id", 1)
      .maybeSingle();
    health.tokenCache = data
      ? { present: true, expiresAt: data.expires_at, mintedAt: data.updated_at }
      : { present: false };
    const { count: propCount } = await db
      .from("properties")
      .select("id", { count: "exact", head: true });
    const { count: resCount } = await db
      .from("reservations")
      .select("id", { count: "exact", head: true });
    health.db = { properties: propCount ?? 0, reservations: resCount ?? 0 };
  }

  try {
    const listings = await getListings();
    health.guestyListings = {
      count: listings.length,
      titles: listings.map((l) => l.title),
      mock: !guestyConfigured(),
    };
  } catch (err) {
    health.guestyListings = {
      error: err instanceof Error ? err.message.slice(0, 300) : "failed",
    };
  }

  try {
    const reservations = await getUpcomingReservations();
    health.guestyUpcomingReservations = {
      count: reservations.length,
      mock: !guestyConfigured(),
    };
  } catch (err) {
    health.guestyUpcomingReservations = {
      error: err instanceof Error ? err.message.slice(0, 300) : "failed",
    };
  }

  return NextResponse.json(health, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
