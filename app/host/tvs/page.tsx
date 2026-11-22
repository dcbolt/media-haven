import { redirect } from "next/navigation";
import { isHostAuthenticated } from "@/lib/host-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { listTvDevices, type TvDeviceRow } from "@/lib/tv";
import { pickActiveCampaign } from "@/lib/campaigns";
import { loadJoinedGroups } from "@/lib/joined-stays";
import { loadPairProfile } from "@/lib/pair-profile";
import {
  loadFleetNowPlayingContext,
  summarizeNowPlaying,
  type NowPlaying,
} from "@/lib/tv-now-playing";
import ApiForm from "../api-form";
import FleetGrid, { type FleetSection, type FleetTileTv } from "./fleet-grid";
import {
  FLEET_FIXTURE_DEVICES,
  FLEET_FIXTURE_NOW,
  FLEET_FIXTURE_PROPERTIES,
} from "./fleet-fixture";
import { isTvOnline, isTvStale } from "./fleet-helpers";

async function loadProperties(): Promise<{ id: string; name: string }[]> {
  const db = supabaseAdmin();
  if (!db) return [];
  const { data } = await db.from("properties").select("id, name").order("name");
  return data ?? [];
}

function toFleetTile(
  tv: TvDeviceRow,
  now: NowPlaying | undefined
): FleetTileTv {
  const online = isTvOnline(tv.last_seen);
  return {
    id: tv.id,
    label: tv.label,
    pair_code: tv.pair_code,
    property_id: tv.property_id,
    property_name: tv.property_name,
    last_seen: tv.last_seen,
    online,
    stale: isTvStale(tv.property_id, tv.last_seen),
    occupied: tv.occupied,
    guest_label: tv.guest_label,
    joined_name: tv.joined_name,
    joined_property_id: tv.joined_property_id,
    previewPropertyId: tv.property_id
      ? tv.joined_property_id ?? tv.property_id
      : null,
    now: now
      ? {
          mode: now.mode,
          headline: now.headline,
          detail: now.detail,
        }
      : null,
  };
}

function buildFleetSections(
  devices: TvDeviceRow[],
  properties: { id: string; name: string }[],
  joinedGroups: Awaited<ReturnType<typeof loadJoinedGroups>>,
  nowPlayingByDevice: Map<string, NowPlaying>
): { sections: FleetSection[]; unpaired: FleetTileTv[] } {
  const byProp = new Map<string, TvDeviceRow[]>();
  const unpairedRows: TvDeviceRow[] = [];
  for (const tv of devices) {
    if (!tv.property_id) {
      unpairedRows.push(tv);
      continue;
    }
    const arr = byProp.get(tv.property_id) ?? [];
    arr.push(tv);
    byProp.set(tv.property_id, arr);
  }

  const shortName = (n: string) => n.split(" - ")[0].trim() || n;
  const sectionsMeta: {
    id: string;
    name: string;
    indent: boolean;
    combo: boolean;
  }[] = [];
  const placed = new Set<string>();
  for (const g of joinedGroups) {
    const parent = properties.find((p) => p.id === g.joinedPropertyId);
    if (parent && !placed.has(parent.id)) {
      sectionsMeta.push({
        id: parent.id,
        name: shortName(parent.name),
        indent: false,
        combo: true,
      });
      placed.add(parent.id);
    }
    for (const mid of g.memberPropertyIds) {
      const m = properties.find((p) => p.id === mid);
      if (m && !placed.has(m.id)) {
        sectionsMeta.push({
          id: m.id,
          name: shortName(m.name),
          indent: true,
          combo: false,
        });
        placed.add(m.id);
      }
    }
  }
  for (const p of properties) {
    if (!placed.has(p.id)) {
      sectionsMeta.push({
        id: p.id,
        name: shortName(p.name),
        indent: false,
        combo: false,
      });
    }
  }

  const sections: FleetSection[] = sectionsMeta
    .filter((sec) => (byProp.get(sec.id) ?? []).length > 0)
    .map((sec) => {
      const tvs = byProp.get(sec.id) ?? [];
      const tiles = tvs.map((tv) =>
        toFleetTile(tv, nowPlayingByDevice.get(tv.id))
      );
      const onlineCount = tiles.filter((t) => t.online).length;
      return {
        ...sec,
        onlineCount,
        total: tiles.length,
        tvs: tiles,
      };
    });

  const unpaired = unpairedRows.map((tv) =>
    toFleetTile(tv, nowPlayingByDevice.get(tv.id))
  );
  return { sections, unpaired };
}

export default async function TvManagementPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; err?: string }>;
}) {
  if (!(await isHostAuthenticated())) redirect("/host/login");

  const { ok, err } = await searchParams;
  const live = Boolean(supabaseAdmin());
  const usingFixture = !live;

  const [devicesLive, propertiesLive, pairProfile, joinedGroups] =
    await Promise.all([
      live ? listTvDevices() : Promise.resolve([] as TvDeviceRow[]),
      live ? loadProperties() : Promise.resolve([]),
      loadPairProfile(),
      live ? loadJoinedGroups() : Promise.resolve([]),
    ]);

  const devices = usingFixture ? FLEET_FIXTURE_DEVICES : devicesLive;
  const properties = usingFixture ? FLEET_FIXTURE_PROPERTIES : propertiesLive;

  const nowPlayingByDevice = new Map<string, NowPlaying>();
  if (usingFixture) {
    for (const tv of devices) {
      nowPlayingByDevice.set(
        tv.id,
        FLEET_FIXTURE_NOW[tv.id] ?? {
          mode: "unlinked",
          headline: "Pairing code",
          detail: null,
        }
      );
    }
  } else if (live) {
    const contentPropertyIds = [
      ...new Set(
        devices
          .map((d) => d.joined_property_id || d.property_id)
          .filter((id): id is string => Boolean(id))
      ),
    ];
    const { byProperty, takeover, campaigns } = await loadFleetNowPlayingContext(
      contentPropertyIds
    );
    for (const tv of devices) {
      if (!tv.property_id) {
        nowPlayingByDevice.set(
          tv.id,
          summarizeNowPlaying({
            occupied: null,
            settings: null,
            takeover: null,
          })
        );
        continue;
      }
      const contentPid = tv.joined_property_id || tv.property_id;
      const pack = byProperty.get(contentPid);
      nowPlayingByDevice.set(
        tv.id,
        summarizeNowPlaying({
          occupied: tv.occupied,
          settings: pack?.settings ?? null,
          takeover,
          campaign: pickActiveCampaign(campaigns, contentPid),
        })
      );
    }
  }

  const online = devices.filter((d) => isTvOnline(d.last_seen)).length;
  const linked = devices.filter((d) => d.property_id).length;
  const occupied = devices.filter((d) => d.occupied === true).length;
  const vacant = devices.filter((d) => d.occupied === false).length;
  const stale = devices.filter(
    (d) => d.property_id && !isTvOnline(d.last_seen)
  ).length;

  const { sections, unpaired } = buildFleetSections(
    devices,
    properties,
    joinedGroups,
    nowPlayingByDevice
  );

  const showFleet = devices.length > 0;

  return (
    <main className="mx-auto max-w-7xl p-4 pb-12 sm:p-6">
      <header>
        <h1 className="text-3xl font-bold text-ocean-700">TVs · Fleet</h1>
      </header>
      <p className="mt-2 max-w-3xl text-ocean-900/70">
        Every screen that has opened the TV app — online freshness, room,
        property, occupied vs vacant, and what the property&apos;s rotation
        should be showing. Unpaired screens show a pairing code until linked.
        Tap a tile for link/unlink, reload, rename, and full now-playing detail.
      </p>

      {usingFixture && (
        <p className="mt-3 rounded-xl border border-dashed border-ocean-300 bg-ocean-50/80 px-3 py-2 text-sm font-medium text-ocean-800">
          Fixture fleet (no database) — sample names only, for layout preview in
          mock mode.
        </p>
      )}

      {showFleet && (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {[
            { label: "Online", value: `${online}/${devices.length}` },
            { label: "Linked", value: String(linked) },
            { label: "Occupied", value: String(occupied) },
            { label: "Vacant", value: String(vacant) },
            { label: "Stale", value: String(stale) },
          ].map((c) => (
            <div
              key={c.label}
              className="rounded-xl bg-white px-3 py-2 shadow-sm"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-ocean-900/45">
                {c.label}
              </p>
              <p className="text-xl font-bold text-ocean-700">{c.value}</p>
            </div>
          ))}
        </div>
      )}

      {ok && (
        <p className="mt-4 rounded-xl bg-white p-3 font-semibold text-seafoam-500 shadow-sm">
          {
            {
              linked: "TV linked — signage updates in ~10 seconds.",
              unlinked: "TV unlinked — it now shows its pairing code.",
              renamed: "TV renamed.",
              reloaded:
                "Reload queued — the TV kiosk should refresh within ~10 seconds if online.",
              "pair-profile": "Pair profile saved — applies on next claim/link.",
              forgotten:
                "TV forgotten. If it's still powered on, it will reappear with a fresh pairing code.",
            }[ok]
          }
        </p>
      )}
      {err && (
        <p className="mt-4 rounded-xl bg-white p-3 font-semibold text-red-600 shadow-sm">
          That didn&apos;t work ({err}). If renaming fails, migration 0007 may
          not have run yet.
        </p>
      )}

      {live && devices.length === 0 && (
        <p className="mt-6 text-ocean-900/60">
          No TVs yet. Open <span className="font-mono">/tv</span> on a TV&apos;s
          browser and it will appear here with a pairing code.
        </p>
      )}

      {showFleet && (
        <FleetGrid sections={sections} unpaired={unpaired} properties={properties} />
      )}

      {live && (
        <section className="mt-8 rounded-2xl bg-white p-5 shadow-md">
          <h2 className="text-lg font-bold text-ocean-700">Pair profile</h2>
          <p className="mt-1 text-sm text-ocean-900/55">
            Defaults applied when you link a TV to a property (S5.1). Settings
            only — no migration. Device class is stored on the org until
            column 0022 lands.
          </p>
          <ApiForm
            op="pair-profile"
            endpoint="/api/host/tvs"
            className="mt-4 space-y-3"
            successText="Pair profile saved"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs font-semibold text-ocean-900/50">
                Device class default
                <select
                  name="deviceClass"
                  defaultValue={pairProfile.deviceClass}
                  className="rounded-xl border border-sand-300 bg-sand-50 px-3 py-2 text-sm font-normal text-ocean-900"
                >
                  <option value="streamer">Streamer (entertainment SoC)</option>
                  <option value="signage">Signage (ambient only)</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold text-ocean-900/50">
                Label prefix
                <input
                  name="labelPrefix"
                  defaultValue={pairProfile.labelPrefix}
                  placeholder="Living"
                  maxLength={24}
                  className="rounded-xl border border-sand-300 bg-sand-50 px-3 py-2 text-sm font-normal text-ocean-900"
                />
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm text-ocean-800">
              <input
                type="checkbox"
                name="autoLabel"
                value="on"
                defaultChecked={pairProfile.autoLabel}
                className="h-4 w-4 rounded border-sand-300"
              />
              Auto-label blank TVs as &quot;Prefix · Property&quot; on claim
            </label>
            <label className="flex items-center gap-2 text-sm text-ocean-800">
              <input
                type="checkbox"
                name="seedPlaylistIfEmpty"
                value="on"
                defaultChecked={pairProfile.seedPlaylistIfEmpty}
                className="h-4 w-4 rounded border-sand-300"
              />
              If property has no guest playlist, seed Beach day pack on claim
            </label>
            <button
              type="submit"
              className="rounded-full bg-ocean-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-ocean-700"
            >
              Save pair profile
            </button>
          </ApiForm>
        </section>
      )}

      {showFleet && (
        <p className="mt-6 text-sm text-ocean-900/45">
          Online = polled within 90s. Stale = linked but heartbeat aged out.
          Occupied = active in-house reservation. Now = expected mode + timeline
          from property settings (S0.3 proxy — never a bedroom screenshot).
        </p>
      )}
    </main>
  );
}