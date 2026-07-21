import { NextRequest, NextResponse } from "next/server";
import { isHostAuthenticated } from "@/lib/host-auth";
import {
  assignTv,
  forgetTv,
  renameTv,
  unlinkTv,
  type TvOpResult,
} from "@/lib/tv-ops";

/**
 * Host TVs page ops (link / unlink / rename / forget).
 * Deploy-proof API — replaces app/host/tvs/actions.ts server actions.
 */

const OPS: Record<string, (fd: FormData) => Promise<TvOpResult>> = {
  assign: assignTv,
  unlink: unlinkTv,
  rename: renameTv,
  forget: forgetTv,
};

export async function POST(req: NextRequest) {
  if (!(await isHostAuthenticated())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const fd = await req.formData().catch(() => null);
  if (!fd) {
    return NextResponse.json({ error: "bad form data" }, { status: 400 });
  }
  const op = OPS[String(fd.get("op") ?? "")];
  if (!op) {
    return NextResponse.json({ error: "unknown op" }, { status: 400 });
  }
  const result = await op(fd);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
