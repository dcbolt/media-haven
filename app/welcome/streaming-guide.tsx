import { STREAMING_SERVICES } from "@/lib/streaming";

/**
 * Streaming is deliberately guidance, not an integration. Roku Guest Mode
 * handles per-guest sign-in and automatic wipe on the checkout date (no
 * public API to drive it), and TV apps sign in via activation codes. This
 * section walks the guest through both halves: Guest Mode on the TV, and
 * one-tap links to every service's activate page for when the TV shows a code.
 */
export default function StreamingGuide({ checkOut }: { checkOut: string }) {
  const checkoutDate = new Date(checkOut).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const steps = [
    "Press Home on the Roku remote — you'll see the Guest Mode welcome screen.",
    `Enter your check-out date (${checkoutDate}) when prompted.`,
    "Open any app. When it shows a sign-in code, tap that service below and enter the code — no typing passwords with the remote.",
    "On your check-out date the TV signs out of everything and erases your activity automatically.",
  ];

  return (
    <section className="rounded-2xl bg-white p-6 shadow-md">
      <h2 className="text-xl font-bold text-ocean-700">Streaming on the TV</h2>
      <p className="mt-2 text-ocean-900/80">
        Use your own accounts — they wipe themselves automatically when you
        leave.
      </p>
      <ol className="mt-4 space-y-3">
        {steps.map((step, i) => (
          <li key={i} className="flex gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ocean-100 font-bold text-ocean-700">
              {i + 1}
            </span>
            <span className="text-lg">{step}</span>
          </li>
        ))}
      </ol>
      <h3 className="mt-6 font-bold text-ocean-700">Sign-in pages</h3>
      <p className="mt-1 text-sm text-ocean-900/60">
        When the TV shows a code, tap the matching service:
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {STREAMING_SERVICES.map((s) => (
          <a
            key={s.name}
            href={s.activateUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-xl bg-ocean-50 p-3 text-center font-semibold text-ocean-700 transition hover:bg-ocean-100"
          >
            {s.name}
          </a>
        ))}
      </div>
    </section>
  );
}
