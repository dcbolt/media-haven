# Paste this into a new Claude Code session (media-haven)

Copy everything below the line into Claude Code when starting work on Florida Havens / Media Haven.

---

You are working on **media-haven** — guest Stay OS for **The Florida Havens** (Melbourne Beach short-term rentals).

## Repo & deploy

- **GitHub:** https://github.com/dcbolt/media-haven  
- **Branch:** `claude/media-haven` (auto-deploys production)  
- **Live:** https://media-haven-lilac.vercel.app  
- **Local:** `/Users/devinwambolt/media-haven` (if present) or clone the repo  
- **Stack:** Next.js App Router, TypeScript, Supabase, Tailwind, Vercel, Guesty  

## Read first (in order)

1. [`CLAUDE.md`](../CLAUDE.md) + [`AGENTS.md`](../AGENTS.md)  
2. [`docs/DECISIONS.md`](./DECISIONS.md) — **architecture lock**  
3. [`docs/ROADMAP.md`](./ROADMAP.md) — phases vs WelcomeScreen  
4. [`docs/ENTERTAINMENT.md`](./ENTERTAINMENT.md) — streaming contract  
5. [`docs/HARDWARE-STANDARD.md`](./HARDWARE-STANDARD.md) — Shield / Cast Pro / buy list  
6. [`docs/STREAMING-SEAMLESS.md`](./STREAMING-SEAMLESS.md) — seamless QR launch plan  
7. [`docs/GROK.md`](./GROK.md) — latest Grok findings log  
8. [`docs/SESSION-STATE.md`](./SESSION-STATE.md) — live Guesty/Supabase status  
9. **Marketing website (separate product):** [`docs/TFH-WEBSITE.md`](./TFH-WEBSITE.md) — thefloridahavens.com Wix audit, book-direct, new-repo plan. Guest house guides stay in Media Haven, not TFH.com.

If anything conflicts: **DECISIONS + ENTERTAINMENT win**.

## Mission

1. **Primary:** Dogfood for **The Florida Havens** — OTA → direct rebook, never-blank TV + portal  
2. **Secondary (architecture now):** Same product becomes **multi-tenant SaaS** — licensing, customer portal, media libraries, multi-PMS (Guesty, Hostfully, …). FH = Tenant Zero, not a fork.  
3. Streaming: guests use **their** accounts via **native apps** on one HDMI — not an ad board  

**SaaS rules:** Read [`docs/SAAS-ARCHITECTURE.md`](./SAAS-ARCHITECTURE.md). New schema needs `org_id` (or FK chain to org). PMS behind adapters. Don’t hardcode only Florida Havens. Billing/Stripe can wait; **isolation plumbing does not.**

## Grok’s standing initiative (Devin 2026-07-24) — partner accordingly

Grok’s **direct initiative** across **Media Haven** and **DCBolt configurator** is to:

1. **Optimize performance, functionality, and user experience** continuously  
2. **Find and extinguish** real issues, bugs, and errors (no invented bugs)  
3. **Provide ample feedback** to Claude — repro, severity, UX impact, suggested fix — so we improve on all fronts  

Claude: read the latest `#### Grok →` in [`docs/GROK.md`](./GROK.md). Prefer multi-assign tickets that let Grok pipeline polish/QA/fixes while you ship larger design. Grok will ship small safe slices when unblocked and stay quiet when idle.

## Locked architecture (do not reopen without Caitlin)

- **One device, one HDMI forever:** NVIDIA Shield TV Pro (living) / Google TV (bedrooms)  
- `/tv` = boot + idle home; **Home** or Entertainment intents open Netflix etc.  
- **Wipe = host turnover checklist** — no programmatic Netflix logout API  
- **No** dual HDMI, Roku-primary, BrightSign-as-entertainment, iframe Netflix, stored stream OAuth tokens  
- **UniFi Display Cast Pro** = optional **signage** Web Mode only — **not** guest entertainment primary  

## Surfaces

| Path | Who |
|------|-----|
| `/tv` | TV kiosk (Fully Kiosk on Shield/GTV) |
| `/welcome?token=` | Guest phone (opaque token, never raw Guesty ID) |
| `/host` | Host CMS, TVs, media, turnover, Guesty sync |
| Demo | `/welcome?token=demo` works without config |

## Ship policy

- `npm run smoke` green before push  
- Push/merge to `claude/media-haven` deploys prod — verify READY  
- Update living roadmap board (`/api/roadmap`) in the **same session** as the work  
- Prefer **Phase 1** (tides/weather → last-night direct → heartbeat → self-reload → portal parity) over re-litigating hardware  

## Recent Grok recommendations (2026-07-20)

- Seamless streaming plan: launcher + official phone QR; Phase 2 = portal “Open on TV” command  
- Hardware: Shield Pro #1 all-in-one; Google TV Streamer = modern alt (pilot); Onn 4K Pro = budget bedrooms  
- Cast Pro: do not replace Shield for living rooms  

## First actions this session

1. `git pull` on `claude/media-haven`  
2. Skim DECISIONS + latest `docs/GROK.md` log  
3. Confirm Phase 1 next item from ROADMAP / host roadmap board  
4. Ship a small slice; smoke; deploy; report  

Ask Devin only for: Vercel/Supabase secret changes, physical Fully Kiosk intent tests on Shield, Guesty dashboard clicks you cannot do via API.
