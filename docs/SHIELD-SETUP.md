# media-haven — NVIDIA Shield TV Pro setup runbook

**Audience:** Devin / installers, standing in front of the TV.
**Purpose:** provision one Shield from box to paired signage, then run the
**S0 hardware proof** that [`STREAMING-SEAMLESS.md`](./STREAMING-SEAMLESS.md)
lists as a blocker for the streaming phases.
**Related:** [`HARDWARE-STANDARD.md`](./HARDWARE-STANDARD.md) · [`DECISIONS.md`](./DECISIONS.md) · [`ENTERTAINMENT.md`](./ENTERTAINMENT.md)

Production URL used throughout: `https://media-haven-lilac.vercel.app`

---

## 0 · Have these on hand before you start

| Item | Why it matters |
|------|----------------|
| **USB mouse** (wired or BT) | **Non-negotiable.** Fully Kiosk's settings UI is not D-pad navigable — you cannot configure it with the Shield remote. The Pro's USB-A ports are one reason it's the standard SKU. |
| Ethernet cable to the UniFi switch | `HARDWARE-STANDARD` requires wired for primary units, not Wi-Fi |
| Host Google account | Play Store installs only — **never** a guest account on the device |
| Fully Kiosk Browser **Plus** licence | Boot-start and kiosk lockdown are paid-tier features |
| Host dashboard login | `/host` — you'll need it for pairing |
| A phone | For the device-code/QR sign-ins and for reading this |

Budget ~60–90 minutes for the first one. Later units take ~20.

---

## 1 · Shield first boot and system settings

1. Ethernet in **before** first boot, then HDMI, then power.
2. Run Google's setup with the **host** account. Skip Google Assistant voice
   match. Decline personalized ads.
3. `Settings → Device Preferences → About` → apply all system updates now,
   then re-check (Shield often chains two updates).
4. **Display:** `Settings → Device Preferences → Display & Sound → Advanced`
   → match your panel's native resolution/refresh. Leave HDR alone for now;
   the standby video is SDR H.264 and HDR tone-mapping can wash it out.
5. **Sleep:** `Settings → Device Preferences → Screen saver` →
   - *Screen saver* → **None**
   - *Put device to sleep* → **Never**

   Fully will also hold a wake lock, but the OS setting is the reliable one.
   Our app draws its own standby screen (property logo + clock + weather) —
   the Shield's screensaver would cover it, which is why this must be None.
6. **Cast name:** `Settings → Device Preferences → About → Device name` →
   set to `{Room} · {Property}`, e.g. `Living · Turtle Haven`. This is the
   name guests see when casting (Path B), so it matters.
7. Note the **local IP** (`Settings → Network`) — useful for ADB later.

---

## 1b · One remote for everything (HDMI-CEC) — host requirement 2026-07-30

**Requirement:** the guest powers the TV on, changes volume, and drives the app
with the **Shield remote alone**. The TV's own remote never appears on the
coffee table. This is the same "guest never hunts inputs" goal as one-HDMI.

Our app cannot interfere: the `/tv` key handler early-returns on anything that
isn't an arrow, Enter or Back (`app/tv/page.tsx` ~2119), so volume and power
are never intercepted or `preventDefault()`ed.

**Shield side** — `Settings → Device Preferences → HDMI`:

| Setting | Value | Effect |
|---------|-------|--------|
| Consumer Electronic Control (CEC) | **on** | enables the rest |
| One-touch play | **on** | Shield power-on wakes the TV **and** switches it to that HDMI input |
| TV auto power off | **on** | Shield sleep powers the TV down |

**TV side — this is where it usually fails.** CEC ships *off* on most panels and
is almost never labelled "CEC". Enable it, and check whether your model gates it
**per HDMI port** — several do:

| Brand | Menu name |
|-------|-----------|
| Samsung | **Anynet+ (HDMI-CEC)** |
| LG | **SIMPLINK** |
| Sony | **BRAVIA Sync** |
| Vizio | **CEC** |
| TCL / Hisense | **CEC Control** / **HDMI CEC** |

**Volume:** the 2019 Shield Pro remote has both CEC and an **IR emitter**. Run
the TV-control wizard (`Settings → Remote & accessories → SHIELD Remote → TV
control`) and pick the TV brand. If volume-over-CEC proves flaky — some panels
are genuinely bad at it — the IR path is the reliable one, and the brand
selection is what configures it.

**Ops:** once this works the TV remote goes in a drawer, **not** binned — if CEC
ever drops it is the only way to recover the input. Housekeeping keeps access;
guests do not see it.

---

## 2 · Install the streaming apps

Install each from the Play Store, sign in to **nothing** yet. The guide
launches these by exact Android package name, so all nine should be present
for a complete test. Packages come from `lib/streaming.ts`:

| Service | Android package |
|---------|-----------------|
| Netflix | `com.netflix.ninja` |
| Disney+ | `com.disney.disneyplus` |
| Hulu | `com.hulu.livingroomplus` |
| Max | `com.wbd.stream` |
| Prime Video | `com.amazon.amazonvideo.livingroom` |
| Paramount+ | `com.cbs.ott` |
| Peacock | `com.peacocktv.peacockandroid` |
| YouTube | `com.google.android.youtube.tv` |
| Apple TV+ | `com.apple.atve.androidtv.appletv` |

If a package name has drifted (vendors do rename), confirm the real one with
`adb shell pm list packages | grep -i netflix` and tell me — the catalog needs
updating, not the device.

---

## 3 · Install and configure Fully Kiosk Browser

### 3a · Getting it onto the Shield

Fully Kiosk is **not** a leanback (TV-certified) app, so it may not appear in
the Shield's on-device Play Store search. Either:

- push it from the Play Store **website** on your laptop (select the Shield as
  target device), or
- sideload the APK from `fully-kiosk.com` using *Downloader* / *Send files to TV*.

Then plug in the **mouse** and open it. Buy/enter the **Plus** licence first —
several settings below are Plus-only and won't appear otherwise.

### 3b · Settings that matter

Menu wording shifts slightly between Fully versions; match on intent.

| Setting | Value | Why |
|---------|-------|-----|
| Web Content → **Start URL** | `https://media-haven-lilac.vercel.app/tv` | **Plain `/tv` — do NOT append `?device=…`.** `DECISIONS.md:43` shows a device param illustratively, but the app self-registers (see §4). |
| Web Content → **Enable Intent URLs** (a.k.a. allow non-http URL schemes) | **ON** | **The single most important setting.** The guide launches apps with `window.location.href = "intent:#Intent;…package=…;end"`. With this off, every Entertainment tile silently does nothing. |
| Advanced Web → **Enable Local Storage / DOM Storage** | **ON** | Device identity *and* the never-blank cache live in `localStorage` |
| Web Content → **Clear Cache on Restart** | **OFF** | See the warning below |
| Web Content → **Clear Cookies / Web Storage on Restart** | **OFF** | See the warning below |
| Incognito / private mode | **OFF** | Same reason |
| Device Mgmt → **Keep Screen On** | ON | |
| Device Mgmt → **Launch on Boot** (Plus) | ON | `/tv` = boot home per DECISIONS |
| Device Mgmt → **Restart App on Crash** | ON | Never-blank |
| Kiosk Mode (Plus) → **Enable Kiosk Mode** | ON | Guest can't wander into settings |
| Screensaver → **Fully's own screensaver** | **OFF / disabled** | Our standby screen is the screensaver |
| Timer → **Reload page after N seconds** | **leave off** | The app already self-heals (`setTimeout(reload, msUntilSelfHeal())`) and honours host force-reload. A second timer just fights it. |
| Remote Administration | ON, strong password | Configure later from a laptop without a mouse |

> ### ⚠ Do not let Fully clear storage on restart
> The TV's identity is a UUID the page generates once and keeps in
> `localStorage["fh_tv_device"]`. The offline last-good content cache lives
> there too. If Fully clears storage on restart, then on every reboot the TV
> **forgets who it is, unpairs itself, and shows a fresh pairing code** — and
> loses its never-blank cache. This is the #1 way to make a Shield look
> broken. Verify by rebooting twice in §5.

### 3c · Back → `/tv` (expect to iterate here)

The requirement is: guest exits Netflix with **Back** and lands on `/tv`
without touching Home. On Android TV the reliable way is for Fully to be the
**home/launcher** app so it's what the system returns to. Try in order:

1. Fully → *Device Management* → **Set as Home app / default launcher** if offered.
2. Otherwise `Settings → Apps → Default apps → Home app` → Fully Kiosk.
3. Fallback: Fully's *Bring to Foreground* / relaunch-on-home options.

**This is the step most likely to need fiddling**, and it's the same
launcher-permission constraint that ruled out the smart-TV app-store route.
If none of the three work cleanly, stop and tell me what you saw rather than
burning an hour — there's an ADB device-owner path, and a native Android TV
shell is already logged as a Phase-2 option.

---

## 4 · Pair the TV to a property

No device ID is typed anywhere. The flow is automatic:

1. Fully loads `/tv`. The page generates a UUID into `localStorage`, registers
   itself by polling `/api/tv/state?device=<uuid>`, and shows a **6-character
   uppercase pairing code** on screen.
2. On your laptop/phone: `/host` → **Pair a TV** → type the code → choose the
   property (for this test, whichever villa you're standing in) → **Pair TV**.
3. The TV switches to signage within **~10 seconds** (it polls every 10s).
4. Confirm on `/host/tvs`: the TV appears under its property with a **green
   online dot** and a live thumbnail of the deck it's serving. Online means it
   polled within the last 90 seconds.

If the code is rejected: it's case-insensitive on the server but must be an
unclaimed device — if you paired it already, use *Unlink* on `/host/tvs` first.

---

## 5 · S0 acceptance test — the actual gate

This is what `STREAMING-SEAMLESS.md:90` blocks the streaming phases on. Run it
in order and record pass/fail for each. **Don't fix anything mid-test** — note
it and continue, so we see the whole failure surface at once.

| # | Test | Pass looks like |
|---|------|-----------------|
| 1 | Power-cycle the Shield at the wall | Boots straight to `/tv`, no Android home screen, no pairing code |
| 2 | Power-cycle **again** | Still paired (proves storage survives — §3b warning) |
| 3 | Leave it alone past the idle threshold | Standby screen: big property logo, date, clock, weather, drone video behind |
| 4 | Menu → Entertainment → **OK on Netflix** | Netflix opens on the **same HDMI input**, no input switching |
| 5 | Press **Back** from Netflix | Returns to `/tv` — ideally to the Entertainment grid |
| 6 | Repeat 4–5 for all nine services | Each opens its own app |
| 7 | Sign in to Netflix using the on-TV QR/code with your phone | Works, and note **how long** it took |
| 8 | Unplug Ethernet for 60s | Guide keeps rendering from last-good cache — **never blank** |
| 9 | Replug Ethernet | Recovers on its own without intervention |
| 10 | `/host/tvs` → **Reload** button for this TV | TV reloads within ~10s |
| 11 | Cast from your phone | Target shows as `{Room} · {Property}` |
| 12 | Leave it running overnight | Still on `/tv` next morning, still online on the fleet page |
| 13 | TV off → **power on the Shield remote** | TV wakes on the right HDMI input showing `/tv`, TV remote never touched (§1b) |
| 14 | **Volume rocker** on the Shield remote | Moves TV volume; no on-screen artefacts; slide rotation undisturbed |
| 15 | Shield power off | TV powers off with it |

Tests **4, 5 and 8** are the real ones: 4 proves intents work at all, 5 proves
the kiosk underlay, 8 proves the never-blank guarantee on real hardware. **13
and 14** prove the one-remote requirement (§1b).

**Test 4 is self-diagnosing.** OK on a tile fires the intent *and* opens the
sign-in walkthrough underneath as a safety net. So Netflix opening = intents
work; getting the **walkthrough overlay instead** is the exact signature of
`Enable Intent URLs` being off, or that app not being installed. A
misconfigured intent shows the guest useful instructions rather than a dead
screen.

---

## 6 · Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Tiles do nothing when you press OK | Intent URLs disabled in Fully | §3b, *Enable Intent URLs* → ON |
| One specific tile does nothing, others work | That app isn't installed, or its package name changed | Install it; if installed, run the `adb pm list packages` check in §2 and report the real name |
| Shows a pairing code after every reboot | Fully is clearing storage on restart | §3b warning — turn all three clear-on-restart options OFF, then re-pair once |
| Boots to Android home, not `/tv` | Launch-on-boot off, or Fully isn't the home app | §3b + §3c |
| Screen goes black/blank after a while | Shield screensaver or sleep still enabled | §1 step 5 → both to None/Never |
| A generic screensaver covers our standby screen | Fully's own screensaver is on | §3b → disable it |
| TV shows offline on `/host/tvs` but looks fine | Network dropped, or the page crashed without relaunch | Check *Restart App on Crash*; the app also self-heals on a timer |
| Standby video stutters | HDR tone-mapping or a heavy rendition | §1 step 4; the rotation already caps videos at 150 MB |
| Can't operate Fully's menus | Using the remote | Plug in the mouse (§0) |

---

## 7 · What to report back

Paste me the pass/fail for all twelve tests in §5, plus:

- which of the three §3c methods made Back → `/tv` work
- the tile→first-frame time for Netflix (test 4) and the sign-in time (test 7)
- any package name that didn't match the catalog
- a photo of the standby screen and of the Entertainment grid on the real panel

That closes S0 and unblocks S1 (coach polish) and S2 (Path C phone→TV launch).
Path C's live office-TV test stays gated on your explicit go-ahead.
