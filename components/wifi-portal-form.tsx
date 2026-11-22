"use client";

import { useState } from "react";

/**
 * Captive portal form — minimal client JS for iOS captive sheet.
 * Marketing consent is optional; email is required for Wi-Fi (not for Mailchimp
 * unless opted in).
 */
export default function WifiPortalForm({
  propertyName,
  clientMac,
  apMac,
  ssid,
  redirectUrl,
}: {
  propertyName: string;
  clientMac: string | null;
  apMac: string | null;
  ssid: string | null;
  redirectUrl: string | null;
}) {
  const [email, setEmail] = useState("");
  const [consentMarketing, setConsentMarketing] = useState(false);
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");
  const [hp, setHp] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("busy");
    try {
      const res = await fetch("/api/portal/authorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          consentMarketing,
          clientMac,
          apMac,
          ssid,
          redirectUrl,
          company: hp,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        redirect?: string;
        error?: string;
      };
      if (res.ok && data.redirect) {
        window.location.href = data.redirect;
        return;
      }
      setState("error");
    } catch {
      setState("error");
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" data-wifi-portal-form="">
      <input
        type="text"
        name="company"
        value={hp}
        onChange={(e) => setHp(e.target.value)}
        tabIndex={-1}
        autoComplete="off"
        className="absolute h-0 w-0 opacity-0"
        aria-hidden
      />
      <label className="block">
        <span className="text-sm font-medium text-slate-700">Email</span>
        <input
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-base text-slate-900"
          placeholder="you@example.com"
        />
      </label>
      <p className="text-sm text-slate-600">
        Wi-Fi access requires your email so we can run the network. This is not
        marketing unless you opt in below.
      </p>
      <label className="flex items-start gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={consentMarketing}
          onChange={(e) => setConsentMarketing(e.target.checked)}
          className="mt-0.5 h-4 w-4"
          data-wifi-marketing-consent=""
        />
        <span>
          Optional: send me news and direct-booking offers from The Florida
          Havens. See{" "}
          <a href="/privacy" className="text-sky-700 underline">
            privacy policy
          </a>
          .
        </span>
      </label>
      <button
        type="submit"
        disabled={state === "busy"}
        className="w-full rounded-full bg-sky-700 py-3 text-base font-semibold text-white disabled:opacity-60"
      >
        {state === "busy" ? "Connecting…" : "Connect to Wi‑Fi"}
      </button>
      {state === "error" && (
        <p className="text-sm text-red-700" role="alert">
          Could not connect — try again or ask your host.
        </p>
      )}
    </form>
  );
}