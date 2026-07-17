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
- **`/tv` = boot + idle home.** Guest presses **Home** for Netflix etc. Cast to the same device.
- **No** dual-input, HDMI auto-switch product, BrightSign-as-primary, or Roku-as-portfolio-standard.
- **No** programmatic streaming login wipe APIs (they don't exist). Wipe = host **turnover checklist**.
- **Business goal:** OTA → direct at thefloridahavens.com (last-night TV panel + portal + real incentive).
- **Never-blank TV:** every upstream optional; last-good cache; self-reload 4–6h.
- **Not an ad board:** reject Viator/ad-first default UX; convert to direct stays.

### Current ship order

1. Cast naming (`deviceLabel`) — ROADMAP Phase 0.6  
2. Phase 1 conversion + reliability  
3. Phase 2 grounded AI / first-party store  

Do not re-litigate architecture without Caitlin. Prefer shipping roadmap Phase 0–1 over reopening hardware debates.
