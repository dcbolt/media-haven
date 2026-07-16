import { supabaseAdmin } from "./supabase";

/**
 * Guesty Open API client.
 *
 * Runs in mock mode until GUESTY_CLIENT_ID / GUESTY_CLIENT_SECRET are set, so
 * the portal works end-to-end before Open API access is approved. All Guesty
 * knowledge lives in this file — swapping mock → live touches nothing else.
 *
 * Token strategy: Guesty allows only 5 access-token requests per key per 24h
 * (tokens last ~24h). On serverless, minting a token per invocation would
 * exhaust that before lunch, so the token is cached in the guesty_tokens
 * table and shared across all invocations (~1 request/day).
 */

const GUESTY_OAUTH_URL = "https://open-api.guesty.com/oauth2/token";
const GUESTY_API_BASE = "https://open-api.guesty.com/v1";

export interface GuestyListing {
  _id: string;
  title: string;
  picture?: { thumbnail?: string; large?: string };
  address?: { full?: string; city?: string; state?: string };
}

export interface GuestyReservation {
  _id: string;
  listingId: string;
  status: string;
  checkIn: string; // ISO timestamp
  checkOut: string; // ISO timestamp
  guest: { fullName?: string; firstName?: string };
}

export function guestyConfigured(): boolean {
  return Boolean(process.env.GUESTY_CLIENT_ID && process.env.GUESTY_CLIENT_SECRET);
}

async function getAccessToken(): Promise<string> {
  const db = supabaseAdmin();

  if (db) {
    const { data } = await db
      .from("guesty_tokens")
      .select("access_token, expires_at")
      .eq("id", 1)
      .maybeSingle();
    if (data && new Date(data.expires_at) > new Date()) {
      return data.access_token;
    }
  }

  const res = await fetch(GUESTY_OAUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      scope: "open-api",
      client_id: process.env.GUESTY_CLIENT_ID!,
      client_secret: process.env.GUESTY_CLIENT_SECRET!,
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Guesty token request failed: ${res.status} ${await res.text()}`);
  }

  // Trust expires_in from the response — Guesty's docs contradict themselves
  // (86400 in the strategy guide, 3600 in the sample). 5-minute safety margin.
  const body = (await res.json()) as { access_token: string; expires_in: number };
  const expiresAt = new Date(Date.now() + (body.expires_in - 300) * 1000);

  if (db) {
    await db.from("guesty_tokens").upsert({
      id: 1,
      access_token: body.access_token,
      expires_at: expiresAt.toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  return body.access_token;
}

async function guestyFetch<T>(path: string): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(`${GUESTY_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Guesty API ${path} failed: ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Mock data — one realistic property + reservation so every flow is testable
// without credentials. Removed from responses the moment real creds exist.
// ---------------------------------------------------------------------------

export const MOCK_LISTING: GuestyListing = {
  _id: "mock-listing-1",
  title: "Turtle Tide Cottage",
  picture: { large: "/hero-placeholder.svg" },
  address: { full: "Melbourne Beach, FL", city: "Melbourne Beach", state: "FL" },
};

export const MOCK_RESERVATION: GuestyReservation = {
  _id: "mock-res-1",
  listingId: "mock-listing-1",
  status: "confirmed",
  checkIn: new Date(Date.now() - 86400_000).toISOString(),
  checkOut: new Date(Date.now() + 3 * 86400_000).toISOString(),
  guest: { fullName: "Alex Rivera", firstName: "Alex" },
};

export async function getListings(): Promise<GuestyListing[]> {
  if (!guestyConfigured()) return [MOCK_LISTING];
  const data = await guestyFetch<{ results: GuestyListing[] }>("/listings?limit=100");
  return data.results;
}

export async function getReservation(id: string): Promise<GuestyReservation> {
  if (!guestyConfigured()) return { ...MOCK_RESERVATION, _id: id };
  return guestyFetch<GuestyReservation>(`/reservations/${id}`);
}
