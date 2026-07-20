# Claude — media-haven

Read **[`docs/DECISIONS.md`](./docs/DECISIONS.md)** then **[`docs/ROADMAP.md`](./docs/ROADMAP.md)** before any feature work.  
Also see **[`AGENTS.md`](./AGENTS.md)**.

**Cold start:** Devin can paste **[`docs/CLAUDE-INTRO.md`](./docs/CLAUDE-INTRO.md)** into a new session.

| Doc | Role |
|-----|------|
| [`docs/DECISIONS.md`](./docs/DECISIONS.md) | Architecture lock (hardware, wipe, streaming stance) |
| [`docs/ROADMAP.md`](./docs/ROADMAP.md) | Full competitive roadmap vs WelcomeScreen — phases 0–4 |
| [`docs/ENTERTAINMENT.md`](./docs/ENTERTAINMENT.md) | Entertainment tab contract (launcher + device-code coach) |
| [`docs/HARDWARE-STANDARD.md`](./docs/HARDWARE-STANDARD.md) | Buy list: Shield / GTV Streamer / Onn; Cast Pro = signage only |
| [`docs/STREAMING-SEAMLESS.md`](./docs/STREAMING-SEAMLESS.md) | Seamless QR + phone→TV launch game plan (Grok 2026-07-20) |
| [`docs/GROK.md`](./docs/GROK.md) | Grok ⇄ Claude log + protocol |
| [`docs/SESSION-STATE.md`](./docs/SESSION-STATE.md) | Live Guesty/Supabase/deploy handoff |
| [`docs/RUNBOOK.md`](./docs/RUNBOOK.md) | Ops |
| [`docs/CLAUDE-INTRO.md`](./docs/CLAUDE-INTRO.md) | Pasteable session intro for Devin → Claude |
| Raw DECISIONS | https://raw.githubusercontent.com/dcbolt/media-haven/claude/media-haven/docs/DECISIONS.md |
| Raw ROADMAP | https://raw.githubusercontent.com/dcbolt/media-haven/claude/media-haven/docs/ROADMAP.md |

## Locked (2026-07-16 + hardware reconfirm 2026-07-20)

Single-device **Shield / Google TV**, one HDMI forever. `/tv` boot+idle · Home/Entertainment → native apps · turnover wipe checklist.  
**Not** dual HDMI, **not** Roku-primary, **not** BrightSign/Cast Pro as entertainment primary.  
**UniFi Cast Pro** = optional **signage** Web Mode only (see HARDWARE-STANDARD).

Streaming: **no** stored Netflix/Disney OAuth; **no** API wipe; official device-code/QR only (ENTERTAINMENT + STREAMING-SEAMLESS).

## Build order (2026-07-17 — Phase 0 done)

1. **Phase 1 now:** tides/weather (1.3) → last-night direct CTA (1.4) → heartbeats (1.6) → self-reload (1.7) → portal parity (1.5)  
2. **Phase 0 shipped:** cast naming, host CMS, streaming catalog, living roadmap board — harden only  
3. **Streaming polish (parallel, after S0 hardware proof):** Path A coach + optional Path C “Open on TV” (STREAMING-SEAMLESS)  
4. **Phase 2 later:** grounded AI concierge + launch planner + first-party store (**not** Viator-first)  

Mission: **OTA → direct rebook** + never-blank Stay OS — not ad impressions.

## Living roadmap (Devin, 2026-07-17)

`/roadmap.html` (API `/api/roadmap`) must always reflect reality — update it
**in the same working session as the work itself**: new work → item added
(in_progress), shipped → marked shipped, anything waiting on Devin →
`blocked` with a "NEEDS DEVIN:" title. Devin reads this board to know where
the project is at any moment.

## Ship policy (Devin, 2026-07-17)

At every substantial milestone: run `npm run smoke` (must be green), push,
open the PR, and **merge automatically — no approval gate**. Merging to
`claude/media-haven` deploys production; verify the deploy is READY and the
feature is live, then report. Additive DB migrations ship with their
milestone; destructive/irreversible operations (data deletion, schema drops)
still get an explicit go-ahead first.

If local memory `project_media_haven` conflicts with `docs/DECISIONS.md`, **repo cloud files win**.
