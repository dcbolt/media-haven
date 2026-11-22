import { notFound, redirect } from "next/navigation";
import { isHostAuthenticated } from "@/lib/host-auth";
import FleetGrid from "../fleet-grid";
import { isOnline } from "../fleet-utils";
import {
  FIXTURE_DEVICES,
  FIXTURE_PROPERTIES,
  fixtureNowPlayingMap,
} from "../fleet-fixtures";

/**
 * Dev-only fleet layout preview with anonymized fixture data (screenshots / QA).
 * Not available in production builds.
 */
export default async function FleetFixturePreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  if (!(await isHostAuthenticated())) redirect("/host/login");

  const devices = FIXTURE_DEVICES;
  const properties = [...FIXTURE_PROPERTIES];
  const nowPlayingByDevice = fixtureNowPlayingMap();

  const online = devices.filter((d) => isOnline(d.last_seen)).length;
  const linked = devices.filter((d) => d.property_id).length;
  const occupied = devices.filter((d) => d.occupied === true).length;
  const vacant = devices.filter((d) => d.occupied === false).length;
  const stale = devices.filter(
    (d) => d.property_id && !isOnline(d.last_seen)
  ).length;

  return (
    <main className="mx-auto max-w-7xl p-4 pb-12 sm:p-6">
      <header>
        <h1 className="text-3xl font-bold text-ocean-700">TVs · Fleet</h1>
        <p className="mt-1 text-sm font-semibold text-amber-800">
          Fixture preview (development only) — no live guest data
        </p>
      </header>
      <p className="mt-2 text-ocean-900/70">
        Layout reference with sample properties and screens. Controls post to the
        same APIs but IDs are not in the database.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {[
          { label: "Online", value: `${online}/${devices.length}` },
          { label: "Linked", value: String(linked) },
          { label: "Occupied", value: String(occupied) },
          { label: "Vacant", value: String(vacant) },
          { label: "Stale", value: String(stale) },
        ].map((c) => (
          <div key={c.label} className="rounded-xl bg-white px-3 py-2 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-ocean-900/45">
              {c.label}
            </p>
            <p className="text-xl font-bold text-ocean-700">{c.value}</p>
          </div>
        ))}
      </div>

      <FleetGrid
        devices={devices}
        properties={properties}
        nowPlayingByDevice={nowPlayingByDevice}
      />
    </main>
  );
}