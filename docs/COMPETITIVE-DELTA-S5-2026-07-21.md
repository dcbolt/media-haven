# Competitive delta re-scrape — post S0–S2 ship (2026-07-21)

**Author:** Grok · MEDIA HAVEN  
**Audience:** Claude (board) · Devin  
**Date:** 2026-07-21  
**Scope:** WelcomeScreen / Hello Guest Screen / GuestView-class STR guest TV + TouchStay-class mobile guidebook — vs **media-haven Stay OS as shipped today**.  
**Prior CMS research:** [`SIGNAGE-CMS-DEEP-DIVE-PASS4.md`](./SIGNAGE-CMS-DEEP-DIVE-PASS4.md) · [`SIGNAGE-CMS-COMPETITIVE.md`](./SIGNAGE-CMS-COMPETITIVE.md)  
**Locks:** DECISIONS · ENTERTAINMENT · HARDWARE-STANDARD — no stream OAuth store; one entertainment SoC; Cast Pro signage-only; guest privacy sacred.

---

## 0. Shipped Stay OS scoreboard (honest)

### Host CMS / fleet (S0–S2 competitive set — **complete**)

| ID | Feature | Status |
|----|---------|--------|
| S0.1 | Fleet map | ✅ |
| S0.2 | Offline / stale alerts | ✅ |
| S0.3 | Now-playing proxy (mode + timeline) | ✅ |
| S0.4 | Publish history + rollback | ✅ |
| S0.5 | Bulk multi-property publish | ✅ |
| S1.1 | Calendar campaigns | ✅ |
| S1.3b | Storm / emergency takeover (+ portal banner) | ✅ |
| S1.4 | Vacant-mode playlist | ✅ |
| S1.5 | Playlist channels | ✅ |
| S1.6 | Launch-window auto-weight | ✅ |
| S2.1 | Media tags / search / expiry | ✅ |
| — | Direct media upload · mobile host · deploy-proof API forms · media preload | ✅ |

### Guest / entertainment moat (already ahead of pure CMS)

| Capability | Stay OS | Typical WelcomeScreen-class |
|------------|---------|------------------------------|
| Guest name + PMS (Guesty) | ✅ | ✅ (varies by PMS) |
| Wi‑Fi QR + house rules + guidebook | ✅ | ✅ |
| Space Coast weather / tides / launches | ✅ **moat** | Weak / generic local |
| Entertainment launcher + provider QR | ✅ **moat** | Rare / none |
| Path C Open on TV (portal → poll → intent) | ✅ code | Usually none |
| One HDMI entertainment SoC | ✅ lock | Often Fire Stick welcome-only |
| Vacant luxury vs guest modes | ✅ | Weak |
| Fleet storm takeover | ✅ TV + portal | Rare |

### Still gated on Devin (not competitive gaps)

- MCP **0022** / S3.6 `deviceClass`  
- Drive service account for media upload reliability  
- Provider keys / Plex  
- Office Shield live Path C e2e (plan: [`PATH-C-E2E.md`](./PATH-C-E2E.md))

---

## 1. Hospitality cousins (kill list re-scrape)

### WelcomeScreen (STR guest TV — primary cousin)

**What they sell:** Personalized TV welcome (name, dates, Wi‑Fi, local tips), mobile guidebook, store of designs, Fire Stick / smart TV apps. Host marketing: “80% never open the booklet; 100% see the TV.”

| They have | We have | Gap / steal? |
|-----------|---------|--------------|
| Guest personalization | Stronger (Guesty + labels) | Defend |
| Pretty templates / store | Weak | **S5.6 / S4.8** packs |
| Multi-property host portal | Host multi-property | Polish onboarding |
| Force-launch on TV power-on | Fully Kiosk / Shield SOP | **S0.3b + HARDWARE SOP** (ops, not product bloat) |
| Design marketplace | No | **Reject** open marketplace |
| Entertainment on same HDMI | **We win** | Defend Path C + launcher |

**Known WS pain (host forums):** cleaner must leave TV on + app running; hard remotely. Our Fully Kiosk + never-blank + fleet map is the answer — document in hardware SOP, not a WS clone.

### Hello Guest Screen / Guesty marketplace

**What they sell:** Fire Stick / Tizen / webOS welcome app; Guesty/OwnerRez integrations; Wi‑Fi, logo, house rules, local tips; app-free guest experience.

| They have | We have | Steal? |
|-----------|---------|--------|
| One-click PMS marketplace install | Guesty sync custom | SaaS packaging later |
| Consumer stick focus | Shield primary | Stay HARDWARE lock |
| Simple non-designer CMS | Timeline editor good | Templates (S4.8) |

### TVYou / similar “Airbnb welcome screen” tools

**What they sell:** Per-property welcome + slideshow + $1/TV pricing; free first property.

| Steal | Reject |
|-------|--------|
| Instant property bootstrap packs | Per-screen $1 DNA for FH dogfood |
| Photo slideshow between stays | Dual-box architectures |

### TouchStay / Touch Guide / mobile guidebook class

**What they sell:** Phone-first digital guidebook, QR cards, multi-language, sections CMS.

| They have | We have | Steal? |
|-----------|---------|--------|
| Deep mobile guidebook UX | `/welcome` portal solid | **S5.13** portal section polish only if hosts ask |
| Printable QR ops | We have print/QR | Keep |
| Offline PDF export | No | Low priority for FH |

**Doctrine:** TouchStay is not the TV. We already combine **phone portal + TV** — rare combo.

### Pure digital signage (BrightSign / Navori / ScreenCloud / Yodeck)

See pass 4. Remaining honest gaps after S0–S2:

| Gap | Effort | Impact for FH | S5 id |
|-----|--------|---------------|-------|
| Remote kiosk reload | S | High ops | **S0.3b** |
| Screen groups / property tags | M | High multi-villa | **S4.2 / S5.8** |
| Template gallery / brand kit | M | High non-designer | **S4.8 / S2.2** |
| Pair profiles on claim | S | Medium | **S5.1** |
| Content health (broken media) | S | Medium | **S5.3** |
| Priority stack UI | M | Medium | **S4.1** |
| POP lite | M | Low until ads | **S3.1** later |
| Roles / multi-user | L | SaaS | **S3.2** later |

---

## 2. What is *still genuinely missing* (only board-worthy)

Filter: would Devin/Caitlin feel the gap on a Space Coast villa week? Drop vanity CMS features.

### P0 — ops & guest truth (next code when Devin unblocks)

| ID | Title (board-ready) | Effort | Impact | Why still real |
|----|---------------------|--------|--------|----------------|
| **S0.3b** | Fully Kiosk force-reload from host fleet | S | **High** | WS hosts complain cleaner left wrong app; BrightSign has remote reload |
| **S5.12** | Dashboard fleet SLA chip row (green/amber/red) | S | **High** | S0.1/0.2 exist; one glance missing on `/host` home |
| **Path C e2e** | Office Shield live fire (plan ready) | S (ops) | **High** | Code shipped; proof gated on Devin |

### P1 — content speed (non-designer hosts)

| ID | Title | Effort | Impact | Why |
|----|-------|--------|--------|-----|
| **S4.8 / S5.6** | Property-type template packs (Beach / Rocket / Family / Vacant luxury) | M | **High** | WS/HGS win on “pretty in 5 minutes”; we win on depth after bootstrap |
| **S5.1** | TV pair profiles (defaults on claim) | S | Med | BrightSign B-Deploy analogue |
| **S5.3** | Content health (broken media URLs) | S | Med | Black slides kill luxury feel |
| **S4.12** | Clone property config (Wi‑Fi + guidebook + signage skeleton) | M | Med | SaaS onboarding |

### P2 — scheduling polish (nice after S1.1)

| ID | Title | Effort | Impact | Why |
|----|-------|--------|--------|-----|
| **S1.2** | Media validity start/end dates in rotation | S | Med | Navori hygiene; pairs with S2.1 expiry |
| **S4.1** | Content priority stack visual (why this slide won) | M | Med | Host debug for campaign vs daypart |
| **S5.4** | Mode transition hooks (check-in → guest channel) | M | Med | PMS-aware without surprise mid-stay |

### P3 — SaaS / later

| ID | Title | Effort | Impact | Why defer |
|----|-------|--------|--------|-----------|
| **S3.2** | Roles (owner / media / cleaner) | L | SaaS | Single host code fine for FH |
| **S3.6** | deviceClass streamer \| signage | S+MCP | Med | Parked on **0022** |
| **S3.1** | Proof-of-play lite | M | Low | No ad inventory yet |
| Portal campaign banner | S | Low | TV-only campaigns v1 by design |

### Explicit non-gaps (do not board as “missing”)

| Temptation | Why not |
|------------|---------|
| Design marketplace like WS Store | Junk + brand risk |
| Dual HDMI / Fire Stick as entertainment SoC | HARDWARE lock |
| Stream credential broker / auto-logout API | DECISIONS |
| Multi-zone living-room canvas | Kills 10-ft guest UX |
| Camera audience analytics | Privacy poison for STR |
| Per-screen $1–20 SaaS DNA for six villas | Org/property packaging |

---

## 3. Positioning after this re-scrape

| Buyer asks | WelcomeScreen / HGS | Stay OS (today) |
|------------|---------------------|-----------------|
| “Will guests see Wi‑Fi on the TV?” | Yes | Yes |
| “Can I schedule launch week?” | Weak | **Yes — S1.1** |
| “Storm message on every villa?” | Rare | **Yes — TV + phone** |
| “Netflix on the same TV without a second box?” | Usually no | **Yes — core** |
| “Is the fleet online?” | Weak | **Yes — S0.1/0.2/0.3** |
| “Pretty templates in 5 minutes?” | **Yes** | **Still our biggest product gap** |

> **Competitors sell welcome slides (and sometimes a phone guide).**  
> **We sell Stay OS:** guest-aware TV + Space Coast live data + entertainment launcher + host CMS with fleet truth.  
> Remaining product work is **bootstrap speed (templates)** and **ops finish (reload, SLA chips, Path C proof)** — not feature parity with mall CMS or WS theme stores.

---

## 4. Recommended board order (next code, when free)

1. **S0.3b** Fully forceReload (ops)  
2. **S5.12** dashboard SLA chips (visibility)  
3. **Path C e2e** when Devin says go ([`PATH-C-E2E.md`](./PATH-C-E2E.md))  
4. **S4.8 / S5.6** template packs (conversion for non-designers)  
5. **S5.1** pair profiles · **S5.3** content health  
6. **S1.2** validity · **S4.1** priority UI  
7. **S3.6** when MCP 0022 approved  

---

## 5. Ask for Claude

1. Fold **S0.3b, S5.12, S4.8/S5.6, S5.1, S5.3** onto living board with titles above.  
2. Keep **S3.6** parked on Devin.  
3. Path C: plan-only until Devin explicit go — no live insert without approval.

— Grok · 2026-07-21 · competitive delta post S0–S2
