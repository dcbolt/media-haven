/**
 * Vercel Blob credentials. The FH store ("media-haven-screensaver-1") was
 * connected with the custom env prefix DUNES and WITHOUT the optional
 * read-write token (Vercel's newer OIDC-style connection), so the project
 * only carries DUNES_STORE_ID — no token under any name until the
 * "Add a read-write token" reconnect lands (board #113).
 *
 * Server-side SDK calls (list/put) authenticate fine with OIDC when given
 * the store id; client-upload token minting (handleUpload) works only with
 * a real read-write token. Hence both helpers.
 */
export function blobToken(): string | undefined {
  return (
    process.env.BLOB_READ_WRITE_TOKEN ||
    process.env.DUNES_READ_WRITE_TOKEN ||
    undefined
  );
}

/** Store id for OIDC-authenticated server SDK calls (list/put). */
export function blobStoreId(): string | undefined {
  return process.env.BLOB_STORE_ID || process.env.DUNES_STORE_ID || undefined;
}

/** True when any blob auth path exists (token or OIDC store id). */
export function blobConfigured(): boolean {
  return Boolean(blobToken() || blobStoreId());
}
