/**
 * Strict parse + sanitize for POST /api/tv/report bodies.
 */

import {
  DEVICE_REPORT_FOREGROUNDS,
  DEVICE_REPORT_MODES,
  DEVICE_REPORT_TYPES,
  DEVICE_STAY_DAYS,
  REPORT_ERROR_MSG_MAX,
  REPORT_MAX_CHILDREN,
  REPORT_MAX_ERRORS,
  type DeviceReportForeground,
  type DeviceReportMode,
  type DeviceReportType,
  type DeviceStayDay,
  type SanitizedDeviceReport,
} from "./tv-device-report-types.ts";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function coerceEnum<T extends string>(
  raw: unknown,
  allowed: readonly T[],
  fallback: T
): T {
  const s = typeof raw === "string" ? raw.trim() : "";
  return (allowed as readonly string[]).includes(s) ? (s as T) : fallback;
}

function trimStr(raw: unknown, max: number): string | undefined {
  if (typeof raw !== "string") return undefined;
  const t = raw.trim();
  if (!t) return undefined;
  return t.slice(0, max);
}

/** Scrub tokens, emails, phones, URL query secrets from error text. */
export function scrubReportMessage(msg: string): string {
  let s = msg.slice(0, REPORT_ERROR_MSG_MAX);
  s = s.replace(
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    "[redacted]"
  );
  s = s.replace(
    /(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
    "[redacted]"
  );
  s = s.replace(/([?&][^=\s&]+=)[^&\s#]+/g, "$1[redacted]");
  s = s.replace(/Bearer\s+\S+/gi, "Bearer [redacted]");
  return s.slice(0, REPORT_ERROR_MSG_MAX);
}

function parseApp(raw: unknown): SanitizedDeviceReport["app"] | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  const name = trimStr(o.name, 80);
  const version = trimStr(o.version, 40);
  const build = trimStr(o.build, 40);
  if (!name && !version && !build) return undefined;
  return {
    name: name ?? "",
    version: version ?? "",
    build: build ?? "",
  };
}

function parseFeed(raw: unknown): SanitizedDeviceReport["feed"] | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  const lastOkAt =
    typeof o.lastOkAt === "string" && Number.isFinite(Date.parse(o.lastOkAt))
      ? o.lastOkAt
      : null;
  const lastError =
    typeof o.lastError === "string" && o.lastError.trim()
      ? scrubReportMessage(o.lastError)
      : o.lastError === null
        ? null
        : null;
  const usingLastGood = o.usingLastGood === true;
  return { lastOkAt, lastError, usingLastGood };
}

function parseErrors(raw: unknown): SanitizedDeviceReport["errors"] {
  if (!Array.isArray(raw)) return [];
  const out: SanitizedDeviceReport["errors"] = [];
  for (const item of raw) {
    if (out.length >= REPORT_MAX_ERRORS) break;
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const at =
      typeof o.at === "string" && Number.isFinite(Date.parse(o.at))
        ? o.at
        : new Date().toISOString();
    const code = trimStr(o.code, 64) ?? "unknown";
    const msg = scrubReportMessage(String(o.msg ?? "").slice(0, 500));
    out.push({ at, code, msg });
  }
  return out;
}

function parseServices(
  raw: unknown,
  forNode: boolean
): SanitizedDeviceReport["services"] | undefined {
  if (!forNode || !raw || typeof raw !== "object" || Array.isArray(raw)) {
    return undefined;
  }
  const out: Record<string, "up" | "down"> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const name = trimStr(k, 48);
    if (!name) continue;
    out[name] = v === "down" ? "down" : "up";
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export type ParsedChildReport = SanitizedDeviceReport;

export function parseDeviceReportPayload(
  raw: unknown,
  opts: { allowChildren: boolean; deviceIdFallback?: string }
):
  | { ok: true; report: SanitizedDeviceReport; children: ParsedChildReport[] }
  | { ok: false; error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "invalid body" };
  }
  const body = raw as Record<string, unknown>;
  const deviceIdRaw =
    typeof body.deviceId === "string" ? body.deviceId.trim() : opts.deviceIdFallback ?? "";
  if (!UUID_RE.test(deviceIdRaw)) {
    return { ok: false, error: "bad deviceId" };
  }

  const type = coerceEnum<DeviceReportType>(
    body.type,
    DEVICE_REPORT_TYPES,
    "unknown"
  );
  const mode = coerceEnum<DeviceReportMode>(
    body.mode,
    DEVICE_REPORT_MODES,
    "unknown"
  );
  const foreground = coerceEnum<DeviceReportForeground>(
    body.foreground,
    DEVICE_REPORT_FOREGROUNDS,
    "unknown"
  );
  const stayDayRaw = body.stayDay;
  const stayDay =
    typeof stayDayRaw === "string" &&
    (DEVICE_STAY_DAYS as readonly string[]).includes(stayDayRaw)
      ? (stayDayRaw as DeviceStayDay)
      : undefined;

  const uptimeS =
    typeof body.uptimeS === "number" && Number.isFinite(body.uptimeS)
      ? Math.max(0, Math.floor(body.uptimeS))
      : undefined;

  const report: SanitizedDeviceReport = {
    deviceId: deviceIdRaw,
    type,
    app: parseApp(body.app),
    firmware: trimStr(body.firmware, 120),
    model: trimStr(body.model, 80),
    mode,
    foreground,
    stayDay,
    quiet: body.quiet === true ? true : body.quiet === false ? false : undefined,
    uptimeS,
    feed: parseFeed(body.feed),
    errors: parseErrors(body.errors),
    services: parseServices(body.services, type === "node"),
  };

  const children: ParsedChildReport[] = [];
  if (opts.allowChildren && Array.isArray(body.children)) {
    const slice = body.children.slice(0, REPORT_MAX_CHILDREN);
    for (const childRaw of slice) {
      if (!childRaw || typeof childRaw !== "object" || Array.isArray(childRaw)) {
        continue;
      }
      const childObj = childRaw as Record<string, unknown>;
      if (childObj.children !== undefined) continue;
      const parsed = parseDeviceReportPayload(childObj, {
        allowChildren: false,
      });
      if (parsed.ok) children.push(parsed.report);
    }
  }

  return { ok: true, report, children };
}

export function reportsEqual(
  a: SanitizedDeviceReport,
  b: SanitizedDeviceReport
): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function storedEntryReportJson(entry: unknown): string {
  if (!entry || typeof entry !== "object") return "";
  const r = (entry as { report?: unknown }).report;
  return JSON.stringify(r ?? null);
}
