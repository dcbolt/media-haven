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
 * Client-safe: constants only. Do not import `lib/tv.ts` here.
 */
export const TV_SIGNAGE_ENTERTAINMENT = false;

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

export function isEntertainmentSlide(key: string): boolean {
  return key === TV_ENTERTAINMENT_SLIDE_KEY;
}

/** Hide the separate Casting coach so guest output has one streaming
 *  instruction, not two. Host `?slide=casting` can still preview it. */
export function hideCastingOnSignage(pinSlide?: string | null): boolean {
  return !TV_SIGNAGE_ENTERTAINMENT && pinSlide !== "casting";
}
