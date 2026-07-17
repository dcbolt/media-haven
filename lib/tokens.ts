import { randomBytes } from "crypto";
import { supabaseAdmin } from "./supabase";

/**
 * Guest token minting. Tokens are short, unguessable, URL-safe codes that
 * resolve to a reservation (see lib/reservations.ts for the read side).
 * Expiry is checkout + 24h grace so the portal keeps working while guests
 * pack up, then the link dies on its own even if the webhook never fires.
 */

export interface MintedToken {
  token: string;
  url: string;
  expiresAt: string;
}

/**
 * Public site origin for guest QR links and emails.
 * Prefer an explicit production URL — never fall back to a per-deploy
 * VERCEL_URL first, or host Google OAuth / QR codes point at ephemeral
 * preview hosts (seen live on lilac: redirect_to=*qbtip7mq5*).
 */
export function portalBaseUrl(): string {
  const explicit =
    process.env.NEXT_PUBLIC_PORTAL_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  // Stable production hostname on Vercel (not the deployment subdomain).
  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (prod) return `https://${prod.replace(/^https?:\/\//, "")}`;
  const deploy = process.env.VERCEL_URL?.trim();
  if (deploy) return `https://${deploy.replace(/^https?:\/\//, "")}`;
  return "http://localhost:3000";
}

/** Origin of the *current* request (lilac / preview / localhost). Use for
 *  OAuth redirect_to so the callback returns to the host the user opened. */
export async function requestOrigin(): Promise<string> {
  try {
    const { headers } = await import("next/headers");
    const h = await headers();
    const host = h.get("x-forwarded-host") || h.get("host");
    if (host) {
      const proto =
        h.get("x-forwarded-proto") ||
        (host.includes("localhost") || host.startsWith("127.") ? "http" : "https");
      return `${proto}://${host}`.replace(/\/$/, "");
    }
  } catch {
    // outside a request (build, cron) — fall through
  }
  return portalBaseUrl();
}

function generateToken(): string {
  // 9 bytes → 12 base64url chars: unguessable, short enough for a clean QR.
  return randomBytes(9).toString("base64url");
}

/** Idempotent mint: returns the reservation's existing live token if one
 *  exists, otherwise mints. Used by webhook/sync so every reservation has a
 *  guest link with zero host clicks. */
export async function ensureGuestToken(
  reservationId: string,
  checkOut: string
): Promise<MintedToken | null> {
  const db = supabaseAdmin();
  if (!db) return null;
  const { data: existing } = await db
    .from("guest_tokens")
    .select("token, expires_at")
    .eq("reservation_id", reservationId)
    .gt("expires_at", new Date().toISOString())
    .limit(1)
    .maybeSingle();
  if (existing) {
    return {
      token: existing.token,
      url: `${portalBaseUrl()}/welcome?token=${existing.token}`,
      expiresAt: existing.expires_at,
    };
  }
  return mintGuestToken(reservationId, checkOut);
}

export async function mintGuestToken(
  reservationId: string,
  checkOut: string
): Promise<MintedToken> {
  const token = generateToken();
  const expiresAt = new Date(new Date(checkOut).getTime() + 24 * 3600_000).toISOString();

  const db = supabaseAdmin();
  if (db) {
    const { error } = await db.from("guest_tokens").insert({
      token,
      reservation_id: reservationId,
      expires_at: expiresAt,
    });
    if (error) throw new Error(`token insert failed: ${error.message}`);
  }
  // Without Supabase configured (mock mode) the token isn't persisted; the
  // dashboard labels it as a demo mint so it can't be mistaken for real.

  return { token, url: `${portalBaseUrl()}/welcome?token=${token}`, expiresAt };
}
