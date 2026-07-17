import { resolveGuestToken, formatTideTime } from "@/lib/reservations";
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
  const checkOutTime = new Date(view.checkOut).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  const navItems = [
    ...(view.lastNight ? [{ id: "checkout", label: "Checkout" }] : []),
    ...(property.wifiSsid ? [{ id: "wifi", label: "Wi-Fi" }] : []),
    { id: "streaming", label: "Streaming" },
    ...((view.weather || view.tides?.length || view.sun)
      ? [{ id: "beach-day", label: "Beach day" }]
      : []),
    ...((view.launches?.length ?? 0) > 0
      ? [{ id: "rockets", label: "Rockets" }]
      : []),
    ...property.sections.map((s) => ({ id: s.slug, label: s.title })),
    { id: "book", label: "Book again" },
  ];

  return (
    <main className="mx-auto max-w-2xl p-4 pb-12 sm:p-6">
      <header
        className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-ocean-500 to-ocean-700 p-8 text-white shadow-lg"
        style={
          property.heroImageUrl
            ? {
                backgroundImage: `linear-gradient(to top, rgba(18,51,63,0.88), rgba(18,51,63,0.45)), url(${property.heroImageUrl})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }
            : undefined
        }
      >
        {property.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={property.logoUrl}
            alt=""
            className="mb-4 h-20 w-auto object-contain"
          />
        )}
        <p className="text-lg opacity-90">Welcome to</p>
        <h1 className="mt-1 text-4xl font-bold">{property.name}</h1>
        <p className="mt-4 text-xl">
          Hi {view.guestFirstName} — make yourself at home. You&apos;re with us
          through {checkOut}.
        </p>
        {view.weather && (
          <p className="mt-3 text-base text-white/85">
            Now: {view.weather.tempF}°F · {view.weather.label}
          </p>
        )}
      </header>

      <QuickNav items={navItems} />

      <div className="mt-4 space-y-6">
        {/* Phase 1.4 — last-night / checkout-morning hard conversion */}
        {view.lastNight && (
          <section
            id="checkout"
            className="scroll-mt-4 rounded-2xl border-2 border-seafoam-400 bg-ocean-700 p-6 text-white shadow-lg"
          >
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-seafoam-300">
              {view.departureDay ? "Departure day" : "Leaving soon"}
            </p>
            <h2 className="mt-1 font-serif text-3xl font-semibold">
              {view.departureDay ? "Bon voyage" : "Until next time"},{" "}
              {view.guestFirstName}
            </h2>
            <p className="mt-3 text-lg text-white/90">
              Check-out is {view.departureDay ? "today" : checkOut}
              {checkOutTime ? ` around ${checkOutTime}` : ""}. Start the
              dishwasher, bag trash, bring in beach gear, and leave keys where
              you found them.
            </p>
            <p className="mt-4 text-lg font-semibold text-seafoam-300">
              These exact dates next year —{" "}
              {formatDateRangeNextYear(view.checkIn, view.checkOut)} — book
              direct and skip the OTA fees.
            </p>
            <a
              href={property.bookUrlNextYear}
              className="mt-5 block rounded-full bg-white py-3.5 text-center text-lg font-semibold text-ocean-700 transition hover:bg-sand-100"
            >
              Reserve next year now
            </a>
          </section>
        )}

        {property.wifiSsid && property.wifiPassword && (
          <div id="wifi" className="scroll-mt-4">
            <WifiCard
              ssid={property.wifiSsid}
              password={property.wifiPassword}
            />
          </div>
        )}
        <div id="streaming" className="scroll-mt-4">
          <StreamingGuide services={property.streaming} />
        </div>

        {/* Phase 1.3 / 1.5 — weather + tides on phone */}
        {(view.weather || view.sun || (view.tides && view.tides.length > 0)) && (
          <section
            id="beach-day"
            className="scroll-mt-4 rounded-2xl bg-white p-6 shadow-md"
          >
            <h2 className="text-xl font-bold text-ocean-700">
              Today at the beach
            </h2>
            {view.weather && (
              <p className="mt-2 text-lg text-ocean-900/85">
                <span className="font-semibold">{view.weather.tempF}°F</span>
                {view.weather.label ? ` · ${view.weather.label}` : ""}
              </p>
            )}
            {view.sun && (
              <p className="mt-2 text-base text-ocean-900/75">
                Sunrise{" "}
                <span className="font-semibold">
                  {new Date(view.sun.sunrise).toLocaleTimeString("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
                {" · "}
                Sunset{" "}
                <span className="font-semibold">
                  {new Date(view.sun.sunset).toLocaleTimeString("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
              </p>
            )}
            {view.tides && view.tides.length > 0 && (
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {view.tides.map((t) => (
                  <div
                    key={t.time}
                    className="rounded-xl bg-ocean-50 px-3 py-3 text-center"
                  >
                    <p className="text-xs font-semibold uppercase tracking-wider text-ocean-500">
                      {t.type === "high" ? "High tide" : "Low tide"}
                    </p>
                    <p className="mt-1 text-lg font-bold text-ocean-800">
                      {formatTideTime(t.time)}
                    </p>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-3 text-sm text-ocean-900/60">
              Low tide is the best shelling and the firmest sand for walking.
            </p>
          </section>
        )}

        {/* Phase 1.5 — rockets on phone */}
        {view.launches && view.launches.length > 0 && (
          <section
            id="rockets"
            className="scroll-mt-4 rounded-2xl bg-white p-6 shadow-md"
          >
            <h2 className="text-xl font-bold text-ocean-700">
              Rocket launches
            </h2>
            <p className="mt-1 text-sm text-ocean-900/65">
              Often visible from Melbourne Beach / Indialantic — watch from the
              sand or the deck. Windows slip; this is a best-effort schedule.
            </p>
            <ul className="mt-4 space-y-3">
              {view.launches.slice(0, 4).map((l) => (
                <li
                  key={l.net + l.name}
                  className="rounded-xl border border-sand-200 bg-sand-50 px-4 py-3"
                >
                  <p className="font-semibold text-ocean-800">{l.name}</p>
                  <p className="mt-1 text-sm text-ocean-900/70">
                    {new Date(l.net).toLocaleString("en-US", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                    {l.vehicle ? ` · ${l.vehicle}` : ""}
                    {l.status ? ` · ${l.status}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}

        {property.sections.map((s) => (
          <InfoSection key={s.slug} id={s.slug} title={s.title} body={s.body} />
        ))}

        <LaunchAlerts />

        <section
          id="book"
          className={`scroll-mt-4 rounded-2xl p-6 text-white shadow-md ${
            view.lastNight
              ? "bg-gradient-to-br from-seafoam-600 to-ocean-700"
              : "bg-gradient-to-br from-ocean-500 to-ocean-700"
          }`}
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
            — are open for returning guests first.
          </p>
          <a
            href={property.bookUrlNextYear}
            className="mt-4 block rounded-full bg-white py-3 text-center text-lg font-semibold text-ocean-700 transition hover:bg-sand-100"
          >
            Book this home direct
          </a>
        </section>
      </div>
    </main>
  );
}
