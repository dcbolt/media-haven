import { NextRequest, NextResponse } from "next/server";
import { completeCommand } from "@/lib/tv-commands";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Path C ack: TV fires intent then reports done/failed (fire-and-forget).
 * TTL expiry covers lost acks.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "bad command id" }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    status?: "done" | "failed";
    error?: string;
    deviceId?: string;
  };

  if (body.status !== "done" && body.status !== "failed") {
    return NextResponse.json(
      { error: "status must be done or failed" },
      { status: 400 }
    );
  }

  if (body.deviceId && !UUID_RE.test(body.deviceId)) {
    return NextResponse.json({ error: "bad device id" }, { status: 400 });
  }

  const ok = await completeCommand(id, {
    status: body.status,
    error: body.error,
    deviceId: body.deviceId,
  });

  if (!ok) {
    return NextResponse.json({ error: "update failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
