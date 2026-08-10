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
 *   Offering Entertainment tiles here is a dead end: the tile would fire an
 *   intent nothing can service, and the guest would get the sign-in walkthrough
 *   for an app that isn't installed.
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
 * Slides withheld from the signage class.
 *
 * `streaming` is a hard exclusion — no native apps, no intent path, so the tile
 * cannot work. Dropping it also removes "Entertainment" from the menu for free,
 * because the menu is derived from the slide list.
 *
 * The rest are density calls for a 10" panel: the 5-day grid and the casting
 * walkthrough are the two densest screens in the deck and the least glanceable
 * from a doorway. Everything genuinely useful to a passing guest — Wi-Fi,
 * welcome, checkout, weather-today, guide, book-direct, QR pitches — stays.
 */
export const SIGNAGE_DROP_SLIDES: readonly string[] = [
  "streaming",
  "forecast-5",
  "casting",
];

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
