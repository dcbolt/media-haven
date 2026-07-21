# Digital signage CMS deep dive — pass 4 (2026)

**Date:** 2026-07-21  
**Author:** Grok · MEDIA HAVEN  
**Ask:** Full market scan of CMS / industry weapons + others; best solutions list; concrete inspiration to improve Stay OS.  
**Prior passes:** [`SIGNAGE-CMS-COMPETITIVE.md`](./SIGNAGE-CMS-COMPETITIVE.md) (S0–S3 gaps) · [`SIGNAGE-INDUSTRY-DEEP-DIVE.md`](./SIGNAGE-INDUSTRY-DEEP-DIVE.md) (pass 2) · [`SIGNAGE-CMS-MARKET-MAP-2026.md`](./SIGNAGE-CMS-MARKET-MAP-2026.md) (pass 3)  
**Locks:** DECISIONS · ENTERTAINMENT · HARDWARE-STANDARD — one entertainment SoC (Shield/GTV); Cast Pro = signage-only; no stream OAuth store; guest privacy sacred.

---

## 0. Executive take (read this first)

There is still **no single best digital signage CMS**. The market is a set of weapons optimized for different jobs:

| Job | Industry winner(s) | Steal for Stay OS? |
|-----|--------------------|--------------------|
| **Player health & remote ops** | BrightSign Control / BSN.cloud, SpinetiX | **Yes** — fleet truth, provision, reload |
| **Rule / campaign scheduling** | Navori QL + Signagelive | **Yes** — launch windows, vacant/occupied, priority |
| **Emergency override** | Rise Vision (CAP / campus DNA) | **Yes — shipped S1.3b storm** |
| **Polished multi-location SaaS UX** | ScreenCloud | **Selective** — publish safety, groups, clone property |
| **Templates + non-designer speed** | NoviSign, OptiSigns (4k templates), Yodeck | **Yes** — FH packs / vacant luxury |
| **Live data / IT dashboards** | TelemetryTV, Appspace channels | **Yes — shipped S1.5 channels** |
| **Budget fleet + free hardware** | Yodeck (Pi), PosterBooking | **No** — we are Shield luxury, not Pi mall |
| **Panel OEM lock-in** | Samsung VXT, LG SuperSign | **No as primary** — wrong for guest entertainment SoC |
| **DOOH / ad exchange** | Broadsign | **No now** |
| **Business TV + ad breaks** | Atmosphere TV | **Idea only** — curated vacant ambience, not cable ads |
| **STR guest personalization** | WelcomeScreen / hotel IPTV | **Kill list** — we win on entertainment + Space Coast + PMS |

**media-haven is not competing to be #1 on G2 “digital signage.”** We are **Stay OS**: guest-aware living-room TV + entertainment launcher + host CMS light enough for six villas and strong enough for multi-tenant SaaS later.

**Doctrine (unchanged):** Match **fleet health, scheduling depth, publish safety, emergency** of the best platforms. Defend **guest personalization + one HDMI**. Reject multi-zone bedroom canvases, camera analytics, dual-HDMI boxes, stream OAuth brokers.

---

## 1. What changed since pass 3 (honest scoreboard)

Pass 3 assumed S0.4 only. As of tip (2026-07-21 ~08:xx UTC) we have closed most of the original P0 ops gap:

| ID | Feature | Status |
|----|---------|--------|
| **S0.1** | Fleet map on `/host/tvs` | ✅ #62 |
| **S0.2** | Offline / stale alerts | ✅ #64 |
| **S0.4** | Publish history + rollback | ✅ #65 |
| **S0.5** | Bulk multi-property publish | ✅ #70 |
| **S1.3b** | Storm / emergency takeover | ✅ #71 |
| **S1.5** | Playlist channels (save pack / apply) | ✅ #74 |
| **S2.1** | Media tags, search, expiry | ✅ #68 |
| **#66** | Direct media upload | ✅ |
| **#67** | Mobile-friendly host | ✅ |
| **S1.4** | Vacant-mode playlist | ⏳ open `grok/s1-4-vacant-playlist` |
| **S3.6** | `deviceClass` streamer \| signage | 🅿️ parked (needs MCP **0022**) |
| **S1.1** | Calendar campaigns | ❌ next depth |
| **S1.6** | Launch-window auto-weight | ❌ next after S1.4 |
| **S0.3 / S0.3b** | Now-playing proxy · kiosk reload | ❌ |
| **S2.2 / S4.8** | Brand kit · template gallery | ❌ |

**Capability rescore (1–5) after fan-out:**

| Axis | Pass 3 | **Now** | Target | Gap left |
|------|--------|---------|--------|----------|
| Fleet reliability & ops | 3 | **4.2** | 5 | Now-playing, kiosk reload, SLA badges, provision templates |
| Scheduling intelligence | 2.5 | **3.2** | 4.5 | Campaigns, validity, vacant (open), launch weight, priority UI |
| Content authoring | 3.5 | **4.0** | 4.2 | Brand kit / templates; AI assist optional |
| Governance / multi-user | 1.5 | **2.0** | 3 | Roles; draft; actor audit |
| Live data / channels | 4.5 | **4.8** | 5 | Channel gallery polish; auto-weight |
| Guest personalization | 5 | **5** | 5 | Defend (Path C, PMS, entertainment) |
| Analytics / POP | 1 | **1** | 3 | POP lite only when fleet boring |
| Emergency takeover | 1 | **4** | 4.5 | CAP-lite propose (human confirm) |

**Bottom line:** We are no longer “CMS-blind.” We still lag pure weapons on **calendar rules, groups, templates, remote player control**, and we intentionally skip **retail multi-zone + DOOH**.

---

## 2. Market structure 2026 (full catalog)

| Seg | What they sell | Who | Standouts 2026 |
|-----|----------------|-----|----------------|
| **A. Player + OS** | Hardware + network CMS | AV integrators, 24/7 retail | **BrightSign** (Control free w/ player; Management paid), **SpinetiX** HMP + ARYA |
| **B. Workplace / EX** | Signage + employee apps + spaces | Corp IT / Internal Comms | **Appspace**, **Poppulo** (ex Four Winds), **ScreenCloud**, Korbyt |
| **C. Cloud SMB / mid** | Browser CMS + SoC/Pi/Fire | SMB, schools, QSR | **Yodeck**, **OptiSigns**, **NoviSign**, **Rise Vision**, **TelemetryTV**, Kitcast, NowSignage, PosterBooking, OnSign TV, PlaySignage, Fugo, Pickcel |
| **D. Rule engines** | Conditional play, POP, scale | Retail, franchise, transit | **Navori QL + Signagelive** (combined powerhouse) |
| **E. DOOH / ads** | Inventory, programmatic, POP | Outdoor networks | Broadsign, DOOHly |
| **F. Display OEM** | Locked to panel OS | Facilities buying commercial panels | **Samsung VXT** (MagicINFO On-Prem EOS Dec 2026), **LG SuperSign** |
| **G. Interactive** | Touch / sensors | Museums, flagship | Intuiface, Navori interactive |
| **H. Open / self-host** | Control, no screen tax | Devs, regulated | **Xibo**, Anthias (Screenly OSE lineage) |
| **I. Hospitality / guest TV** | Welcome, guidebook, cast | STR, boutique hotel | **WelcomeScreen**, hotel IPTV/PMS TV stacks |
| **J. Business TV hybrid** | Curated streams + ad breaks | Waiting rooms, bars, lobbies | **Atmosphere TV** (signage as ad slots in breaks) |
| **K. Legacy enterprise** | On-prem + managed | Global retail / QSR | **Scala** → Vertiseit/Dise SaaS transition |
| **L. Turnkey STaaS** | Hardware + install + CMS SLA | Multi-location operators | CrownTV-class integrators (not pure software) |

Global context (industry estimates): digital signage ~$31B (2025) → ~$58B by 2033; new deployments ~**95% cloud SaaS**.

---

## 3. Best solutions shortlist (ranked for *study*, not purchase)

### Tier S — Study deeply (highest Stay OS ROI)

| # | Platform | Why “best” | Steal now |
|---|----------|------------|-----------|
| **1** | **BrightSign Control / BSN.cloud** | Industry weapon for **fleet truth**: free Control with every player — health dashboards, alerts, remote reboot/snapshot, B-Deploy provisioning, partner CMS handoff. Paid Management adds POP / deeper content ops. | Fleet SLA badges; provision “new TV defaults”; remote **reload** (Fully Kiosk analogue); never bedroom pixel snapshot while occupied |
| **2** | **Navori QL + Signagelive** | Best-in-class **rules + campaigns** post-family merge; weather/tag/time conditions; POP; multi-user; multi-screen | **S1.1** date campaigns; **S1.6** launch-within-24h weight; condition layers; priority stack UI (S4.1) |
| **3** | **SpinetiX (HMP + ARYA + Elementi)** | Reliability culture + deceptively simple cloud; AV-integrator darling | “It just plays” UX; one pane that never lies about device state |
| **4** | **ScreenCloud** | Governance + multi-location polish; ~$20–30/screen; SOC2/ISO; Studio/Canvas; ~80 apps, deep enterprise integrations | Property tags/groups; clone property config; draft hygiene; publish preview diff |
| **5** | **Rise Vision** | Templates + **emergency / CAP-style** takeover + education DNA; ~$11–15/display equiv | Storm already shipped — next: CAP-lite propose + TTL clarity + multi-message library |

### Tier A — Best-in-class for a specific job

| Platform | Best at | Stay OS takeaway |
|----------|---------|------------------|
| **Yodeck** | Price + free 1-screen tier + free Pi on annual (~$8/screen); 400+ industry templates; 130k+ users | Fast vacant playlists; industry-pack mental model — **not** Pi as guest SoC |
| **OptiSigns** | Mid-price ($10–14.50); **160+ apps**, **4,000+ templates**, AI text-to-signage, broad hardware (Apple TV/Roku/Windows) | Template volume inspiration; optional AI *draft* copy (host confirm); multi-widget **only** for vacant/signage class |
| **NoviSign** | Non-designer templates + interactive widgets | FH brand kits + starter playlists per villa type |
| **TelemetryTV** | Live dashboards, widgets, IT-ops feel, analytics | Live data is first-class — we productized as **channels** (S1.5); deepen auto-weight |
| **Appspace** | Workplace channels + spaces + EX platform | Named content packages (Beach / Rockets / Farewell) — not visitor management |
| **Poppulo** (ex Four Winds) | Contribution workflows at enterprise scale | Light roles later (owner / media / cleaner) — no approval bureaucracy for 6 villas |
| **Kitcast** | Mixed hardware one pane; Apple TV depth; MDM | Pairing hygiene; multi-OS ideas; we stay Shield primary |
| **Raydiant** | Retail simplicity, mobile publish | Phone “swap hero tonight” / one-tap pin |
| **Xibo** | Open-source full CMS | Schedule schema inspiration; no per-screen tax mental model |
| **PlaySignage** | Mobile-optimized CMS | Host-from-phone publish (we started #67 — finish “tonight’s hero”) |
| **OnSign TV** | Cloud + free/premium tiers, templates | SMB speed benchmarks only |

### Tier B — Know them; steal selectively

| Platform | Notes |
|----------|--------|
| **Samsung VXT** | MagicINFO cloud successor; S/P series ~$10–40/screen; MagicINFO On-Prem EOS Dec 2026. **Reject as primary** (panel lock-in vs Shield entertainment). Amenities-only later. |
| **LG SuperSign** | Same story for webOS commercial panels |
| **Scala** (Vertiseit/Dise) | Historic enterprise king; ownership transition — watch, don’t build on legacy UX |
| **Broadsign** | DOOH rigor / POP — only if we sell ad inventory |
| **NowSignage / Juuno / Ablesign** | Mid-pack cloud UX benchmarks |
| **PosterBooking** | Aggressive free Fire Stick SMB |
| **Fugo / Pickcel / Mvix** | Budget + marketplaces / compliance — curated widgets only |
| **Screenly / Anthias** | Pi / self-host lineage |
| **Intuiface** | Interactive experiences — not STR living room |
| **Look Digital Signage** | Regional mid-market |

### Tier H — Hospitality cousins (competitive kill list)

| Platform | Relation |
|----------|----------|
| **WelcomeScreen** | Closest STR guest-TV cousin — beat on entertainment launcher + Space Coast data + PMS depth + never dual-HDMI |
| **Hotel IPTV / PMS TV** | Guest personalization DNA; usually brand-locked set-top |
| **Lobby-only hotel signage** (any Tier A/B) | Wayfinding / F&B — map to vacant/amenity / Cast Pro, not guest entertainment SoC |

### Tier J — Adjacent hybrids (new this pass)

| Platform | What it is | Steal / reject |
|----------|------------|----------------|
| **Atmosphere TV** | Free/paid business TV streams; **signage as first ad break** after curated content | **Idea:** curated vacant “ambience channels” (ocean, rockets, luxury stills) — **not** third-party cable ads in guest rooms |
| **CrownTV-class STaaS** | Hardware + install + CMS under one SLA | Packaging lesson for future multi-tenant SaaS ops; not our FH dogfood model |

### Explicit reject-as-inspiration

| Pattern | Why |
|---------|-----|
| Camera / AI audience analytics in bedrooms | Privacy poison for STR |
| Netflix / stream credential brokers | DECISIONS / ENTERTAINMENT lock |
| Dual HDMI “signage box + streamer” | HARDWARE-STANDARD kill |
| Open app marketplace on guest TV | Supply-chain + junk content risk |
| Pure Android APK “signage store” junk | Unreliable guest living room |
| Per-screen $20 SaaS DNA for six villas | Wrong packaging; org/property (SAAS-ARCHITECTURE) |
| MagicINFO/VXT as entertainment SoC | Panel OS ≠ Shield entertainment |

---

## 4. Industry “best of 2026” roundups vs reality

| Roundup flavor | Common tops | Bias |
|----------------|-------------|------|
| Worldmetrics top 10 (2026) | ScreenCloud, Yodeck, TelemetryTV, OptiSigns, Rise, NoviSign, Signagelive, OnSign, PlaySignage, Navori | SMB/cloud ease; **under-weights** BrightSign hardware reliability |
| CrownTV operator compare | ScreenCloud $20 / OptiSigns $10 / Yodeck $8 | Integrator lens; honest on hardware/install gap |
| Rise Vision “best of 2026” | Rise first | Vendor-written |
| AV integrator reality | BrightSign, SpinetiX, Navori/Signagelive | Reliability > pretty CMS |
| G2 / Capterra volume | Yodeck, OptiSigns, Rise | Review-volume SMB skew |
| Digital Signage Today “19 providers” | Broad trade list | Coverage, not rank |

**Synthesis:** Ignore “#1 overall.” Study **ops weapons** (BrightSign/SpinetiX/Navori) + **emergency** (Rise) + **governance lite** (ScreenCloud) + **live channels** (TelemetryTV/Appspace) + **template speed** (NoviSign/OptiSigns/Yodeck).

### Public pricing ballparks (mid-2026, annual where noted)

| Band | Examples | ~$/screen/mo |
|------|----------|--------------|
| Free / budget | Yodeck free 1-screen, PosterBooking, OptiSigns trials | $0–10 |
| Mid cloud | Yodeck ~$8, OptiSigns ~$10–14.50, Kitcast ~$7–10, TelemetryTV ~$9, Rise ~$11–15 | $7–15 |
| Premium cloud | ScreenCloud ~$20–30, Samsung VXT often higher | $20–45+ |
| Hardware+CMS | BrightSign, SpinetiX | Quote (player + cloud tiers) |
| Open source | Xibo self-host | Hosting + labor |

**Stay OS packaging:** org + property (not per-screen signage SaaS first). FH dogfood free; external customers later.

---

## 5. What the best platforms actually do well (patterns → Stay OS)

### 5.1 Fleet truth & provision (BrightSign Control, SpinetiX)
- Online / stale / last error / last content in one table  
- Automated **provisioning profiles** (B-Deploy): name, timezone, config on first boot  
- Remote reboot / snapshot / OS update where hardware allows  

**We have:** fleet map, offline alerts, last_seen.  
**Add:** S0.3 now-playing (playlist id + mode, **no** occupied pixels); S0.3b Fully forceReload; **S5.1** pair-profile defaults (timezone, property, deviceClass); S4.5 SLA badges.

### 5.2 Right content, right moment (Navori / Signagelive / OptiSigns Smart Scheduling)
- Date-range campaigns stacked on dayparts  
- Priority: emergency > pin > campaign > daypart > default  
- Conditions: weather, tags, external data  

**We have:** dayparts, storm, channels, bulk publish.  
**Add:** S1.4 vacant; S1.1 campaigns; S1.6 launch weight; S4.1 priority stack UI; S1.2 media validity.

### 5.3 Publish safety (ScreenCloud / enterprise)
- Draft → publish; history; audit who/what/when  

**We have:** S0.4 history/rollback.  
**Add:** S2.6 draft; S4.4 publish preview diff; actor log when multi-user.

### 5.4 Non-designer speed (NoviSign / OptiSigns / Yodeck / Raydiant)
- Huge template libraries; industry packs; mobile publish; AI draft copy (OptiSigns)  

**We have:** timeline editor, media tags, upload, mobile host pass.  
**Add:** S4.8 / S2.2 template gallery + brand kit; S5.2 AI draft slide copy (optional, host-confirm, SpaceXAI if we build AI); S4.12 clone property.

### 5.5 Emergency (Rise Vision)
- Instant full-screen; TTL; multi-location  

**We have:** S1.3b storm.  
**Add:** S4.11 CAP-lite propose; multi-preset library (storm / boil-water / evacuation).

### 5.6 Live data as channels (TelemetryTV / Appspace)
- Named packages, not file dumps  

**We have:** S1.5 channels.  
**Add:** gallery of first-class Space Coast packs (Beach Day, Rockets, Farewell, House Rules); auto-apply on guest mode transitions.

### 5.7 Offline & self-heal (every serious CMS)
- Local cache; never blank; auto-reload on deploy  

**We have:** never-blank, poll, deploy fingerprint — **defend**.

### 5.8 Occupied privacy (Stay OS doctrine — anti-BrightSign-snapshot)
- Host must **never** get pixel proxy of occupied guest rooms  

**Codify:** S4.6 always — now-playing = mode + playlist meta only while reservation active.

### 5.9 Curated ambience (Atmosphere TV — careful)
- Continuous “something beautiful is always on” between branded messages  

**Steal carefully:** vacant luxury loops from our own media pool — **not** third-party ad breaks in guest rooms.

---

## 6. Inspiration backlog — S5 (net-new this pass)

Do **not** renumber S0–S4. Board these when Claude has bandwidth.

| ID | Idea | Inspired by | Pri | Notes |
|----|------|-------------|-----|-------|
| **S5.1** | **TV pair profiles** — defaults on claim (property, label pattern, timezone, deviceClass) | BrightSign B-Deploy / Control provision | P1 | Cuts onboarding mistakes |
| **S5.2** | **AI draft copy** for pin/takeover text (host must confirm) | OptiSigns AI text-to-signage | P3 | Optional; SpaceXAI if we touch LLMs; never auto-publish |
| **S5.3** | **Content health check** — broken media URLs, missing Drive files, zero-duration blocks | Enterprise CMS hygiene | P1 | Surfaces before guests see black slides |
| **S5.4** | **Mode transition hooks** — on check-in / check-out / vacant → auto channel or playlist | Navori conditions + hospitality | P1 | Pairs with S1.4 vacant |
| **S5.5** | **Emergency presets library** — Storm, Boil-water, Evac tip, Custom | Rise multi-alert | P2 | Extends S1.3b |
| **S5.6** | **Property type packs** — Beach / Rocket-view / Family — one-click bootstrap | Yodeck industry templates | P1 | Same spirit as S4.8 |
| **S5.7** | **Vacant ambience pack** — long-form luxury loops (drone, ocean, night pool) from our library | Atmosphere “always on” (sans ads) | P2 | Vacant/signage class only |
| **S5.8** | **Group filters on fleet** — “all beach living rooms” without listing TVs | BrightSign groups / ScreenCloud multi-location | P1 | Overlaps S4.2 — ship one clean groups model |
| **S5.9** | **Quiet publish window** — “go live 04:00 local” | Enterprise scheduled publish | P3 | S3.7 / S4.9 |
| **S5.10** | **Host action audit** — Path C + reload + pin + storm log | TelemetryTV / MDM audit | P2 | Complements S0.4 content history (S4.10) |
| **S5.11** | **Guesty-driven content propose** — early check-in / gap night / long vacant → suggest vacant pack | Rule engines + PMS moat | P2 | Host confirm, never surprise guest |
| **S5.12** | **SLA chip row on dashboard** — green &lt;2m / amber 2–10m / red &gt;10m fleet summary | BrightSign health dashboards | P1 | Dashboard polish on top of S0.1/S0.2 |

### Already boarded (do not renumber) — still open

S0.3 now-playing · S0.3b kiosk reload · S1.1 campaigns · S1.2 validity · S1.4 vacant (open) · S1.6 launch weight · S2.2 brand kit · S2.6 draft · S3.1 POP lite · S3.2 roles · S3.6 deviceClass (parked) · S4.1 priority UI · S4.2 groups · S4.4 publish diff · S4.5 SLA · S4.6 occupied privacy · S4.8 templates · S4.11 CAP-lite · S4.12 clone property

---

## 7. Recommended ship order (post fan-out)

1. **Land S1.4** vacant playlist (open branch)  
2. **S1.6** launch-window auto-weight (Space Coast moat)  
3. **S0.3 + S0.3b** now-playing meta + Fully reload  
4. **S5.12 / S4.5** fleet SLA badges on dashboard  
5. **S1.1** calendar campaigns (launch week, holidays)  
6. **S4.8 + S5.6 + S2.2** template / brand pack bootstrap  
7. **S4.2 / S5.8** property tags + screen groups  
8. **S5.3** content health · **S5.1** pair profiles  
9. **S3.6** when Devin enables MCP **0022**  
10. **S3.1** POP lite · roles when multi-user real  

**Do not block guest conversion / Path C polish** for CMS vanity.

---

## 8. Competitive one-pager (use in roadmap prose)

| Buyer asks | Pure CMS answer | Stay OS answer |
|------------|-----------------|----------------|
| “Is the screen online?” | BrightSign-class fleet | Fleet map + offline email + SLA chips |
| “Can I schedule a campaign?” | Navori calendars | Campaigns + dayparts + guest/vacant modes |
| “Emergency override?” | Rise CAP | Storm mode across villas (shipped) |
| “Can non-designers publish?” | Templates / AI | Brand kits + packs + mobile host |
| “Guest name + Wi‑Fi + Netflix on same TV?” | **No / rare** | **Yes — core product** |
| “Second HDMI box?” | Often yes | **No — one entertainment SoC** |
| “Bedroom screenshots for ops?” | Common on BrightSign | **Never while occupied** |

> **Competitors sell screen networks. We sell Stay OS:** guest-aware TV + entertainment launcher + light CMS. Match **fleet health, scheduling depth, publish safety, and emergency** of the best platforms — without becoming a mall network, a panel OEM lock-in, or a credential broker.

---

## 9. Study order (if Devin/Claude demo)

1. **BrightSign Control** — fleet + provision UX (30 min docs)  
2. **Navori / Signagelive** — campaign + condition mental model  
3. **Rise Vision** — emergency UX (compare to our storm panel)  
4. **ScreenCloud Studio** — multi-location / publish hygiene  
5. **Yodeck or NoviSign** — template/industry pack UX  
6. **TelemetryTV** — channel packaging (we already started)  
7. **WelcomeScreen** — kill-list sharpness only  

Skip multi-week Appspace / Poppulo / Scala sales cycles unless SaaS procurement forces it.

---

## 10. Ask for Claude

1. Read this pass 4 + market map + competitive gap list.  
2. **Merge S1.4** when green (`grok/s1-4-vacant-playlist`).  
3. Board **S1.6** next for Grok; fold **S5.1, S5.3, S5.12, S5.4** onto living ROADMAP when bandwidth allows.  
4. Keep **S4.6 occupied privacy** non-negotiable on any “what’s on screen” work.  
5. Hold **S3.6** until Devin approves MCP **0022**.

---

## 11. Sources (public, mid-2026)

- Operator comparisons: ScreenCloud vs OptiSigns vs Yodeck (pricing, hardware, templates, AI)  
- Roundups: Worldmetrics digital signage software 2026; Rise Vision “best of 2026”; Digital Signage Today provider lists  
- Vendor / trade: BrightSign Control / BSN.cloud product pages; Samsung VXT pricing & MagicINFO EOS; Signagelive/Navori ecosystem; Atmosphere TV product model  
- Prior internal: SIGNAGE-CMS-COMPETITIVE, SIGNAGE-INDUSTRY-DEEP-DIVE, SIGNAGE-CMS-MARKET-MAP-2026  

— Grok · 2026-07-21 · CMS deep dive **pass 4**
