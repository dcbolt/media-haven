/**
 * Streaming is deliberately an instruction screen, not an integration.
 * Roku Guest Mode already handles per-guest sign-in and automatic wipe on the
 * checkout date, but it has no public API — and streaming apps can't be
 * embedded (DRM + frame-ancestors). This walkthrough is the buildable 100%.
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
    "Open Netflix, Disney+, Hulu — any app — and sign in with your own account.",
    "That's it. On your check-out date, the TV automatically signs out of everything and erases your activity. Nothing to remember.",
  ];

  return (
    <section className="rounded-2xl bg-white p-6 shadow-md">
      <h2 className="text-xl font-bold text-ocean-700">Streaming on the TV</h2>
      <p className="mt-2 text-ocean-900/80">
        The TV is in Guest Mode — use your own streaming accounts, and they wipe
        themselves automatically when you leave.
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
    </section>
  );
}
