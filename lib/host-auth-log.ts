import { createHash } from "crypto";

/** MH186-16: never log raw host email in structured logs. */
export function hostAuthMethodForLog(identity: string | null | undefined): string {
  if (!identity?.trim()) return "unknown";
  const id = identity.trim();
  if (id.includes("@")) return "google";
  if (id.toLowerCase() === "access code") return "code";
  return createHash("sha256").update(id, "utf8").digest("hex").slice(0, 8);
}