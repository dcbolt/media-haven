"use client";

import { useState } from "react";
import type { EmergencyTakeover } from "@/lib/takeover";

/**
 * S1.3b host storm / emergency takeover — one-tap fleet pin.
 * Mobile-first (host #67): stacked buttons, full-width on phone.
 */
export default function StormPanel({
  initial,
}: {
  initial: EmergencyTakeover | null;
}) {
  const [takeover, setTakeover] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function setKind(kind: "storm" | "water") {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/host/takeover", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        takeover?: EmergencyTakeover | null;
        error?: string;
      };
      if (!res.ok || !body.ok) {
        setErr(body.error ?? `failed (${res.status})`);
        return;
      }
      setTakeover(body.takeover ?? null);
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/host/takeover", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clear: true }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !body.ok) {
        setErr(body.error ?? `failed (${res.status})`);
        return;
      }
      setTakeover(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className={`mt-6 rounded-2xl p-6 shadow-md ${
        takeover
          ? "border-2 border-amber-500 bg-amber-50"
          : "bg-white"
      }`}
    >
      <h2 className="text-xl font-bold text-ocean-700">Emergency takeover</h2>
      <p className="mt-1 text-sm text-ocean-900/60">
        Pins a full-screen message on <strong>every</strong> Florida Havens TV
        within ~10s — including vacant standby. Auto-clears on a timer; clear
        early anytime. (S1.3b · storm mode)
      </p>

      {takeover ? (
        <div className="mt-4 space-y-3">
          <p className="rounded-xl bg-white px-4 py-3 text-ocean-900 shadow-sm">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-700">
              {takeover.kind} active
            </span>
            <br />
            <span className="text-lg font-semibold">{takeover.title}</span>
            <br />
            <span className="text-sm text-ocean-900/70">{takeover.body}</span>
            <br />
            <span className="mt-1 inline-block text-xs text-ocean-900/50">
              Until {new Date(takeover.until).toLocaleString()}
            </span>
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void clear()}
            className="w-full rounded-full bg-ocean-500 py-3 font-semibold text-white transition hover:bg-ocean-700 disabled:opacity-50 sm:w-auto sm:px-6"
          >
            {busy ? "Clearing…" : "Clear takeover now"}
          </button>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <button
            type="button"
            disabled={busy}
            onClick={() => void setKind("storm")}
            className="w-full rounded-full bg-amber-600 py-3 font-semibold text-white transition hover:bg-amber-700 disabled:opacity-50 sm:w-auto sm:px-6"
          >
            {busy ? "…" : "Storm mode (6h)"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void setKind("water")}
            className="w-full rounded-full border-2 border-sky-600 py-3 font-semibold text-sky-800 transition hover:bg-sky-50 disabled:opacity-50 sm:w-auto sm:px-6"
          >
            Water advisory (12h)
          </button>
        </div>
      )}
      {err && (
        <p className="mt-3 text-sm font-semibold text-red-600">{err}</p>
      )}
    </section>
  );
}
