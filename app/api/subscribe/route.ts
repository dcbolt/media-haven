import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[+\d][\d\s().-]{6,19}$/;
const SOURCES = new Set(["portal", "wifi"]);

/** Guest contact capture: launch-alert opt-ins and the Wi-Fi reveal gate. */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    email?: string;
    phone?: string;
    source?: string;
  };
  const email = body.email?.trim().toLowerCase() ?? "";
  const phone = body.phone?.trim() || null;
  const source = SOURCES.has(body.source ?? "") ? body.source! : "portal";

  if (!EMAIL_RE.test(email) || email.length > 254) {
    return NextResponse.json({ error: "invalid email" }, { status: 400 });
  }
  if (phone && !PHONE_RE.test(phone)) {
    return NextResponse.json({ error: "invalid phone" }, { status: 400 });
  }

  const db = supabaseAdmin();
  if (!db) {
    // Demo mode: accept without persistence so the flow is testable.
    return NextResponse.json({ ok: true, demo: true });
  }

  const { error } = await db
    .from("guest_subscribers")
    .upsert(
      phone ? { email, phone, source } : { email, source },
      { onConflict: "email" }
    );
  if (error) {
    return NextResponse.json({ error: "could not save" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
