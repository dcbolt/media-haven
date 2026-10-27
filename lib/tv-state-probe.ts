/** TV /api/tv/state probe body validation (F-1143). */

export type TvStateProbeMode = "demo" | "pairing" | "active";

export function isTvStateProbePayload(body: unknown): body is {
  mode: TvStateProbeMode;
} {
  if (!body || typeof body !== "object") return false;
  const mode = (body as { mode?: unknown }).mode;
  return mode === "demo" || mode === "pairing" || mode === "active";
}
