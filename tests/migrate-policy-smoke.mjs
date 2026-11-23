/**
 * F-5598 — 0027 excluded from auto /api/admin/migrate unless explicit flag.
 */
const { MIGRATIONS } = await import("../lib/migrations.generated.ts");
const {
  TV_STATE_SECRET_MIGRATION_ID,
  migrationsForAutoApply,
  tvStateSecretMigrationAllowed,
} = await import("../lib/migrate-policy.ts");

let failed = 0;
function check(name, pass, detail = "") {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failed = 1;
}

const prev = process.env.APPLY_TV_STATE_SECRET_MIGRATION;
delete process.env.APPLY_TV_STATE_SECRET_MIGRATION;

const auto = migrationsForAutoApply(MIGRATIONS, false);
check(
  "0027 excluded by default",
  !auto.some((m) => m.id === TV_STATE_SECRET_MIGRATION_ID)
);
check(
  "other migrations still listed",
  auto.length >= MIGRATIONS.length - 1
);

process.env.APPLY_TV_STATE_SECRET_MIGRATION = "1";
check("flag reader", tvStateSecretMigrationAllowed());
const withFlag = migrationsForAutoApply(MIGRATIONS, true);
check(
  "0027 included when APPLY_TV_STATE_SECRET_MIGRATION=1",
  withFlag.some((m) => m.id === TV_STATE_SECRET_MIGRATION_ID)
);

if (prev === undefined) delete process.env.APPLY_TV_STATE_SECRET_MIGRATION;
else process.env.APPLY_TV_STATE_SECRET_MIGRATION = prev;

process.exit(failed);