import postgres from "postgres";
import { MIGRATIONS } from "./migrations.generated";

/**
 * In-app migration runner: applies supabase/migrations/*.sql (bundled via
 * scripts/gen-migrations.mjs) directly against the database, tracked in a
 * schema_migrations table. Replaces hand-pasting into the SQL editor.
 *
 * Connection: SUPABASE_DB_URL or DATABASE_URL — the Transaction-pooler
 * string (…pooler.supabase.com:6543/postgres). prepare:false for pgbouncer.
 *
 * Passwords from Supabase's reset often contain characters (@ # ? / :) that
 * break a URL if pasted raw. We repair the string by percent-encoding
 * whatever sits between the last ':' of the userinfo and the '@'.
 */

interface ConnParts {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
}

/**
 * Parse the connection string into discrete parts WITHOUT new URL(), so a
 * password containing @ / ? # % — which Supabase reset passwords routinely
 * do — cannot break parsing. Password is captured greedily as everything
 * between the userinfo ':' and the LAST '@' (host has no '@').
 */
function parseConn(raw: string): ConnParts | null {
  const s = raw.trim().replace(/^["']|["']$/g, "");
  const m = s.match(
    /^postgres(?:ql)?:\/\/([^:@/]+):(.*)@([^:@/]+):(\d+)\/([^?\s]+)/
  );
  if (!m) return null;
  return {
    username: m[1],
    password: m[2],
    host: m[3],
    port: Number(m[4]),
    database: m[5],
  };
}

export async function runMigrations(): Promise<
  | {
      ok: true;
      applied: string[];
      assumedApplied: string[];
      alreadyApplied: string[];
    }
  | { ok: false; reason: string }
> {
  const raw = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
  if (!raw) {
    return { ok: false, reason: "SUPABASE_DB_URL / DATABASE_URL not configured" };
  }
  if (raw.includes("[YOUR-PASSWORD]") || raw.includes("YOUR-NEW-PASSWORD")) {
    return {
      ok: false,
      reason:
        "connection string still contains the [YOUR-PASSWORD] placeholder — replace it with the real database password",
    };
  }

  const parts = parseConn(raw);
  if (!parts) {
    return {
      ok: false,
      reason:
        "could not parse the connection string — expected postgresql://USER:PASSWORD@HOST:PORT/DATABASE (use the Transaction pooler string on port 6543)",
    };
  }

  // Everything below is wrapped so no error can escape as an opaque 500.
  let sql: ReturnType<typeof postgres> | null = null;
  try {
    // Discrete options (not a URL): password passed raw, immune to special
    // characters. query params like ?pgbouncer=true are intentionally dropped
    // — prepare:false already handles the transaction pooler.
    sql = postgres({
      host: parts.host,
      port: parts.port,
      database: parts.database,
      username: parts.username,
      password: parts.password,
      max: 1,
      prepare: false,
      connect_timeout: 12,
      idle_timeout: 5,
      ssl: "require",
    });

    const applied: string[] = [];
    const assumedApplied: string[] = [];
    const alreadyApplied: string[] = [];

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
        // 42P07 dup table · 42701 dup column · 42710 dup object · 42P06 dup schema
        if (["42P07", "42701", "42710", "42P06"].includes(code ?? "")) {
          await sql`insert into schema_migrations (id) values (${m.id}) on conflict (id) do nothing`;
          assumedApplied.push(m.id);
        } else {
          return {
            ok: false,
            reason: `${m.id} failed: ${(err as Error).message}`.slice(0, 500),
          };
        }
      }
    }
    return { ok: true, applied, assumedApplied, alreadyApplied };
  } catch (err) {
    const e = err as { message?: string; code?: string };
    const hint =
      e.code === "ENOTFOUND"
        ? " (host not found — check the pooler hostname/region in the connection string)"
        : e.code === "28P01" || /password/i.test(e.message ?? "")
          ? " (password authentication failed — re-copy the DB password, watch for a trailing space)"
          : e.code === "ECONNREFUSED" || e.code === "ETIMEDOUT"
            ? " (could not reach the database — confirm you used the Transaction pooler on port 6543)"
            : "";
    return {
      ok: false,
      reason: `${e.code ? e.code + ": " : ""}${e.message ?? "connection failed"}${hint}`.slice(
        0,
        500
      ),
    };
  } finally {
    if (sql) await sql.end({ timeout: 5 }).catch(() => {});
  }
}
