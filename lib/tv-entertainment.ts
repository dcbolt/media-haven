/**
 * Guest `/tv` entertainment launcher (service grid + Android intents).
 *
 * Devin lock 2026-09-10: OFF. Property install (Roku) is the stream
 * input; this HDMI is house guide / stay signage only. Guests change
 * inputs on the TV when they want Netflix etc. Do not show a half-baked
 * Entertainment grid or app launcher on this output.
 *
 * When false, the `streaming` playlist/menu slot stays occupied by one
 * instructional slide (`STREAM_INPUT_COACH`) so the deck has no blank
 * hole. Flip to `true` to restore the ENTERTAINMENT.md launcher.
 *
 * Persistent overlay (Devin 2026-09-10 follow-up): guests must always see
 * how to start streaming, not only when the coach slide is in rotation.
 * Default visible copy is the Home-button line (refine over the earlier
 * “press ROKU” ask). `TV_ROKU_STREAM_OVERLAY` is the host/dev toggle —
 * no CMS coach-copy setting existed. Overlay is a no-op while the
 * launcher flag is on.
 *
 * Client-safe: constants only. Do not import `lib/tv.ts` here.
 */
export const TV_SIGNAGE_ENTERTAINMENT = false;

/**
 * Always-on Roku-input banner on occupied + vacant signage. Flip off
 * here if a property should hide it. No settings.jsonb knob yet.
 */
export const TV_ROKU_STREAM_OVERLAY = true;

/** Slide key shared by the launcher and the Roku-input coach. */
export const TV_ENTERTAINMENT_SLIDE_KEY = "streaming";

/**
 * Guest copy for the single instructional slide. No HDMI numbers — the
 * repo does not store a per-property input name.
 */
export const STREAM_INPUT_COACH = {
  menuTitle: "Watch TV",
  title: "Stream / Watch TV",
  lead: "This screen is your house guide.",
  body: "To stream apps (Netflix, Disney+, and the rest), switch this TV’s input to Roku.",
  steps: [
    "On the TV remote, press Input or Source.",
    "Select Roku.",
    "Switch back to this input when you want the house guide.",
  ],
} as const;

/**
 * Persistent footer/edge banner. Devin refine 2026-09-10: Home-button
 * wording is the default. Earlier “press ROKU” ask is not the visible
 * line. No host-editable coach string existed.
 */
export const STREAM_INPUT_OVERLAY = {
  before: "Push",
  highlight: "Home",
  after: "on your remote to start streaming",
  line: "Push home on your remote to start streaming",
} as const;

export function isEntertainmentSlide(key: string): boolean {
  return key === TV_ENTERTAINMENT_SLIDE_KEY;
}

/** When the always-on banner should render. Hidden on the detailed
 *  Watch TV coach (same instruction, fuller steps) and while the
 *  footer menu covers the bottom edge. */
export function showRokuStreamOverlay(opts?: {
  navOpen?: boolean;
  slideKey?: string | null;
}): boolean {
  if (!TV_ROKU_STREAM_OVERLAY || TV_SIGNAGE_ENTERTAINMENT) return false;
  if (opts?.navOpen) return false;
  if (opts?.slideKey && isEntertainmentSlide(opts.slideKey)) return false;
  return true;
}

/** Hide the separate Casting coach so guest output has one streaming
 *  instruction, not two. Host `?slide=casting` can still preview it. */
export function hideCastingOnSignage(pinSlide?: string | null): boolean {
  return !TV_SIGNAGE_ENTERTAINMENT && pinSlide !== "casting";
}
