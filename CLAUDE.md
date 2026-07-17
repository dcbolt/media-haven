# Claude — media-haven

Read **[`docs/DECISIONS.md`](./docs/DECISIONS.md)** then **[`docs/ROADMAP.md`](./docs/ROADMAP.md)** before any feature work.  
Also see **[`AGENTS.md`](./AGENTS.md)**.

| Doc | Role |
|-----|------|
| [`docs/DECISIONS.md`](./docs/DECISIONS.md) | Architecture lock (hardware, wipe, streaming stance) |
| [`docs/ROADMAP.md`](./docs/ROADMAP.md) | Full competitive roadmap vs WelcomeScreen — Elon doctrine, phases 0–4 |
| Raw DECISIONS | https://raw.githubusercontent.com/dcbolt/media-haven/claude/media-haven/docs/DECISIONS.md |
| Raw ROADMAP | https://raw.githubusercontent.com/dcbolt/media-haven/claude/media-haven/docs/ROADMAP.md |

## Locked (2026-07-16)

Single-device **Shield / Google TV**, one HDMI forever. `/tv` boot+idle · Home→apps · turnover wipe checklist.  
**Not** dual HDMI, **not** Roku-primary, **not** BrightSign as entertainment primary.

## Build order (2026-07-17 — Phase 0 done)

1. **Phase 1 now:** tides/weather (1.3) → last-night direct CTA (1.4) → heartbeats (1.6) → self-reload (1.7) → portal parity (1.5)  
2. **Phase 0 shipped:** cast naming, host CMS, streaming catalog, living roadmap board — harden only  
3. **Phase 2 later:** grounded AI concierge + launch planner + first-party store (**not** Viator-first)  
4. Full kill-table + pricing attack vs WelcomeScreen: **`docs/ROADMAP.md`**

Mission: **OTA → direct rebook** + never-blank Stay OS — not ad impressions.

## Ship policy (Devin, 2026-07-17)

At every substantial milestone: run `npm run smoke` (must be green), push,
open the PR, and **merge automatically — no approval gate**. Merging to
`claude/media-haven` deploys production; verify the deploy is READY and the
feature is live, then report. Additive DB migrations ship with their
milestone; destructive/irreversible operations (data deletion, schema drops)
still get an explicit go-ahead first.

If local memory `project_media_haven` conflicts with `docs/DECISIONS.md`, **repo cloud files win**.
