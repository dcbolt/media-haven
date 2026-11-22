import { createHash, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { readLocalInput, recordNodeReport } from "@/lib/local-input";

/**
 * Node-facing (outbound poll from the on-site agent). Bearer token compared
 * against sha256 in env NODE_AGENT_TOKEN_SHA256. Fail-closed when unset.
 * GET returns intents; POST reports applied state + acks one-shot HDMI2.
 */
function authed(req: NextRequest): boolean {
  const want = (process.env.NODE_AGENT_TOKEN_SHA256 || "").trim().toLowerCase();
  const tok = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!want || !tok) return false;
  const got = createHash("sha256").update(tok).digest("hex");
  return got.length === want.length && timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { intents } = await readLocalInput();
  return NextResponse.json({ intents, now: new Date().toISOString() }, { headers: { "cache-control": "no-store" } });
}

export async function POST(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { reports?: Record<string, never> } | null;
  if (!body?.reports || typeof body.reports !== "object") return NextResponse.json({ error: "bad body" }, { status: 400 });
  const r = await recordNodeReport(body.reports);
  return NextResponse.json(r, { status: r.ok ? 200 : 500 });
}
