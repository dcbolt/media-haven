import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Launch-alert / offers opt-in from the guest portal. */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { email?: string };
  const email = body.email?.trim().toLowerCase() ?? "";
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return NextResponse.json({ error: "invalid email" }, { status: 400 });
  }

  const db = supabaseAdmin();
  if (!db) {
    // Demo mode: accept without persistence so the flow is testable.
    return NextResponse.json({ ok: true, demo: true });
  }

  const { error } = await db
    .from("guest_subscribers")
    .upsert({ email, source: "portal" }, { onConflict: "email" });
  if (error) {
    return NextResponse.json({ error: "could not save" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
