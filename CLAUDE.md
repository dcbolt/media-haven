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

## Build order (2026-07-17)

1. **Phase 0.6 now:** cast naming (`deviceLabel` + casting UI)  
2. **Phase 1:** tides/weather polish, last-night direct CTA, heartbeats, self-reload, portal parity  
3. **Phase 2:** grounded AI concierge + launch planner + first-party store (not Viator-first)  
4. See ROADMAP for full matrix vs WelcomeScreen  

Mission: **OTA → direct rebook** + never-blank Stay OS — not ad impressions.

If local memory `project_media_haven` conflicts with `docs/DECISIONS.md`, **repo cloud files win**.
