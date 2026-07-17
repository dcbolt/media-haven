# media-haven — live session state & finish sequence

**For the next Claude Code session. Read this first, then verify network, then finish.**

**Canonical product docs:**
- Architecture: [`docs/DECISIONS.md`](./DECISIONS.md)
- **Full roadmap (beat WelcomeScreen):** [`docs/ROADMAP.md`](./ROADMAP.md) — updated 2026-07-17

## Where things stand (as of this handoff)

- **Deployed**: Vercel project `media-haven`, production URL `https://media-haven-lilac.vercel.app`, branch `claude/media-haven` (auto-deploys on push).
- **Guesty**: LIVE. Credentials set in Vercel. 6 listings + ~82 reservations reachable. OAuth token cached in Postgres.
- **Supabase**: LIVE (project `woleywnwgjfcvowqyyix`, East US). API keys set in Vercel.
- **What works now**: guest portal, TV signage (welcome/wifi/tides/launches/streaming/casting/book-direct, drone bg video, hero photos, per-property logos auto-matched by name), host dashboard (TVs / media / turnover), printable QR cards, PWA. All logos bundled in `public/logos/`, no DB needed.

## The ONE thing blocking full data

**RESOLVED 2026-07-17:** all migrations through 0011 (property settings) are applied — 0007–0010 via SQL editor / Supabase MCP, 0011 with the CMS. Guesty sync has run (6 properties, ~82 reservations, full photo sets). Phase 0.6 cast naming (`TvContent.deviceLabel` on the casting slide) shipped with the CMS PR.

**Fastest apply — Supabase SQL Editor (always works):**
```sql
alter table tv_devices add column if not exists label text;
alter table properties add column if not exists photos jsonb not null default '[]'::jsonb;
alter table properties add column if not exists logo_url text;
create table if not exists turnover_checks (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties (id) on delete cascade,
  items jsonb not null, notes text,
  completed_at timestamptz not null default now()
);
alter table turnover_checks enable row level security;
```

**Or the in-app runner** (needs `SUPABASE_DB_URL`/`DATABASE_URL` = Transaction pooler string, port 6543):
`GET /api/admin/migrate?code=<HOST_ACCESS_CODE>` — applies repo migrations, returns JSON. Parses the conn string into discrete parts (handles special-char passwords). If it can't parse, the JSON includes a masked shape fingerprint.

## Finish sequence (once migrations applied)

1. `GET /api/guesty/health?code=demo` — confirms `db.properties`, `db.reservations`, token cache, config flags. (Add `HOST_ACCESS_CODE` if changed.)
2. `/host` → **Sync from Guesty** — writes 6 properties + reservations, sweeps full photo sets into `properties.photos`, auto-mints guest links for active stays only.
3. Re-check health: expect `db: { properties: 6, reservations: ~82 }`.

## What a network-enabled session unlocks (vs. this jailed one)

With the DCBOLT OFFICE environment network policy opened (allow-all or allowlist), THIS agent can directly:
- `curl` the migrate / health / fields endpoints and read results itself (auth is `?code=`, not a browser login)
- reach guesty docs, open-meteo, NOAA, the live site
- Playwright-screenshot the LIVE production site (not just localhost)

**Still NOT possible even then**: logging into the user's Supabase/Vercel dashboards (no auth cookies). Env-var edits and DB-password resets stay with the user or the Claude for Chrome extension.

## Optional extras (not blockers)

- **Per-property Wi-Fi**: `GET /api/guesty/fields` (host-gated) lists each listing's custom-field IDs → set `GUESTY_WIFI_SSID_FIELD_ID` / `GUESTY_WIFI_PASSWORD_FIELD_ID` in Vercel → redeploy → Sync.
- **Instant updates**: register `https://media-haven-lilac.vercel.app/api/guesty/webhook` in Guesty, put its `whsec_…` secret in `GUESTY_WEBHOOK_SECRET` (Svix signature verified).
- **Security**: set a real `HOST_ACCESS_CODE` (public dashboard is `demo` today).

## Guardrails

- `docs/DECISIONS.md` is locked product/hardware truth — honor it.
- Every push to `claude/media-haven` auto-deploys to production. `npm run smoke` before pushing.

## Account / environment note

Browser-driving, computer-use, and network egress are set at the ACCOUNT/ORG/ENVIRONMENT
level. If a prior session could drive dashboards and this one can't, the likely cause is
running under a different account/team (e.g. personal vs DCBolt teams) whose environment
has open network or a browser tool enabled. To get those capabilities: start the session
under the account/team whose environment is configured for them, or open the network policy
on this environment at claude.ai/code and start a fresh session.

