# media-haven — live session state & finish sequence

**For the next Claude Code session. Read this first, then verify network, then finish.**

**Canonical product docs:**
- Architecture: [`docs/DECISIONS.md`](./DECISIONS.md)
- **Full roadmap:** [`docs/ROADMAP.md`](./ROADMAP.md) — status snapshot **2026-07-21** (S0–S5 shipped; Devin-gated queue)
- Hardware: [`docs/HARDWARE-STANDARD.md`](./HARDWARE-STANDARD.md) — Shield #1; Cast Pro signage only
- Streaming plan: [`docs/STREAMING-SEAMLESS.md`](./STREAMING-SEAMLESS.md)
- Grok log: [`docs/GROK.md`](./GROK.md)
- **Claude cold start paste:** [`docs/CLAUDE-INTRO.md`](./CLAUDE-INTRO.md)
- **SaaS multi-tenant:** [`docs/SAAS-ARCHITECTURE.md`](./SAAS-ARCHITECTURE.md) — FH Tenant Zero
- S3.6 when 0022 lands: [`docs/S3.6-FINALIZE-0022.md`](./S3.6-FINALIZE-0022.md)
- Path C live fire (Devin go): [`docs/PATH-C-E2E.md`](./PATH-C-E2E.md)

## Where things stand (updated 2026-07-21, post S0–S5 competitive ship)

- **Deployed**: Vercel `media-haven` · `https://media-haven-lilac.vercel.app` · branch `claude/media-haven` (auto-deploy). Grok ships on `grok/*`; Claude vets + merges.
- **Guesty**: LIVE (6 listings). **Supabase**: LIVE; migrations through **0021**. **0022** device_class written in repo but **not applied** (Devin declined; S3.6 parked).
- **DB HANDS-OFF (Devin)**: no MCP migrations/SQL from agents until Devin says go. Features = settings-jsonb only.
- **Competitive S-backlog**: **shipped** (S0–S5 unblocked set). ROADMAP snapshot leads; phase tables are historical.
- **Smoke gate**: ~56-check suite (`tests/smoke.mjs`). Live board: `/roadmap.html`.

### Shipped product surface (high level)

Fleet map + now-playing + offline alerts (dormant until Resend) + force-reload + SLA chips · publish history/rollback · bulk apply · channels · campaigns · dayparts · media validity · launch auto-weight · storm takeover (TV + portal) · vacant mode · **mode-transition hooks (S5.4)** · **priority-stack “Now deciding” (S4.1)** · media upload/tags/search/expiry/health · template packs · pair profiles · clone property · deploy-proof host UI · mobile pass · media preload · Path C code (hardware e2e gated).

## Standing engineering rules

- **No server actions in host UI** — use API route + `<ApiForm>`.
- **TV client must not value-import `lib/tv.ts`** — client-safe modules only.
- **Every new host API route** gets a 401 line in `tests/smoke.mjs`.
- **Grep smoke for copy assertions** before rewording covered pages.
- **Rotation timer** must not depend on slides identity (refs).
- **Grok⇄Claude efficiency**: pipeline non-overlapping work; no empty GROK heartbeats; multi-assign when possible (`docs/GROK.md` protocol).

## Blocked on Devin (NEEDS DEVIN)

| Item | Notes |
|------|--------|
| MCP **0022** | → S3.6 device_class; migrate S5.1 `deviceClasses` stamps ([S3.6-FINALIZE-0022](./S3.6-FINALIZE-0022.md)) |
| Drive service-account | uploads land in Drive (Blob fallback live) |
| Resend/Twilio + CRON_SECRET | arm 1.8 + S0.2 alert sends |
| Plex go/no-go | board #58 |
| Beach St addresses | content ops |
| Physical Shield intent | entertainment path proof |
| Path C office-TV e2e | only on explicit “fire Path C e2e” |

## Ops recovery (migrations already applied on prod)

In-app runner (needs `SUPABASE_DB_URL`/`DATABASE_URL` = Transaction pooler, port 6543):  
`GET /api/admin/migrate?code=<HOST_ACCESS_CODE>` — applies pending repo migrations.

## Health check

1. `GET /api/guesty/health?code=demo` — db + token cache flags.  
2. Live: `/` and `/welcome?token=demo` should be **200**.  
3. If roadmap/SESSION-STATE conflict on “what’s done,” **verify code / live site**.
