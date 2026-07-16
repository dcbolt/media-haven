import { NextResponse } from "next/server";
import { getListings, guestyConfigured } from "@/lib/guesty";
import { isHostAuthenticated } from "@/lib/host-auth";

/**
 * Host helper: lists each Guesty listing with its custom fields and their
 * IDs, so the Wi-Fi SSID/password field IDs can be copied into
 * GUESTY_WIFI_SSID_FIELD_ID / GUESTY_WIFI_PASSWORD_FIELD_ID without hunting
 * through Guesty's UI. Host-gated; read-only.
 */
export async function GET() {
  if (!(await isHostAuthenticated())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!guestyConfigured()) {
    return NextResponse.json(
      { error: "guesty-not-configured", hint: "Set GUESTY_CLIENT_ID / GUESTY_CLIENT_SECRET first." },
      { status: 409 }
    );
  }

  const listings = await getListings();
  return NextResponse.json(
    listings.map((l) => ({
      listing: l.title,
      guestyId: l._id,
      customFields: (l.customFields ?? []).map((f) => ({
        fieldId: f.fieldId,
        value: f.value,
      })),
    })),
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
