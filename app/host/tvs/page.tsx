import { redirect } from "next/navigation";
import { isHostAuthenticated } from "@/lib/host-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { listTvDevices } from "@/lib/tv";
import { pickActiveCampaign } from "@/lib/campaigns";
import { loadPairProfile } from "@/lib/pair-profile";
import {
  loadFleetNowPlayingContext,
  summarizeNowPlaying,
  type NowPlaying,
} from "@/lib/tv-now-playing";
import ApiForm from "../api-form";
import FleetGrid from "./fleet-grid";
import { isOnline } from "./fleet-utils";

async function loadProperties(): Promise<{ id: string; name: string }[]> {
  const db = supabaseAdmin();
  if (!db) return [];
  const { data } = await db.from("properties").select("id, name").order("name");
  return data ?? [];
}

export default async function TvManagementPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; err?: string }>;
}) {
  if (!(await isHostAuthenticated())) redirect("/host/login");

  const { ok, err } = await searchParams;
  const [devices, properties, pairProfile] = await Promise.all([
    listTvDevices(),
    loadProperties(),
    loadPairProfile(),
  ]);
  const live = Boolean(supabaseAdmin());

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
  const nowPlayingByDevice = new Map<string, NowPlaying>();
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
      </header>
      <p className="mt-2 text-ocean-900/70">
        Every screen that has opened the TV app — grouped by property. Tap a
        tile for link/unlink, reload, rename, and full Now details. Link/unlink
        applies in about one poll (~10s); unlinking returns a TV to its pairing
        code.
      </p>

      {live && devices.length > 0 && (
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

      {!live && (
        <p className="mt-6 text-ocean-900/60">
          Supabase isn&apos;t configured — TV management needs the database.
        </p>
      )}
      {live && devices.length === 0 && (
        <p className="mt-6 text-ocean-900/60">
          No TVs yet. Open <span className="font-mono">/tv</span> on a TV&apos;s
          browser and it will appear here with a pairing code.
        </p>
      )}

      {live && devices.length > 0 && (
        <FleetGrid
          devices={devices}
          properties={properties}
          nowPlayingByDevice={nowPlayingByDevice}
        />
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

      {live && devices.length > 0 && (
        <p className="mt-6 text-sm text-ocean-900/45">
          Online = polled within 90s. Occupied = active in-house reservation.
          Now = expected mode + timeline from property settings (S0.3 proxy —
          never a bedroom screenshot). Deploy SHA on device rows deferred.
        </p>
      )}
    </main>
  );
}