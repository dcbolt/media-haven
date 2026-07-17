import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { isAllowedHostEmail, issueHostCookie } from "@/lib/host-auth";

/**
 * Google sign-in verifier. The /host/login/google callback page posts the
 * Supabase access token it received in the URL fragment; we ask GoTrue who
 * that token belongs to, check the host allowlist, and exchange it for the
 * same signed host cookie the access-code path issues. Guests never touch
 * this — it gates the host dashboard only.
 */
export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const apikey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !apikey) {
    return NextResponse.json({ ok: false, reason: "auth-not-configured" }, { status: 503 });
  }
  const body = (await req.json().catch(() => ({}))) as { access_token?: string };
  const token = (body.access_token ?? "").trim();
  if (!token) {
    return NextResponse.json({ ok: false, reason: "token-required" }, { status: 400 });
  }

  // Ask Supabase Auth who the token belongs to — never trust client claims.
  const res = await fetch(`${url}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey },
    cache: "no-store",
  });
  if (!res.ok) {
    return NextResponse.json({ ok: false, reason: "invalid-token" }, { status: 401 });
  }
  const user = (await res.json()) as { email?: string };
  const email = user.email ?? "";
  if (!(await isAllowedHostEmail(email))) {
    return NextResponse.json(
      { ok: false, reason: "email-not-allowed", email },
      { status: 403 }
    );
  }

  const cookie = await issueHostCookie();
  const store = await cookies();
  store.set(cookie.name, cookie.value, cookie.options);
  return NextResponse.json({ ok: true });
}
