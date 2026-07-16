"use client";

import { useState } from "react";

/**
 * Value-first email capture: guests genuinely want to know when a rocket is
 * going up during their stay. The email lands in the owned guest list that
 * powers direct-booking remarketing. Copy is honest about both.
 */
export default function LaunchAlerts() {
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");

  async function subscribe(e: React.FormEvent) {
    e.preventDefault();
    setState("busy");
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, phone: phone || undefined }),
      });
      setState(res.ok ? "done" : "error");
    } catch {
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <section className="rounded-2xl bg-white p-6 shadow-md">
        <h2 className="text-xl font-bold text-ocean-700">You&apos;re on the list 🚀</h2>
        <p className="mt-2 text-lg text-ocean-900/80">
          We&apos;ll email you when a launch is visible from the beach.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl bg-white p-6 shadow-md">
      <h2 className="text-xl font-bold text-ocean-700">Rocket launch alerts</h2>
      <p className="mt-2 text-lg text-ocean-900/80">
        Get an email when a launch is visible from the beach during your stay —
        plus occasional offers on future stays. Unsubscribe anytime.
      </p>
      <form onSubmit={subscribe} className="mt-4 space-y-2">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full rounded-xl border border-sand-300 p-3 text-lg outline-none focus:border-ocean-500"
        />
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Phone (optional — text alerts for night launches)"
          className="w-full rounded-xl border border-sand-300 p-3 text-lg outline-none focus:border-ocean-500"
        />
        <button
          type="submit"
          disabled={state === "busy"}
          className="w-full rounded-full bg-ocean-500 py-3 text-lg font-semibold text-white transition hover:bg-ocean-700 disabled:opacity-50"
        >
          {state === "busy" ? "…" : "Notify me"}
        </button>
      </form>
      {state === "error" && (
        <p className="mt-2 text-red-600">That didn&apos;t work — try again?</p>
      )}
    </section>
  );
}
