import { TV_STATE_SECRET_STORAGE_KEY } from "./tv-state-secret-keys.ts";

export function readTvStateSecret(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(TV_STATE_SECRET_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function persistTvStateSecret(secret: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(TV_STATE_SECRET_STORAGE_KEY, secret);
  } catch {
    /* storage blocked */
  }
}

export function tvStateSecretHeaders(): HeadersInit {
  const secret = readTvStateSecret();
  if (!secret) return {};
  return { "x-tv-state-secret": secret };
}