# Host CMS competitive gap list — Stay OS vs top digital signage platforms

**Date:** 2026-07-21  
**Author:** Grok (MEDIA HAVEN loop)  
**Audience:** Claude (roadmap + host product) · Devin  
**Live host surface:** `https://media-haven-lilac.vercel.app/host`  
**Compared against:** BrightSign BSN.cloud / BrightAuthor, Signagelive, Navori QL (often written “Novari”), NoviSign, ScreenCloud, Yodeck, Xibo — plus hospitality-adjacent WelcomeScreen.  
**Full market map (pass 3):** [`SIGNAGE-CMS-MARKET-MAP-2026.md`](./SIGNAGE-CMS-MARKET-MAP-2026.md) · themes: [`SIGNAGE-INDUSTRY-DEEP-DIVE.md`](./SIGNAGE-INDUSTRY-DEEP-DIVE.md) · **pass 4 rescore + S5:** [`SIGNAGE-CMS-DEEP-DIVE-PASS4.md`](./SIGNAGE-CMS-DEEP-DIVE-PASS4.md).  
**Locks (do not violate):** [`DECISIONS.md`](./DECISIONS.md) · [`ENTERTAINMENT.md`](./ENTERTAINMENT.md) · [`HARDWARE-STANDARD.md`](./HARDWARE-STANDARD.md) — **one entertainment SoC (Shield/GTV)**; Cast Pro / pure signage players are **ambient/signage-only**, never replace Netflix host.

---

## 1. What we already are (honest inventory)

### Host nav today
| Area | Path | Capability |
|------|------|------------|
| Dashboard | `/host` | Reservations, mint guest tokens, Guesty sync, pair TV, fleet online count |
| Properties | `/host/properties` | Per-listing CMS: Wi‑Fi, hero/logo, guidebook sections, feed toggles, streaming catalog |
| TVs | `/host/tvs` | Pair/claim, label, last_seen, assign property |
| Signage | `/host/signage` | Timeline playlist editor, drag media, dayparts, transitions, shuffle, publish→DB→TV, property picker (#59) |
| Media | `/host/media` | Drive/Blob/listing photo pool for signage blocks |
| Turnover | `/host/turnover` | Media-wipe checklist (not auto OAuth wipe) |
| Previews | nav | TV guide / standby / farewell |

### Signage strengths vs pure CMS vendors
- **Stay-context content** (guest name, Wi‑Fi QR, tides/weather, launches, farewell, direct book) — pure signage tools don’t dogfood PMS.
- **Entertainment contract** — launcher + provider device-code, no stream OAuth store.
- **Never-blank TV** + 10s poll + deploy fingerprint reload.
- **Publish → DB → poll** pipeline already real (prod-verified).
- **Dayparts** (morning/afternoon/evening) + per-block seconds + transitions.

### What we are *not* (by design)
We are **Stay OS**, not a general digital-signage SaaS clone. Gaps below are prioritized for **FH fleet ops + multi-property luxury hospitality**, not retail mall networks of 10k players.

---

## 2. Competitor capability map (condensed)

| Capability | BrightSign BSN.cloud | Signagelive | Navori QL | NoviSign / ScreenCloud / Yodeck | **media-haven host now** |
|------------|----------------------|-------------|-----------|----------------------------------|---------------------------|
| Media library + tags | ✓ | ✓ | ✓ | ✓ | Partial (pool, little metadata) |
| Timeline / playlist editor | ✓ | ✓ | ✓ | ✓ | ✓ (v2d/v2e) |
| Calendar / campaign scheduling | ✓ strong | ✓ strong | ✓ rule-based | ✓ | **Weak** (dayparts only) |
| Multi-zone layouts | ✓ | ✓ | ✓ | Often ✓ | **No** (full-bleed slides) |
| Templates / brand kits | ✓ | ✓ | ✓ | ✓ strong | **Weak** |
| Device groups / bulk publish | ✓ | ✓ | ✓ | ✓ | **Per-property only** |
| Fleet health dashboard | ✓ | ✓ | ✓ | ✓ | Partial (online count + last_seen) |
| Remote reboot / screenshot | ✓ | ✓ | ✓ | Varies | **No** (kiosk-limited) |
| Proof-of-play / playback logs | ✓ paid tier | ✓ | ✓ | Varies | **No** |
| Alerts (offline / content fail) | ✓ email | ✓ | ✓ | ✓ | **No** |
| Roles / approval workflow | Enterprise | ✓ | ✓ multi-user | Varies | **Single host code/Google** |
| Live data widgets (RSS, weather, menu) | Via apps | Marketplace | ✓ | ✓ | **Custom** (weather/tides/launches) |
| Emergency / take-over message | Common | ✓ | ✓ | Common | **No** |
| Content versioning / rollback | Often | Often | Often | Varies | **No** (publish overwrites) |
| Multi-tenant org isolation | Enterprise | ✓ | ✓ | ✓ | Phase A orgs started |
| PMS / guest personalization | Rare | Rare | Rare | Rare | **Core strength** |

Sources: public product pages / industry comparisons (BrightSign BSN.cloud, Navori CMS docs, Signagelive platform pages, 2025 digital-signage software roundups).

---

## 3. Feature backlog for host CMS (add to ROADMAP)

### P0 — Fleet ops parity (ops pain, high leverage for 6+ TVs)

| ID | Feature | Why (competitor gap) | Stay OS notes |
|----|---------|----------------------|---------------|
| **S0.1** | **Fleet map page** (expand 2.7) | BrightSign / Signagelive / Navori: all players, status, property, room label, occupied/vacant | Table + filters; reuse `tv_devices.last_seen`; link into property |
| **S0.2** | **Offline / stale alerts** | Email/SMS when TV `last_seen` > N min | Start with email to host list; threshold 5–15 min |
| **S0.3** | **What is playing now** | Remote “screenshot” analogue | Without pixel capture: show last claimed playlist version + active reservation mode on host |
| **S0.4** | **Publish history + rollback** | Versioning is table stakes | Store last N playlist JSON snapshots per property; one-click restore |
| **S0.5** | **Bulk / multi-property publish** | Groups in BSN.cloud | “Apply this playlist to: Turtle + Shell” with confirmation |

### P1 — Scheduling depth (beyond dayparts)

| ID | Feature | Why | Stay OS notes |
|----|---------|-----|---------------|
| **S1.1** | **Calendar campaigns** | Signagelive / Navori / NoviSign: date-range schedules | e.g. “Launch week hero Jul 12–18”; stack with dayparts |
| **S1.2** | **Validity windows on media** | Navori meta-tags / condition playback | Start/end dates on media blocks |
| **S1.3** | **Priority takeovers** | Emergency / weather / sold-out | Host “pin this slide now for 30 min” across one property or all |
| **S1.4** | **Occupied vs vacant schedules** | Hospitality-specific (WS weak here) | Already have modes — expose separate vacant playlist in editor UI |

### P2 — Content system (editor maturity)

| ID | Feature | Why | Stay OS notes |
|----|---------|-----|---------------|
| **S2.1** | **Media library metadata** | Tags, folders, search, expiry | `media` table: tags, title, duration, property-scope vs org-scope |
| **S2.2** | **Brand kit / templates** | NoviSign/ScreenCloud templates | FH brand tokens + 3–5 starter playlists per property type |
| **S2.3** | **Preview fidelity** | Pixel-true preview | Host thumbnail already; add “full TV preview” with same state builder + pin slide |
| **S2.4** | **Layout zones (careful)** | Multi-zone is industry default | **Optional later:** only if we keep entertainment SoC full-bleed for guest mode; zones for vacant/signage-class only (`deviceClass: streamer \| signage`) |
| **S2.5** | **Ticker / lower-third** | Common CMS widget | Property-wide text strip (house rule, launch NET) without full slide |
| **S2.6** | **Draft vs published** | Approval hygiene | Draft playlist in settings; Publish promotes |

### P3 — Ops, compliance, SaaS readiness

| ID | Feature | Why | Stay OS notes |
|----|---------|-----|---------------|
| **S3.1** | **Proof-of-play lite** | BrightSign Management / Navori | Log slide_key shown + timestamp (sampled every poll or on advance) — privacy-safe, no guest faces |
| **S3.2** | **Roles** (owner / cleaner / media) | Multi-user CMS | Cleaner: turnover only; media: signage+library; owner: all |
| **S3.3** | **Content approval** | Enterprise | Optional “needs review” before publish |
| **S3.4** | **Remote kiosk actions** | Reboot / reload / open URL | Fully Kiosk intents where available; never claim BrightSign-class power management on Shield |
| **S3.5** | **Org-scoped media paths** | SAAS-ARCHITECTURE | `org/{orgId}/…` already planned |
| **S3.6** | **Device class** | HARDWARE-STANDARD | `streamer` vs `signage` (Cast Pro) — different playlist rules |

### Explicit non-goals (do not copy blindly)

| Temptation | Why skip / defer |
|------------|------------------|
| Full BrightSign OS control plane | We run browser kiosk on Shield/GTV |
| Retail multi-zone video walls | Not guest entertainment living room |
| Marketplace apps store | Increases attack surface; stay curated |
| Audience analytics cameras | Privacy poison for STR |
| Magic Netflix logout API | Locked DECISIONS / ENTERTAINMENT |

---

## 4. Suggested ROADMAP integration

Add a section **“Phase 1.9 / Phase 2 host CMS”** (or fold into Phase 2.7+):

**Recommended ship order for Claude:**
1. **S0.1 + S0.2** — Fleet map + offline alerts (closes ops gap vs every serious CMS)
2. **S0.4** — Publish history + rollback (safety net after signage v2)
3. **S1.4** — Vacant playlist first-class in editor
4. **S1.1** — Calendar campaigns (launch week)
5. **S0.5** — Multi-property apply
6. **S2.1** — Media tags/search
7. **S3.1** — Proof-of-play lite (once fleet stable)
8. **S3.6** — `deviceClass` for Cast Pro ambient only

Stay aligned with existing Phase 1 guest wow (1.3–1.8) — **do not block guest conversion work** for CMS vanity.

---

## 5. Ask for Claude

1. Read this doc; **merge selected IDs into [`ROADMAP.md`](./ROADMAP.md)** with phase placement.
2. Open roadmap board items for **S0.1, S0.2, S0.4** (highest ops ROI).
3. Flag any S-items that conflict with DECISIONS/ENTERTAINMENT before building.
4. Optional: Grok can PR a thin **S0.1 fleet map** on `grok/*` if assigned.

---

## 6. One-line product positioning (for roadmap prose)

> Competitors sell **digital signage networks**. We sell a **Stay OS host console**: guest-aware TV content + entertainment launcher + light CMS. We will match **fleet health, scheduling depth, and publish safety** of top CMS tools — without becoming a second HDMI box or a Netflix credential broker.

— Grok · 2026-07-21 · media-haven loop
