import { NextRequest, NextResponse } from "next/server";
import { unsubscribeSig } from "@/lib/alerts";
import { supabaseAdmin } from "@/lib/supabase";

/** One-click unsubscribe from alert emails/SMS. Link carries
 *  ?e=<base64url email>&s=<hmac> — no session needed, tamper-evident. */
export async function GET(req: NextRequest) {
  const e = req.nextUrl.searchParams.get("e") ?? "";
  const s = req.nextUrl.searchParams.get("s") ?? "";
  let email = "";
  try {
    email = Buffer.from(e, "base64url").toString("utf8").trim().toLowerCase();
  } catch {
    // fall through to the invalid response
  }
  if (!email || !s || s !== unsubscribeSig(email)) {
    return NextResponse.json({ error: "invalid link" }, { status: 400 });
  }

  const db = supabaseAdmin();
  if (db) {
    await db
      .from("guest_subscribers")
      .update({ unsubscribed_at: new Date().toISOString() })
      .eq("email", email)
      .is("unsubscribed_at", null);
  }

  return new NextResponse(
    `<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Unsubscribed — The Florida Havens</title>
<body style="margin:0;display:grid;place-items:center;min-height:100vh;background:#0b2e3a;color:#fff;font-family:Montserrat,system-ui,sans-serif;text-align:center">
<div style="padding:2rem">
<p style="letter-spacing:.35em;text-transform:uppercase;font-size:.75rem;color:#7fd1c0">The Florida Havens</p>
<h1 style="font-family:Georgia,serif;font-weight:600;font-size:2rem;margin:.75rem 0">You're unsubscribed</h1>
<p style="color:rgba(255,255,255,.7);max-width:26rem">No more launch alerts for ${email.replace(/</g, "&lt;")}. Changed your mind? Re-subscribe any time from your stay portal.</p>
</div></body>`,
    { headers: { "content-type": "text/html; charset=utf-8" } }
  );
}
