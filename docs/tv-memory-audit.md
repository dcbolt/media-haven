# `/tv` memory & auto-refresh audit

Branch baseline: `#153` head (`a1a9d22`) + follow-up `#155` fixes.  
Inventory is line-accurate to `cursor/tv-renderer-guard-f69b` after this pass.

## Full page reload paths

| Trigger | Location | When | Gated |
|--------|----------|------|--------|
| Deploy SHA change | `app/tv/page.tsx` ~273–284 | Poll sees new `payload.deploy` after 2 min uptime | `reloadTvIfReachable`, **exempt** |
| Host force reload | ~290–299 | `forceReloadAt` stamp, after 5 s uptime | exempt + stamp after success |
| Failed poll heal | ~356–361 | ≥120 failed polls (~20 min) | **budgeted** probe |
| Nightly self-heal | ~372–393 | 3:00–4:00 AM local (6 h cap) | budgeted probe, 5 min retry |
| Main-thread stall | ~397–401 | RAF gap >60 s | **exempt** |
| Error boundary | `app/tv/error.tsx` ~32–58 | 30 s → 5 min backoff forever | exempt |
| Try again button | `error.tsx` ~85–92 | Manual | exempt |
| All reloads | `lib/tv-reload.ts` ~122–135 | After probe HTTP 200 | `window.location.reload()` |

No `router.refresh()` on `/tv`.

## Timers & polls

| Source | File:line | Interval | Cleanup |
|--------|-----------|----------|---------|
| State poll | `page.tsx` ~249–363, 366–370 | 10 s | `clearInterval` on unmount / deps |
| Nightly reload schedule | ~372–393 | once + 5 min retry | `clearTimeout`, cancelled flag |
| Clock (header) | ~141–147 | 15 s | `clearInterval` |
| Tide clock | ~972–974 | 1 s | `clearInterval` |
| Rocket clock | ~1022–1024 | 1 s | `clearInterval` |
| Standby image advance | ~591–595 | 45 s | `clearTimeout` per asset |
| Slide dwell | ~2775–2784 | per slide (default ~20 s) | `clearTimeout` |
| Weather tour | ~2798–2806 | per slide | `clearTimeout` |
| Guest idle → Home | ~2472–2488 | 180 s reset on input | **clear on unmount** (fix) |
| Ambience rotate | `ambience-player.tsx` ~75–80 | `AMBIENCE_ROTATE_MS` | `clearInterval` |
| Ambience resume retry | ~108 | 12 s | `clearInterval` |
| Ambience crossfade dispose | ~193–198 | once per crossfade | **clear on Engine.stop** (fix) |
| Error retry | `error.tsx` ~55 | 30 s–5 min | `clearTimeout` |
| Main-thread heartbeat | `lib/tv-main-thread-heartbeat.ts` | RAF each frame | `cancelAnimationFrame` |

## Event listeners

| Event | File:line | Cleanup |
|-------|-----------|---------|
| `visibilitychange` (wake lock) | `page.tsx` ~421–424 | removed |
| `visibilitychange` (ambience) | `ambience-player.tsx` ~107 | removed |
| `pointerdown` / `keydown` (ambience resume) | ~104–105 | removed |
| `pagehide` (ambience suspend) | ~106 | removed |
| `keydown` (nav) | `page.tsx` ~2685–2686 | removed (re-bound when deps change) |
| `fh:media-ended` | ~2780–2783 | removed |
| SW | register only; no `message` listener on page | n/a |

## Network

| Call | File:line | Frequency |
|------|-----------|-----------|
| `GET /api/tv/state` | `page.tsx` ~253 | every 10 s |
| `POST /api/tv/command/:id` | ~327 | once per pending command |
| Probe inside reload | `lib/tv-reload.ts` ~85 | before each reload attempt |

## Media / memory

| Mechanism | File | Notes |
|-----------|------|--------|
| `<video>` slides / bg / standby | `page.tsx` | `releaseVideoElement` on change (fix #155) |
| Hidden preloader | `MediaPreloader` ~1557+ | cap registry 4; release src off-DOM |
| Object URLs | `lib/tv-media-memory.ts` | revoke on release |
| `<img>` preload | preloader | **clear src when evicted** (fix) |
| Ambience Web Audio | `ambience-player.tsx` | graph torn down on effect cleanup; crossfade timer cleared |

## Service worker

| Item | File | Notes |
|------|------|--------|
| Register `/tv-sw.js` | `page.tsx` ~234–241 | skipped when `no-sw` / off flag |
| Unregister + cache delete | ~224–228 | kill switch |

## Leaks found & fixes (follow-up #155)

| Issue | Severity | Fix |
|-------|----------|-----|
| Ambience crossfade `setTimeout` not cleared on unmount / rapid rotate | Medium — orphaned nodes + timers | Track `crossfadeTimer` on `Engine`, clear in `stop()` |
| Wake lock re-acquire without releasing prior lock | Low — duplicate locks on visibility | Release before re-request |
| Guest idle timer not cleared on deck unmount | Low | `clearTimeout` on unmount |
| Unbounded warm media / video src | High on long-run TVs | Registry cap + detach (prior commit) |
| Preloader `<img>` kept remote URLs forever in hidden DOM | Low | Remove `src` when dropped from warm set |

## Verification

- `tests/tv-memory-cycle-smoke.mjs` — 500 simulated slide cycles, registry peak ≤ cap.
- `tests/tv-memory-harness.mjs` — headless `/tv` arrow-step churn, DOM/video/heap deltas (CI when Chromium + server available).
