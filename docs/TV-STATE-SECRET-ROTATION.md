# TV state device secret — rotation plan (docs only)

Addresses **MH185-1**: UUID alone must not entitle a caller to guest PII on `GET /api/tv/state`.

This document is **operational policy only**. No cron, no automatic rotation code, and no mid-stay device changes beyond the Stay OS app (Dunes policy).

## Secret delivery model (no auto-deliver on poll)

- Polls that only know the **device UUID** (grace mode or enforcement) **never** receive `stateSecret` in JSON.
- Host-authenticated flows (**pair by code**, **assign/link**, **Issue state secret**) mint a **one-time pickup token** (15-minute TTL, device-bound, single use).
- The host pairing channel returns the pickup to the **host session** (dashboard/TVs API JSON). Staff append `?pickup=<token>` to the TV start URL (or reload once with that query); the TV sends `x-tv-state-pickup` on poll and receives `stateSecret` **once**, then stores it in `localStorage`.

## What rotates

- **Rotate:** per-device **state secret** (bearer in `x-tv-state-secret`), optionally alongside a **new device UUID** when hardware or QR URL was exposed.
- **Do not rotate mid-stay:** no unlink/re-pair, no pickup re-issue that would strand an in-house guest screen, except emergency host ops with occupancy check.

## When to rotate

| Trigger | Action |
|--------|--------|
| Guest checkout / turnover | Optional **Issue state secret** if UUID was on a printed QR or photo |
| Shield URL photographed or shared | New UUID in Fully start URL **between stays** + host **Issue state secret** |
| Suspected UUID scraping | After all TVs have secrets (`TV_STATE_REQUIRE_SECRET=1`), legacy UUID-only traffic should be zero; investigate logs |
| Staff laptop loss with host session | Host session rotation (separate); TV secrets unchanged unless fleet page used maliciousally |

## Rotation procedure (between guests)

1. Confirm **no in-house reservation** on the property (host fleet “occupied” chip).
2. Host → **TVs** → **Issue state secret** (or re-link) — copy the **pickup code** from the host UI (not from poll).
3. Update Fully start URL with `?pickup=` **once** (or reload TV with query); TV redeems on next poll and clears pickup from session storage.
4. If the **device UUID** was exposed: new `?device=<new-uuid>` **before** next guest; old UUID may be **Forgotten** after the box is updated.
5. Verify host fleet: **State secret: Yes**.
6. Only after **100%** of paired TVs show **Yes**, enable `TV_STATE_REQUIRE_SECRET=1` in Vercel (separate change).

## How to verify each TV

| Check | Pass |
|-------|------|
| Host `/host/tvs` | **State secret: Yes** |
| UUID-only poll (no pickup header) | Response has **no** `stateSecret` field |
| TV after pickup redeem | Signage loads; `fh_tv_state_secret` present (host tooling only; never log value) |
| Grace flag off | UUID-only curl returns **401** with no guest PII in JSON |
| Enforcement on | UUID-only cannot obtain secret via poll (only via host pickup) |

## Rollout order (summary)

1. Merge migration **0027** + app code; deploy with `TV_STATE_REQUIRE_SECRET` **unset** (grace). (If PR #185 lands first, **0026** is attribution-only; **0027** adds secret columns either way.)
2. Apply migration **0027** in Supabase when approved (not via `/api/admin/migrate` from agents).
3. For each paired TV: host **link/claim/issue** → copy pickup → append to Fully URL once → confirm **State secret: Yes**.
4. Fleet dashboard: all paired rows **State secret: Yes**.
5. Set `TV_STATE_REQUIRE_SECRET=1`; verify UUID-only polls return **401** without guest fields and **never** ship `stateSecret`.
6. Document UUID URL changes in turnover checklist (`docs/SHIELD-SETUP.md`).

## Never

- Apply migrations to production from a cloud agent run.
- Call `/api/admin/migrate` against live Supabase.
- Rotate secrets or UUIDs **during** an occupied stay for convenience.
- Print real UUIDs, pickup tokens, or secrets in tickets, Slack, or CI logs.