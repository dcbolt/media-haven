/**
 * Fleet UI: strip control characters and HTML from report strings (text-only).
 */

const CONTROL_RE = /[\u0000-\u001F\u007F]/g;
const TAG_RE = /<[^>]*>/g;

export function sanitizeReportDisplayText(raw: string, maxLen = 500): string {
  let s = raw.replace(CONTROL_RE, "").replace(TAG_RE, "");
  if (s.length > maxLen) s = s.slice(0, maxLen);
  return s;
}
