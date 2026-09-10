# media-haven — Full Roadmap: Blow WelcomeScreen Out of the Water

**Status:** CANONICAL product roadmap for Claude / Grok / Codex (updated **2026-07-26**)  
**Architecture constraints:** [`DECISIONS.md`](./DECISIONS.md) remains LOCKED (single-device Shield/Google TV).  
**Live:** https://media-haven-lilac.vercel.app · Branch: `claude/media-haven`  
**Competitor baseline:** [welcomescreen.com](https://www.welcomescreen.com/) · [pricing](https://www.welcomescreen.com/pricing) (re-scraped 2026-07-17)

---

## ⚡ Status snapshot (2026-07-26 — read this before the phase tables)

**Standing mandate:** make everything better all the time — ship real
wins every cycle when unblocked; never invent bugs; never spam empty
ceremony. Locks still win (DECISIONS · ENTERTAINMENT · HARDWARE · SAAS ·
DB hands-off · guest privacy · never-blank TV).

Phases 0–1 and the entire competitive S-backlog (S0–S5, from
[`SIGNAGE-CMS-COMPETITIVE.md`](./SIGNAGE-CMS-COMPETITIVE.md) and
[`COMPETITIVE-DELTA-S5-2026-07-21.md`](./COMPETITIVE-DELTA-S5-2026-07-21.md))
are **shipped** — fleet map + now-playing + offline alerts + force-reload +
SLA chips, publish history/rollback, bulk apply, channels, campaigns,
dayparts, validity windows, launch auto-weight, storm/water takeover
(TV + portal), vacant mode, mode-transition hooks, priority-stack trace,
media upload/tags/search/expiry/health, template packs, pair profiles,
clone-property, deploy-proof host UI, mobile pass, media preloading.
Gate: ~56-check smoke suite. Live board: `/roadmap.html`.

### Dogfood arc since 2026-07-21 (merged on `claude/media-haven`)

| PR | Slice |
|----|--------|
| #113–#120 | Blob standby restore · Drive cannot serve browser video · pull-upload foundation |
| #121–#123 | G2 never-blank bgvideo · smooth 6 Mbps standby · 150 MB TV cap |
| #125–#129 | Standby redesign · multi-cal · real stays only · extend-stay · compositing |
| #130–#133 | Guest book + host users · open/linked cal · dashboard intel · QR `/go` analytics |
| G3 | Media health Sec-Fetch browser probes + host “TV block” badge (landed 2026-07-24) |
| #134–#138 | TV footer zones · fleet live thumbs · fleet property grouping · logo auto-scale · dashboard SVG analytics |
| G6 | Security headers (nosniff · SAMEORIGIN · CSP Report-Only) live on prod |

**Agent-runnable queue (2026-07-26):** Host Users UI · org filter prep · Path C complete integrity · Direct hue parity · subscribe rate-limit when Resend arms. Devin-gated still:
migration 0022 (→ S3.6 flip), Drive service-account key, Resend/Twilio +
CRON_SECRET (arms 1.8 + S0.2 sends), Plex go/no-go, Beach St addresses,
physical Shield intent test, Path C office-TV live fire
([`PATH-C-E2E.md`](./PATH-C-E2E.md) — one command on his go). Phase-1
tables below are historical context. Continuous polish (reliability,
host intel, conversion, never-blank) never stops.

---

## How Elon would build this (operating doctrine)

Not “make prettier welcome slides.” First principles:

| Principle | What it means for Florida Havens |
|-----------|----------------------------------|
| **Define the mission metric** | Not impressions or Viator 8%. Metric = **OTA → direct rebook rate** + **5★ reviews** + **zero host questions about Wi‑Fi/stream**. |
| **Delete the product** | Most “welcome TV” SaaS is digital signage *in the way of* Netflix. We delete the second box, second HDMI, second app store. **One streamer. Forever.** |
| **Vertical integrate the stay** | Own TV kiosk + phone portal + host turnover + Guesty data + Space Coast content. SaaS competitors rent you a skin; we own the **OS of the stay**. |
| **10×, not 10%** | WS shows name + Wi‑Fi + ads. We make the TV a **never-blank, launch-aware, cast-named, conversion machine** that also gets out of the way for real entertainment. |
| **Physics over pitch decks** | Streaming login wipe APIs don’t exist → checklist. Dual HDMI is fragile → one input. Roku has no real browser → Google TV/Shield. PMS “every 8–24h” is lazy → webhooks + live cache. |
| **Iterate with live hardware** | Ship to one villa, measure cast success + direct QR taps + host tickets, then multi-property. |
| **Own the stack** | Next.js / Supabase / Vercel / multi-PMS — FH pays no WelcomeScreen tax; later **we** may sell Stay OS as SaaS ([`SAAS-ARCHITECTURE.md`](./SAAS-ARCHITECTURE.md)). No ad marketplace as core UX. Full data ownership per tenant. |
| **Algorithms + brand** | Rockets (LL2), tides (NOAA), weather, drone cinema — content nobody generic can fake for Melbourne Beach. |
| **Extreme reliability** | Every API optional, last-good cache, self-reload, heartbeat. Blank TV = product failure. |
| **Convert, don’t clutter** | Monetization = **direct stay**, not third-party tour spam. Optional local partners later, never as the core UX. |
| **One perfect path, not three mediocre** | WS chases Roku + Fire + Google. We pick Shield/GTV and make cast naming, Home→Netflix, and wipe ops *perfect*. |

**One-line thesis:** WelcomeScreen is a *pretty overlay you rent*. media-haven is the *operating system of the stay* — guide when idle, guest Netflix when Home, direct book when leaving.

---

## Competitive teardown — WelcomeScreen (full feature map)

### What they sell (public product, 2026-07-17)

| Layer | What WelcomeScreen ships |
|-------|--------------------------|
| **Positioning** | “All-in-one guest experience platform” — TV + mobile guidebook + monetization |
| **TV** | Personalized greeting (name, dates), Wi‑Fi, weather, logo, QR codes, image carousels (6–10 slides), check-in/out, emergency contact, local tips, direct booking link |
| **Mobile** | Digital guidebook: property details, rules, attractions, AI trip planner + AI concierge |
| **AI (new)** | “AI-Powered Content Discovery” — suggest local experiences; answer guest questions about the property |
| **Host** | Multi-property dashboard; CMS for screens/content; PMS pull |
| **PMS** | Hostaway, Lodgify, Guesty, OwnerRez, Beds24, Hospitable, Hostex (+ others in blogs) |
| **Monetization** | **Viator Partner ~8%** on QR→book tours; **WelcomeScreen Store** (products/services/experiences); local business ads / carousel promotion |
| **Branding** | Logo, colors, themed templates |
| **Hardware** | Google TV, Roku, Fire Stick (breadth-first) |
| **Scale story** | ~2.7K–3.5K properties, 35+ countries (marketing claims) |

### Pricing (attack surface)

| Plan | ~Price (1–2 listings) | Caps that hurt luxury operators |
|------|----------------------|----------------------------------|
| **Guidebook** | **$5.99**/listing/mo | Mobile only — no TV |
| **TV** | **$9.99**/listing/mo | ≤**3 TVs**/property · ≤**6** carousel images · PMS sync **once / 24h** |
| **Pro** | **$14.99**/listing/mo | ≤**10 TVs** · ≤**10** images · PMS sync **every 8h** · priority support |
| Portfolio tiers | Flat caps up to 100 listings | Still SaaS rent; roadmap/outages owned by them |

**Elon read on pricing:** For 6 Havens at Pro you’re paying ~$70–90/mo *forever* for a skin that syncs guest names every 8–24 hours and optimizes for **their** store/Viator. Own the stack once → zero SaaS tax, webhooks, full margin on direct rebooks.

### Feature-by-feature kill table

| WelcomeScreen feature | What it is | media-haven win condition |
|----------------------|------------|---------------------------|
| Personalized TV greeting | Name, dates, Wi‑Fi, rules | **Shipping** + 10-ft luxury Space Coast voice + drone/hero cinema |
| Layout templates | Multiple TV frame themes | **One perfect brand system** (Florida Havens logos, seafoam, property photos) — not template soup |
| Image carousel (6–10) | Static host uploads | **Unlimited media library** + Guesty full photo sets + drone reel — cinema, not slide limit |
| Mobile guidebook | Phone guide + tips | **Tokenized guest portal** — Wi‑Fi QR, stream activation grid, direct CTA, rockets |
| AI content discovery / AI concierge | Generic local Q&A | **Space Coast brain**: launches, tides, turtle rules, villa FAQs grounded in *our* data (not free-web tourism) |
| AI trip planner | Generic itineraries | **Launch-week + beach-day planner** tied to real LL2 windows + weather/tides |
| Host dashboard | Multi-property CMS | **Host ops**: pair TVs, labels, wipe checklist, media, Guesty sync, property feed toggles, **living roadmap board** |
| PMS integrations | Broad but slow (8–24h) | **Guesty deep**: OAuth token cache, reservations, photos, book-direct deep links, webhook path → *minutes not hours* |
| Monetization / Store / Viator 8% | Core business model | **Primary:** direct rebook (host keeps the stay). **Secondary later:** first-party extras (early check-in, chef, flowers). **Reject** ad-network as default UX |
| Custom branding | Logo/colors | **Per-property brand marks** + streaming tile CMS + identity pack |
| Multi-device apps (Roku/Fire/Google) | Broad hardware chase | **Elon cut:** only Shield + Google TV — real browser, cast, apps. Roku rejected |
| Multi-country SaaS scale | 2.7K properties story | **Wrong game.** Own 6 Havens at 10× quality, then productize *if* Caitlin wants SaaS |
| Background music / carousel ads | Passive income focus | **Reject as default.** Ambient = our drone + launches, not local dentist ads |
| Tabs: Home / Info / Nearby / Apps / Guide | App-store UX | **Panel carousel** for remote + idle; **Home *exits* to real Netflix** |
| “More direct bookings” link | Soft CTA on skin | **Last-night hard conversion panel** + portal + real incentive + post-stay launch alerts |

### WelcomeScreen structural weaknesses (exploit these)

1. **Signage-first, entertainment-second** — guests still fight a stuck app or second device for Netflix.  
2. **Revenue model fights the guest** — Viator/ads optimize host passive income, not luxury calm.  
3. **Generic locality** — same product in Sardinia and Arizona; no Space Coast moat.  
4. **SaaS dependency + slow PMS** — 8–24h guest-name lag; outages and roadmap owned by them.  
5. **Carousel / TV caps** — 6–10 images and 3–10 TVs are product limits, not physics.  
6. **No real cast/stream system design** — Wi‑Fi shown; cast target naming + activation links + wipe ops are *our* stack.  
7. **Roku/Fire breadth** — dilutes quality; we pick the one stack that can run a real `/tv` browser + apps.  
8. **AI bolted on** — generic discovery without owned local data is a chatbot skin, not a moat.

---

## North-star product definition

**media-haven = Stay OS for The Florida Havens**

```
                    ┌─────────────────────────────┐
   Guest phone ────►│  Opaque token portal        │
                    │  Wi‑Fi · stream · book · AI │
                    └─────────────┬───────────────┘
                                  │ same content brain
   TV (Shield/GTV) ─► /tv kiosk ──┤ never-blank · rockets · cast name
                                  │ Home → native Netflix (guest account)
   Host ───────────► /host ───────┤ pair · label · wipe · CMS · Guesty
                                  │ living roadmap board
   Guesty / NOAA / LL2 / Open-Meteo (all optional, cached)
```

**Success metrics (instrument everything):**

| Metric | Target (v1 villa) |
|--------|-------------------|
| `/tv` blank/error rate | **0** in production (last-good always) |
| Guest “what’s the Wi‑Fi?” tickets | **−90%** vs baseline |
| Cast success (named target visible) | Guest finds `{Room} · {Property}` in ≤30s |
| Direct book QR/portal taps (last 24h of stay) | Track + lift week over week |
| Turnover wipe completion | 100% checklist before next check-in |
| Time-to-Netflix for guest | < 3 min with activation links |
| PMS name freshness | Webhook or sync **≪ 8h** (beat Pro tier) |

---

## Kill-list vs build-list (Elon prioritization)

### Build (mission critical)
- Never-blank TV + heartbeats  
- Named cast targets  
- Guesty-truth personalization  
- Launch/tide/weather moat content  
- Stream/cast education that matches Google TV/Shield  
- Direct conversion panels (soft + last-night hard)  
- Host wipe checklist + pair/label + property CMS  
- Phone portal parity with TV essentials  

### Build later (10× leverage)
- Grounded AI concierge (property + Space Coast RAG)  
- Launch-week planner + email “launch alerts”  
- Host extras store (first-party: early check-in, mid-stay clean, firewood, chef)  
- Multi-property ops pack for all 6 Havens  
- Offline-first last-good + edge cache hardening  

### Do NOT build (WelcomeScreen traps)
- Third-party ad networks as default UX  
- Viator carousel as hero monetization  
- Dual HDMI / BrightSign-as-entertainment  
- Roku-primary portfolio  
- Fake “wipe Netflix via API”  
- iframe Netflix / DRM bypasses  
- Template marketplace CMS bloat  
- Chasing every PMS under the sun before Guesty is perfect  
- **Backend storage of guest Netflix/Disney/etc. OAuth tokens** or “auto sign-in the TV app for them” (see Entertainment contract)

---

## Entertainment tab (LOCKED product contract)

> Full detail: **[`docs/ENTERTAINMENT.md`](./ENTERTAINMENT.md)** · hardware/wipe locks: **[`docs/DECISIONS.md`](./DECISIONS.md)**

**What it is:** Menu destination on `/tv` that helps guests **open native streaming apps on the same Shield/Google TV** and **complete official device-code sign-in on their phone**. Playback always happens in the provider’s app — never inside our browser.

**What it is not:** A credential vault, OAuth proxy, or system that “receives a token and launches Netflix already signed in.” Those APIs do not exist on consumer platforms in a durable/legal way; DECISIONS rejects them.

### Guest flow (canonical)

| Step | Behavior | Status |
|------|----------|--------|
| 1 | D-pad → **Entertainment** → branded service grid (CMS-togglable) | **Held** — guest `/tv` shows Roku-input coach (`TV_SIGNAGE_ENTERTAINMENT=false`, Devin 2026-09-10) |
| 2 | OK on tile → Android `intent://` launches native app (same HDMI) | **Held** with #1 |
| 3 | Need sign-in → walkthrough: scan QR to official activate URL (e.g. netflix.com/tv8) | **Shipped** |
| 4 | Guest types the **code shown by the TV app** on the phone page | **Provider-owned** (we only coach) |
| 5 | Cast education on Casting slide / copy (menu parked until hardware OK) | **Shipped** (slide) |
| 6 | Checkout → host **turnover checklist** signs out apps | **Shipped** (`/host/turnover`) |

### Phone portal twin

Same catalog + one-tap activation links on `/welcome` (tokenized stay). No separate “stream session” backend.

### Metrics (Entertainment)

| Metric | Target |
|--------|--------|
| Time-to-Netflix (intent + activation coach) | &lt; 3 min |
| Copy accuracy | Zero “we auto-login / auto-wipe Netflix” claims |
| Intent success on Shield | Verified on physical unit (Devin hardware board item) |

### Explicit non-goals (roadmap kill)

- Polling our API for “Netflix session active” after phone OAuth through *our* domain  
- Encrypted `ServiceAuth` rows with provider refresh tokens scoped to a stay  
- Auto-wipe of provider sessions via API on Guesty checkout  

### Phase placement

| Work | Phase |
|------|--------|
| Grid, intents, activation QRs, portal links, wipe checklist | **0 — Done** |
| Hardware confirm Fully Kiosk intents; casting menu re-entry | **Ops / board** (not redesign) |
| Optional ADB wipe scripts (never marketed as magic) | **4.6 later** |

---

## Full roadmap by phase

### Phase 0 — Foundation (NOW — largely SHIPPED)
**Goal:** Reliability + correct architecture.

| # | Slice | Acceptance | Status |
|---|--------|------------|--------|
| 0.1 | Never-blank `/tv` + last-good cache | No error screens if Guesty/LL2/NOAA die | **Done** / harden |
| 0.2 | Personalized welcome + Wi‑Fi `WIFI:` QR | Guest joins network by scan | **Done** |
| 0.3 | Stream/cast copy for Google TV/Shield | No Roku language | **Done** |
| 0.4 | Guesty live + book-direct deep links | Per-unit Guesty booking URLs | **Done** (#7) |
| 0.5 | Host wipe checklist + media/screensavers | Turnover is a product | **Done** |
| 0.6 | **Cast target naming** | `TvContent.deviceLabel` + `Cast to: {label} · {property}` | **Done** (#8) |
| 0.7 | Migrations applied (label → property settings → roadmap) | Through **0012** | **Done** |
| 0.8 | Host property CMS + feed toggles + slides | Per-property Wi‑Fi, hero, rules, TV panels | **Done** (#8) |
| 0.9 | Streaming services as CMS-managed catalog | Branded tiles + portal activation; native playback only | **Done** (#10) |
| 0.10 | Living roadmap board | `/roadmap.html` + `/api/roadmap` host-gated kanban | **Done** (#9) |
| 0.11 | README / SESSION-STATE / this file truth | No stale “ship 0.6 next” | **This update** |

### Phase 1 — Beat WelcomeScreen on the “wow” (NEXT — 2–3 weeks)
**Goal:** Every WS headline feature, but Space Coast–specific and conversion-first.

| # | Slice | Why it destroys WS |
|---|--------|-------------------|
| 1.1 | **10-ft brand system polish** | Property logo, hero, drone, consistent type — looks $10M not SaaS template |
| 1.2 | **Rockets as hero content** | LL2 server-cache + host pin + “likely visible from Melbourne Beach” honesty |
| 1.3 | **Weather + NOAA tides on TV + phone** | Real local utility WS doesn’t own |
| 1.4 | **Strong last-night / checkout-morning direct panel** | Conversion machine; WS pushes Viator instead |
| 1.5 | **Phone portal parity** | Wi‑Fi, activation links, rockets, book, rules — better than WS guidebook |
| 1.6 | **TV heartbeat / last-seen on host** | Ops superpower; WS “dashboard” is content, not fleet health |
| 1.7 | **Client self-reload 4–6h / ~4am** | Kiosk hygiene without truck rolls |
| 1.8 | **Email opt-in “launch alerts”** (CAN-SPAM) | Own the guest relationship post-stay |

**Phase 1 ship order:** **1.3 → 1.4 → 1.6 → 1.7 → 1.5 polish → 1.1/1.2 → 1.8**

### Phase 2 — Stay OS (AI + ops) (3–6 weeks after Phase 1 metrics)
**Goal:** Features WS markets (“AI”) but grounded and useful.

| # | Slice | Spec |
|---|--------|------|
| 2.1 | **Grounded AI concierge** | Answers only from property FAQ + house rules + pinned local tips + live launches/tides/weather. No free-web hallucination on the TV. |
| 2.2 | **Launch-week trip planner** | Given stay dates: which nights have windows, beach plan if scrub, “watch from villa” vs drive-to-view. |
| 2.3 | **Guest FAQ reduction engine** | Host pastes common texts → auto panels + portal cards. Measure ticket drop. |
| 2.4 | **First-party Haven store** | Early check-in, late checkout, mid-stay clean, private chef, flowers — *our* margin, not 8% Viator. |
| 2.5 | **Per-property Wi‑Fi from Guesty custom fields** | Zero host re-entry after sync. |
| 2.6 | **Guesty webhooks** | Instant guest name / stay window updates — **beat their 8–24h sync**. |
| 2.7 | **Multi-TV fleet map** | All devices, labels, last-seen, occupied/vacant mode. |
| 2.8 | **Vacant mode productization** | OLED-safe black *or* host drone slideshow by property. |

### Phase 3 — Portfolio excellence (all Havens) (parallel after Phase 1)
**Goal:** 6 properties feel like one luxury brand.

| # | Slice |
|---|--------|
| 3.1 | Every unit: Shield/Chromecast + Fully Kiosk + pair + label |
| 3.2 | Photo/logo sweep complete for all listings |
| 3.3 | Printable QR cards + door/coffee-table placement SOP |
| 3.4 | Turnover checklist baked into cleaner SOP (HavenOps handoff optional) |
| 3.5 | Direct incentive locked with Caitlin (% vs early check-in vs launch-week priority) |
| 3.6 | Review prompt flow (post-checkout SMS/email) pointing at direct next stay |

### Phase 4 — Moats WS cannot copy easily (later)
| # | Slice | Moat |
|---|--------|------|
| 4.1 | Sebastian Inlet / surf conditions | Hyperlocal |
| 4.2 | Turtle season / beach rules adaptive panels | Compliance + brand care |
| 4.3 | Live launch countdown mode (fullscreen) | Viral guest moment |
| 4.4 | Offline edge cache (Service Worker / local last-good) | Storm / Wi‑Fi blip resilience |
| 4.5 | BrightSign **ambient-only** experiments | Non-entertainment displays only |
| 4.6 | Optional ADB wipe *scripts* for power users | Never marketed as magic API |
| 4.7 | Productize as multi-tenant only if Caitlin wants SaaS | Default remains private Havens stack |

---

## Feature parity matrix (ship order)

| Capability | WS | media-haven now | Target phase |
|------------|----|-----------------|--------------|
| Personalized name on TV | ✓ | ✓ | 0 |
| Wi‑Fi display | ✓ | ✓ + `WIFI:` QR | 0 |
| Checkout times | ✓ | ✓ | 0 |
| Mobile guidebook | ✓ | ✓ portal | 0–1 |
| Host multi-property dashboard | ✓ | ✓ host + CMS | 0 |
| Host property CMS / feed toggles | partial | ✓ (#8) | 0 |
| PMS sync | ✓ multi, 8–24h | ✓ Guesty deep | 0–2 |
| Custom branding | ✓ | ✓ logos/photos | 0–1 |
| Streaming activation UX | weak | ✓ CMS catalog + Entertainment tab + device-code QRs (#10) | 0 |
| Native app launch from guide | weak | ✓ Android intent on OK (Shield/GTV) | 0 |
| Backend streaming OAuth vault | n/a | **Rejected** (ENTERTAINMENT.md) | never |
| Named cast targets | ✗ | ✓ (#8) | **0.6 Done** |
| AI concierge | ✓ generic | — | **2.1** |
| Trip planner | ✓ generic | — | **2.2** |
| Monetize tours (Viator) | ✓ core | reject default | optional late |
| First-party extras store | partial Store | — | **2.4** |
| Launch board | ✗ | ✓ LL2 | 0–1 |
| Tides | ✗ | partial | **1.3** |
| Native stream path design | weak | **core architecture** | 0 |
| Never-blank reliability eng | weak | **core** | 0 |
| Direct book as primary KPI | soft | **core goal** | **1.4** |
| Fleet heartbeat | weak | planned | **1.6** |
| Living product roadmap board | ✗ | ✓ (#9) | 0 |
| Self-hosted / owned data | ✗ SaaS | ✓ | always |
| SaaS per-listing tax | $6–15/mo | **$0** | always |

---

## Claude / Grok execution protocol

1. **Always honor** `docs/DECISIONS.md` hardware locks.  
2. **Current coding focus (2026-07-24):** unblocked competitive backlog is **shipped**. Do not restart Phase 1.3–1.7 as if pending. Prefer **continuous improvement** on dogfood pain (never-blank, host ops, conversion, media truth) and Claude-boarded P3 polish. Devin-gated items stay gated.  
3. Do not start Phase 2 AI until conversion + reliability metrics exist and Devin unblocks bandwidth.  
4. Every PR: `npm run smoke`; never blank `/tv`; no dual-input / Roku / BrightSign-primary.  
5. When adding “monetization,” prefer **direct stay** CTAs over third-party ads.  
6. Update this file when a phase slice ships (status column + commit message).  
7. Host-facing triage lives in the **living board** (`public/roadmap.html`); this file remains the **canonical competitive strategy**.  
8. **DB hands-off** until Devin says otherwise — settings-jsonb features only (no new migrations without MCP go).  
9. **Always better:** if Claude is silent and a small safe slice is unblocked, ship it (or leave a ready branch) — do not idle in empty heartbeats.

### Immediate next (Devin-gated — not agent freelancing)

```
1. Path C office-TV live fire — docs/PATH-C-E2E.md (only on Devin “fire Path C e2e”)
2. MCP apply 0022 → S3.6 device_class finalize (docs/S3.6-FINALIZE-0022.md)
3. Drive service-account JSON → reliable media upload to Drive
4. Resend/Twilio + CRON_SECRET → arm 1.8 + S0.2 offline alert sends
5. Plex go/no-go · Beach St addresses · physical Shield intent proof
```

---

## Messaging: how we talk about WS publicly

Internal only unless Caitlin says otherwise:

- We don’t trash competitors in guest-facing UI.  
- Host narrative: *“We built our own Stay OS so guests get Netflix the normal way, rockets on the TV, and a reason to book direct — not a hotel ad board.”*  
- Cost narrative (internal): *“WS rents you a $10–15/mo skin with 8h guest lag and 8% Viator. We own the stack and keep the rebook.”*

---

## Decision log for this roadmap

| Date | Decision |
|------|----------|
| 2026-07-17 | Competitive teardown of WelcomeScreen locked into this file |
| 2026-07-17 | Elon doctrine: mission = direct rebook + never-blank + one HDMI Stay OS |
| 2026-07-17 | Reject Viator/ad-first monetization as default UX |
| 2026-07-17 | Phase 0.6 cast naming = immediate engineering P0 (then shipped #8) |
| 2026-07-21 | S0–S5 competitive backlog shipped end-to-end (PRs #37–#103); DB hands-off rule in force; remaining queue is Devin-gated |
| 2026-07-24 | Dogfood arc #113–#133 + G3 Sec-Fetch health; mandate **make everything better all the time** (continuous polish when unblocked) |
| 2026-07-17 | Architecture still DECISIONS.md — this file expands *what to build*, not hardware |
| 2026-07-17 | Re-scrape WS pricing/features; mark Phase 0.6–0.10 Done; **next = Phase 1.3→1.4→1.6→1.7** |
| 2026-07-17 | Explicit cost attack: Pro $14.99/listing + 8–24h PMS lag + carousel caps are structural, not temporary |

---

## Agent instruction (append)

Read **`docs/DECISIONS.md`** then **this roadmap** before large features.  
If roadmap and DECISIONS conflict on hardware, **DECISIONS wins**.  
If roadmap and SESSION-STATE conflict on “what’s done,” **verify the code / live site**.
