import { extractWifi, getListings, guestyConfigured } from "./guesty";
import { supabaseAdmin } from "./supabase";

/**
 * Property sync: Guesty listings → properties table. Guesty is the source of
 * truth for name, photo, coordinates, and per-property Wi-Fi (custom fields).
 * Wi-Fi only overwrites when the Guesty custom field has a value, so a
 * manually-entered password survives until Guesty actually carries one.
 * Guide sections are portal-owned and never touched by sync.
 */
export async function syncGuestyProperties(): Promise<
  { ok: true; count: number } | { ok: false; reason: string }
> {
  if (!guestyConfigured()) {
    return { ok: false, reason: "guesty-not-configured" };
  }
  const db = supabaseAdmin();
  if (!db) return { ok: false, reason: "storage-not-configured" };

  const listings = await getListings();
  let count = 0;

  for (const listing of listings) {
    const wifi = extractWifi(listing);
    const base: Record<string, unknown> = {
      guesty_id: listing._id,
      name: listing.title,
      hero_image_url: listing.picture?.large ?? null,
      latitude: listing.address?.lat ?? null,
      longitude: listing.address?.lng ?? null,
    };
    if (wifi.ssid) base.wifi_ssid = wifi.ssid;
    if (wifi.password) base.wifi_password = wifi.password;

    const { error } = await db
      .from("properties")
      .upsert(base, { onConflict: "guesty_id" });
    if (!error) count++;
  }

  return { ok: true, count };
}
