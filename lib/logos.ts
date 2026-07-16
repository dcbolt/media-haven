/**
 * Brand marks, bundled in public/logos/ (from the FLORIDA HAVENS LOGOS kit).
 * Auto-matched to listings by name; properties.logo_url in the DB overrides
 * per property when set. White variants live on dark surfaces (TV, portal
 * hero), black variants on light ones (print cards).
 *
 * "The Havens at Beach Street" / "The Havens at The Dunes" intentionally
 * fall through to the master FH mark until they get marks of their own.
 */

export type LogoVariant = "white" | "black";

const PROPERTY_LOGOS: { match: RegExp; slug: string }[] = [
  { match: /shell haven/i, slug: "shell-haven" },
  { match: /turtle haven/i, slug: "turtle-haven" },
  { match: /sea haven/i, slug: "sea-haven" },
  { match: /beach haven/i, slug: "beach-haven" },
];

export function logoFor(propertyName: string, variant: LogoVariant = "white"): string {
  const hit = PROPERTY_LOGOS.find((l) => l.match.test(propertyName));
  return `/logos/${hit?.slug ?? "fh"}-${variant}.png`;
}
