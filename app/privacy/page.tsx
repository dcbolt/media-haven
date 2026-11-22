import Link from "next/link";

export const metadata = {
  title: "Privacy — The Florida Havens",
  description: "How we handle guest email and consent.",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto min-h-screen max-w-2xl px-6 py-10 text-ocean-900">
      <h1 className="font-serif text-3xl font-semibold text-ocean-800">
        Privacy policy
      </h1>
      <p className="mt-2 text-sm text-ocean-700/70">Last updated November 22, 2026</p>

      <section className="mt-8 space-y-4 text-lg leading-relaxed text-ocean-900/90">
        <p>
          The Florida Havens (&quot;we&quot;) runs the in-home guest guide and
          optional Wi-Fi welcome portal for our vacation rentals. This notice
          explains what we collect when you enter your email on those pages.
        </p>
        <h2 className="text-xl font-semibold text-ocean-800">What we collect</h2>
        <ul className="list-disc space-y-2 pl-6">
          <li>Your email address when you submit a form.</li>
          <li>
            Whether you opted in to marketing emails (checkbox — always
            optional on the house guide; never required for Wi-Fi).
          </li>
          <li>Which property you were visiting and when you submitted the form.</li>
        </ul>
        <p>
          We do not store your device MAC address, IP address, or browser
          fingerprint in our consent log.
        </p>
        <h2 className="text-xl font-semibold text-ocean-800">How we use it</h2>
        <ul className="list-disc space-y-2 pl-6">
          <li>
            <strong>Transactional:</strong> operating Wi-Fi access and sending
            stay-related messages you request (e.g. launch alerts).
          </li>
          <li>
            <strong>Marketing (opt-in only):</strong> occasional news and
            direct-booking offers via Mailchimp, with double opt-in confirmation.
          </li>
        </ul>
        <h2 className="text-xl font-semibold text-ocean-800">Your choices</h2>
        <p>
          You can unsubscribe from marketing emails anytime using the link in
          any message. For questions, contact{" "}
          <a
            className="text-ocean-600 underline"
            href="mailto:hello@thefloridahavens.com"
          >
            hello@thefloridahavens.com
          </a>
          .
        </p>
      </section>

      <p className="mt-10">
        <Link href="/" className="text-ocean-600 underline">
          Back to home
        </Link>
      </p>
    </main>
  );
}