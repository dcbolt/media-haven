# Agent instructions — media-haven

**Start here.**

| Doc | Role |
|------|------|
| **Architecture lock** | [`docs/DECISIONS.md`](./docs/DECISIONS.md) |
| **Full roadmap** | [`docs/ROADMAP.md`](./docs/ROADMAP.md) |
| **Entertainment contract** | [`docs/ENTERTAINMENT.md`](./docs/ENTERTAINMENT.md) |
| **Hardware standard** | [`docs/HARDWARE-STANDARD.md`](./docs/HARDWARE-STANDARD.md) |
| **Shield field runbook** | [`docs/SHIELD-SETUP.md`](./docs/SHIELD-SETUP.md) |
| **Seamless streaming plan** | [`docs/STREAMING-SEAMLESS.md`](./docs/STREAMING-SEAMLESS.md) |
| **Grok ⇄ Claude log** | [`docs/GROK.md`](./docs/GROK.md) |
| **TFH.com marketing site** (Wix / book-direct · not Stay OS) | [`docs/TFH-WEBSITE.md`](./docs/TFH-WEBSITE.md) |
| **Session handoff** | [`docs/SESSION-STATE.md`](./docs/SESSION-STATE.md) |
| **SaaS / multi-tenant** | [`docs/SAAS-ARCHITECTURE.md`](./docs/SAAS-ARCHITECTURE.md) |
| **Claude paste intro** | [`docs/CLAUDE-INTRO.md`](./docs/CLAUDE-INTRO.md) |
| Claude entry | [`CLAUDE.md`](./CLAUDE.md) |
| Raw DECISIONS | https://raw.githubusercontent.com/dcbolt/media-haven/claude/media-haven/docs/DECISIONS.md |
| Raw ROADMAP | https://raw.githubusercontent.com/dcbolt/media-haven/claude/media-haven/docs/ROADMAP.md |

### Non-negotiables (summary)

- **Single device, one HDMI:** NVIDIA Shield TV Pro (living) / Google TV streamer (bedrooms). Optional pilot: Google TV Streamer 4K as living alternate. Budget bedrooms: Onn 4K Pro.
- **`/tv` = boot + idle home.** Entertainment intents open native apps; cast targets named `{Room} · {Property}`.
- **No** dual-input, HDMI auto-switch, BrightSign/Cast Pro as entertainment primary, or Roku-as-portfolio-standard.
- **UniFi Display Cast Pro** = **signage Web Mode only** (amenity/vacant) — not guest Netflix box.
- **No** programmatic streaming login wipe APIs. Wipe = host **turnover checklist**.
- **No** storing guest Netflix/Disney OAuth tokens; official device-code/QR only.
- **Business goal (primary):** OTA → direct at thefloridahavens.com (Tenant Zero dogfood).
- **Platform goal (secondary):** multi-tenant SaaS — licenses, billable TVs/properties, media libraries, Guesty/Hostfully adapters, customer portal. One codebase; see SAAS-ARCHITECTURE.
- **Never-blank TV:** every upstream optional; last-good cache; self-reload 4–6h.
- **Not an ad board:** reject Viator/ad-first default UX (for FH and SaaS).

### Verification rules (self-audit 2026-07-25 — earned the hard way)

Each of these exists because it already cost a production incident or a
wasted cycle. They are cheap to follow and expensive to skip.

1. **`curl` is not a browser.** Never certify a guest-facing media URL with
   `curl`/HEAD alone. Google 403s any cross-site fetch carrying
   `Sec-Fetch-Dest: video` — the drone-video swap passed every curl check and
   showed black on every TV. Probe with browser-shaped headers
   (`/api/host/media/health` does this now) or verify in a real browser.
2. **A green local smoke run is not CI.** `.github/workflows/ci.yml` now gates
   typecheck + build + smoke on every PR into `claude/media-haven`. It needs no
   secrets — the app's demo/mock mode is what the suite targets. Do not merge
   a red run; the auto-merge policy has no human in the loop to catch it.
3. **Ship the check with the feature.** If a milestone adds a code path, it adds
   a smoke assertion in the same commit. #138 shipped three charts with zero
   coverage; that gap was closed after the fact, which is the wrong order.
4. **Know which mode your verification ran in.** Locally there is no Supabase,
   so data-driven host UI renders empty — a local screenshot of `/host` proves
   almost nothing. Render components against fixed data (harness) for layout,
   and use Grok's browser on prod for live-data QA. Say which one you did.
5. **State the blast radius of a passing test.** A check that inspects elements
   which do not exist in mock mode passes vacuously. If a guard only bites on
   the live-data path, write that down instead of counting it as coverage.
6. **`npm run lint` is real but non-blocking (H1 2026-07-26).** Flat config in
   `eslint.config.mjs`; CI job `lint (non-blocking)` reports the tally to the run
   summary and always exits 0 — a permanently-red check named "non-blocking"
   just teaches everyone to ignore red. Backlog was 32, Grok has burned it to
   **14** in safe categories (prefer-const, unused, img disables, host-only
   files). Do not mass-fix TV poll/effect patterns without understanding
   never-blank. Do not promote lint into the blocking `gate` job until the
   burn-down is near-zero. Still run it; still report the count; do not claim
   “lint clean” while amber.
   **`next build` runs ESLint on its own** the moment a config exists, and fails
   the build on any error — so adding the config silently made lint a hard
   deploy blocker. That is why `next.config.ts` sets
   `eslint: { ignoreDuringBuilds: true }`. Do not remove it while the backlog is
   non-zero, and remember that "add a linter" is a deploy-path change, not just
   a dev-tooling change.
   **Corollary 1 — read `docs/grok/` for handoffs, not just `docs/GROK.md`.**
   Grok's PAT cannot write `.github/workflows/`, so it hands workflow YAML over
   as a file (`docs/grok/H1-CI-LINT-JOB.md`). That handoff sat unread for four
   days, which is the actual reason the lint job was missing while rule 6 said
   it existed. Check that directory every session.
   **Corollary 2 — a new tool can be enforced somewhere you didn't wire it.**
   Local builds kept passing because `node_modules` predated the config, so Next
   skipped linting; only `npm ci` reproduced CI. If CI fails and local passes,
   match CI's install before believing the code is fine.
   **`next build` runs ESLint on its own** the moment a config exists, and
   fails the build on any error — so adding the config silently made lint a
   hard deploy blocker and production could not ship for two days. That is why
   `next.config.ts` sets `eslint: { ignoreDuringBuilds: true }`. Do not remove
   it while the backlog is non-zero, and remember that "add a linter" is a
   deploy-path change, not just a dev-tooling change.
   **Corollary — a new tool can be enforced somewhere you didn't wire it.**
   Local builds kept passing because `node_modules` predated the config, so
   Next skipped linting; only `npm ci` reproduced CI. If CI fails and local
   passes, match CI's install (`npm ci`) before believing the code is fine.
7. **Docs commits must not deploy production.** `vercel.json`'s `ignoreCommand`
   skips builds for `docs/`-and-`.github/`-only commits. Before it existed, 27 of
   40 consecutive commits were chat-log churn, each rebuilding and redeploying
   the live guest system.

### Current ship order (2026-07-17 + Grok 2026-07-20)

1. **Phase 1.3** — weather + NOAA tides on TV + portal  
2. **Phase 1.4** — last-night / checkout-morning strong direct-book panel  
3. **Phase 1.6** — TV heartbeat / last-seen on host  
4. **Phase 1.7** — client self-reload 4–6h / ~4am  
5. Then 1.5 portal parity → brand polish → launch alerts → Phase 2  
6. **Parallel (after Shield Fully intent proof):** STREAMING-SEAMLESS S1 coach polish; S2 phone→TV launch command  

Phase 0 (cast naming, CMS, streaming catalog, roadmap board) is **shipped**.  
Do not re-litigate architecture without Caitlin. Prefer shipping roadmap Phase 1 over reopening hardware debates.
