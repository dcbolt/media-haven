"use client";

import { useState } from "react";

type Variant = "portal" | "tv";

/**
 * Phase 0 optional email capture on the house guide (phone portal + TV browser).
 * Marketing consent is unchecked by default; Wi-Fi access is never gated here.
 */
export default function GuideEmailSignup({
  propertyName,
  variant = "portal",
}: {
  propertyName: string;
  variant?: Variant;
}) {
  const [email, setEmail] = useState("");
  const [consentMarketing, setConsentMarketing] = useState(false);
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [hp, setHp] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("busy");
    try {
      const res = await fetch("/api/guide-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          property: propertyName,
          consentMarketing,
          company: hp,
        }),
      });
      setState(res.ok ? "done" : "error");
    } catch {
      setState("error");
    }
  }

  if (state === "done") {
    const doneClass =
      variant === "tv"
        ? "mt-[2vw] rounded-[1vw] border border-white/15 bg-white/5 p-[1.5vw]"
        : "rounded-2xl bg-white p-6 shadow-md";
    return (
      <section
        className={doneClass}
        data-guide-email-signup=""
        aria-label="Guide email signup confirmation"
      >
        <p
          className={
            variant === "tv"
              ? "text-[1.6vw] text-seafoam-400"
              : "text-lg font-semibold text-ocean-700"
          }
        >
          Thanks — check your inbox if you opted into emails from us.
        </p>
      </section>
    );
  }

  const shell =
    variant === "tv"
      ? "mt-[2vw] max-w-[36vw] rounded-[1vw] border border-white/15 bg-black/25 p-[1.5vw]"
      : "rounded-2xl bg-white p-6 shadow-md";
  const inputClass =
    variant === "tv"
      ? "w-full rounded border border-white/25 bg-white/10 px-[1vw] py-[0.6vw] text-[1.5vw] text-white outline-none focus:border-seafoam-500"
      : "w-full rounded-xl border border-sand-300 p-3 text-lg outline-none focus:border-ocean-500";
  const labelClass =
    variant === "tv"
      ? "flex items-start gap-[0.6vw] text-[1.25vw] leading-snug text-white/75"
      : "flex items-start gap-2 text-ocean-900/70";
  const titleClass =
    variant === "tv"
      ? "text-[1.4vw] font-semibold uppercase tracking-[0.2em] text-seafoam-500"
      : "text-xl font-bold text-ocean-700";
  const bodyClass =
    variant === "tv"
      ? "mt-[0.6vw] text-[1.35vw] text-white/70"
      : "mt-2 text-lg text-ocean-900/80";

  return (
    <section
      id="guide-email"
      className={`scroll-mt-4 ${shell}`}
      data-guide-email-signup=""
      aria-label="Optional guide email signup"
    >
      <h2 className={titleClass}>Stay in touch (optional)</h2>
      <p className={bodyClass}>
        Beach tips and launch alerts during your stay — only if you want them.
      </p>
      <form onSubmit={submit} className={variant === "tv" ? "mt-[1vw] space-y-[0.8vw]" : "mt-4 space-y-2"}>
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
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className={inputClass}
        />
        <label className={labelClass}>
          <input
            type="checkbox"
            checked={consentMarketing}
            onChange={(e) => setConsentMarketing(e.target.checked)}
            className={
              variant === "tv"
                ? "mt-[0.2vw] h-[1.2vw] w-[1.2vw] accent-seafoam-500"
                : "mt-1 h-5 w-5 accent-ocean-500"
            }
          />
          <span>
            Yes, send me occasional emails about future stays and Florida
            Havens news. See our{" "}
            <a
              href="/privacy"
              className={
                variant === "tv"
                  ? "text-seafoam-400 underline"
                  : "text-ocean-600 underline"
              }
            >
              privacy policy
            </a>
            .
          </span>
        </label>
        <button
          type="submit"
          disabled={state === "busy"}
          className={
            variant === "tv"
              ? "w-full rounded-full bg-seafoam-600 py-[0.7vw] text-[1.4vw] font-semibold text-white disabled:opacity-50"
              : "w-full rounded-full bg-ocean-500 py-3 text-lg font-semibold text-white transition hover:bg-ocean-700 disabled:opacity-50"
          }
        >
          {state === "busy" ? "…" : "Sign up"}
        </button>
      </form>
      {state === "error" && (
        <p
          className={
            variant === "tv"
              ? "mt-[0.6vw] text-[1.2vw] text-red-300"
              : "mt-2 text-red-600"
          }
        >
          That didn&apos;t work — try again?
        </p>
      )}
    </section>
  );
}