# Agent instructions — media-haven

**Start here.**

| Doc | URL |
|-----|-----|
| **Architecture lock** | [`docs/DECISIONS.md`](./docs/DECISIONS.md) |
| **Full roadmap (vs WelcomeScreen)** | [`docs/ROADMAP.md`](./docs/ROADMAP.md) |
| Raw DECISIONS | https://raw.githubusercontent.com/dcbolt/media-haven/claude/media-haven/docs/DECISIONS.md |
| Raw ROADMAP | https://raw.githubusercontent.com/dcbolt/media-haven/claude/media-haven/docs/ROADMAP.md |

### Non-negotiables (summary)

- **Single device, one HDMI:** NVIDIA Shield TV Pro (living) / Chromecast with Google TV 4K (bedrooms).
- **`/tv` = boot + idle home.** Guest presses **Home** for Netflix etc. Cast to the same device (named `{Room} · {Property}`).
- **No** dual-input, HDMI auto-switch product, BrightSign-as-primary, or Roku-as-portfolio-standard.
- **No** programmatic streaming login wipe APIs (they don't exist). Wipe = host **turnover checklist**.
- **Business goal:** OTA → direct at thefloridahavens.com (last-night TV panel + portal + real incentive).
- **Never-blank TV:** every upstream optional; last-good cache; self-reload 4–6h.
- **Not an ad board:** reject Viator/ad-first default UX; convert to direct stays.

### Current ship order (2026-07-17)

1. **Phase 1.3** — weather + NOAA tides on TV + portal  
2. **Phase 1.4** — last-night / checkout-morning strong direct-book panel  
3. **Phase 1.6** — TV heartbeat / last-seen on host  
4. **Phase 1.7** — client self-reload 4–6h / ~4am  
5. Then 1.5 portal parity → brand polish → launch alerts → Phase 2  

Phase 0 (cast naming, CMS, streaming catalog, roadmap board) is **shipped**.  
Do not re-litigate architecture without Caitlin. Prefer shipping roadmap Phase 1 over reopening hardware debates.
