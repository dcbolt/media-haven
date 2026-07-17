import { STREAMING_SERVICES, type StreamingService } from "@/lib/streaming";

/**
 * Streaming is guidance, not an integration (DECISIONS.md): one streamer per
 * TV (Shield / Google TV), guests use native apps with their own accounts,
 * and login cleanup is the host's turnover checklist — no auto-wipe claims.
 * This section teaches the Home-button flow plus one-tap activation links
 * for when a TV app shows a sign-in code.
 */
export default function StreamingGuide({
  services = STREAMING_SERVICES,
}: {
  services?: StreamingService[];
}) {
  const steps = [
    "Press Home on the TV remote — Netflix, Disney+, Hulu, and the rest are right there.",
    "Sign in with your own accounts. When an app shows a code, tap that service below and enter it on your phone — no typing passwords with the remote.",
    "Cast like at home: your phone is on the same Wi-Fi as the TV, so the cast button in your apps (and AirPlay) just works.",
    "When you're done, the house guide returns on its own. We clear all logins after checkout.",
  ];

  return (
    <section className="rounded-2xl bg-white p-6 shadow-md">
      <h2 className="text-xl font-bold text-ocean-700">Streaming on the TV</h2>
      <p className="mt-2 text-ocean-900/80">
        Your shows, your accounts — the TV screen you see is just the house
        guide, and streaming is one button away.
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
        {services.map((s) => (
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
