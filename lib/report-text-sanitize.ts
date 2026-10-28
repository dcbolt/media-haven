/** Strip bidi controls and zero-width chars from stored/rendered report text (F-3326). */

export const INVISIBLE_UNICODE_RE =
  /[\u200B-\u200D\uFEFF\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;

export function stripInvisibleUnicode(s: string): string {
  return s.replace(INVISIBLE_UNICODE_RE, "");
}
