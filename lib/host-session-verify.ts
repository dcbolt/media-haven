import { createHmac, timingSafeEqual } from "crypto";

let cached: { value: string; at: number } | null = null;

async function accessCode(): Promise<string> {
  if (cached && Date.now() - cached.at < 60_000) return cached.value;
  cached = { value: (process.env.HOST_ACCESS_CODE || "demo").trim(), at: Date.now() };
  return cached.value;
}

async function sign(value: string): Promise<string> {
  return createHmac("sha256", `fh-host-${await accessCode()}`)
    .update(value)
    .digest("hex");
}

function b64url(s: string): string {
  return Buffer.from(s, "utf8").toString("base64url");
}
function fromB64url(s: string): string {
  try {
    return Buffer.from(s, "base64url").toString("utf8");
  } catch {
    return "";
  }
}

/** Verify a raw `fh_host` cookie value (HMAC). Forged names/values fail closed. */
export async function verifyHostSessionCookie(
  value: string | undefined
): Promise<boolean> {
  if (!value) return false;
  const dot = value.indexOf(".");
  if (dot <= 0) return false;
  const id = fromB64url(value.slice(0, dot));
  if (!id) return false;
  const expected = Buffer.from(await sign(`host-session-v1:${id}`));
  const given = Buffer.from(value.slice(dot + 1));
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export async function issueHostCookieForTests(identity: string): Promise<string> {
  const id = identity.trim().slice(0, 120) || "host";
  return `${b64url(id)}.${await sign(`host-session-v1:${id}`)}`;
}