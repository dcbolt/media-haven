# TV state device secret — rotation plan (docs only)

Addresses **MH185-1**: UUID alone must not entitle a caller to guest PII on `GET /api/tv/state`.

This document is **operational policy only**. No cron, no automatic rotation code, and no mid-stay device changes beyond the Stay OS app (Dunes policy).

## What rotates

- **Rotate:** per-device **state secret** (bearer in `X-TV-State-Secret` / `x-tv-state-secret`), optionally alongside a **new device UUID** when hardware or QR URL was exposed.
- **Do not rotate mid-stay:** no unlink/re-pair, no “Issue state secret” that would strand an in-house guest screen, except emergency host ops with occupancy check.

## When to rotate

| Trigger | Action |
|--------|--------|
| Guest checkout / turnover | Optional **issue secret** if UUID was on a printed QR or photo |
| Shield URL photographed or shared | New UUID in Fully start URL **between stays** + host **Issue state secret** |
| Suspected UUID scraping | After all TVs have secrets (`TV_STATE_REQUIRE_SECRET=1`), legacy UUID-only traffic should be zero; investigate logs |
| Staff laptop loss with host session | Host session rotation (separate); TV secrets unchanged unless fleet page used maliciously |

## Rotation procedure (between guests)

1. Confirm **no in-house reservation** on the property (host fleet “occupied” chip).
2. Host → **TVs** → **Issue state secret** on that row (sets deliver-on-next-poll; TV picks up secret within ~10s).
3. If the **device UUID** was exposed (e.g. start URL in a photo): Fully → new `?device=<new-uuid>` **before** next guest; old UUID may be **Forgotten** after the box is updated.
4. Verify host fleet: **State secret** column shows **Yes**.
5. Only after **100%** of paired TVs show **Yes**, enable `TV_STATE_REQUIRE_SECRET=1` in Vercel (separate change; not in the security PR deploy).

## How to verify each TV

| Check | Pass |
|-------|------|
| Host `/host/tvs` | **State secret: Yes** |
| TV poll | No 401 loop; signage loads |
| Grace flag off | UUID-only curl returns **401** with no `guestFirstName` / `wifiPassword` / `portalQr` in JSON |
| TV localStorage | `fh_tv_state_secret` present (host tools only; never log value) |

## Rollout order (summary)

1. Merge migration **0026** + app code; deploy with `TV_STATE_REQUIRE_SECRET` **unset** (grace).
2. Migration applied in Supabase when approved (not via this agent run).
3. Each paired TV: **Issue state secret** or wait for claim/re-link to mint + deliver.
4. Fleet dashboard: all paired rows **State secret: Yes**; monitor legacy auth counter / logs.
5. Set `TV_STATE_REQUIRE_SECRET=1`; re-verify one TV per property.
6. Document any UUID URL changes in turnover checklist (`docs/SHIELD-SETUP.md`).

## Never

- Apply migrations to production from a cloud agent run.
- Call `/api/admin/migrate` against live Supabase.
- Rotate secrets or UUIDs **during** an occupied stay for convenience.
- Print real UUIDs or secrets in tickets, Slack, or CI logs.