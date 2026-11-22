import { NextRequest, NextResponse } from "next/server";
import {
  WIFI_PORTAL_CONSENT_VERSION,
  recordConsentLog,
} from "@/lib/consent";
import {
  clientIp,
  normalizeGuideSignupEmail,
} from "@/lib/guide-signup-shared";
import { consumeRateLimit } from "@/lib/in-memory-rate-limit";
import { subscribeGuideSignup } from "@/lib/mailchimp";
import { authorizeGuestOnNode } from "@/lib/node-authorizer";
import { guestAuthorizeMinutes } from "@/lib/wifi-checkout";
import {
  propertyForSsid,
  safePortalRedirect,
  portalModeFromEnv,
} from "@/lib/wifi-portal";
import { portalBaseUrl } from "@/lib/tokens";

const MAC_IN_RESPONSE_FORBIDDEN = true;

/**
 * Captive portal authorize — FAIL-OPEN: guest Wi‑Fi proceeds even if
 * consent log, Mailchimp, or node authorizer fail. Client MAC is never stored.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    email?: string;
    consentMarketing?: boolean;
    clientMac?: string | null;
    ssid?: string | null;
    redirectUrl?: string | null;
    company?: string;
  };

  if (body.company?.trim()) {
    const welcome = `${portalBaseUrl()}/portal/welcome?property=dunes`;
    return NextResponse.json({ ok: true, redirect: welcome });
  }

  const mode = portalModeFromEnv();
  const property = propertyForSsid(body.ssid ?? null);
  const welcomeFallback = `${portalBaseUrl()}/portal/welcome?property=${encodeURIComponent(property.slug)}`;

  if (mode === "open") {
    return NextResponse.json({ ok: true, redirect: welcomeFallback });
  }
  if (mode === "closed") {
    return NextResponse.json({ error: "portal closed" }, { status: 503 });
  }

  const ip = clientIp(req);
  const limited = consumeRateLimit(`wifi-portal:${ip}`, 12, 10 * 60_000);
  if (!limited.ok) {
    // Fail-open for rate limit too — guests still get online.
  }

  const email = normalizeGuideSignupEmail(body.email ?? "");
  if (!email) {
    return NextResponse.json({ error: "email required" }, { status: 400 });
  }

  const consentMarketing = body.consentMarketing === true;
  const clientMac = body.clientMac?.trim() || null;

  await recordConsentLog({
    email,
    property: property.name,
    source: "wifi-captive",
    consentedMarketing: consentMarketing,
    consentTextVersion: WIFI_PORTAL_CONSENT_VERSION,
    emailRedacted: false,
  });

  if (consentMarketing) {
    await subscribeGuideSignup({ email, property: property.name });
  }

  const minutes = await guestAuthorizeMinutes(property.slug);
  if (clientMac) {
    await authorizeGuestOnNode({
      clientMac,
      minutes,
      ssid: body.ssid ?? null,
      propertySlug: property.slug,
    });
  }

  void safePortalRedirect(body.redirectUrl ?? null, welcomeFallback);

  const response: Record<string, unknown> = {
    ok: true,
    redirect: welcomeFallback,
    transactional: !consentMarketing,
  };
  void MAC_IN_RESPONSE_FORBIDDEN;

  return NextResponse.json(response);
}