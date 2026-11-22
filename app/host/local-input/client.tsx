"use client";
import { useState } from "react";

type State = { intents: Record<string, { unlockUntil?: string }>; reports: Record<string, { input: string | null; paused: boolean; reportedAt: string }>; audit: { at: string; by: string; kiosk: string; action: string }[] };

export default function LocalInputClient({ kiosks, initial }: { kiosks: string[]; initial: State }) {
  const [s, setS] = useState<State>(initial);
  const [msg, setMsg] = useState("");
  async function call(body: object) {
    const r = await fetch("/api/host/local-input", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    setMsg(r.ok ? "Saved. The TV applies it within about a minute." : j.error || "failed");
    const g = await fetch("/api/host/local-input");
    if (g.ok) setS(await g.json());
  }
  return (
    <main className="p-6 max-w-3xl">
      <h1 className="text-xl font-semibold">Allow local input</h1>
      <p className="text-sm opacity-70">Unlock lets a guest switch a TV to their own HDMI device. Default: until checkout. Re-lock returns the TV to signage.</p>
      {msg && <p role="status" className="my-2 text-sm">{msg}</p>}
      <table className="w-full text-sm mt-4">
        <tbody>
          {kiosks.map((k) => {
            const until = s.intents[k]?.unlockUntil;
            const open = until && Date.parse(until) > Date.now();
            const rep = s.reports[k];
            return (
              <tr key={k} className="border-t">
                <td className="py-2 font-mono">{k}</td>
                <td>{open ? `Unlocked until ${new Date(until!).toLocaleString()}` : "Locked"}</td>
                <td>{rep ? `${rep.input ?? "unknown"} · seen ${new Date(rep.reportedAt).toLocaleTimeString()}` : "no report yet"}</td>
                <td className="space-x-2">
                  <button onClick={() => call({ kiosk: k, action: "unlock", minutes: 1440 })}>Unlock 24h</button>
                  <button onClick={() => call({ kiosk: k, action: "unlock", minutes: 1440, switchHdmi2: true })}>Unlock + HDMI 2</button>
                  <button onClick={() => call({ kiosk: k, action: "lock" })}>Re-lock</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <h2 className="mt-6 font-medium">Audit log</h2>
      <ul className="text-xs font-mono">{[...s.audit].reverse().map((a, i) => <li key={i}>{a.at} {a.by} {a.kiosk} {a.action}</li>)}</ul>
    </main>
  );
}
