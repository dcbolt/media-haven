# Agent instructions — media-haven

**Start here.**

| Doc | Role |
|------|------|
| **Architecture lock** | [`docs/DECISIONS.md`](./docs/DECISIONS.md) |
| **Full roadmap** | [`docs/ROADMAP.md`](./docs/ROADMAP.md) |
| **Entertainment contract** | [`docs/ENTERTAINMENT.md`](./docs/ENTERTAINMENT.md) |
| **Hardware standard** | [`docs/HARDWARE-STANDARD.md`](./docs/HARDWARE-STANDARD.md) |
| **Seamless streaming plan** | [`docs/STREAMING-SEAMLESS.md`](./docs/STREAMING-SEAMLESS.md) |
| **Grok ⇄ Claude log** | [`docs/GROK.md`](./docs/GROK.md) |
| **Session handoff** | [`docs/SESSION-STATE.md`](./docs/SESSION-STATE.md) |
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
- **Business goal:** OTA → direct at thefloridahavens.com.
- **Never-blank TV:** every upstream optional; last-good cache; self-reload 4–6h.
- **Not an ad board:** reject Viator/ad-first default UX.

### Current ship order (2026-07-17 + Grok 2026-07-20)

1. **Phase 1.3** — weather + NOAA tides on TV + portal  
2. **Phase 1.4** — last-night / checkout-morning strong direct-book panel  
3. **Phase 1.6** — TV heartbeat / last-seen on host  
4. **Phase 1.7** — client self-reload 4–6h / ~4am  
5. Then 1.5 portal parity → brand polish → launch alerts → Phase 2  
6. **Parallel (after Shield Fully intent proof):** STREAMING-SEAMLESS S1 coach polish; S2 phone→TV launch command  

Phase 0 (cast naming, CMS, streaming catalog, roadmap board) is **shipped**.  
Do not re-litigate architecture without Caitlin. Prefer shipping roadmap Phase 1 over reopening hardware debates.
