"use client";

import { useEffect, useState } from "react";

/**
 * OAuth landing: Supabase returns here with tokens in the URL fragment
 * (implicit flow). The fragment never reaches the server, so this tiny
 * client page lifts the access token and posts it to /api/auth/google,
 * which validates + allowlists it and sets the host cookie.
 */
export default function GoogleCallback() {
  const [msg, setMsg] = useState("Signing you in…");

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const query = new URLSearchParams(window.location.search);
    const err =
      hash.get("error_description") ??
      query.get("error_description") ??
      hash.get("error") ??
      query.get("error");
    const token = hash.get("access_token");

    if (err) {
      setMsg(
        /provider/i.test(err)
          ? "Google sign-in isn't switched on yet — enable the Google provider in Supabase (Authentication → Providers), then try again."
          : `Google sign-in failed: ${err}`
      );
      return;
    }
    if (!token) {
      setMsg("No sign-in token found — head back and try again.");
      return;
    }
    fetch("/api/auth/google", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ access_token: token }),
    })
      .then((r) => r.json())
      .then((d: { ok?: boolean; reason?: string; email?: string }) => {
        if (d.ok) {
          window.location.replace("/host");
        } else if (d.reason === "email-not-allowed") {
          setMsg(
            `${d.email ?? "That Google account"} isn't on the host list. Ask the owner to add it, or sign in with the access code.`
          );
        } else {
          setMsg(`Couldn't complete sign-in (${d.reason ?? "unknown"}).`);
        }
      })
      .catch(() => setMsg("Couldn't reach the sign-in service — try again."));
  }, []);

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-8 text-center">
      <h1 className="text-2xl font-bold text-ocean-700">Host access</h1>
      <p className="text-ocean-900/70">{msg}</p>
      <a href="/host/login" className="font-semibold text-ocean-500 hover:text-ocean-700">
        ← Back to sign-in
      </a>
    </main>
  );
}
