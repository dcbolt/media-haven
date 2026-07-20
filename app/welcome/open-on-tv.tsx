"use client";

import { useCallback, useEffect, useState } from "react";
import type { StreamingService } from "@/lib/streaming";

type OnlineTv = { id: string; label: string | null; lastSeen: string };

/**
 * Path C portal control: enqueue a native app launch on a paired TV.
 * Never claims we signed the guest into the streamer — coach only.
 */
export default function OpenOnTv({
  token,
  services,
}: {
  token: string;
  services: StreamingService[];
}) {
  const [tvs, setTvs] = useState<OnlineTv[] | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!token || token === "demo") {
      setTvs([]);
      return;
    }
    try {
      const res = await fetch(
        `/api/tv/command?token=${encodeURIComponent(token)}`,
        { cache: "no-store" }
      );
      if (!res.ok) {
        setTvs([]);
        return;
      }
      const data = (await res.json()) as { tvs?: OnlineTv[] };
      setTvs(data.tvs ?? []);
      if ((data.tvs?.length ?? 0) === 1) setPicked(data.tvs![0].id);
    } catch {
      setTvs([]);
    }
  }, [token]);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 30_000);
    return () => clearInterval(t);
  }, [refresh]);

  if (token === "demo") {
    return (
      <p className="mt-4 text-sm text-ocean-900/60">
        Demo stay — pair a real guest token and an online TV to use Open on TV.
      </p>
    );
  }

  if (tvs === null) return null;
  if (tvs.length === 0) {
    return (
      <p className="mt-4 text-sm text-ocean-900/60">
        No TV online right now — use the remote: Entertainment → pick the app.
      </p>
    );
  }

  async function open(slug: string, name: string) {
    setBusy(slug);
    setMsg(null);
    setErr(null);
    try {
      const body: {
        token: string;
        slug: string;
        tvDeviceId?: string;
      } = { token, slug };
      if (tvs!.length > 1) {
        if (!picked) {
          setErr("Pick which TV to open on.");
          setBusy(null);
          return;
        }
        body.tvDeviceId = picked;
      } else {
        body.tvDeviceId = tvs![0].id;
      }
      const res = await fetch("/api/tv/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        targetHint?: string;
      };
      if (!res.ok) {
        setErr(
          data.error === "no TV online"
            ? "No TV online — use the remote: Entertainment → " + name
            : data.error || "Could not open on TV"
        );
        return;
      }
      setMsg(
        `Opening ${name} on ${data.targetHint ?? "the TV"}… Look at the TV — scan the QR if it asks you to sign in.`
      );
    } catch {
      setErr("Network error — try again or use the remote.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-6 rounded-xl border border-ocean-100 bg-ocean-50/60 p-4">
      <h3 className="font-bold text-ocean-700">Open on TV</h3>
      <p className="mt-1 text-sm text-ocean-900/70">
        Launch the app on the house TV. Sign in with{" "}
        <em>your</em> account when it asks — we never store stream passwords.
      </p>

      {tvs.length > 1 && (
        <label className="mt-3 block text-sm font-medium text-ocean-800">
          Which TV?
          <select
            className="mt-1 w-full rounded-lg border border-ocean-200 bg-white px-3 py-2"
            value={picked ?? ""}
            onChange={(e) => setPicked(e.target.value || null)}
          >
            <option value="">Select…</option>
            {tvs.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label?.trim() || "TV"} · online
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {services.map((s) => (
          <button
            key={s.slug}
            type="button"
            disabled={busy === s.slug}
            onClick={() => void open(s.slug, s.name)}
            className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-ocean-700 shadow-sm transition hover:bg-ocean-100 disabled:opacity-50"
          >
            {busy === s.slug ? "Opening…" : `Open ${s.name}`}
          </button>
        ))}
      </div>

      {msg && (
        <p className="mt-3 text-sm font-medium text-ocean-800" role="status">
          {msg}
        </p>
      )}
      {err && (
        <p className="mt-3 text-sm font-medium text-red-700" role="alert">
          {err}
        </p>
      )}
    </div>
  );
}
