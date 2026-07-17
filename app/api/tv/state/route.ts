import { NextRequest, NextResponse } from "next/server";
import { getTvState, registerTvDevice } from "@/lib/tv";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** TVs poll this. First call registers the device; later calls return
 *  pairing state or live signage content. */
export async function GET(req: NextRequest) {
  const deviceId = req.nextUrl.searchParams.get("device") ?? "";
  if (!UUID_RE.test(deviceId)) {
    return NextResponse.json({ error: "bad device id" }, { status: 400 });
  }
  const state = await getTvState(deviceId);
  return NextResponse.json(
    {
      ...state,
      // Deploy fingerprint: the TV client reloads when this changes, so new
      // code reaches every screen within one poll instead of waiting for the
      // ~4am self-heal (a TV once ran a stale bundle for a whole day).
      deploy: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { deviceId?: string };
  if (!body.deviceId || !UUID_RE.test(body.deviceId)) {
    return NextResponse.json({ error: "bad device id" }, { status: 400 });
  }
  const state = await registerTvDevice(body.deviceId);
  return NextResponse.json(state);
}
