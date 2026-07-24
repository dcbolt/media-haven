import { NextRequest, NextResponse } from "next/server";
import { isHostAuthenticated } from "@/lib/host-auth";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * Host-user allowlist management (host 2026-07-24). Google sign-in is gated
 * by app_config 'host_allowed_emails' (comma-separated, case-insensitive;
 * HOST_ALLOWED_EMAILS env is the fallback when the row is empty) — this
 * route makes the row editable without a deploy.
 * GET  — current allowlist + whether the env fallback is in effect
 * POST — { op: "add" | "remove", email }
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const KEY = "host_allowed_emails";

async function readList(): Promise<{ emails: string[]; source: "db" | "env" }> {
  const db = supabaseAdmin();
  let raw = "";
  if (db) {
    const { data } = await db
      .from("app_config")
      .select("value")
      .eq("key", KEY)
      .maybeSingle();
    raw = data?.value ?? "";
  }
  const source: "db" | "env" = raw ? "db" : "env";
  if (!raw) raw = process.env.HOST_ALLOWED_EMAILS ?? "";
  const emails = [
    ...new Set(
      raw
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean)
    ),
  ];
  return { emails, source };
}

export async function GET() {
  if (!(await isHostAuthenticated())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ ok: true, ...(await readList()) });
}

export async function POST(req: NextRequest) {
  if (!(await isHostAuthenticated())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = supabaseAdmin();
  if (!db) return NextResponse.json({ error: "no database" }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as {
    op?: string;
    email?: string;
  };
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 120) {
    return NextResponse.json({ error: "bad email" }, { status: 400 });
  }

  // Seed from the effective list (env fallback included) so the first db
  // write never locks out whoever was granted by env.
  const { emails } = await readList();
  let next: string[];
  if (body.op === "add") {
    next = [...new Set([...emails, email])];
  } else if (body.op === "remove") {
    next = emails.filter((e) => e !== email);
    if (next.length === 0) {
      return NextResponse.json(
        { error: "refusing to remove the last host user" },
        { status: 400 }
      );
    }
  } else {
    return NextResponse.json({ error: "unknown op" }, { status: 400 });
  }

  const { error } = await db
    .from("app_config")
    .upsert({ key: KEY, value: next.join(",") }, { onConflict: "key" });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, emails: next, source: "db" });
}
