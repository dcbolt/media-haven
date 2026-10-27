export type ScreensaverRotationAuditAction =
  | "delete"
  | "hide"
  | "unhide"
  | "bulk-delete-oversized";

export type ScreensaverRotationAuditEntry = {
  action: ScreensaverRotationAuditAction;
  url?: string;
  urls?: string[];
  source?: string;
  orgId: string;
  hostIdentity: string | null;
  ip: string | null;
  userAgent: string | null;
};

export function logScreensaverRotationAudit(
  entry: ScreensaverRotationAuditEntry
): void {
  console.log(
    JSON.stringify({
      event: "screensaver_rotation",
      ts: new Date().toISOString(),
      ...entry,
    })
  );
}
