import { redirect } from "next/navigation";
import { isHostAuthenticated } from "@/lib/host-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { listTvDevices } from "@/lib/tv";
import {
  assignTvAction,
  forgetTvAction,
  renameTvAction,
  unlinkTvAction,
} from "./actions";

/** A TV is "online" if it has polled within 90s (poll interval is 30s). */
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
  const [devices, properties] = await Promise.all([
    listTvDevices(),
    loadProperties(),
  ]);
  const live = Boolean(supabaseAdmin());

  return (
    <main className="mx-auto max-w-4xl p-4 pb-12 sm:p-6">
      <header>
        <h1 className="text-3xl font-bold text-ocean-700">TVs</h1>
      </header>
      <p className="mt-2 text-ocean-900/70">
        Every screen that has ever opened the TV app. Link a TV to a property
        and it switches to that property&apos;s signage within 30 seconds;
        unlink it and it returns to its pairing code.
      </p>

      {ok && (
        <p className="mt-4 rounded-xl bg-white p-3 font-semibold text-seafoam-500 shadow-sm">
          {
            {
              linked: "TV linked — signage updates within 30 seconds.",
              unlinked: "TV unlinked — it now shows its pairing code.",
              renamed: "TV renamed.",
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

      <div className="mt-6 space-y-4">
        {devices.map((tv) => (
          <div key={tv.id} className="rounded-2xl bg-white p-5 shadow-md">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span
                  className={`h-3 w-3 rounded-full ${
                    isOnline(tv.last_seen) ? "bg-seafoam-500" : "bg-sand-300"
                  }`}
                  title={isOnline(tv.last_seen) ? "online" : "offline"}
                />
                <div>
                  <p className="text-lg font-semibold">
                    {tv.label ?? "Unnamed TV"}{" "}
                    <span className="font-mono text-sm text-ocean-900/50">
                      {tv.pair_code}
                    </span>
                  </p>
                  <p className="text-sm text-ocean-900/60">
                    {tv.property_name
                      ? `Linked to ${tv.property_name}`
                      : "Unlinked — showing pairing code"}{" "}
                    · seen {ago(tv.last_seen)}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <form action={assignTvAction} className="flex items-center gap-2">
                  <input type="hidden" name="deviceId" value={tv.id} />
                  <select
                    name="propertyId"
                    defaultValue={tv.property_id ?? ""}
                    className="rounded-xl border border-sand-300 bg-white p-2 outline-none focus:border-ocean-500"
                  >
                    <option value="">— no property —</option>
                    {properties.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    className="rounded-full bg-ocean-500 px-4 py-2 font-semibold text-white transition hover:bg-ocean-700"
                  >
                    Link
                  </button>
                </form>
                {tv.property_id && (
                  <form action={unlinkTvAction}>
                    <input type="hidden" name="deviceId" value={tv.id} />
                    <button
                      type="submit"
                      className="rounded-full border border-ocean-500 px-4 py-2 font-semibold text-ocean-700 transition hover:bg-ocean-50"
                    >
                      Unlink
                    </button>
                  </form>
                )}
                <form action={forgetTvAction}>
                  <input type="hidden" name="deviceId" value={tv.id} />
                  <button
                    type="submit"
                    className="rounded-full border border-sand-300 px-4 py-2 font-semibold text-ocean-900/60 transition hover:bg-sand-100"
                  >
                    Forget
                  </button>
                </form>
              </div>
            </div>

            <form action={renameTvAction} className="mt-3 flex items-center gap-2">
              <input type="hidden" name="deviceId" value={tv.id} />
              <input
                name="label"
                defaultValue={tv.label ?? ""}
                placeholder='Name this TV (e.g. "Living Room")'
                className="min-w-0 flex-1 rounded-xl border border-sand-300 p-2 outline-none focus:border-ocean-500"
              />
              <button
                type="submit"
                className="rounded-full border border-ocean-500 px-4 py-2 font-semibold text-ocean-700 transition hover:bg-ocean-50"
              >
                Save name
              </button>
            </form>
          </div>
        ))}
      </div>
    </main>
  );
}
