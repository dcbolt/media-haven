import type { NowPlaying } from "@/lib/tv-now-playing";
import type { TvDeviceRow } from "@/lib/tv";
import TvFleetTile from "./tv-fleet-tile";
import { buildPropertySections, guestFirstName } from "./fleet-utils";

export default function FleetGrid({
  devices,
  properties,
  nowPlayingByDevice,
}: {
  devices: TvDeviceRow[];
  properties: { id: string; name: string }[];
  nowPlayingByDevice: Map<string, NowPlaying>;
}) {
  const { sections, unassigned } = buildPropertySections(devices, properties);

  const tileGrid =
    "grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4";

  return (
    <div className="mt-6 space-y-8">
      {sections.map((sec) => {
        const guest = guestFirstName(sec.guestLabel);
        const occupancy =
          sec.occupied === true
            ? `Occupied${guest ? ` · ${guest}` : ""}`
            : sec.occupied === false
              ? "Vacant"
              : "—";
        return (
          <section key={sec.propertyId} aria-labelledby={`prop-${sec.propertyId}`}>
            <header
              id={`prop-${sec.propertyId}`}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-ocean-500/20 pb-2"
            >
              <h2 className="text-lg font-bold text-ocean-700">{sec.name}</h2>
              <span
                className={
                  sec.occupied === true
                    ? "text-sm font-semibold text-seafoam-600"
                    : "text-sm font-semibold text-ocean-900/50"
                }
              >
                {occupancy}
              </span>
              {sec.combined && (
                <span className="rounded-full bg-ocean-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ocean-700">
                  Combined stay
                </span>
              )}
              <span className="text-sm font-medium text-ocean-900/45">
                {sec.onlineCount}/{sec.tvs.length} online
              </span>
            </header>
            <div className={`mt-3 ${tileGrid}`}>
              {sec.tvs.map((tv) => (
                <TvFleetTile
                  key={tv.id}
                  tv={tv}
                  now={nowPlayingByDevice.get(tv.id)}
                  properties={properties}
                />
              ))}
            </div>
          </section>
        );
      })}

      {unassigned.length > 0 && (
        <section aria-labelledby="fleet-unassigned">
          <header
            id="fleet-unassigned"
            className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-sand-300 pb-2"
          >
            <h2 className="text-lg font-bold text-ocean-900/55">Unassigned</h2>
            <span className="text-sm font-medium text-ocean-900/45">
              {unassigned.length} screen{unassigned.length === 1 ? "" : "s"} · awaiting property link
            </span>
          </header>
          <div className={`mt-3 ${tileGrid}`}>
            {unassigned.map((tv) => (
              <TvFleetTile
                key={tv.id}
                tv={tv}
                now={nowPlayingByDevice.get(tv.id)}
                properties={properties}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}