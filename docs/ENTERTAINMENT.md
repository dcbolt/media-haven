# Entertainment tab — product contract (LOCKED)

> **Guest `/tv` output (Devin 2026-09-10):** the launcher/grid is flagged
> **off** (`TV_SIGNAGE_ENTERTAINMENT` in `lib/tv-entertainment.ts`). The
> `streaming` slot is one instructional slide — switch the TV input to
> **Roku** to stream; switch back for the house guide. Flip the flag to
> restore this contract. Do not reopen HDMI auto-switch.
>
> **Persistent overlay (Devin 2026-09-10 follow-up):** occupied and vacant
> signage always show a bottom banner — “Push **home** on your remote to
> start streaming.” (Home-button default; earlier ROKU line is not the
> visible copy. No CMS coach-copy setting existed.) Not a rotating-only
> coach. Toggle: `TV_ROKU_STREAM_OVERLAY`. Hidden on the detailed Watch
> TV slide so two coaches do not stack. Pairing and emergency takeover
> stay clear.

**Canonical.** Aligns agents, hosts, and any external “streaming welcome app” specs.  
If this file and a design doc disagree, **this file + `docs/DECISIONS.md` win.**

| | |
|--|--|
| Surface | TV menu item **Entertainment** (`app/tv/page.tsx` · slide key `streaming`) |
| Catalog | `lib/streaming.ts` (CMS: `properties.settings.streaming.<slug>`) |
| Phone twin | Guest portal streaming guide (`app/welcome/streaming-guide.tsx`) |
| Hardware | NVIDIA Shield / Chromecast with Google TV only (not Roku-primary) |
| Wipe | Host **turnover checklist** — not API token deletion |

---

## One-sentence product truth

**Entertainment is a choose-and-watch launcher + official device-code coach** — not a backend that stores Netflix/Disney credentials or injects sessions into apps.

---

## Guest journey (what must happen)

```
Idle /tv guide
    │  D-pad → menu → Entertainment
    ▼
Service grid (Netflix, Disney+, Hulu, Max, Prime, …)
    │  OK on a tile
    ▼
① Android intent opens the native app on THIS TV / THIS HDMI
    │  (Fully Kiosk must allow external intents — host hardware test)
    ▼
② If already signed in → watch immediately
    │
③ If need sign-in → walkthrough on guide (under/over the app):
       Scan QR → official activate URL on phone (netflix.com/tv8, …)
       App shows a short code on TV → guest types it on phone
       Provider links account via THEIR device-code flow
    ▼
④ Back out of app → Fully Kiosk returns to /tv guide
    ▼
⑤ Checkout → host checklist: sign out major apps (no magic wipe API)
```

**Guest copy (must stay consistent with DECISIONS):**

> Your shows, your accounts.  
> This screen is the house guide — pick a service to open it on this TV.  
> Sign in with *your* account (scan the QR for the code page on your phone).  
> We clear logins after checkout *(via turnover — not silent API)*.

---

## What is SHIPPED (do not re-build)

| Piece | Implementation |
|-------|----------------|
| Service grid (up to 9) | `STREAMING_SERVICES` + CMS hide toggles |
| Menu destination | Home · **Entertainment** · Guidebook · Weather · Book Direct |
| OK → open native app | `appLaunchUrl()` → `intent://…LEANBACK_LAUNCHER…package=` |
| Per-service activation QR | QR to official `activateUrl` (device-code page) |
| Walkthrough steps | Scan-first order (code page open *before* typing TV code) |
| Portal activation links | Same catalog, one-tap on phone |
| Cast education | Separate **Casting** slide (menu parked pending hardware) |
| Host wipe checklist | `/host/turnover` |
| Persistent stream overlay | Bottom banner on occupied + vacant `/tv` — “Push home…” (`TV_ROKU_STREAM_OVERLAY`) |

---

## What we explicitly DO NOT build

| Idea (often in “streaming welcome” specs) | Why rejected |
|-------------------------------------------|--------------|
| Backend stores guest `accessToken` / `refreshToken` for Netflix et al. | Provider policies + security; not how device linking works |
| “TV receives auth and launches already signed in” via our API | **No consumer wipe/login APIs**; device code is guest↔provider, not us |
| OAuth proxy that completes login *for* the guest | Out of ToS / phishing risk / not durable |
| iframe / embedded player for Netflix, Disney+, etc. | DRM / `frame-ancestors` |
| Programmatic checkout wipe of streaming sessions | **Does not exist** → checklist only |
| Roku Guest Mode API as portfolio standard | No real browser; DECISIONS lock Shield/GTV |
| Dual HDMI “guide stick + stream stick” | One input forever |

---

## Mapping: common external architecture → media-haven

| External doc concept | Our answer |
|----------------------|------------|
| PWA on TV browser | **Yes** — Fully Kiosk → `/tv?device=…` |
| Service grid + QR | **Yes** — Entertainment tab + portal |
| Preferred: device activation | **Yes** — official URLs only; guest completes link |
| Alternative: OAuth proxy + token store | **No** — out of contract |
| Backend stay session for streaming auth | **No** — stay tokens are for **guest portal** privacy, not stream logins |
| Poll status until “active” | **No stream status** — provider owns session; we only launch + coach |
| Checkout wipes encrypted tokens | **Wipe checklist** for apps; portal guest token expires (checkout + grace) |
| Deep-link open native app | **Yes** — Android intent (Shield/GTV) |
| Multi-service simultaneous | **Yes** — each app holds its own guest profile/session |

---

## Acceptance tests (Entertainment)

1. From menu, **Entertainment** opens grid with CMS-enabled services only.  
2. OK on Netflix fires intent (on Shield with kiosk intents allowed) *or* walkthrough still usable if intent blocked.  
3. Activation QR opens official activate page (not a media-haven login form).  
4. Copy never claims “we auto-sign you in” or “we remotely log out Netflix.”  
5. Host turnover page lists sign-out steps for major apps.  
6. Smoke: Watch TV Roku-input coach (launcher flagged off; Devin 2026-09-10).
7. Smoke: persistent Home-button overlay on occupied `/tv` and vacant `?preview=standby`; overlay hidden on the Watch TV coach slide.

---

## Open hardware / ops (not product redesign)

- **Devin:** Fully Kiosk “open external links / intents” on physical Shield — board item.  
- Casting menu re-entry after hardware confirms cast target reliability.  
- Optional later (Phase 4, never marketed as magic): ADB wipe *scripts* for power users.

---

## Related plans (do not override this contract)

| Doc | Role |
|-----|------|
| [`STREAMING-SEAMLESS.md`](./STREAMING-SEAMLESS.md) | Grok game plan: Path A/B/C, phases S0–S5, phone→TV launch |
| [`HARDWARE-STANDARD.md`](./HARDWARE-STANDARD.md) | Shield / GTV / Onn; Cast Pro = signage only |

## Agent rule

Before adding Entertainment features, re-read this file + DECISIONS streaming stance.  
Any PR that stores third-party streaming OAuth tokens or claims automatic login wipe is **out of scope** and must not merge.
