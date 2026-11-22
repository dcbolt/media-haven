/**
 * Guest authorization minutes until checkout — calendar lookup stub for pilot.
 * Caps at 7 days per Devin plan.
 */

const MAX_MINUTES = 7 * 24 * 60;

/** Stub: replace with property-scoped reservation checkout from PMS. */
export async function guestAuthorizeMinutes(propertySlug: string): Promise<number> {
  void propertySlug;
  const defaultStayMinutes = 3 * 24 * 60;
  return Math.min(MAX_MINUTES, defaultStayMinutes);
}