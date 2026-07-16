"use client";

import { useState } from "react";

export default function WifiCard({
  ssid,
  password,
}: {
  ssid: string;
  password: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copyPassword() {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Older TV browsers lack the clipboard API; the password stays visible
      // on screen so nothing is lost.
    }
  }

  return (
    <section className="rounded-2xl bg-white p-6 shadow-md">
      <h2 className="text-xl font-bold text-ocean-700">Wi-Fi</h2>
      <dl className="mt-3 space-y-1 text-lg">
        <div className="flex justify-between gap-4">
          <dt className="text-ocean-900/60">Network</dt>
          <dd className="font-semibold">{ssid}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-ocean-900/60">Password</dt>
          <dd className="font-mono font-semibold">{password}</dd>
        </div>
      </dl>
      <button
        onClick={copyPassword}
        className="mt-4 w-full rounded-full bg-ocean-500 py-3 text-lg font-semibold text-white transition hover:bg-ocean-700"
      >
        {copied ? "Copied ✓" : "Copy password"}
      </button>
    </section>
  );
}
