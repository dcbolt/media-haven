# Grok ⇄ Claude — thefloridahavens.com (marketing site)

**Dual-agent communication for the Florida Havens public marketing / direct-booking website.**  
Not Stay OS. Not Media Haven TV/portal. This is the **demand + book-direct** surface.

| Field | Value |
|-------|--------|
| **Live today** | https://www.thefloridahavens.com (Wix Thunderbolt) |
| **Business job** | OTA → **book direct** on brand domain |
| **Related product** | Media Haven = in-stay OS ([GROK.md](./GROK.md) · Stay OS loop) |
| **Planned** | New repo (Claude planning) — lean Next.js marketing site |
| **Primary brand phone** | **321-209-0495** · Relax@thefloridahavens.com |

Cloud repo wins over local memory. Append dated entries under **Log** (newest at bottom).

---

## How to use

1. **Claude:** Read this file first when working on TFH.com / Wix / new marketing repo. Then ACT.  
2. **Grok:** Append `#### Grok → <UTC> — <title>`; ACK Claude; measure live site; no invented bugs.  
3. **Devin:** Grant access listed under **Access needed**; paste this path into a cold Claude session for website work.  
4. **Do not** put guest Wi‑Fi / laundry / check-in guides on the marketing domain — that is **Media Haven** (`/welcome`, TV).

### Split of ownership (locks)

| Surface | Owner product | Examples |
|---------|---------------|----------|
| **Marketing + book** | TFH.com (this doc) | Home, properties, SEO pages, Guesty book |
| **In-stay** | Media Haven | TV, guest portal, house guides, Path C |
| **Host ops** | Media Haven | Fleet, multi-cal, signage CMS |

Architecture locks for Stay OS still live in DECISIONS / ENTERTAINMENT / HARDWARE — **do not reopen** them in this thread.

---

## Scorecard (Grok external audit · 2026-07-26)

Measured live HTML/headers/sitemap — **not** Wix editor (no collaborator login yet).

| Area | Grade | Notes |
|------|-------|--------|
| Brand / content | **Strong** | Family story, Dunes vs Beach Street clear |
| SEO fundamentals | **Weak–mixed** | Titles OK; **nav is H1 sitewide**; schema wrong; guest-ops indexed |
| Performance | **Poor** | Home HTML **~1.73 MB**; properties **~1.3 MB**; FAQs **~1.5 MB** |
| Book conversion | **Fragile** | Book pages thin; widget via **Wix HtmlComponent / iframe** (client) |
| Usability | **Mixed** | Good story; gallery slide spam; dual phone numbers |
| Ops hygiene | **Needs work** | Typo URL `beach-strret-wifi-guide`; ~54 guides in public sitemap |

### Hard numbers (sampled)

| URL pattern | HTML size | H1 count (broken) |
|-------------|----------:|-------------------:|
| `/` | ~1.73 MB | 7 (nav labels) |
| `/beach-haven` etc. | ~1.3 MB | 7 |
| `/book-*` | ~0.96 MB | 7 |
| `/faqs` | ~1.5 MB | 8 |
| Pages in sitemap | **76** | — |
| Guest-ops-like URLs | **~54** | should be noindex / MH-only |
| SEO demand pages | **~10** | keep & improve |
| Home images missing alt | **~65 / 68** | fix |

### Schema bugs (home JSON-LD `LocalBusiness`)

| Field | Live | Should be |
|-------|------|-----------|
| `telephone` | **5087260695** | **321-209-0495** |
| Address | 4225 S Hwy A1A, Melbourne Beach only | Multi-property brand (or HQ + separate LodgingBusiness per home) |
| Missing | geo, sameAs, ratings, per-home VacationRental | Add on rebuild |

### Booking architecture (today)

```
Property / SEO page → /book-{slug}
  → Wix HtmlComponent (iframe / embed pipeline, filesusr)
    → Guesty (or similar) booking engine (client-rendered)
```

- Embed **not** fully crawlable as first-class content.  
- Wix cannot optimize third-party iframe weight.  
- Prefer **lazy-load** embed after “Check availability” until rebuild.

### What’s working

- Per-property book URLs (`/book-shell-haven`, …)  
- Combo campus pages (`/the-dunes`, `/beach-street`)  
- Unique titles on sampled pages  
- Canonical + robots + sitemap present  
- GA4 `G-3669F4QWXJ`  
- Apex → www HTTPS  
- Strong testimonials  

---

## Priority actions

### P0 — still on Wix (this week)

| # | Action | Owner |
|---|--------|-------|
| 1 | Nav text **not** Heading 1 — one real H1 per page | Devin / Claude on Wix |
| 2 | One phone everywhere: **321-209-0495** (schema + footer + book) | Devin / Claude on Wix |
| 3 | **noindex** (or unpublish) all guest guide / check-in / wifi / laundry / waste / emergency pages | Devin / Claude on Wix |
| 4 | 301 `beach-strret-wifi-guide` → correct slug (then noindex) | Devin / Claude on Wix |
| 5 | Alt text on heroes + logos | Devin / Claude on Wix |
| 6 | Trim gallery slide duplication (same 3 images × N) | Devin / Claude on Wix |
| 7 | Book pages: trust blurb + photo **above** embed; lazy-load widget | Devin / Claude on Wix |
| 8 | Baseline PSI screenshots (mobile home + book + property) | Grok / Devin |

### P1 — Wix or parallel (this month)

| # | Action |
|---|--------|
| 9 | Property-level schema (`LodgingBusiness` / `VacationRental`) |
| 10 | FAQPage schema on `/faqs` |
| 11 | GSC coverage cleanup (exclude guides) |
| 12 | GA4 funnel: property → book → purchase (if available) |
| 13 | Content: ship real posts **or** remove empty blog chrome |

### P2 — new repo (Claude plan + build)

| # | Action |
|---|--------|
| 14 | Lock IA (below) + design tokens shared with Media Haven ocean/seafoam |
| 15 | Next.js marketing site on Vercel; Guesty widget/API on `/book/[slug]` |
| 16 | Full 301 matrix from 76 Wix URLs |
| 17 | Guest-ops content **only** in Media Haven — never re-home on TFH.com |
| 18 | Performance budgets: LCP &lt; 2.5s mobile, lean book route |

---

## Target IA (new marketing site)

```
/                         brand home
/properties               all homes + combos
/the-dunes | /beach-street
/{turtle,shell,beach,sea}-haven
/book/[slug]              lean shell + booking mount (lazy)
/about | /contact | /faqs
/guides/*                 SEO demand only (Orlando, rockets, restaurants, …)
```

**Never on this domain:** wifi, laundry, check-in, waste, emergency, house manuals → Media Haven.

### Stack recommendation

- Next.js App Router (same family as Media Haven)  
- `next/image`, explicit metadata API, JSON-LD components  
- Guesty official booking engine (embed or API)  
- GA4 ecommerce-ish events  
- Shared brand tokens with Media Haven (avoid oceanviz chroma mistakes on charts only — marketing can use brand fills)

---

## Access needed (Devin)

| Access | Why |
|--------|-----|
| **Wix collaborator** (Editor + SEO + Apps) | Real backend audit, H1/noindex/schema fixes |
| **Google Search Console** (user) | Index bloat, queries, CWV field data |
| **GA4** (viewer) | Funnel truth |
| **Guesty** booking engine listing IDs / widget URLs | Correct per-home book embeds |
| Optional: Clarity/Hotjar | Rage clicks on book embeds |

Grok can re-crawl public URLs anytime without access. Editor login unlocks P0 execution verification.

---

## Agent roles on this project

| Agent | Does |
|-------|------|
| **Claude** | Wix fixes when Devin grants access · new repo scaffold · IA/PR plan · Guesty integration design |
| **Grok** | Live crawls · PSI/SEO verify · redirect matrix drafts · post-ship prod checks · ample repro to Claude |
| **Devin** | Access · brand/copy final · cutover go · DNS if needed |

### Anti-patterns

- Rebuilding guest house guides on TFH.com  
- Inventing ranking claims without GSC  
- Mass-redesign without fixing H1 / noindex first  
- Coupling Stay OS DB migrations to marketing rebuild  

---

## Log

#### Grok → 2026-07-26 ~12:50 UTC — TFH.com dual-agent file opened + external audit landed

Devin asked for a deep scrub of thefloridahavens.com (Wix + iframes + SEO/perf/UX) and a channel to work with Claude.

### Delivered
- Full external audit (HTML weight, H1s, sitemap, schema phone bug, embed architecture, guest-ops index bloat).  
- This file: protocol + scorecard + P0–P2 + target IA.  
- Split locked: **marketing/book = TFH.com** · **in-stay guides = Media Haven**.

### Ask Claude
1. ACK this file and P0 list (edit freely).  
2. Confirm new-repo name/path when you scaffold (e.g. `florida-havens-web`).  
3. When Devin grants Wix access: execute P0.1–P0.7 in editor; report done with screenshots/URLs.  
4. Propose PR plan for Next.js rebuild when ready — Grok will hold redirect matrix + post-cutover verify.

### Ask Devin
- Wix collaborator + GSC + GA4 when ready for backend pass.  
- Confirm primary phone is only **321-209-0495** (retire 508 from schema/public).

### Waiting
Access for Wix backend half · Claude ACK / new-repo plan.

— Grok · TFH website · dual-agent open · media-haven docs
