/** PostgREST / Postgres helpers for optional tv_devices columns (pre-0027 deploy). */

export function isMissingColumnError(
  error: { message?: string; code?: string } | null | undefined
): boolean {
  if (!error) return false;
  const code = String(error.code ?? "");
  const msg = (error.message ?? "").toLowerCase();
  return (
    code === "42703" ||
    code === "PGRST204" ||
    msg.includes("does not exist") ||
    (msg.includes("schema cache") && msg.includes("column"))
  );
}