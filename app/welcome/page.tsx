import { resolveGuestToken } from "@/lib/reservations";
import WifiCard from "./wifi-card";
import StreamingGuide from "./streaming-guide";
import LaunchAlerts from "./launch-alerts";

function InfoSection({
  id,
  title,
  body,
}: {
  id: string;
  title: string;
  body: string;
}) {
  return (
    <section id={id} className="scroll-mt-4 rounded-2xl bg-white p-6 shadow-md">
      <h2 className="text-xl font-bold text-ocean-700">{title}</h2>
      <p className="mt-2 whitespace-pre-line text-lg leading-relaxed text-ocean-900/85">
        {body}
      </p>
    </section>
  );
}

function formatDateRangeNextYear(checkIn: string, checkOut: string): string {
  const plusYear = (iso: string) => {
    const d = new Date(iso);
    d.setFullYear(d.getFullYear() + 1);
    return d;
  };
  const opts: Intl.DateTimeFormatOptions = { month: "long", day: "numeric" };
  const a = plusYear(checkIn);
  const b = plusYear(checkOut);
  return `${a.toLocaleDateString("en-US", opts)} – ${b.toLocaleDateString(
    "en-US",
    opts
  )}, ${b.getFullYear()}`;
}

function QuickNav({ items }: { items: { id: string; label: string }[] }) {
  return (
    <nav className="-mx-4 mt-4 overflow-x-auto px-4 sm:-mx-6 sm:px-6">
      <div className="flex w-max gap-2">
        {items.map((i) => (
          <a
            key={i.id}
            href={`#${i.id}`}
            className="whitespace-nowrap rounded-full bg-white px-4 py-2 font-semibold text-ocean-700 shadow-sm transition hover:bg-ocean-50"
          >
            {i.label}
          </a>
        ))}
      </div>
    </nav>
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

      <QuickNav
        items={[
          ...(property.wifiSsid ? [{ id: "wifi", label: "Wi-Fi" }] : []),
          { id: "streaming", label: "Streaming" },
          ...property.sections.map((s) => ({ id: s.slug, label: s.title })),
          { id: "book", label: "Book again" },
        ]}
      />

      <div className="mt-4 space-y-6">
        {property.wifiSsid && property.wifiPassword && (
          <div id="wifi" className="scroll-mt-4">
            <WifiCard ssid={property.wifiSsid} password={property.wifiPassword} />
          </div>
        )}
        <div id="streaming" className="scroll-mt-4">
          <StreamingGuide checkOut={view.checkOut} />
        </div>
        {property.sections.map((s) => (
          <InfoSection key={s.slug} id={s.slug} title={s.title} body={s.body} />
        ))}

        <LaunchAlerts />

        <section
          id="book"
          className="scroll-mt-4 rounded-2xl bg-gradient-to-br from-ocean-500 to-ocean-700 p-6 text-white shadow-md"
        >
          <h2 className="text-xl font-bold">Come back to the beach</h2>
          <p className="mt-2 text-lg text-white/90">
            Book your next stay directly with us — best rates, no platform
            fees, first pick of launch-week dates.
          </p>
          <p className="mt-3 rounded-xl bg-white/10 p-3 text-lg text-white/90">
            These exact dates next year —{" "}
            <span className="font-semibold">
              {formatDateRangeNextYear(view.checkIn, view.checkOut)}
            </span>{" "}
            — are open now. Returning guests get them before anyone else.
          </p>
          <a
            href={process.env.NEXT_PUBLIC_BOOK_URL ?? "https://www.thefloridahavens.com/book"}
            className="mt-4 block rounded-full bg-white py-3 text-center text-lg font-semibold text-ocean-700 transition hover:bg-sand-100"
          >
            Book direct at thefloridahavens.com
          </a>
        </section>
      </div>
    </main>
  );
}
