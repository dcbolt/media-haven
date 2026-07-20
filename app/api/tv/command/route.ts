import { NextRequest, NextResponse } from "next/server";
import {
  enqueueLaunchCommand,
  listOnlineTvs,
  resolveGuestCommandContext,
} from "@/lib/tv-commands";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Path C enqueue: guest portal → pending tv_commands row.
 * Authz: opaque guest token → in-house reservation → property only.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    token?: string;
    slug?: string;
    tvDeviceId?: string | null;
  };

  const token = (body.token ?? "").trim();
  const slug = (body.slug ?? "").trim().toLowerCase();
  if (!token || !slug) {
    return NextResponse.json(
      { error: "token and slug required" },
      { status: 400 }
    );
  }

  const ctx = await resolveGuestCommandContext(token);
  if (!ctx) {
    return NextResponse.json(
      { error: "invalid or inactive stay token" },
      { status: 401 }
    );
  }

  let tvDeviceId = body.tvDeviceId ?? null;
  if (tvDeviceId && !UUID_RE.test(tvDeviceId)) {
    return NextResponse.json({ error: "bad tvDeviceId" }, { status: 400 });
  }

  const result = await enqueueLaunchCommand({
    orgId: ctx.orgId,
    propertyId: ctx.propertyId,
    slug,
    tvDeviceId,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(
    {
      ok: true,
      commandId: result.commandId,
      expiresAt: result.expiresAt,
      targetHint: result.targetHint,
    },
    { status: 201 }
  );
}

/** List online TVs for the guest property (device picker). */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token")?.trim() ?? "";
  if (!token) {
    return NextResponse.json({ error: "token required" }, { status: 400 });
  }
  const ctx = await resolveGuestCommandContext(token);
  if (!ctx) {
    return NextResponse.json(
      { error: "invalid or inactive stay token" },
      { status: 401 }
    );
  }
  const tvs = await listOnlineTvs(ctx.propertyId);
  return NextResponse.json(
    { propertyName: ctx.propertyName, tvs },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
