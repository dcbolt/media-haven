# Agent fix checklist (not an auditor or security verdict)

Working notes from agent fix runs on draft **PR #186** (`cursor/tv-state-device-secret-437d`).  
For authoritative review status, use SECURITY/AUDITOR reports in the vault — not this file.

## r1 / Rule B (partial — superseded by later heads)

| ID | Agent notes |
|----|-------------|
| F-5591 | Pre-0027 list fallbacks omit secret columns — implemented in `lib/tv.ts` |
| F-5593+ | See r2/r3 heads for ratchet, `state_secret_required_at`, fleet signals |
| F-5594 | Production mutant killers live in `tests/tv-state-production-mutant-smoke.mjs` (not helper-only) |
| F-5595 | 401/503 keep `deploy` / `forceReloadAt`; **do not** bump `last_seen` (F-5604) |
| F-5597–F-5599 | Pickup one-shot, migrate gate, docs — see `docs/TV-STATE-SECRET-ROTATION.md` |

## r2 provisional (auditor @330b7ab) — track on latest head

| ID | Track in CI / PR body |
|----|------------------------|
| F-5607 | Fail-closed auth row load → 503/401 minimal |
| F-5602 | Probe without pickup (MH186-14) |
| F-5603 | Mint log `hostAuth` not email (MH186-16) |
| F-5604 | `last_unauthorized_at` on deny |
| F-5605 | Deterministic wrong-hash verify test ×200 |
| F-5606 | This file replaces mislabeled `raw/agent-reports/…` verdict |

**Do not** treat rows marked “Done” in older agent commits as audit sign-off.