# media-haven — Locked Decisions (2026-07-16)

**Canonical agent communication file** for Claude, Grok, Codex, and humans.

| | |
|--|--|
| **Repo** | https://github.com/dcbolt/media-haven |
| **This file** | https://github.com/dcbolt/media-haven/blob/claude/media-haven/docs/DECISIONS.md |
| **Raw** | https://raw.githubusercontent.com/dcbolt/media-haven/claude/media-haven/docs/DECISIONS.md |
| **Source** | Grok consultation with Caitlin (Florida Havens), 2026-07-16 |
| **Status** | LOCKED architecture — do not re-litigate without Caitlin |
| **Roadmap** | **[`docs/ROADMAP.md`](./ROADMAP.md)** — full competitive plan vs WelcomeScreen (Elon doctrine, phases 0–4) |

Also mirrored for local Claude memory: `project_media_haven`. Brief questions archive may exist as `~/Downloads/grokconsultationbrief.md`.

> **2026-07-17:** Full product roadmap (beat WelcomeScreen feature-by-feature) lives in **`docs/ROADMAP.md`**. This file remains the hardware/architecture lock. Software *expansion* priorities track the roadmap phases.

---

## Product

Self-hosted guest media center for **The Florida Havens** (Melbourne Beach, Space Coast). Replaces WelcomeScreen / Hello Guest.

| Goal | Detail |
|------|--------|
| **#1 Business** | Convert OTA guests → direct repeat at **thefloridahavens.com** |
| **#2 Experience** | Streaming/casting effortless on in-unit TVs with **guest's own accounts** |

Related ops app: **HavenOps** (`dcbolt/havenops`) — family command center; **separate** from this guest TV/portal product.

---

## Architecture: LOCKED

### Single device, one HDMI forever

```
TV (one input) ──► NVIDIA Shield TV Pro (living) / Chromecast with Google TV 4K (bedrooms)
                      │
                      ├── Boot + idle → https://…/tv?device=…
                      ├── Home        → Netflix / Disney+ / etc. (guest accounts)
                      ├── Cast        → same device, named "{Room} · {Property}"
                      └── Vacant      → black OLED-safe OR host drone slideshow
```

| Rejected | Why |
|----------|-----|
| Dual HDMI (Roku + signage stick) | User wants one input; no input juggling |
| Auto HDMI switching (CEC/IR/Pi) | Fragile; not product scope |
| BrightSign as only entertainment box | Signage king; **no** guest Netflix/cast/apps |
| Roku as portfolio standard | No real browser for `/tv` |
| Programmatic streaming login wipe APIs | **Do not exist** on consumer platforms |
| iframe Netflix etc. | DRM / frame-ancestors |
| Browser TV power control | Impossible |

### Hardware buy list

| Role | SKU |
|------|-----|
| Living room | **NVIDIA Shield TV Pro** + Ethernet |
| Bedrooms | **Chromecast with Google TV 4K** (+ Ethernet adapter if possible) |
| Per site | Spare primary streamer + spare remotes |
| Kiosk | Fully Kiosk Browser Plus (or equivalent): start URL `/tv`, keep awake, boot start, idle return to `/tv`, reload 4–6h |

### Guest copy (everywhere identical)

> This screen is your house guide.  
> Press **Home** for Netflix and streaming (sign in with *your* accounts).  
> When you're done, this guide comes back.  
> We clear logins after checkout.

### Account wipe = checklist (not automation)

Turnover: sign out major apps; confirm `/tv` still boots; remote present.  
Build into host dashboard. No v1 ADB productization.

### Streaming stance

- Guests use **native apps** on Shield / Google TV with their own accounts.
- Phone portal provides one-tap **TV-code activation links** (netflix.com/tv, disneyplus.com/begin, …).
- TV **Entertainment** tab: service grid → OK launches native app (Android intent) → walkthrough coaches official device-code sign-in (QR to provider activate URL). See **[`docs/ENTERTAINMENT.md`](./ENTERTAINMENT.md)**.
- **Do not** build Roku Guest Mode API integration (does not exist).
- **Do not** iframe or embed streaming services.
- **Do not** store guest Netflix/Disney/etc. OAuth tokens or claim “we sign the TV in for them.”
- Older README language about "standardize on Roku" is **superseded** by this file.

---

## Software priorities

Canonical phased plan + WelcomeScreen teardown: **[`docs/ROADMAP.md`](./ROADMAP.md)**.

### P0 — Phase 0 (SHIPPED — harden only)
- Never-blank `/tv` + last-good cache (every API optional)
- Personalized welcome + Wi-Fi `WIFI:` QR
- Launch board (LL2 **server-cached**; TVs hit our API only)
- Stream/cast panel for **Google TV/Shield + Home** (not Roku input language)
- **Cast target naming:** `TvContent.deviceLabel` + `Cast to: {label} · {property}` — **Done (#8)**
- Host property CMS + feed toggles + streaming catalog — **Done (#8, #10)**
- Living roadmap board — **Done (#9)**
- Phone portal: Wi-Fi, activation links, direct CTA
- Host: tokens, TV pair, screensaver upload, **media wipe checklist**

### P1 — Phase 1 (NEXT — beat WelcomeScreen on wow + conversion)
Ship order: **1.3 → 1.4 → 1.6 → 1.7 → 1.5 → 1.1/1.2 → 1.8**
- NOAA tides + weather polish on TV and phone ← **next ship**
- Last-night / checkout-morning **strong** direct-book panel
- TV heartbeat / last-seen (fleet health)
- Client self-reload every 4–6h or ~4am
- Phone portal parity polish
- 10-ft brand polish (logos, drone, property identity)
- Email opt-in ("launch alerts") + CAN-SPAM consent fields

### P2 — Phase 2 (Stay OS)
- Grounded AI concierge (property + Space Coast RAG — **no free-web hallucination on TV**)
- Launch-week trip planner
- First-party Haven extras store (early check-in, chef, etc.) — **not** Viator/ad-first
- Guesty webhooks + Wi-Fi custom fields
- Vacant-mode productization + multi-TV fleet map

### P3 — Phase 3–4 (portfolio + moats)
- All 6 Havens hardware/SOP rollout
- Surf / Sebastian Inlet, turtle-season panels, fullscreen launch countdown
- BrightSign ambient-only experiments; optional ADB wipe *scripts*
- Productize multi-tenant only if Caitlin wants SaaS (default = private Havens stack)

### Explicit non-build
Roku Guest Mode API, streaming credential lifecycle automation, captive-portal v1, dual-input product features, BrightSign as living-room standard, **third-party ad networks / Viator carousels as default monetization UX**.

---

## Content

| Need | Approach |
|------|----------|
| Launches | LL2 cached server-side; host pin for special nights; honest "likely visible" heuristic from Melbourne Beach |
| Weather | Open-Meteo |
| Tides | NOAA CO-OPS |
| Conversion | Real direct incentive (confirm with Caitlin: % vs early check-in vs launch-week priority) + last-night panel + optional email |

### Wi-Fi / cast runbook
One guest SSID, no client isolation, streamers on same LAN as phones, flat mesh, cast targets named by room, tip about iOS Local Network + VPN.

---

## `/tv` panel order

1. Welcome  
2. Wi-Fi  
3. **Rockets**  
4. Stream + cast how-to  
5. Weather / tides  
6. Soft direct book  
7. Guide (rules/turtles) less often  
8. Last-night strong direct offer when checkout is imminent  

Voice: luxury Space Coast — short, 10-foot readable, not hotel CMS fluff.

---

## BrightSign note

- **OK:** pure ambient `/tv` on a non-watch display  
- **Not OK:** sole device for villa entertainment (no guest apps/cast)  
- Living-room standard remains Shield / Google TV  

---

## Still valid from original brief (not reversed)

- Opaque per-stay tokens in QR (never raw PMS reservation IDs); expiry = checkout + 24h
- Guesty may lag/tier-gate — mock/cached standalone required
- RLS default-deny; service-role only for data access
- Guesty OAuth token cache in Postgres (5 mints / 24h cap)
- TVs never show error pages; all upstreams optional

---

## Agent instruction

1. **Read this file first**, then **`docs/ROADMAP.md`**, before extending media-haven.
2. Honor single-device Shield/Google TV — do **not** re-open dual-input, Roku-primary, or BrightSign-as-primary unless Caitlin asks.
3. Phase 0 is **done** (including cast naming). Ship **Phase 1** (tides → last-night direct → heartbeat → self-reload) before Phase 2 AI.
4. Mission metric = **OTA → direct rebook** + never-blank TV — not ad impressions or Viator %.
5. When copy mentions streaming: **Home → apps → your accounts → we clear at checkout** — not "switch HDMI to Roku."
