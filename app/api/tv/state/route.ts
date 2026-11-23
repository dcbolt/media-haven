import { NextRequest, NextResponse } from "next/server";
import { isHostAuthenticated } from "@/lib/host-auth";
import { resolveTvStateForDevice } from "@/lib/tv-state-gate";
import { TV_STATE_PICKUP_HEADER } from "@/lib/tv-state-pickup";
import { TV_STATE_SECRET_HEADER } from "@/lib/tv-state-secret";
import { propertyTvState, registerTvDevice } from "@/lib/tv";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** TVs poll this. First call registers the device; later calls return
 *  pairing state or live signage content.
 *
 *  Host preview: `?property=<id>` (session cookie required) returns the
 *  exact state a TV paired to that property would show, without touching
 *  device rows — the signage editor's live thumbnails ride this. */
export async function GET(req: NextRequest) {
  const propertyId = req.nextUrl.searchParams.get("property");
  if (propertyId) {
    if (!(await isHostAuthenticated())) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    if (!UUID_RE.test(propertyId)) {
      return NextResponse.json({ error: "bad property id" }, { status: 400 });
    }
    const state = await propertyTvState(propertyId, "Preview");
    if (!state) {
      return NextResponse.json({ error: "unknown property" }, { status: 404 });
    }
    return NextResponse.json(state, {
      headers: { "Cache-Control": "private, no-store" },
    });
  }

  const deviceId = req.nextUrl.searchParams.get("device") ?? "";
  if (!UUID_RE.test(deviceId)) {
    return NextResponse.json({ error: "bad device id" }, { status: 400 });
  }

  const headerSecret =
    req.headers.get(TV_STATE_SECRET_HEADER) ??
    req.headers.get(TV_STATE_SECRET_HEADER.toLowerCase());
  // Pickup only via header (client moves ?pickup= from URL once — F-5597 / F-5596).
  const pickupToken =
    req.headers.get(TV_STATE_PICKUP_HEADER) ??
    req.headers.get(TV_STATE_PICKUP_HEADER.toLowerCase());

  const resolved = await resolveTvStateForDevice(
    deviceId,
    headerSecret,
    pickupToken
  );
  return NextResponse.json(resolved.body, {
    status: resolved.status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { deviceId?: string };
  if (!body.deviceId || !UUID_RE.test(body.deviceId)) {
    return NextResponse.json({ error: "bad device id" }, { status: 400 });
  }
  const state = await registerTvDevice(body.deviceId);
  return NextResponse.json(state);
}