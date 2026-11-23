# Auditor Rule B — MH186 TV state (r1/3) — fix run status

Base reject: `0cecc11c6250` (overlap with SECURITY r1/3). Branch: `cursor/tv-state-device-secret-437d` (draft PR #186).

## F-559x closure

| ID | Pri | Item | Status |
|----|-----|------|--------|
| F-5591 | P1 | `listTvDevices` fallback must not SELECT 0027 columns | **Done** — `noSecretCols` / `legacyCols` omit `state_secret_hash` and `last_legacy_auth_at`; nulls injected in map |
| F-5593 | P2 | Readiness: wrong secret in grace → 401; `last_legacy_auth_at` persisted | **Done** — per-device ratchet in `evaluateTvStateAuth`; `recordLastLegacyAuthAt` on legacy path; fleet shows “last legacy poll” |
| F-5594 | P2 | Mutant-killing tests | **Done** — `tests/tv-state-auth-gate-smoke.mjs` (see map below) |
| F-5595 | P3 | 401 keeps reload/deploy/last_seen, no guest data | **Done** — `buildUnauthorizedPollBody` + TV client handles `deploy`/`forceReloadAt` on 401 |
| F-5597 | P3 | Pickup once; strip URL/history | **Done** — `absorbPickupFromUrl` + clear header after first poll; server no longer reads `?pickup=` |
| F-5598 | P3 | Gate 0027 on `/api/admin/migrate` + rollback doc | **Done** — `lib/migrate-policy.ts`; `docs/supabase/0027_tv_state_secret_rollback.sql` |
| F-5599 | P3 | PR/docs: #185 first, rebase; grace vs 401; Roku | **Done** — `docs/TV-STATE-SECRET-ROTATION.md`; PR body updated |

## MH186-x (security overlap)

| ID | Status | Notes |
|----|--------|-------|
| MH186-1 | Done | Pickup authorizes one poll; `REQUIRE=1` honored |
| MH186-2 | Done | Enrolled ratchet → 401 |
| MH186-3 | Done | Conditional pickup redeem UPDATE |
| MH186-4 | Done | Pre-0027 list fallbacks |
| MH186-5 | Done | Auth gate smoke (route logic unit) |
| MH186-6 | Done | No server `?pickup=`; client strip + doc logging note |
| MH186-7 | Done | `minimalUnauthorizedTvState` + tests |
| MH186-8 | Done | Revoke host op + supersede on mint |
| MH186-9 | Done | `last_legacy_auth_at` column + writer + fleet UI |
| MH186-10 | Done | Pickup mint structured log |
| MH186-11 | Done | (prior) prefix logging |
| MH186-12 | Done | SELECT-only pre-apply block in rotation doc |

## F-5594 mutant → test map

| Mutant | Killing test |
|--------|----------------|
| Drop single-use pickup (ship `stateSecret` without redeem) | `MUTANT drop-single-use killed` in `tv-state-auth-gate-smoke.mjs` |
| Ignore `evaluateTvStateAuth` deny | `MUTANT ignore-gate killed` |
| Skip 401 guest strip | `MUTANT drop-401-strip killed (branding only)` |

## Hard rules (this run)

- Draft PR only — **no merge**, no push to `claude/media-haven`, no live migration/env.
- **No rebase** on #185 until it merges (documented order only).