# TV state device secret — rotation plan (docs only)

Addresses **MH185-1**: UUID alone must not entitle a caller to guest PII on `GET /api/tv/state`.

This document is **operational policy only**. No cron, no automatic rotation code, and no mid-stay device changes beyond the Stay OS app (Dunes policy).

## PR / migration order

1. Merge **PR #185** (`0026_tv_attribution_tag.sql`) to `claude/media-haven` first.
2. **Rebase** the TV state secret branch (#186) onto updated `claude/media-haven`, then merge #186.
3. Apply **`0027_tv_state_secret.sql`** in Supabase only after Devin GO (not via unguarded `/api/admin/migrate`). In-app migrate skips `0027` unless `APPLY_TV_STATE_SECRET_MIGRATION=1` is set on that deployment.
4. Rollback SQL (not applied): `docs/supabase/0027_tv_state_secret_rollback.sql`.

## Secret delivery model (no auto-deliver on poll)

- Polls that only know the **device UUID** (grace mode or enforcement) **never** receive `stateSecret` in JSON.
- Host-authenticated flows (**pair by code**, **assign/link**, **Issue state secret**) mint a **one-time pickup token** (15-minute TTL, device-bound, single use).
- The host pairing channel returns the pickup to the **host session** (dashboard/TVs API JSON). Staff append `?pickup=<token>` to the TV start URL once; the TV client moves the token to session storage, **strips `?pickup=` from the URL/history**, sends `x-tv-state-pickup` on **one main poll only** (reload reachability probes must **not** send pickup).
- After fleet shows **State secret: Yes**, remove `?pickup=` from the Fully start URL (one-time bootstrap only).

### Pending promotion (lost redeem response)

- Successful pickup redeem writes `state_secret_pending_hash` and sets sticky `state_secret_required_at` (first enroll only).
- The **previous** `state_secret_hash` stays valid until the TV presents the new bearer; the server promotes pending → active on the first matching poll.
- If the JSON body with `stateSecret` is lost, the TV can keep polling with the **old** bearer until staff re-issue pickup — document turnover re-issue in that rare case.

## Roku native channel (read-only `/api/tv/state`)

- Send device id on the query string as today (`?device=<uuid>`).
- After enrollment, send **`x-tv-state-secret`** on every poll (same bearer as Shield `localStorage`).
- For host-issued rotation, send **`x-tv-state-pickup`** on exactly one poll (no `?pickup=` query on ongoing polls).
- Do **not** log header values. On **401**, render branding-only shell; still honor `deploy` and `forceReloadAt` if present (no guest tiles).

## Sticky ratchet (`state_secret_required_at`)

- Set on **first successful pickup redeem**; cleared only when the device row is deleted (host **Forget**).
- Host **Issue** / **Revoke** nulls active/pending hashes but **does not** clear `state_secret_required_at` — UUID-only polls return **401** until a new pickup is redeemed (even in grace).
- Fleet **State secret: No** after issue is expected until redeem completes.

## What rotates

- **Rotate:** per-device **state secret** (bearer in `x-tv-state-secret`), optionally alongside a **new device UUID** when hardware or QR URL was exposed.
- **Do not rotate mid-stay:** no unlink/re-pair, no pickup re-issue that would strand an in-house guest screen, except emergency host ops with occupancy check.
- **Issue state secret** clears active hash, stages pickup, clears pending hash.

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
3. Update Fully start URL with `?pickup=` **once** (or reload TV with query); TV redeems on next **main** poll and clears pickup from session storage + URL.
4. When fleet shows **State secret: Yes**, remove `?pickup=` from the Fully start URL permanently.
5. If the **device UUID** was exposed: new `?device=<new-uuid>` **before** next guest; old UUID may be **Forgotten** after the box is updated.
6. Verify host fleet: **State secret: Yes**, and **no recent “last legacy poll”** on enrolled rows (`last_legacy_auth_at` throttled to ~1/h).
7. Only after **100%** of paired TVs show **Yes** and legacy timestamps are quiet (recommend **7+ days** with zero UUID-only polls per device), enable `TV_STATE_REQUIRE_SECRET=1` in Vercel (separate change).

## How to verify each TV

| Check | Pass |
|-------|------|
| Host `/host/tvs` | **State secret: Yes** (after pending promotion) |
| UUID-only poll (no pickup header) | Response has **no** `stateSecret` field |
| TV after pickup redeem | Signage loads; `fh_tv_state_secret` present (host tooling only; never log value) |
| **Unenrolled** + grace (`TV_STATE_REQUIRE_SECRET` unset) | UUID-only poll returns **200** full state (legacy); still **no** `stateSecret` in JSON |
| **Required-at set** / enrolled + wrong/missing bearer | **401** branding-only JSON (even in grace) |
| **Enrolled** + enforcement on | UUID-only → **401**; correct bearer → **200** |
| 401/503 body | No guest PII; may include `deploy`, `forceReloadAt`, `pendingCommand: null`; **does not** bump `last_seen` (writes `last_unauthorized_at` for fleet) |
| Reload reachability probe | Must not send `x-tv-state-pickup`; may persist `stateSecret` from a 200 main poll only |

## Pre-apply SQL check (service_role, SELECT only)

```sql
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'tv_devices'
  and column_name in (
    'state_secret_hash',
    'state_secret_pending_hash',
    'state_secret_required_at',
    'state_secret_pickup_hash',
    'state_secret_pickup_expires_at',
    'last_legacy_auth_at'
  );
```

Empty result → safe to apply `0027`. Never run rollback without Devin GO.

## Post-migration privilege check (before go-live)

After `0027` applies the `revoke all on tv_devices from anon, authenticated` clause, confirm the app service role retains DML:

```sql
select has_table_privilege('service_role', 'public.tv_devices', 'SELECT,INSERT,UPDATE,DELETE');
```

Must return `true` before enabling `TV_STATE_REQUIRE_SECRET=1`.

## Rollout order (summary)

1. Merge #185, rebase #186, deploy with `TV_STATE_REQUIRE_SECRET` **unset** (grace).
2. Apply migration **0027** in Supabase when approved (manual SQL or migrate with explicit flag).
3. For each paired TV: host **link/claim/issue** → copy pickup → append to Fully URL once → confirm **State secret: Yes** → strip `?pickup=` from Fully URL.
4. Fleet dashboard: all paired rows **State secret: Yes**; watch **last legacy poll** go quiet.
5. Set `TV_STATE_REQUIRE_SECRET=1`; verify required-at / enrolled UUID-only → **401** without guest fields and **never** ship `stateSecret`.
6. Document UUID URL changes in turnover checklist (`docs/SHIELD-SETUP.md`).

## Logging (Vercel)

- Pickup mint: structured `tv_state_pickup_mint` with **8-char device prefix** and **`hostAuth`** (`google` | `code` | short hash) — **never** email or the pickup token.
- Do not rely on query strings for pickup in production logs (`?pickup=` stripped client-side after first load).

## Never

- Apply migrations to production from a cloud agent run.
- Call `/api/admin/migrate` against live Supabase without understanding the `0027` gate.
- Rotate secrets or UUIDs **during** an occupied stay for convenience.
- Print real UUIDs, pickup tokens, or secrets in tickets, Slack, or CI logs.