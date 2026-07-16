import postgres from "postgres";
import { MIGRATIONS } from "./migrations.generated";

/**
 * In-app migration runner: applies supabase/migrations/*.sql (bundled via
 * scripts/gen-migrations.mjs) directly against the database, tracked in a
 * schema_migrations table. Replaces hand-pasting into the SQL editor.
 *
 * Needs SUPABASE_DB_URL — the Transaction-pooler connection string
 * (…pooler.supabase.com:6543/postgres). prepare:false for pgbouncer.
 *
 * Convergent with hand-applied history: if a migration fails because its
 * objects already exist (duplicate table/column/object), it's recorded as
 * applied and the run continues.
 */
export async function runMigrations(): Promise<
  | {
      ok: true;
      applied: string[];
      assumedApplied: string[];
      alreadyApplied: string[];
    }
  | { ok: false; reason: string }
> {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) return { ok: false, reason: "SUPABASE_DB_URL not configured" };

  const sql = postgres(url, { max: 1, prepare: false, connect_timeout: 10 });
  const applied: string[] = [];
  const assumedApplied: string[] = [];
  const alreadyApplied: string[] = [];

  try {
    await sql`create table if not exists schema_migrations (
      id text primary key,
      applied_at timestamptz not null default now()
    )`;
    const done = new Set(
      (await sql`select id from schema_migrations`).map((r) => r.id as string)
    );

    for (const m of MIGRATIONS) {
      if (done.has(m.id)) {
        alreadyApplied.push(m.id);
        continue;
      }
      try {
        await sql.unsafe(m.sql);
        await sql`insert into schema_migrations (id) values (${m.id})`;
        applied.push(m.id);
      } catch (err) {
        const code = (err as { code?: string }).code;
        // 42P07 duplicate table · 42701 duplicate column · 42710 duplicate object
        if (code === "42P07" || code === "42701" || code === "42710") {
          await sql`insert into schema_migrations (id) values (${m.id}) on conflict (id) do nothing`;
          assumedApplied.push(m.id);
        } else {
          return {
            ok: false,
            reason: `${m.id}: ${(err as Error).message}`.slice(0, 500),
          };
        }
      }
    }
    return { ok: true, applied, assumedApplied, alreadyApplied };
  } catch (err) {
    return {
      ok: false,
      reason: (err as Error).message.slice(0, 500),
    };
  } finally {
    await sql.end({ timeout: 5 });
  }
}
