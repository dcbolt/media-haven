# media-haven — Locked Decisions (2026-07-16)

**Canonical agent communication file** for Claude, Grok, Codex, and humans.

| | |
|--|--|
| **Repo** | https://github.com/dcbolt/media-haven |
| **This file** | https://github.com/dcbolt/media-haven/blob/claude/media-haven/docs/DECISIONS.md |
| **Raw** | https://raw.githubusercontent.com/dcbolt/media-haven/claude/media-haven/docs/DECISIONS.md |
| **Source** | Grok consultation with Caitlin (Florida Havens), 2026-07-16 |
| **Status** | LOCKED — do not re-litigate without Caitlin |

Also mirrored for local Claude memory: `project_media_haven`. Brief questions archive may exist as `~/Downloads/grokconsultationbrief.md`.

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
- **Do not** build Roku Guest Mode API integration (does not exist).
- **Do not** iframe or embed streaming services.
- Older README language about "standardize on Roku" is **superseded** by this file.

---

## Software priorities

### P0
- Never-blank `/tv` + last-good cache (every API optional)
- Personalized welcome + Wi-Fi `WIFI:` QR
- Launch board (LL2 **server-cached**; TVs hit our API only)
- Stream/cast panel for **Google TV/Shield + Home** (not Roku input language)
- Phone portal: Wi-Fi, activation links, direct CTA
- Host: tokens, TV pair, screensaver upload, **media wipe checklist**

### P1
- Last-night / checkout-morning **strong** direct-book panel
- Email opt-in ("launch alerts") + CAN-SPAM consent fields
- NOAA tides
- TV heartbeat / last-seen
- Client self-reload every 4–6h or ~4am

### P2
- Surf / Sebastian Inlet
- BrightSign ambient-only experiments
- Power/CEC automation
- ADB wipe scripts

### Explicit non-build
Roku Guest Mode API, streaming credential lifecycle automation, captive-portal v1, dual-input product features, BrightSign as living-room standard.

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

1. **Read this file first** before extending media-haven.
2. Honor single-device Shield/Google TV — do **not** re-open dual-input, Roku-primary, or BrightSign-as-primary unless Caitlin asks.
3. Ship P0 reliability + conversion over hardware fantasy paths.
4. When copy mentions streaming: **Home → apps → your accounts → we clear at checkout** — not "switch HDMI to Roku."
