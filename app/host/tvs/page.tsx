import { redirect } from "next/navigation";
import { signageName } from "@/lib/content";
import { isHostAuthenticated } from "@/lib/host-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { listTvDevices } from "@/lib/tv";
import { pickActiveCampaign } from "@/lib/campaigns";
import { loadJoinedGroups } from "@/lib/joined-stays";
import { loadPairProfile } from "@/lib/pair-profile";
import {
  loadFleetNowPlayingContext,
  summarizeNowPlaying,
  type NowPlaying,
} from "@/lib/tv-now-playing";
import ApiForm from "../api-form";
import PropertySelect from "./property-select";

/** A TV is "online" if it has polled within 90s (poll interval is 10s). */
function isOnline(lastSeen: string): boolean {
  return Date.now() - new Date(lastSeen).getTime() < 90_000;
}

function ago(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

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
  const [devices, properties, pairProfile, joinedGroups] = await Promise.all([
    listTvDevices(),
    loadProperties(),
    loadPairProfile(),
    loadJoinedGroups(),
  ]);
  const live = Boolean(supabaseAdmin());

  // S0.3: batch settings + takeover once; summarize per linked TV (no pixels).
  // J2: when a member house is under a live joined stay, now-playing uses the
  // joined listing's settings (what the TV actually serves).
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
    <main className="mx-auto max-w-4xl p-4 pb-12 sm:p-6">
      <header>
        <h1 className="text-3xl font-bold text-ocean-700">TVs · Fleet</h1>
      </header>
      <p className="mt-2 text-ocean-900/70">
        Every screen that has opened the TV app — online freshness, room,
        property, occupied vs vacant, and what the property&apos;s rotation
        should be showing (mode + timeline — never a guest-room screenshot).
        Link/unlink applies in about one poll (~10s); unlinking returns a TV
        to its pairing code.
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

      {(() => {
        // Fleet hierarchy (host 2026-07-25): TVs grouped under their
        // property, with member villas nested beneath their combined
        // listing (joinedStays config), and unpaired screens last.
        const renderCard = (tv: (typeof devices)[number]) => {
          const onlineNow = isOnline(tv.last_seen);
            const modeLabel =
              tv.occupied === true
                ? `Occupied${tv.guest_label ? ` · ${tv.guest_label}` : ""}`
                : tv.occupied === false
                  ? "Vacant"
                  : "Unlinked";
            const now = nowPlayingByDevice.get(tv.id);
            const nowTone =
              now?.mode === "emergency"
                ? "text-amber-800 bg-amber-50 border-amber-200"
                : now?.mode === "vacant"
                  ? "text-ocean-800/80 bg-ocean-50 border-ocean-100"
                  : now?.mode === "guest"
                    ? "text-seafoam-800 bg-seafoam-50/80 border-seafoam-100"
                    : "text-ocean-900/55 bg-sand-50 border-sand-200";
            return (
              <div key={tv.id} className="rounded-2xl bg-white p-5 shadow-md">
                {/* Card anatomy (host 2026-07-24): thumbnail | info | controls —
                    columns on phones, one row on wide screens. The info column
                    keeps a real minimum width so text never folds word-per-line. */}
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
                  {/* Live thumbnail: a scaled render of the deck this TV serves
                      right now — server-computed rotation (joined listing when a
                      joined stay is live), never a screenshot of the guest's
                      actual screen. Online dot rides the corner. */}
                  {tv.property_id ? (
                    <span className="relative h-[117px] w-52 shrink-0 overflow-hidden rounded-xl bg-black ring-1 ring-black/10">
                      <iframe
                        src={`/tv?property=${tv.joined_property_id ?? tv.property_id}`}
                        title={`Live rotation preview — ${tv.label ?? tv.pair_code}`}
                        loading="lazy"
                        className="pointer-events-none origin-top-left"
                        style={{
                          width: 1920,
                          height: 1080,
                          transform: "scale(0.10833)",
                        }}
                      />
                      {!onlineNow && (
                        <span className="absolute inset-0 flex items-center justify-center bg-black/60 text-[11px] font-bold uppercase tracking-wider text-amber-400">
                          offline
                        </span>
                      )}
                      <span
                        className={`absolute right-1.5 top-1.5 h-3 w-3 rounded-full ring-2 ring-black/40 ${
                          onlineNow ? "bg-seafoam-500" : "bg-sand-300"
                        }`}
                        title={onlineNow ? "online" : "offline"}
                      />
                    </span>
                  ) : (
                    <span className="relative flex h-[117px] w-52 shrink-0 items-center justify-center rounded-xl bg-ocean-900/10 text-[11px] font-semibold uppercase tracking-wider text-ocean-900/40 ring-1 ring-black/5">
                      pairing
                      <span
                        className={`absolute right-1.5 top-1.5 h-3 w-3 rounded-full ${
                          onlineNow ? "bg-seafoam-500" : "bg-sand-300"
                        }`}
                        title={onlineNow ? "online" : "offline"}
                      />
                    </span>
                  )}
                  <div className="min-w-[16rem] flex-1">
                      <p className="text-lg font-semibold">
                        {tv.label ?? "Unnamed TV"}{" "}
                        <span className="font-mono text-sm text-ocean-900/50">
                          {tv.pair_code}
                        </span>
                      </p>
                      <p className="text-sm text-ocean-900/60">
                        {tv.property_name
                          ? signageName(tv.property_name)
                          : "No property"}{" "}
                        {tv.joined_name ? (
                          <span
                            className="ml-1 rounded-full bg-ocean-500/15 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-ocean-700"
                            title={`Joined stay live — TVs show “${tv.joined_name}” content (own Wi-Fi kept)`}
                          >
                            Joined · {tv.joined_name}
                          </span>
                        ) : null}{" "}
                        ·{" "}
                        <span
                          className={
                            tv.occupied === true
                              ? "font-semibold text-seafoam-600"
                              : tv.occupied === false
                                ? "font-semibold text-ocean-900/50"
                                : ""
                          }
                        >
                          {modeLabel}
                        </span>{" "}
                        · seen {ago(tv.last_seen)}
                        {!onlineNow && tv.property_id ? (
                          <span className="ml-1 font-semibold text-amber-700">
                            · offline
                          </span>
                        ) : null}
                      </p>
                      {now && (
                        <p
                          className={`mt-2 inline-block max-w-md rounded-lg border px-2.5 py-1.5 text-sm ${nowTone}`}
                          title="Expected content for this property — not a live pixel capture"
                        >
                          <span className="font-semibold">Now · </span>
                          {now.headline}
                          {now.detail ? (
                            <span className="mt-0.5 block text-xs opacity-80">
                              {now.detail}
                            </span>
                          ) : null}
                        </p>
                      )}
                    <p className="mt-0.5 font-mono text-xs text-ocean-900/35">
                      {tv.id.slice(0, 8)}…
                    </p>
                  </div>
  
                  <div className="flex w-full shrink-0 flex-wrap items-center gap-2 lg:w-64">
                    <ApiForm
                      op="assign"
                      endpoint="/api/host/tvs"
                      className="flex w-full min-w-0 items-center gap-2"
                      successText="Linked"
                    >
                      <input type="hidden" name="deviceId" value={tv.id} />
                      <PropertySelect
                        name="propertyId"
                        defaultValue={tv.property_id ?? ""}
                        options={[
                          { value: "", label: "— no property —" },
                          ...properties.map((p) => ({
                            value: p.id,
                            label: signageName(p.name),
                            title: p.name,
                          })),
                        ]}
                      />
                      <noscript>
                        <button
                          type="submit"
                          className="rounded-full bg-ocean-500 px-4 py-2 font-semibold text-white transition hover:bg-ocean-700"
                        >
                          Link
                        </button>
                      </noscript>
                    </ApiForm>
                    {tv.property_id && (
                      <ApiForm
                        op="unlink"
                        endpoint="/api/host/tvs"
                        successText="Unlinked"
                        className="min-w-0 flex-1"
                      >
                        <input type="hidden" name="deviceId" value={tv.id} />
                        <button
                          type="submit"
                          className="w-full rounded-full border border-ocean-500 px-3 py-2 text-sm font-semibold text-ocean-700 transition hover:bg-ocean-50"
                        >
                          Unlink
                        </button>
                      </ApiForm>
                    )}
                    <ApiForm
                      op="reload"
                      endpoint="/api/host/tvs"
                      className="min-w-0 flex-1"
                      successText="Reload queued"
                      confirmText="Force-reload this TV kiosk? It refreshes within ~10s if online."
                    >
                      <input type="hidden" name="deviceId" value={tv.id} />
                      <button
                        type="submit"
                        className="w-full rounded-full border border-ocean-500 px-3 py-2 text-sm font-semibold text-ocean-700 transition hover:bg-ocean-50"
                      >
                        Reload
                      </button>
                    </ApiForm>
                    <ApiForm
                      op="forget"
                      endpoint="/api/host/tvs"
                      className="min-w-0 flex-1"
                      successText="Forgotten"
                      confirmText="Forget this TV? It reappears with a new pairing code if still online."
                    >
                      <input type="hidden" name="deviceId" value={tv.id} />
                      <button
                        type="submit"
                        className="w-full rounded-full border border-sand-300 px-3 py-2 text-sm font-semibold text-ocean-900/60 transition hover:bg-sand-100"
                      >
                        Forget
                      </button>
                    </ApiForm>
                  </div>
                </div>
  
                <ApiForm
                  op="rename"
                  endpoint="/api/host/tvs"
                  className="mt-3 flex items-center gap-2"
                  successText="Name saved"
                >
                  <input type="hidden" name="deviceId" value={tv.id} />
                  <input
                    name="label"
                    defaultValue={tv.label ?? ""}
                    placeholder='Name this TV (e.g. "Living Room")'
                    className="min-w-0 flex-1 rounded-xl border border-sand-300 p-2 outline-none focus:border-ocean-500"
                  />
                  <button
                    type="submit"
                    className="w-full rounded-full border border-ocean-500 px-3 py-2 text-sm font-semibold text-ocean-700 transition hover:bg-ocean-50"
                  >
                    Save name
                  </button>
                </ApiForm>
              </div>
            );
  
        };
        const byProp = new Map<string, typeof devices>();
        const unpaired: typeof devices = [];
        for (const tv of devices) {
          if (!tv.property_id) { unpaired.push(tv); continue; }
          const arr = byProp.get(tv.property_id) ?? [];
          arr.push(tv);
          byProp.set(tv.property_id, arr);
        }
        const shortName = (n: string) => n.split(" - ")[0].trim() || n;
        const sections: { id: string; name: string; indent: boolean; combo: boolean }[] = [];
        const placed = new Set<string>();
        for (const g of joinedGroups) {
          const parent = properties.find((p) => p.id === g.joinedPropertyId);
          if (parent && !placed.has(parent.id)) {
            sections.push({ id: parent.id, name: shortName(parent.name), indent: false, combo: true });
            placed.add(parent.id);
          }
          for (const mid of g.memberPropertyIds) {
            const m = properties.find((p) => p.id === mid);
            if (m && !placed.has(m.id)) {
              sections.push({ id: m.id, name: shortName(m.name), indent: true, combo: false });
              placed.add(m.id);
            }
          }
        }
        for (const p of properties) {
          if (!placed.has(p.id)) sections.push({ id: p.id, name: shortName(p.name), indent: false, combo: false });
        }
        return (
          <div className="mt-6 space-y-5">
            {sections
              .filter((sec) => (byProp.get(sec.id) ?? []).length > 0)
              .map((sec) => {
                const tvs = byProp.get(sec.id) ?? [];
                return (
                  <section key={sec.id} className={sec.indent ? "ml-4 sm:ml-8" : ""}>
                    <h2 className="flex items-baseline gap-2 px-1 text-sm font-bold uppercase tracking-wide text-ocean-700">
                      {sec.indent && <span className="text-ocean-400">⌐</span>}
                      {sec.name}
                      {sec.combo && (
                        <span className="rounded-full bg-ocean-500/15 px-2 py-0.5 text-[10px] font-bold text-ocean-700">
                          Combined
                        </span>
                      )}
                      <span className="text-xs font-medium normal-case text-ocean-900/45">
                        {tvs.length} TV{tvs.length === 1 ? "" : "s"}
                      </span>
                    </h2>
                    <div className="mt-2 space-y-4">{tvs.map(renderCard)}</div>
                  </section>
                );
              })}
            {unpaired.length > 0 && (
              <section>
                <h2 className="px-1 text-sm font-bold uppercase tracking-wide text-ocean-900/50">
                  Awaiting pairing
                  <span className="ml-2 text-xs font-medium normal-case text-ocean-900/45">
                    {unpaired.length} screen{unpaired.length === 1 ? "" : "s"}
                  </span>
                </h2>
                <div className="mt-2 space-y-4">{unpaired.map(renderCard)}</div>
              </section>
            )}
          </div>
        );
      })()}

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
