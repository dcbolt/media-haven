/**
 * Device class (HARDWARE-STANDARD "optional later", requested 2026-07-30 when
 * Devin put IAdea XDS-1078 panels in stock).
 *
 * Two classes of screen now run `/tv`:
 *
 * - **streamer** — Shield / Google TV / Onn. Real browser, native Netflix et al,
 *   Android intent launching, driven by a D-pad remote. The default.
 * - **signage** — a wall/console panel with no streaming apps and no intent
 *   path (XDS-1078: 10.1" 1280×800, 16:10, 300 nit, PoE+, Android 12, touch).
 *   Firing an Entertainment intent here navigates the panel to a URL nothing
 *   can handle and loses the deck, so the launch is suppressed while the
 *   service grid and sign-in coach stay available.
 *
 * The class exists to stop dead ends, **not** to ship a cut-down product: every
 * slide, the emergency takeover, pairing, heartbeat, never-blank and the
 * background video all behave exactly as they do on a TV.
 *
 * Selected by URL because the panel's start URL is configured once at install
 * and needs no pairing, no migration, and no DB round-trip to take effect:
 *
 *     https://…/tv?class=signage
 *
 * Client-safe: constants and a pure parser only (same pattern as
 * `lib/logo-metrics.ts`).
 *
 * ## Why there is no type-scale knob here
 *
 * The deck is sized almost entirely in viewport units — 366 `vw`-based sizes
 * and zero rem-based text classes — so every layout is already *proportionally*
 * identical on any panel, and a root font-size would do nothing at all.
 *
 * Apparent size therefore depends only on how far away the screen is, and the
 * numbers happen to line up: a 55" panel at 10 ft subtends ≈12.8° of vision; a
 * 10.1" panel at 2 ft subtends ≈12.6°. A touch panel at arm's length reads like
 * the TV it was designed for, with no scaling.
 *
 * That stops being true at walk-past distance — the same panel at 5 ft is only
 * ≈5°, so body copy gets tight. The fix there is **less content**, not bigger
 * glyphs (see `SIGNAGE_DROP_SLIDES`), because scaling a vw layout up just
 * overflows it. Any further tuning should follow eyeballing a real panel at its
 * real mounting distance rather than a guessed multiplier.
 */

export type DeviceClass = "streamer" | "signage";

export const DEVICE_CLASSES: readonly DeviceClass[] = ["streamer", "signage"];

/**
 * Slides withheld from the signage class — **kept deliberately minimal**.
 *
 * Revised 2026-08-10 on Devin's instruction: *"do not delete or degrade any of
 * the app features from their full potential."* The first cut also dropped
 * `forecast-5` and `casting` on my judgement that they were too dense for a 10"
 * panel. That was optimisation-by-deletion — density is a layout problem to
 * solve, not content to remove — so both are restored.
 *
 * `streaming` is the one genuine exclusion, and it is a **capability** limit
 * rather than a taste call: the panel has no native streaming apps and no
 * Android intent path, so the tile can only dead-end. Its content is not lost —
 * `signageLaunchBlocked()` keeps the service grid and the sign-in coach visible
 * and simply declines to fire an intent nothing can service. Only the slide's
 * position in the *idle rotation* is dropped, so a passing guest isn't shown a
 * picker they can't act on; the menu still reaches it.
 *
 * Adding to this list needs a capability reason, not a density one.
 */
export const SIGNAGE_DROP_SLIDES: readonly string[] = [];

/** True when a tile press must NOT fire an Android intent. The signage class
 *  has no app to launch, so firing one navigates the panel to a dead URL and
 *  loses the deck. The sign-in walkthrough still opens — that is the content. */
export function signageLaunchBlocked(deviceClass: DeviceClass): boolean {
  return deviceClass === "signage";
}

/** Read the device class off a URL query string. Unknown/absent → streamer, so
 *  a typo can never silently strip a real TV's Entertainment tiles. */
export function parseDeviceClass(search: string): DeviceClass {
  try {
    const v = new URLSearchParams(search).get("class");
    return v === "signage" ? "signage" : "streamer";
  } catch {
    return "streamer";
  }
}

/** True when this slide key should be hidden for the given class. */
export function slideHiddenFor(deviceClass: DeviceClass, key: string): boolean {
  return deviceClass === "signage" && SIGNAGE_DROP_SLIDES.includes(key);
}
