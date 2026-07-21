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

## Where things stand (updated 2026-07-21, post S0–S2 sprint)

- **Deployed**: Vercel project `media-haven`, production URL `https://media-haven-lilac.vercel.app`, branch `claude/media-haven` (auto-deploys on push). Claude develops on `claude/browser-assessment-fu5fy5`; Grok on `grok/*` branches (Claude vets + merges — Grok has no gh token and often no node, so tsc/build/smoke on a rebased main is Claude's job).
- **Guesty**: LIVE (6 listings, ~82 reservations). **Supabase**: LIVE (`woleywnwgjfcvowqyyix`), migrations applied through **0021** (0022 device_class is written but NOT applied — Devin declined; S3.6 parked on it).
- **DB HANDS-OFF (Devin, 2026-07-21)**: no Supabase MCP migrations or SQL from agents until Devin says otherwise. New features are settings-jsonb-only (see campaigns/channels/takeover/mediaMeta pattern on `orgs.settings`).
- **What works now** (all smoke-gated, 54 checks): guest portal (incl. storm banner + last-night rebook), TV signage with host-arranged playlists (transitions, dayparts, media blocks with preloading, launch auto-weight), vacant-mode rotation, fleet emergency takeover (storm/water), calendar campaigns (precedence: takeover > campaign > playlist > default), signage editor (drag-drop timeline, media library with upload/tags/search/expiry, channels, publish history + rollback, bulk apply), fleet map with now-playing + offline alerts (dormant until Resend key), Path C "Open on TV" (untested on hardware), deploy-proof host UI (zero server actions), mobile-friendly host pages.

## Standing engineering rules (hard-won this sprint)

- **No server actions in host UI** — deployment-bound action ids silently drop submits after deploys. Use an API route + the shared `<ApiForm>` (app/host/api-form.tsx).
- **Runtime code the TV client imports must NOT live in lib/tv.ts** — value imports drag server deps (fs/promises) into the browser bundle. Client-safe modules only (see lib/launch-weight.ts).
- **Every new host API route adds a 401 line to the smoke contract loop** (tests/smoke.mjs).
- **Grep smoke.mjs for copy assertions before rewording** smoke-covered pages.
- **Rotation timer must not depend on slides identity** — use refs (rotation-freeze lesson).

## Blocked on Devin (also on the roadmap board as NEEDS DEVIN)

migration 0022 → S3.6 deviceClass · Drive service-account JSON → uploads land in Drive (Supabase storage fallback live meanwhile) · Resend/Twilio keys + CRON_SECRET → arm 1.8 + S0.2 alerts · Beach St addresses · Plex go/no-go · physical Shield intent test · office-TV Path C live test (fire only on Devin's explicit go).

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

