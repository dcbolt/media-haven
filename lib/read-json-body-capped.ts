/**
 * Read request body with a hard byte cap (before JSON.parse).
 */

export type ReadBodyResult =
  | { ok: true; text: string; byteLength: number }
  | { ok: false; status: 413 };

export async function readRequestBodyCapped(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
  contentLengthHeader: string | null
): Promise<ReadBodyResult> {
  const declared = contentLengthHeader ? Number(contentLengthHeader) : NaN;
  if (Number.isFinite(declared) && declared > maxBytes) {
    return { ok: false, status: 413 };
  }
  if (!body) {
    return { ok: true, text: "", byteLength: 0 };
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value?.length) continue;
    total += value.length;
    if (total > maxBytes) {
      try {
        await reader.cancel();
      } catch {
        /* ignore */
      }
      return { ok: false, status: 413 };
    }
    chunks.push(value);
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.length;
  }
  const text = new TextDecoder("utf-8", { fatal: false }).decode(merged);
  return { ok: true, text, byteLength: total };
}
