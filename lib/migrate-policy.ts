/** Requires explicit env + Devin GO — never auto via /api/admin/migrate (F-5598). */
export const TV_STATE_SECRET_MIGRATION_ID = "0027_tv_state_secret.sql";

export function tvStateSecretMigrationAllowed(): boolean {
  return (
    (process.env.APPLY_TV_STATE_SECRET_MIGRATION ?? "").trim().toLowerCase() ===
    "1"
  );
}

export function migrationsForAutoApply<T extends { id: string }>(
  all: readonly T[],
  allowTvStateSecret: boolean = tvStateSecretMigrationAllowed()
): T[] {
  return all.filter(
    (m) => m.id !== TV_STATE_SECRET_MIGRATION_ID || allowTvStateSecret
  );
}