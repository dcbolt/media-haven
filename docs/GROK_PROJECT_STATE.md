# GROK_PROJECT_STATE.md — The Florida Havens Stay OS

**Single source of truth for agent sync (Claude ⇄ Grok ⇄ Codex).**
Updated by the Claude build loop at the end of every cycle. Repo state on
`claude/media-haven` is canonical — if this file and the code disagree, the
code wins; verify against the live site.

| | |
|--|--|
| Production | https://media-haven-lilac.vercel.app |
| Repo / deploy branch | `dcbolt/media-haven` · `claude/media-haven` (push = prod deploy) |
| Architecture lock | `docs/DECISIONS.md` (Shield/Google TV, one HDMI, no Roku/dual-input/BrightSign-primary, wipe = checklist) |
| Roadmap | `docs/ROADMAP.md` (phases 0–4 vs WelcomeScreen) |
| Live item tracker | `/roadmap.html` (key = HOST_ACCESS_CODE) · API `/api/roadmap` |
| Last cycle | 2026-07-17 · Loop cycle 2 |

## Phase status

- **Phase 0 — SHIPPED** (never-blank TV, cast naming, Guesty live, host CMS, streaming catalog, wipe checklist, per-unit book-direct QRs)
- **Phase 1 — IN PROGRESS**: 1.6 heartbeat surfacing ✅ (dashboard fleet chip, cycle 1) · 1.7 ~4am self-reload ✅ (cycle 1) · next: 1.3 tides/weather polish on phone · 1.4 last-night hard direct-book panel · 1.5 portal parity (rockets on phone) · 1.8 launch-alert sending
- **Phase 2+ — NOT STARTED** (gated on Phase 1 metrics per ROADMAP protocol)

## Guest TV experience (app/tv/page.tsx)

Idle: rotating slide loop (welcome → wifi → guide sections → beach day →
launches → entertainment → casting → book direct + ambient photos), drone
video behind gradient slides (67 MB 1080p rendition, pauses when covered).
D-pad wakes menu: **Home · Guide Book · Dining · Nearby · Weather ·
Entertainment · Casting · Rocket Launches · Book Direct**. Guide/Dining/
Nearby = section browsers (CMS `property_sections.category`, keyword
fallback). Entertainment = interactive tile grid → per-service sign-in
walkthrough (scan-first step order) with activation QR + guest-portal QR
(live stay token). Back steps out; ~60s idle resumes; self-reload ~4am.

## Data model (Supabase, RLS default-deny, service-role only)

properties (guesty_id, wifi, hero/photos/logo, house_rules/local_guide/
emergency_info, settings jsonb {feeds{weather,tides,launches},
streaming{slug:bool}}) · property_sections (slug,title,body,sort,
show_on_tv, category[0013]) · reservations · guest_tokens · guesty_tokens
(single cached OAuth row — never mint per request) · tv_devices (pair_code,
property_id, label, last_seen) · turnover_checks · guest_subscribers ·
roadmap_items [0012]. Migrations 0001–0013 all applied to prod.

## Key modules

| Path | Role |
|---|---|
| `lib/tv.ts` | TvState/TvContent assembly; 8s `within()` budget per feed; feed/streaming toggles; portal+booking QRs; cast label |
| `lib/guesty.ts` | Mock-until-credentialed client; full-res photo extraction (`original`, de-thumbed) |
| `lib/booking.ts` | Per-unit Guesty booking-engine deep links (guesty_id) |
| `lib/streaming.ts` | Service catalog (9 branded) + `enabledServices()` |
| `lib/screensavers.ts` | Media sources: env URL → Blob → Google Drive folder → repo → Supabase bucket |
| `lib/reservations.ts` | Token → GuestView (privacy boundary), per-property streaming/bookUrl |
| `app/host/*` | Dashboard (fleet chip), Properties CMS, TVs, Media, Turnover, roadmap board |
| `app/api/roadmap` | Feature/bug board API (x-roadmap-key) |
| `tests/smoke.mjs` | 34-check pre-deploy suite incl. D-pad flows — must be green to ship |

## Changed this cycle (cycle 2)

1. Formal family lockup: reservations gain `guest_last_name` [0014];
   `familyLabel()` renders "The Wambolts" (sibilant → -es), first-name
   fallback. Guesty sync stores the surname.
2. Persistent header: "IN RESIDENCE · The Wambolts · through July 20"
   centered in the TV header on every view except Entertainment/Casting.
   Footer lockup removed; welcome slide greets the family.
3. Choose-and-watch: Entertainment tile OK fires an Android
   `intent://` (LEANBACK_LAUNCHER, per-service package in lib/streaming)
   that opens the native app on the same device/input — no Home press.
   Walkthrough copy is now launch-first and remains the fallback.
4. Rocket Launches removed from the D-pad menu (slide stays in rotation).
5. Migration 0014 applied to prod (Devin approved) and **PR #14 merged +
   verified live**: prod serves short names ("Turtle Haven"), guestLabel,
   and intent appUrls. Family names appear after the next Guesty sync
   backfills `guest_last_name` (dashboard → Sync from Guesty).
6. Signage display names: `signageName()` trims the Guesty SEO title at its
   first dash ("Beach Haven - Private Beach Home - …" → "Beach Haven"),
   overridable per property via CMS "Display name" (settings.displayName,
   jsonb — no migration). Applies to the TV header/welcome and guest
   portal; welcome title font now scales down for long names.

## Changed cycle 1

1. Entertainment sign-in walkthrough reordered to scan-first (live guest
   scanned before opening the app — Disney page asked for a code that
   didn't exist yet).
2. `/host/media` wrapped in the 8s `within()` budget (same hang class the
   TV state API had).
3. TV self-reload moved from fixed 5h to ~4:00–4:08am local, 6h cap
   (ROADMAP 1.7).
4. Dashboard fleet-health chip: "TVs: n/m online" → /host/tvs (ROADMAP 1.6).
5. This file created.

## Open issues / blocked (also on /roadmap.html)

- Guesty sync pending to backfill `guest_last_name` (header shows stored
  first names until then).
- **Awaiting Devin (Vercel env)**: `HOST_ACCESS_CODE=Dunes4life`;
  `DATABASE_URL` = full pooler string (currently password-only); Blob store
  → Connect Project; `GDRIVE_MEDIA_FOLDER_ID` + `GOOGLE_API_KEY`.
- Phone-as-remote needs Supabase Realtime (staged design, not started).
- Guidebook content seeding from thefloridahavens.com (sections + dining/
  nearby categories) — offered, not requested yet.
- Blob cleanup: unused HEVC (212 MB) + original drone (195 MB) once the
  1080p rendition is confirmed on the physical TVs.
- Cloud-session Chromium cannot TLS-handshake through the org proxy
  (infra; report to Anthropic — curl/Node unaffected).

## Next priorities (loop order)

1. Phase 1.4 — last-night / checkout-morning strong direct-book panel.
2. Phase 1.3/1.5 — tides/weather + rockets on the phone portal (parity).
3. Phase 1.8 — launch-alert email sending pipeline.
4. Guidebook seeding + Dining/Nearby categorization of real content.

## Rules for all agents

- Honor `docs/DECISIONS.md`; never re-open dual HDMI / Roku / BrightSign.
- TVs never show an error page; every feed optional with fallbacks.
- Direct-stay CTAs over third-party ads; no embedded streaming or fake
  login-wipe claims.
- `npm run smoke` (34 checks) green before any push; pushes to
  `claude/media-haven` deploy production immediately.
- **Auto-ship (Devin, 2026-07-17): at every substantial milestone, smoke
  test and merge automatically — no approval gate.** Additive migrations
  ship with the milestone; destructive ops still need an explicit go.
- **Living roadmap (Devin, 2026-07-17): update /roadmap.html in the same
  session as the work** — in-progress visible, shipped marked, blockers
  titled "NEEDS DEVIN:".
