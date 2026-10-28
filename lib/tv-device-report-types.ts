/** Device report enums and stored shapes (app_config device_report:<uuid>). */

export const DEVICE_REPORT_TYPES = [
  "roku",
  "web_tv",
  "signboard",
  "node",
  "samsung",
  "firetv",
  "vizio",
  "sony",
  "unknown",
] as const;
export type DeviceReportType = (typeof DEVICE_REPORT_TYPES)[number];

export const DEVICE_REPORT_MODES = [
  "pairing",
  "attract",
  "menu",
  "night",
  "check-in",
  "mid-stay",
  "check-out",
  "vacant",
  "takeover",
  "launch-countdown",
  "offline-fallback",
  "unknown",
] as const;
export type DeviceReportMode = (typeof DEVICE_REPORT_MODES)[number];

export const DEVICE_REPORT_FOREGROUNDS = [
  "signage",
  "streaming",
  "other_app",
  "home",
  "standby",
  "unknown",
] as const;
export type DeviceReportForeground = (typeof DEVICE_REPORT_FOREGROUNDS)[number];

export const DEVICE_STAY_DAYS = [
  "check-in",
  "mid",
  "check-out",
  "vacant",
] as const;
export type DeviceStayDay = (typeof DEVICE_STAY_DAYS)[number];

/** Stored payload — client `reportedType` is an unverified display hint only. */
export type SanitizedDeviceReport = {
  deviceId: string;
  reportedType?: DeviceReportType;
  app?: { name: string; version: string; build: string };
  firmware?: string;
  model?: string;
  mode: DeviceReportMode;
  /** Hint for offline suppression only — not used for online/stale/offline timing. */
  foreground: DeviceReportForeground;
  stayDay?: DeviceStayDay;
  quiet?: boolean;
  uptimeS?: number;
  feed?: {
    lastOkAt: string | null;
    lastError: string | null;
    usingLastGood: boolean;
  };
  errors: { at: string; code: string; msg: string }[];
  services?: Record<string, "up" | "down">;
};

export type StoredDeviceReportEntry = {
  /** Server time when the report was accepted (authoritative for fleet timing). */
  receivedAt: string;
  auth: "legacy";
  report: SanitizedDeviceReport;
};

export type DeviceReportsMap = Record<string, StoredDeviceReportEntry>;

export const NEXT_REPORT_S = 60;
export const REPORT_MAX_BODY_BYTES = 8 * 1024;
export const REPORT_MAX_ERRORS = 5;
export const REPORT_ERROR_MSG_MAX = 200;
export const REPORT_ERROR_CODE_MAX = 64;
export const REPORT_RATE_LIMIT_MS = 15_000;
export const DEVICE_REPORT_KEY_PREFIX = "device_report:";
export const DEVICE_REPORT_VALUE_MAX_BYTES = 4 * 1024;

/** Keys allowed in stored report JSON (allowlist tests). */
export const STORED_REPORT_TOP_KEYS = new Set([
  "deviceId",
  "reportedType",
  "app",
  "firmware",
  "model",
  "mode",
  "foreground",
  "stayDay",
  "quiet",
  "uptimeS",
  "feed",
  "errors",
  "services",
]);

export const FORBIDDEN_REPORT_SUBSTRINGS = [
  "wifiPassword",
  "wifiSsid",
  "guestFirstName",
  "portalQr",
  "settings",
  "token",
  "guesty",
  "email",
  "phone",
  "content",
] as const;
