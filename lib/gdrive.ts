import { createSign } from "crypto";

/**
 * Google Drive uploads via a service account (host request 2026-07-21:
 * upload from the signage editor straight into the Drive media folder).
 *
 * The read side (lib/screensavers.ts) lists the folder with a plain API
 * key, but API keys cannot write — Drive uploads need OAuth. A service
 * account is the no-user-consent way: Devin creates one in the same GCP
 * project, pastes its key JSON into GOOGLE_SERVICE_ACCOUNT_JSON (or the
 * split GDRIVE_SA_EMAIL / GDRIVE_SA_KEY vars), and shares the media
 * folder with the service-account email as Editor. Uploaded files inherit
 * the folder's "anyone with the link" viewer permission, so TVs can
 * hotlink them exactly like hand-dropped files.
 *
 * Vercel routes cap request bodies at ~4.5 MB, so the server never
 * proxies file bytes: it initiates a Drive resumable-upload session and
 * hands the session URL to the browser, which PUTs the file directly to
 * googleapis.com (their upload endpoints are CORS-enabled for this).
 *
 * No googleapis dependency — the JWT grant is ~20 lines of node crypto.
 */

type ServiceAccount = { email: string; key: string };

function serviceAccount(): ServiceAccount | null {
  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (json) {
    try {
      const parsed = JSON.parse(json) as {
        client_email?: string;
        private_key?: string;
      };
      if (parsed.client_email && parsed.private_key) {
        return { email: parsed.client_email, key: parsed.private_key };
      }
    } catch {
      // malformed env — fall through to the split vars
    }
  }
  const email = process.env.GDRIVE_SA_EMAIL;
  // Vercel env editors often store PEMs with literal \n — un-escape.
  const key = process.env.GDRIVE_SA_KEY?.replace(/\\n/g, "\n");
  return email && key ? { email, key } : null;
}

export function driveUploadConfigured(): boolean {
  return Boolean(serviceAccount() && process.env.GDRIVE_MEDIA_FOLDER_ID);
}

/** Access token via the JWT bearer grant, memoized until near expiry. */
let tokenCache: { token: string; expiresAt: number } | null = null;

async function accessToken(sa: ServiceAccount): Promise<string | null> {
  if (tokenCache && Date.now() < tokenCache.expiresAt) {
    return tokenCache.token;
  }
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o: object) =>
    Buffer.from(JSON.stringify(o)).toString("base64url");
  const input = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({
    iss: sa.email,
    scope: "https://www.googleapis.com/auth/drive",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  })}`;
  let assertion: string;
  try {
    const signature = createSign("RSA-SHA256")
      .update(input)
      .sign(sa.key)
      .toString("base64url");
    assertion = `${input}.${signature}`;
  } catch {
    return null; // malformed private key
  }
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { access_token?: string };
    if (!data.access_token) return null;
    tokenCache = {
      token: data.access_token,
      expiresAt: Date.now() + 50 * 60_000,
    };
    return data.access_token;
  } catch {
    return null;
  }
}

/**
 * Start a resumable upload into the media folder and return the session
 * URL the browser PUTs the bytes to. The final PUT's response is the
 * Drive file resource (id, mimeType) — the client builds the hotlink URL
 * from it, matching lib/screensavers.ts exactly so refreshes don't dupe.
 */
export async function createDriveUploadSession(
  name: string,
  mimeType: string,
  size: number
): Promise<{ uploadUrl: string } | { error: string }> {
  const sa = serviceAccount();
  const folder = process.env.GDRIVE_MEDIA_FOLDER_ID;
  if (!sa || !folder) return { error: "drive-not-configured" };
  const token = await accessToken(sa);
  if (!token) return { error: "drive-auth-failed" };
  try {
    const res = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "content-type": "application/json; charset=UTF-8",
          "x-upload-content-type": mimeType,
          "x-upload-content-length": String(size),
        },
        body: JSON.stringify({ name, parents: [folder] }),
        signal: AbortSignal.timeout(8000),
      }
    );
    const uploadUrl = res.headers.get("location");
    if (!res.ok || !uploadUrl) {
      // 403/404 usually means the folder isn't shared with the SA email
      return { error: `drive-session-${res.status}` };
    }
    return { uploadUrl };
  } catch {
    return { error: "drive-network" };
  }
}
