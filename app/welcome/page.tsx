import { resolveGuestToken } from "@/lib/reservations";
import WifiCard from "./wifi-card";
import StreamingGuide from "./streaming-guide";

function InfoSection({ title, body }: { title: string; body: string }) {
  return (
    <section className="rounded-2xl bg-white p-6 shadow-md">
      <h2 className="text-xl font-bold text-ocean-700">{title}</h2>
      <p className="mt-2 whitespace-pre-line text-lg leading-relaxed text-ocean-900/85">
        {body}
      </p>
    </section>
  );
}

export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const view = token ? await resolveGuestToken(token) : null;

  if (!view) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="text-3xl font-bold text-ocean-700">
          This link isn&apos;t active
        </h1>
        <p className="text-lg text-ocean-900/70">
          Your welcome link is tied to your stay and may have expired. Please
          scan the QR code at the property again, or contact your host.
        </p>
      </main>
    );
  }

  const { property } = view;
  const checkOut = new Date(view.checkOut).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <main className="mx-auto max-w-2xl p-4 pb-12 sm:p-6">
      <header className="rounded-3xl bg-gradient-to-br from-ocean-500 to-ocean-700 p-8 text-white shadow-lg">
        <p className="text-lg opacity-90">Welcome to</p>
        <h1 className="mt-1 text-4xl font-bold">{property.name}</h1>
        <p className="mt-4 text-xl">
          Hi {view.guestFirstName} — make yourself at home. You&apos;re with us
          through {checkOut}.
        </p>
      </header>

      <div className="mt-6 space-y-6">
        {property.wifiSsid && property.wifiPassword && (
          <WifiCard ssid={property.wifiSsid} password={property.wifiPassword} />
        )}
        <StreamingGuide checkOut={view.checkOut} />
        {property.houseRules && (
          <InfoSection title="House rules" body={property.houseRules} />
        )}
        {property.localGuide && (
          <InfoSection title="Local guide" body={property.localGuide} />
        )}
        {property.emergencyInfo && (
          <InfoSection title="Emergency & essentials" body={property.emergencyInfo} />
        )}
      </div>
    </main>
  );
}
