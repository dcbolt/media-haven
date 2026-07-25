/**
 * Logo normalization (host 2026-07-25). The brand-kit PNGs carry wildly
 * different internal padding — Turtle/Shell's art fills 100% of the canvas
 * while Sea/Beach/FH sit in 40–52% — so a fixed-height box rendered turtle
 * ~2× the visual size of the others. Scales below were produced by an
 * alpha-bounding-box sweep of public/logos/*-white.png (content-height
 * fraction per file), softened (^0.7) and clamped so every mark lands in
 * the same visual safe space: turtle/shell shrink ~28% (gaining padding),
 * sea/fh grow to the cap, beach nudges up.
 *
 * Client-safe: constants only. Re-run the sweep when logo files change.
 * Measured contentH fractions: beach .52 · fh .385 · sea .414 · shell 1.0
 * · turtle 1.0 (K = 0.62, scale = clamp((K/contentH)^0.7, 0.62, 1.25)).
 */
export const LOGO_SCALE: Record<string, number> = {
  "beach-haven": 1.13,
  fh: 1.25,
  "sea-haven": 1.25,
  "shell-haven": 0.72,
  "turtle-haven": 0.72,
};

/** Scale for a bundled logo URL; unknown/remote logos render unscaled. */
export function logoScaleFor(url: string | null | undefined): number {
  const m = url?.match(/\/logos\/([a-z0-9-]+)-(?:white|black)\.png$/i);
  return (m && LOGO_SCALE[m[1]]) || 1;
}
