import { NextRequest, NextResponse } from "next/server";
import {
  GUIDE_SIGNUP_CONSENT_VERSION,
  recordConsentLog,
} from "@/lib/consent";
import {
  clientIp,
  normalizeGuideSignupEmail,
} from "@/lib/guide-signup-shared";
import { consumeRateLimit } from "@/lib/in-memory-rate-limit";
import { subscribeGuideSignup } from "@/lib/mailchimp";

/** Optional guide / TV portal email capture → consent log + Mailchimp (opt-in only). */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    email?: string;
    property?: string;
    consentMarketing?: boolean;
    /** Honeypot — bots fill this; humans never see it. */
    company?: string;
  };

  if (body.company?.trim()) {
    return NextResponse.json({ ok: true });
  }

  const ip = clientIp(req);
  const limited = consumeRateLimit(`guide-signup:${ip}`, 8, 10 * 60_000);
  if (!limited.ok) {
    return NextResponse.json(
      { error: "rate limited" },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSec) } }
    );
  }

  const email = normalizeGuideSignupEmail(body.email ?? "");
  if (!email) {
    return NextResponse.json({ error: "invalid email" }, { status: 400 });
  }

  const property =
    (body.property?.trim() || "The Florida Havens").slice(0, 120) || null;
  const consentMarketing = body.consentMarketing === true;

  const log = await recordConsentLog({
    email,
    property,
    source: "guide-signup",
    consentedMarketing: consentMarketing,
    consentTextVersion: GUIDE_SIGNUP_CONSENT_VERSION,
  });
  if (!log.ok) {
    return NextResponse.json({ error: "could not save consent" }, { status: 500 });
  }

  let mailchimp: { ok: boolean; skipped?: boolean } = { ok: true, skipped: true };
  if (consentMarketing) {
    mailchimp = await subscribeGuideSignup({ email, property: property ?? "" });
    if (!mailchimp.ok) {
      return NextResponse.json(
        { error: "could not subscribe" },
        { status: 502 }
      );
    }
  }

  return NextResponse.json({
    ok: true,
    marketing: consentMarketing,
    mailchimpPending: consentMarketing && !mailchimp.skipped,
  });
}