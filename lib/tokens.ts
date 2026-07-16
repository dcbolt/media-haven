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

export function portalBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_PORTAL_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
  );
}

function generateToken(): string {
  // 9 bytes → 12 base64url chars: unguessable, short enough for a clean QR.
  return randomBytes(9).toString("base64url");
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
