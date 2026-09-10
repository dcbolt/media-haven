# Signage ambience (ocean + sound-bath)

**Ask:** Devin, 2026-09-10 — calm looping beds under `/tv` while guests view
the house guide (occupied + vacant).

## Provenance — no commercial tracks

Every sample is **generated in the browser** with the Web Audio API
(`app/tv/ambience-player.tsx`). The repo ships **no** WAV/MP3/OGG, no
YouTube rips, no stock-library downloads.

| Bed | How it is made |
|-----|----------------|
| **Ocean surf** | Looping brown / pink / white noise through lowpass + bandpass + highpass, with slow LFOs on filter and gain (swell, not crash). |
| **Tide bowl** | Sine cluster at **174 / 348 / 522 Hz** (sound-bath / resonant-frequency *inspiration* only — not a medical claim) plus a ~0.11 Hz beat. |
| **Horizon bath** | Sines at **285 / 396 / 198 Hz** over a distant brown-noise rumble. |

Rotate (default) crossfades ocean → bowl → horizon every ~9 minutes.

## Host control

Property CMS → **Signage ambience** (settings-jsonb, no migration):

- `settings.ambience.enabled` (default **on**)
- `settings.ambience.volume` (0–0.4 gain; form is 1–40 percent; default **16%**)
- `settings.ambience.bed` — `rotate` \| `ocean` \| `bath` \| `horizon`

URL overrides for kiosk QA / smoke (no hardware):

- `?ambience=off` — mute
- `?ambience=ocean` \| `bath` \| `horizon` \| `rotate` — force that bed on
- `?volume=12` — percent

Host editor thumbnails (`?property=` / `?slide=`) stay silent.

## What this does **not** do

- Does **not** unmute drone / screensaver `<video>` (those stay `muted`).
- Does **not** fight PR #149’s persistent Home overlay (audio-only).
- Does **not** steal the Roku input’s speakers — this graph only runs on the
  Media Haven HDMI / Fully Kiosk document. Hidden / pagehide suspends it.

## Hypotheses

1. Fully Kiosk allows unmuted Web Audio; if the context starts suspended,
   pointer/key + a 12s retry resume it so a kiosk is never stuck silent.
2. HDMI switch to Roku naturally silences Cast Pro; we still suspend when
   the document is hidden.
3. Procedural beds are calm enough without shipping binary assets.
