import { createHmac, timingSafeEqual } from "crypto";

export type AuthorizeGuestInput = {
  clientMac: string;
  minutes: number;
  ssid: string | null;
  propertySlug: string;
};

export type AuthorizeGuestResult =
  | { ok: true; skipped?: boolean }
  | { ok: false; error: string };

/**
 * POST signed request to on-site Node authorizer (UniFi local API).
 * Contract: docs/WIFI-CAPTIVE-PORTAL.md
 */
export async function authorizeGuestOnNode(
  input: AuthorizeGuestInput
): Promise<AuthorizeGuestResult> {
  const url = process.env.NODE_AUTHORIZER_URL?.trim();
  const secret = process.env.NODE_AUTHORIZER_SECRET?.trim();
  if (!url || !secret) {
    return { ok: true, skipped: true };
  }

  const payload = {
    mac: input.clientMac,
    minutes: Math.max(1, Math.min(input.minutes, 7 * 24 * 60)),
    ssid: input.ssid,
    propertySlug: input.propertySlug,
  };
  const body = JSON.stringify(payload);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const sig = createHmac("sha256", secret)
    .update(`${timestamp}.${body}`, "utf8")
    .digest("hex");

  try {
    const res = await postAuthorizer(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Timestamp": timestamp,
        "X-Signature": sig,
      },
      body,
    });
    if (res.ok) return { ok: true };
    return { ok: false, error: `authorizer http ${res.status}` };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "authorizer unreachable",
    };
  }
}

/** Verify inbound HMAC (reference node service). */
export function verifyNodeAuthorizerSignature(
  secret: string,
  timestamp: string,
  body: string,
  signatureHex: string,
  maxSkewSec = 300
): boolean {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > maxSkewSec) return false;
  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${body}`, "utf8")
    .digest("hex");
  try {
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(signatureHex, "hex");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

let authorizerFetch: typeof fetch = (...args) => fetch(...args);

export function setAuthorizerFetchForTests(fn: typeof fetch): void {
  authorizerFetch = fn;
}

export function resetAuthorizerFetchForTests(): void {
  authorizerFetch = (...args) => fetch(...args);
}

/** Internal fetch hook for tests. */
export async function postAuthorizer(
  url: string,
  init: RequestInit
): Promise<Response> {
  return authorizerFetch(url, init);
}