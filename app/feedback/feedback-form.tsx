"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";

const RELAX_EMAIL = "relax@thefloridahavens.com";

export default function FeedbackForm() {
  const params = useSearchParams();
  const property = params.get("property") ?? "unknown";
  const tv = params.get("tv");
  const slide = params.get("slide");
  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [website, setWebsite] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">(
    "idle"
  );

  async function submit() {
    if (!rating) return;
    setStatus("sending");
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          property,
          tv,
          slide,
          rating,
          comment: comment.trim() || null,
          website,
        }),
      });
      if (!res.ok) throw new Error("bad");
      setStatus("done");
    } catch {
      setStatus("error");
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-lg bg-ocean-50 px-4 py-10 text-ocean-900">
      <h1 className="text-2xl font-bold text-ocean-700">Was the TV info useful?</h1>
      <p className="mt-2 text-sm text-ocean-900/70">
        One quick tap helps us tune what shows on the screen during your stay.
        No name or email — or email us at{" "}
        <a
          href={`mailto:${RELAX_EMAIL}`}
          className="font-semibold text-ocean-600 underline"
        >
          {RELAX_EMAIL}
        </a>
        .
      </p>

      <div className="mt-6 flex justify-between gap-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setRating(n)}
            className={`flex h-12 w-12 items-center justify-center rounded-full border-2 text-lg font-bold transition ${
              rating === n
                ? "border-ocean-500 bg-ocean-500 text-white"
                : "border-ocean-200 bg-white text-ocean-700 hover:border-ocean-400"
            }`}
            aria-label={`Rate ${n} out of 5`}
          >
            {n}
          </button>
        ))}
      </div>
      <p className="mt-1 text-center text-xs text-ocean-900/50">1 = not useful · 5 = very useful</p>

      <label className="mt-6 block text-sm font-semibold text-ocean-700">
        What would you like to see?{" "}
        <span className="font-normal text-ocean-900/50">(optional)</span>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value.slice(0, 500))}
          rows={4}
          className="mt-2 w-full rounded-xl border border-ocean-100 bg-white p-3 text-base shadow-sm focus:border-ocean-400 focus:outline-none"
          placeholder="Shorter weather? More dining ideas? Leave anything here."
        />
      </label>
      <p className="text-right text-xs text-ocean-900/40">{comment.length}/500</p>

      <input
        type="text"
        name="website"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        className="hidden"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden
      />

      <button
        type="button"
        disabled={!rating || status === "sending" || status === "done"}
        onClick={() => void submit()}
        className="mt-6 w-full rounded-xl bg-ocean-600 py-3 text-lg font-bold text-white shadow-md disabled:cursor-not-allowed disabled:bg-ocean-300"
      >
        {status === "done" ? "Thanks — safe travels!" : status === "sending" ? "Sending…" : "Send feedback"}
      </button>

      {status === "error" && (
        <p className="mt-3 text-center text-sm text-red-600">
          Could not send right now. Please email {RELAX_EMAIL}.
        </p>
      )}
    </main>
  );
}