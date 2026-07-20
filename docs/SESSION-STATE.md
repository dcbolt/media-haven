# media-haven — live session state & finish sequence

**For the next Claude Code session. Read this first, then verify network, then finish.**

**Canonical product docs:**
- Architecture: [`docs/DECISIONS.md`](./DECISIONS.md)
- **Full roadmap (beat WelcomeScreen):** [`docs/ROADMAP.md`](./ROADMAP.md) — full refresh 2026-07-17 (pricing kill-table, Phase 0 marked Done, Phase 1 next)
- Hardware: [`docs/HARDWARE-STANDARD.md`](./HARDWARE-STANDARD.md) — Shield #1; Cast Pro signage only (Grok 2026-07-20)
- Streaming plan: [`docs/STREAMING-SEAMLESS.md`](./STREAMING-SEAMLESS.md)
- Grok log: [`docs/GROK.md`](./GROK.md)
- **Claude cold start paste:** [`docs/CLAUDE-INTRO.md`](./CLAUDE-INTRO.md)
- **SaaS multi-tenant:** [`docs/SAAS-ARCHITECTURE.md`](./SAAS-ARCHITECTURE.md) — FH Tenant Zero; license TVs/properties; multi-PMS

## Where things stand (as of this handoff)

- **Deployed**: Vercel project `media-haven`, production URL `https://media-haven-lilac.vercel.app`, branch `claude/media-haven` (auto-deploys on push).
- **Guesty**: LIVE. Credentials set in Vercel. 6 listings + ~82 reservations reachable. OAuth token cached in Postgres.
- **Supabase**: LIVE (project `woleywnwgjfcvowqyyix`, East US). API keys set in Vercel.
- **What works now**: guest portal, TV signage (welcome/wifi/tides/launches/streaming/casting/book-direct, drone bg video, hero photos, per-property logos auto-matched by name), host dashboard (TVs / media / turnover / property CMS), cast naming (`Cast to: {label} · {property}`), streaming service catalog, living roadmap board, printable QR cards, PWA.

## Phase 0 status

**RESOLVED 2026-07-17:** migrations through **0012** (roadmap_items). Guesty sync has run (6 properties, ~82 reservations, full photo sets). Phase 0.6 cast naming shipped (#8). Host CMS + feed toggles (#8). Living roadmap board (#9). Streaming catalog (#10).

**Next coding focus = Phase 1** (see ROADMAP): **1.3 tides/weather → 1.4 last-night direct → 1.6 heartbeat → 1.7 self-reload**.

## Ops recovery (migrations already applied on prod)

In-app runner (needs `SUPABASE_DB_URL`/`DATABASE_URL` = Transaction pooler, port 6543):
`GET /api/admin/migrate?code=<HOST_ACCESS_CODE>` — applies any pending repo migrations, returns JSON.

## Health check

1. `GET /api/guesty/health?code=demo` — confirms `db.properties`, `db.reservations`, token cache, config flags. (Add `HOST_ACCESS_CODE` if changed.)
2. `/host` → **Sync from Guesty** if counts look stale — writes properties + reservations, sweeps photos, auto-mints guest links for active stays only.
3. Expect `db: { properties: 6, reservations: ~82 }`.

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

