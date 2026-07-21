# Digital signage CMS market map 2026 — best solutions & Stay OS inspiration

**Date:** 2026-07-21 (pass 3 — full market catalog)  
**Author:** Grok · MEDIA HAVEN  
**Supplements:** [`SIGNAGE-CMS-COMPETITIVE.md`](./SIGNAGE-CMS-COMPETITIVE.md) (gap backlog S0–S3) · [`SIGNAGE-INDUSTRY-DEEP-DIVE.md`](./SIGNAGE-INDUSTRY-DEEP-DIVE.md) (pass 2 themes)  
**Latest rescore + S5 backlog:** [`SIGNAGE-CMS-DEEP-DIVE-PASS4.md`](./SIGNAGE-CMS-DEEP-DIVE-PASS4.md) (pass 4 — post fan-out scoreboard)  
**Locks:** DECISIONS · ENTERTAINMENT · HARDWARE-STANDARD — Shield/GTV entertainment; Cast Pro signage-only; no stream OAuth store; guest privacy sacred.

---

## 0. Executive summary

There is no single “best” digital signage CMS in 2026. The market splits into **weapon-grade player stacks**, **enterprise workplace platforms**, **cloud SMB SaaS**, **DOOH/ad networks**, **display-OEM lock-ins**, and **open source**. Pure CMS vendors win on **fleet control, scheduling rules, templates, and governance**. None of them win on **guest-aware STR hospitality + entertainment on one HDMI** — that is Stay OS.

**Steal ruthlessly from:** BrightSign (fleet truth), Navori/Signagelive (rules + campaigns), Rise Vision (emergency), ScreenCloud (publish safety), TelemetryTV (live channels), SpinetiX (reliability UX).  
**Do not clone:** multi-zone living-room canvases, camera analytics, DOOH ad exchanges, dual-HDMI boxes, per-screen $20 SaaS DNA for six villas.

**media-haven status after S0.4 (#65):** dayparts + timeline + publish history/rollback live; fleet map (#62) and offline alerts (#64) in PR. Still weak on calendar campaigns, emergency takeover, tags, channels, and bulk property apply.

---

## 1. Market structure (2026)

| Segment | What they sell | Typical buyer | 2026 notes |
|---------|----------------|---------------|------------|
| **A. Dedicated players + OS** | Hardware + network CMS | AV integrators, retail 24/7 | BrightSign still gold standard; SpinetiX ARYA/Elementi |
| **B. Enterprise workplace / EX** | Signage + employee apps + spaces | Corp IT / Internal Comms | Appspace, Poppulo, Korbyt, ScreenCloud |
| **C. Cloud SMB / mid-market** | Browser CMS + SoC/Pi/Fire apps | SMB ops, schools, QSR | Yodeck, OptiSigns, NoviSign, Rise, TelemetryTV, Kitcast, NowSignage, PosterBooking |
| **D. Rule engines / networks** | Conditional play, POP, scale | Retail, transit, franchise | Navori QL + **Signagelive** (Navori acquired Signagelive → combined CMS powerhouse) |
| **E. DOOH / ad ops** | Inventory, programmatic, POP | Outdoor networks | Broadsign, DOOHly |
| **F. Display OEM CMS** | Locked to Tizen / webOS panels | Facilities buying commercial panels | **Samsung VXT** (MagicINFO successor; MagicINFO On-Prem EOS Dec 2026), **LG SuperSign** |
| **G. Interactive / experiential** | Touch, gesture, sensors | Museums, flagship retail | Intuiface, Navori AI player |
| **H. Open / self-host** | Full control, no screen tax | Devs, regulated | Xibo, Anthias (ex-Screenly OSE) |
| **I. Hospitality-adjacent** | Guest TV / VR welcome | STR hosts, boutique hotels | WelcomeScreen, hotel IPTV stacks (often separate from lobby signage) |
| **J. Legacy enterprise** | On-prem + hybrid networks | Global retail / QSR | **Scala** sold 2026 → Vertiseit/Dise; SaaS transition in progress |

Global digital signage market context (industry estimates): ~$31B (2025) → ~$58B by 2033 (~8% CAGR). New deployments are ~95% cloud SaaS.

---

## 2. Best solutions shortlist (ranked for *study*, not purchase)

### Tier S — Study deeply (highest Stay OS ROI)

| # | Platform | Why “best” | Steal for Stay OS |
|---|----------|------------|-------------------|
| **1** | **BrightSign BSN.cloud / Control Cloud** | Industry weapon for player health, groups, remote reboot/snapshot, POP tiers, 24/7 reliability | Fleet map truth, offline alerts, group actions, optional vacant snapshot later — **never** bedroom pixel capture while occupied |
| **2** | **Navori QL + Signagelive** | Best-in-class **rule/campaign scheduling**; weather/tag/time conditions; POP; multi-user; large installed base post-merger | Calendar campaigns, condition layers, launch-window auto-weight, validity windows on media |
| **3** | **SpinetiX (HMP + ARYA + Elementi)** | Hardware reliability + deceptively simple cloud UX; AV-integrator darling | One pane that always tells the truth about device state; “it just plays” reliability culture |
| **4** | **ScreenCloud** | Governance: approvals, RBAC, multi-location, SSO, audit, app integrations (~$20/screen) | Draft/publish hygiene, who-published-what (S0.4 done), multi-property branding later |
| **5** | **Rise Vision** | Templates + **emergency / CAP-style takeover** + ChromeOS education DNA | **Storm mode** (Florida P0); instant full-screen override with TTL clear |

### Tier A — Best-in-class for a specific job

| Platform | Best at | Stay OS takeaway |
|----------|---------|------------------|
| **Appspace** | Workplace experience + channels + spaces | Package content as **named channels** (Beach / Rockets / Farewell), not only freeform playlists |
| **Poppulo** (ex Four Winds) | Contribution workflows at enterprise scale | Light multi-role later (owner / media / cleaner) — not full approval bureaucracy |
| **TelemetryTV** | Live dashboards, widgets, IT-ops feel | Live data is first-class; we already have weather/tides/launches — **productize as channels** |
| **Yodeck** | Cheap Pi fleets, free 1 screen, fast schedule | Low-friction vacant playlists; simple calendar UX |
| **NoviSign** | Templates + interactive widgets for non-designers | FH brand kits + starter playlists for non-designer hosts |
| **OptiSigns** | Broad hardware matrix, value mid-market | Multi-widget **vacant/signage class only** — not guest living room |
| **Kitcast** | Mixed hardware one dashboard; native Apple TV depth; MDM | Pairing + multi-OS fleet ideas; we stay Shield/GTV primary (HARDWARE lock) |
| **Raydiant** | Retail simplicity, mobile-first publish | Phone “swap hero for tonight” / one-tap takeover |
| **Xibo** | Open-source full CMS; self-host patterns | Playlist/schedule schema inspiration; no per-screen tax mental model |
| **Broadsign** | DOOH ad network rigor | POP discipline **if** we ever sell ad inventory (not now) |

### Tier B — Strong tools (know them; steal selectively)

| Platform | Notes |
|----------|--------|
| **Scala** (now Vertiseit/Dise) | Historic enterprise king; 2026 ownership change; moving SaaS/device-agnostic — watch but don’t build on legacy Scala UX |
| **Samsung VXT** / MagicINFO | Best if you own Samsung commercial panels; MagicINFO On-Prem EOS Dec 2026 → cloud VXT. **Reject** as primary: panel lock-in vs Shield entertainment |
| **LG SuperSign** | Same story for LG webOS commercial — amenities only, not guest entertainment SoC |
| **Korbyt** | Enterprise multi-channel employee comms |
| **NowSignage / Juuno / Ablesign** | Cloud SMB mid-pack; clean UX benchmarks |
| **PosterBooking** | Aggressive free-tier / Fire Stick SMB |
| **Fugo / Pickcel / OnSign.TV** | Budget cloud + app marketplaces — curated widgets only for us |
| **Mvix** | Pay-once / compliance buyers |
| **Screenly / Anthias** | Pi/self-host lineage |
| **DOOHly** | Outdoor/ad-focused |
| **Intuiface** | Interactive experiences — not STR living room |
| **Look Digital Signage** | Regional / mid-market |

### Tier H — Hospitality cousins (competitive kill list)

| Platform | Relation to Stay OS |
|----------|---------------------|
| **WelcomeScreen** | Closest STR guest-TV cousin — beat on entertainment launcher + Space Coast data + PMS depth |
| **Hotel IPTV / PMS TV stacks** (various) | Guest personalization DNA; usually locked to hotel brands / set-top |
| **Lobby-only hotel signage** (any Tier A/B) | Wayfinding, events, F&B — we can do vacant/amenity mode but guest **room** is the product |

### Explicit reject-as-inspiration

| Pattern / product type | Why |
|------------------------|-----|
| Camera / AI audience analytics in bedrooms | Privacy poison for STR |
| Netflix / stream credential brokers | DECISIONS lock |
| Dual HDMI “signage box + streamer” | HARDWARE-STANDARD kill |
| Open app marketplace on guest TV | Supply-chain + junk content risk |
| Pure Android APK “signage store” junk | Unreliable guest living room |
| Per-screen enterprise pricing as product DNA | Wrong for 6–50 villas; org/property later (SAAS-ARCHITECTURE) |

---

## 3. Capability matrix — industry leaders vs media-haven

Score 1–5. **Target** is intentional, not “max everything.”

| Axis | Industry weapons | media-haven (post-S0.4) | Target | How we close the gap |
|------|------------------|-------------------------|--------|----------------------|
| **1. Fleet reliability & ops** | BrightSign, SpinetiX | **3** (heartbeat; #62/#64 open) | **5** | Merge S0.1 + S0.2; S0.3 now-playing; S0.3b kiosk reload |
| **2. Scheduling intelligence** | Navori, Signagelive, Yodeck | **2.5** (dayparts only) | **4** | S1.1 campaigns, S1.2 validity, S1.4 vacant playlist, S1.6 launch condition |
| **3. Content authoring** | NoviSign, ScreenCloud, ARYA | **3.5** (timeline v2e) | **4** | S2.1 tags, S2.2 brand kit, Claude direct upload |
| **4. Governance / multi-user** | ScreenCloud, Appspace, Poppulo | **1.5** (single host; S0.4 history) | **3** | Roles later; skip SAML until SaaS |
| **5. Live data / widgets** | TelemetryTV, Rise, Navori live | **4.5** (weather/tides/launches/PMS) | **5** | **S1.5 channels** — productize moat |
| **6. Guest personalization** | WelcomeScreen / hotel IPTV | **5** | **5** | Defend; Path C Open on TV |
| **7. Analytics / POP** | BrightSign paid, Broadsign, Navori | **1** | **3** | S3.1 lite sampled slide logs only |
| **8. Emergency takeover** | Rise, CAP-aware edu platforms | **1** | **4** | **S1.3b storm mode** (Florida) |
| **9. Hardware freedom** | Kitcast, OptiSigns, Yodeck | **4** (web + Fully + Shield) | **4** | Keep; S3.6 deviceClass for Cast Pro |

**Doctrine:** Win **1 + 2 + 5 + 6 + 8**. Polish 3. Accept lite 4 and 7. Never trade 6 for multi-zone retail UX.

---

## 4. What the best platforms actually do well (patterns)

### 4.1 Fleet truth (BrightSign / SpinetiX / TelemetryTV)
- Online / stale / last error / last content in one table  
- Group filters (site, room type, tag)  
- One-click reload / reboot where hardware allows  

**Stay OS:** Finish fleet map + alerts; add “now playing” without screenshots; Fully Kiosk `forceReload` poll flag.

### 4.2 Right content, right moment (Navori / Signagelive)
- Date-range **campaigns** stacked on dayparts  
- Priority: emergency > campaign > default  
- Conditions: weather, tag, external data  

**Stay OS:** Launch week hero; `if launch_within_24h → boost rockets`; vacant vs occupied playlists first-class in UI.

### 4.3 Publish safety (ScreenCloud / enterprise)
- Draft → publish  
- History + rollback  
- Audit “who / what / when”  

**Stay OS:** S0.4 **shipped**. Next: draft state (S2.6), actor audit log when multi-user lands.

### 4.4 Non-designer publish (NoviSign / Raydiant / ARYA)
- Templates, brand kits, mobile publish  

**Stay OS:** FH brand kit + 3–5 starter packs; mobile host “tonight’s hero.”

### 4.5 Emergency communication (Rise Vision / campus)
- Instant full-screen takeover  
- TTL auto-clear  

**Stay OS:** Storm / boil-water / evacuation tip — one host button, all linked TVs, higher priority than vacant slideshow.

### 4.6 Live data as channels (TelemetryTV / Appspace)
- Named channels, not file dumps  

**Stay OS moat:** Beach Day, Rockets, Farewell, Entertainment coach, House rules — pin priority without rebuilding widgets.

### 4.7 Offline & self-heal (every serious CMS)
- Local cache; never blank  
- Auto-reload on deploy  

**Stay OS:** Already strong (never-blank, poll, deploy fingerprint). Keep defending.

### 4.8 Pairing & MDM (Kitcast / enterprise Apple TV world)
- Short code pair; zero-touch MDM  

**Stay OS:** Pair codes exist; hygiene for stale unpaired devices (S0.7). No Jamf needed at FH scale.

---

## 5. Pricing / packaging reality (context only)

Public ballparks mid-2026 (per screen / month, annual where noted):

| Band | Examples | ~Price |
|------|----------|--------|
| Budget cloud | Yodeck, PosterBooking, OptiSigns free tiers | Free–$10 |
| Mid cloud | Kitcast $7–10, TelemetryTV ~$9, Rise ~$11 | $7–15 |
| Enterprise UX | ScreenCloud ~$20–30, Samsung VXT often higher | $20–45+ |
| Hardware+CMS | BrightSign, SpinetiX | Quote (player + cloud tiers) |
| Open source | Xibo self-host | Hosting + labor |

**Stay OS packaging:** not per-screen signage SaaS first — **org + property** (SAAS-ARCHITECTURE). FH dogfood free; external customers later.

---

## 6. Best-of lists crosswalk (industry roundups 2026)

| Roundup flavor | Common “top” names | Bias to watch |
|----------------|--------------------|---------------|
| ScreenCloud “best of 2026” | ScreenCloud, Juuno, TelemetryTV, Rise, NowSignage, Ablesign, BrightSign, Screenly | Vendor-written |
| Kitcast vendor table | Kitcast, Yodeck, OptiSigns, ScreenCloud, Rise, NoviSign, Mvix, SpinetiX, TelemetryTV, Korbyt | Apple TV / multi-platform bias |
| Digital Signage Today “19 providers” | BrightSign, Xibo, Yodeck, + enterprise set | Industry trade |
| G2-style lists | Yodeck, OptiSigns, Rise, Appspace, ScreenCloud | Review-site SMB skew |
| AV integrator reality | BrightSign, SpinetiX, Navori/Signagelive, Scala heritage | Reliability over pretty CMS |

**Synthesis for Stay OS:** ignore “#1 overall.” Study **ops weapons** (BrightSign/SpinetiX/Navori) + **emergency** (Rise) + **governance lite** (ScreenCloud patterns) + **live channels** (TelemetryTV/Appspace).

---

## 7. Inspiration → concrete Stay OS improvements

### Already boarded (do not renumber)

S0.1 fleet · S0.2 offline alerts · S0.3 now-playing · S0.4 history ✅ · S0.5 bulk publish · S1.1 campaigns · S1.2 validity · S1.3 takeover · S1.3b storm · S1.4 vacant playlist · S1.5 channels · S1.6 launch weight · S2.1 tags · S2.2 brand kit · S2.6 draft · S3.1 POP lite · S3.6 deviceClass · S0.3b reload · S0.6 groups · S2.7 mobile · S2.8 calendar · S3.7 quiet publish

### Net-new from this pass (S4 board)

| ID | Idea | Inspired by | Pri | Notes |
|----|------|-------------|-----|-------|
| **S4.1** | **Content priority stack UI** — visual layers: Emergency > Pin > Campaign > Daypart > Default | Navori priority / Rise override | P1 | Host sees why a slide won |
| **S4.2** | **Property tags + screen groups** — “all beach villas”, “all Dunes living rooms” | BrightSign groups, ScreenCloud multi-location | P1 | Enables S0.5 bulk without listing every TV |
| **S4.3** | **Media expiry auto-archive** — end date greys out + drops from playlists | Navori validity / enterprise hygiene | P2 | Pairs with S2.1 tags |
| **S4.4** | **Publish preview diff** — “3 slides added, 1 removed, dayparts unchanged” before commit | Enterprise change mgmt | P2 | Reduces accidental full-wipe publishes |
| **S4.5** | **Heartbeat SLA badges** — green &lt;2m, amber 2–10m, red &gt;10m + last playlist id | BrightSign health | P1 | Fleet map polish after S0.1 |
| **S4.6** | **Occupied privacy mode** — host never sees pixel proxy while reservation active | Anti-BrightSign-screenshot | P0 doctrine | Enforce in any future “what’s on screen” |
| **S4.7** | **Amenity-only playlists** (pool / entry Cast Pro) separate from living room | OEM SoC + HARDWARE deviceClass | P2 | After S3.6 |
| **S4.8** | **Template gallery v1** — Welcome occupied, Vacant luxury, Storm, Launch week, Farewell | NoviSign / Kitcast templates | P1 | Instant property bootstrap |
| **S4.9** | **Scheduled publish** (“go live 04:00”) | Enterprise quiet windows | P3 | Same as S3.7 spirit |
| **S4.10** | **TV command log** (Path C + reload + pin) — host audit of remote actions | TelemetryTV / MDM audit | P2 | Complements S0.4 content history |
| **S4.11** | **CAP-lite webhook** — optional weather/NWS feed → propose storm mode | Rise CAP education | P2 | Human confirm before takeover |
| **S4.12** | **Duplicate property config** — clone Wi‑Fi/guidebook/signage skeleton to new listing | ScreenCloud multi-site | P1 | SaaS onboarding speed |

### Recommended ship order (updated)

1. **Land #62 S0.1 + #64 S0.2** (ops floor)  
2. **S2.1** media tags (coordinate Claude upload)  
3. **S1.3b** storm takeover (Florida)  
4. **S1.5** channels + **S1.4** vacant playlist  
5. **S1.1** calendar campaigns + **S1.6** launch condition  
6. **S4.8** template gallery + **S4.2** groups  
7. **S0.5** bulk apply · **S0.3b** kiosk reload · **S3.6** deviceClass  
8. **S3.1** POP lite · roles when multi-user real  

---

## 8. Competitive positioning one-pager

| Buyer asks | Pure CMS answer | Stay OS answer |
|------------|-----------------|----------------|
| “Is the screen online?” | BrightSign-class fleet | Host fleet map + email alerts |
| “Can I schedule a campaign?” | Navori calendars | Calendar campaigns + dayparts + guest mode |
| “Can non-designers publish?” | Templates | Brand kit + packs + upload |
| “Emergency override?” | Rise CAP | Storm mode across villas |
| “Guest name + Wi‑Fi + Netflix on same TV?” | **No / rare** | **Yes — core product** |
| “Do I need a second HDMI box?” | Often yes for apps | **No — one entertainment SoC** |

> **Competitors sell screen networks. We sell Stay OS:** guest-aware TV + entertainment launcher + light CMS. Match **fleet health, scheduling depth, publish safety, and emergency** of the best platforms — without becoming a mall network or a credential broker.

---

## 9. Study order (if Devin/Claude do demos)

1. BrightSign Control Cloud — fleet UX benchmark (30 min docs)  
2. Navori / Signagelive scheduling — campaign mental model  
3. Rise Vision emergency — storm UX  
4. NoviSign template gallery — non-designer path  
5. TelemetryTV widgets — channel packaging  
6. WelcomeScreen — kill-list sharpness only  

Skip multi-week Appspace/Poppulo/Scala sales cycles unless multi-tenant SaaS procurement forces it.

---

## 10. Ask for Claude

1. Read this + competitive + pass-2 deep dive.  
2. Fold **S4.1, S4.2, S4.5, S4.6, S4.8, S4.12** onto living ROADMAP when bandwidth allows (after S0.x fan-out).  
3. Keep **S1.3b storm** and **S4.6 occupied privacy** as non-negotiable doctrine.  
4. Grok queue unchanged: land #62/#64 → S2.1 (rebase on your media upload) → S3.6.

— Grok · 2026-07-21 · CMS market map pass 3
