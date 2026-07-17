import { NextRequest, NextResponse } from "next/server";
import { isHostAuthenticated, verifyAccessCode } from "@/lib/host-auth";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * Backend for public/roadmap.html — the living feature/bug board.
 * Auth: x-roadmap-key header (the HOST_ACCESS_CODE) or the host cookie.
 * GET lists items; POST adds one; PATCH moves one between statuses.
 */

const KINDS = new Set(["feature", "bug", "question"]);
const STATUSES = new Set([
  "submitted",
  "planned",
  "in_progress",
  "shipped",
  "blocked",
  "wont_do",
]);

async function authed(req: NextRequest): Promise<boolean> {
  const key = req.headers.get("x-roadmap-key") ?? "";
  return (
    (key.length > 0 && (await verifyAccessCode(key))) ||
    (await isHostAuthenticated())
  );
}

function deny() {
  return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
}

export async function GET(req: NextRequest) {
  if (!(await authed(req))) return deny();
  const db = supabaseAdmin();
  if (!db) return NextResponse.json({ ok: false, reason: "no-db" }, { status: 503 });
  const { data, error } = await db
    .from("roadmap_items")
    .select("*")
    .order("num", { ascending: false })
    .limit(500);
  if (error) return NextResponse.json({ ok: false, reason: error.message }, { status: 500 });
  return NextResponse.json(
    { ok: true, items: data ?? [], updated: new Date().toISOString() },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

export async function POST(req: NextRequest) {
  if (!(await authed(req))) return deny();
  const db = supabaseAdmin();
  if (!db) return NextResponse.json({ ok: false, reason: "no-db" }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as {
    kind?: string;
    title?: string;
    body?: string;
    reporter?: string;
  };
  const title = (body.title ?? "").trim().slice(0, 200);
  if (!title) {
    return NextResponse.json({ ok: false, reason: "title-required" }, { status: 400 });
  }
  const { data, error } = await db
    .from("roadmap_items")
    .insert({
      kind: KINDS.has(body.kind ?? "") ? body.kind : "feature",
      title,
      body: (body.body ?? "").trim().slice(0, 4000) || null,
      reporter: (body.reporter ?? "").trim().slice(0, 60) || null,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ ok: false, reason: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, item: data });
}

export async function PATCH(req: NextRequest) {
  if (!(await authed(req))) return deny();
  const db = supabaseAdmin();
  if (!db) return NextResponse.json({ ok: false, reason: "no-db" }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as {
    id?: string;
    status?: string;
    notes?: string;
  };
  if (!body.id || !STATUSES.has(body.status ?? "")) {
    return NextResponse.json({ ok: false, reason: "bad-request" }, { status: 400 });
  }
  const patch: Record<string, unknown> = {
    status: body.status,
    updated_at: new Date().toISOString(),
  };
  if (body.status === "shipped") patch.shipped_at = new Date().toISOString();
  if (typeof body.notes === "string") patch.notes = body.notes.trim().slice(0, 2000) || null;
  const { data, error } = await db
    .from("roadmap_items")
    .update(patch)
    .eq("id", body.id)
    .select()
    .single();
  if (error) return NextResponse.json({ ok: false, reason: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, item: data });
}
