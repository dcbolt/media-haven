import {
  TV_PICKUP_QUERY_PARAM,
  TV_STATE_PICKUP_HEADER,
} from "./tv-state-pickup-crypto.ts";

const PICKUP_SESSION_KEY = "fh_tv_state_pickup";

export function absorbPickupFromUrl(search: string): void {
  if (typeof window === "undefined") return;
  const token = new URLSearchParams(search).get(TV_PICKUP_QUERY_PARAM)?.trim();
  if (!token) return;
  try {
    sessionStorage.setItem(PICKUP_SESSION_KEY, token);
  } catch {
    /* private mode */
  }
}

export function readTvStatePickupToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem(PICKUP_SESSION_KEY);
  } catch {
    return null;
  }
}

export function clearTvStatePickupToken(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(PICKUP_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export function tvStatePickupHeaders(): HeadersInit {
  const token = readTvStatePickupToken();
  if (!token) return {};
  return { [TV_STATE_PICKUP_HEADER]: token };
}