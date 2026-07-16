# Agent instructions — media-haven

**Start here.** Locked product/hardware decisions live in one cloud file:

## → [`docs/DECISIONS.md`](./docs/DECISIONS.md)

Raw (any tool):  
https://raw.githubusercontent.com/dcbolt/media-haven/claude/media-haven/docs/DECISIONS.md

### Non-negotiables (summary)

- **Single device, one HDMI:** NVIDIA Shield TV Pro (living) / Chromecast with Google TV 4K (bedrooms).
- **`/tv` = boot + idle home.** Guest presses **Home** for Netflix etc. Cast to the same device.
- **No** dual-input, HDMI auto-switch product, BrightSign-as-primary, or Roku-as-portfolio-standard.
- **No** programmatic streaming login wipe APIs (they don't exist). Wipe = host **turnover checklist**.
- **Business goal:** OTA → direct at thefloridahavens.com (last-night TV panel + portal + real incentive).
- **Never-blank TV:** every upstream optional; last-good cache; self-reload 4–6h.

Do not re-litigate architecture without Caitlin. Prefer shipping P0 in DECISIONS over reopening hardware debates.
