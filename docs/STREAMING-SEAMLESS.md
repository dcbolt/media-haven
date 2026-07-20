# media-haven — Seamless streaming game plan (Grok 2026-07-20)

**Status:** IMPLEMENTATION PLAN — does **not** reopen [`DECISIONS.md`](./DECISIONS.md).  
**Contract lock:** [`ENTERTAINMENT.md`](./ENTERTAINMENT.md) remains the product truth.  
**Hardware:** [`HARDWARE-STANDARD.md`](./HARDWARE-STANDARD.md)

---

## One-sentence truth

**Entertainment is a choose-and-watch launcher + official device-code coach** on the **same** Shield/Google TV HDMI — not a backend that stores Netflix/Disney credentials or injects sessions.

---

## What “seamless” can mean (consumer reality)

| Goal | Feasible? | How |
|------|-----------|-----|
| Stay on one HDMI | Yes | Native apps on same streamer as `/tv` |
| Guest selects service | Yes | Entertainment grid + portal |
| TV auto-opens that app | Yes | Android `intent://…package=` via Fully Kiosk |
| Guest signs in with phone QR | Yes | **Provider** device-code / QR (Netflix, Disney, etc.) |
| Backend logs guest into Netflix for them | **No** | No public consumer API |
| Phone picks service **before** app open and TV is already logged in | **No** | Code/QR almost always minted **inside** the TV app |
| Silent API wipe at checkout | **No** | Host **turnover checklist** only |

Anyone selling silent auth + silent wipe on consumer Netflix is enterprise-only, casting-from-phone, or out of ToS.

---

## Guest paths

### Path A — Open & sign in (primary, big remote)

```
/tv Entertainment → OK Netflix
  → intent launches com.netflix.ninja (same HDMI)
  → if signed in: watch
  → else: Netflix shows QR/code → guest phone confirms
  → BACK → Fully returns to /tv
  → checkout → turnover checklist signs out apps
```

### Path B — Cast from phone (zero TV login)

Portal teaches cast target `{Room} · {Property}`; guest uses Netflix **on phone** → cast.

### Path C — Phone orchestrates launch (Phase 2, feels magical)

```
Portal: "Open Netflix on Living Room TV"
  → POST /api/tv/command { launch: netflix }  (scoped to stay + property TVs)
  → /tv client fires intent
  → guest scans QR **on the TV**
```

We orchestrate **launch + timing** only — provider still owns auth.

---

## Competitive notes (short)

| Class | Examples | Lesson |
|-------|----------|--------|
| Welcome SaaS | WelcomeScreen | Guide skin; weak streaming depth; SaaS rent |
| Cast-first hospitality | Hotel cast platforms | Login frictionless; different UX (phone is player) |
| Enterprise hospitality TV | WorldVue / hotel Netflix deals | Real wipe/login needs OEM partnerships — not Phase 1 |

Media Haven edge: own stack, Guesty depth, Space Coast content, OTA→direct conversion, one-device Stay OS.

---

## Service catalog (already in `lib/streaming.ts`)

Netflix, Disney+, Hulu, Max, Prime, Paramount+, Peacock, YouTube, Apple TV+ — packages + activate URLs.  
**Add:** Plex (`plex.tv/link` + verify package on device).

Preferred coach order for most services:

1. Launch native app on TV  
2. Wait for QR/code on TV  
3. Phone scan / enter code on **official** activate URL only  

---

## Ship phases

### S0 — Hardware proof (blocker)

Physical Shield: Fully allows intents; each tile opens app; Back → `/tv`.

### S1 — TV-first polish

- Instant intent on tile OK + short coach (“scan the QR **on the TV**”)  
- Per-service playbooks (QR vs code)  
- Plex in catalog  
- Cast naming audit  

### S2 — Phone → TV launch

- `POST /api/tv/command` (guest_token + property-scoped, TTL, single-use)  
- TV poll/SSE consumes launch  
- Multi-TV room picker  
- Fallback copy if TV offline  

### S3 — Cast + multi-TV education

### S4 — Host fleet

Last launch, wipe checklist UX, missing-app alerts.

### S5 — Measure

Time tile→first frame; support tickets on stream login.

---

## Security (Path C)

- Guest token can only command TVs claimed to that property/reservation  
- **Never** store provider OAuth tokens  
- Commands expire (~60s), rate-limited  
- No phishing-like “login on media-haven.com for Netflix”  

---

## Success definition (5★)

1. One pick opens the right app, same HDMI  
2. First-time QR/code &lt; ~30s if phone already has the app logged in  
3. Later in stay: already signed in → two clicks  
4. Checkout checklist clears profiles for next guest  
5. Copy never claims “we auto-sign you in” or “we remotely log out Netflix by API”  

---

## Agent rule

PRs that store third-party streaming OAuth tokens or claim automatic login wipe are **out of scope** and must not merge.  
If this file conflicts with ENTERTAINMENT.md / DECISIONS.md, **those win**.
