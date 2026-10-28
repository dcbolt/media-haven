import {
  FORBIDDEN_REPORT_SUBSTRINGS,
  STORED_REPORT_TOP_KEYS,
} from "./tv-device-report-types.ts";

/** Ensure JSON cannot contain settings/content/wifi/guest fields (smoke). */
export function assertDeviceReportAllowlist(json: unknown): string[] {
  const violations: string[] = [];
  if (json === undefined || json === null) {
    violations.push("missing");
    return violations;
  }
  const text = JSON.stringify(json).toLowerCase();
  for (const forbidden of FORBIDDEN_REPORT_SUBSTRINGS) {
    if (text.includes(forbidden.toLowerCase())) {
      violations.push(forbidden);
    }
  }
  if (json && typeof json === "object" && !Array.isArray(json)) {
    for (const key of Object.keys(json as Record<string, unknown>)) {
      if (
        key === "report" &&
        (json as Record<string, unknown>).report &&
        typeof (json as Record<string, unknown>).report === "object"
      ) {
        for (const rk of Object.keys(
          (json as { report: Record<string, unknown> }).report
        )) {
          if (!STORED_REPORT_TOP_KEYS.has(rk)) {
            violations.push(`report.${rk}`);
          }
        }
      }
    }
  }
  return violations;
}
