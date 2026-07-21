import { redirect } from "next/navigation";
import { isHostAuthenticated } from "@/lib/host-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { listRecentTurnovers, TURNOVER_ITEMS } from "@/lib/turnover";
import { completeTurnoverAction } from "./actions";

async function loadProperties(): Promise<{ id: string; name: string }[]> {
  const db = supabaseAdmin();
  if (!db) return [];
  const { data } = await db.from("properties").select("id, name").order("name");
  return data ?? [];
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function TurnoverPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; err?: string }>;
}) {
  if (!(await isHostAuthenticated())) redirect("/host/login");

  const { ok, err } = await searchParams;
  const [properties, recent] = await Promise.all([
    loadProperties(),
    listRecentTurnovers(),
  ]);
  const live = Boolean(supabaseAdmin());

  return (
    <main className="mx-auto max-w-3xl p-4 pb-12 sm:p-6">
      <header>
        <h1 className="text-3xl font-bold text-ocean-700">Turnover media wipe</h1>
      </header>
      <p className="mt-2 text-ocean-900/70">
        Run this at every turnover. Guest logins are cleared by hand — the
        guide promises &quot;we clear logins after checkout,&quot; and this
        checklist is that promise.
      </p>

      {ok && (
        <p className="mt-4 rounded-xl bg-white p-3 font-semibold text-seafoam-500 shadow-sm">
          Turnover recorded — thank you.
        </p>
      )}
      {err && (
        <p className="mt-4 rounded-xl bg-white p-3 font-semibold text-red-600 shadow-sm">
          Couldn&apos;t save ({err}) — check that migration 0008 has run.
        </p>
      )}

      {!live ? (
        <p className="mt-6 text-ocean-900/60">
          Supabase isn&apos;t configured — the checklist needs the database.
        </p>
      ) : (
        <form
          action={completeTurnoverAction}
          className="mt-6 rounded-2xl bg-white p-6 shadow-md"
        >
          <label className="block font-semibold text-ocean-700">
            Property
            <select
              name="propertyId"
              required
              className="mt-2 block w-full rounded-xl border border-sand-300 bg-white p-3 text-lg outline-none focus:border-ocean-500"
            >
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>

          <fieldset className="mt-5 space-y-3">
            {TURNOVER_ITEMS.map((item) => (
              <label key={item.slug} className="flex items-center gap-3 text-lg">
                <input
                  type="checkbox"
                  name={`item-${item.slug}`}
                  className="h-5 w-5 accent-ocean-500"
                />
                {item.label}
              </label>
            ))}
          </fieldset>

          <textarea
            name="notes"
            placeholder="Notes (optional — e.g. 'guest left signed into Spotify, cleared it')"
            className="mt-5 w-full rounded-xl border border-sand-300 p-3 text-lg outline-none focus:border-ocean-500"
            rows={2}
          />

          <button
            type="submit"
            className="mt-4 w-full rounded-full bg-ocean-500 py-3 text-lg font-semibold text-white transition hover:bg-ocean-700"
          >
            Record turnover
          </button>
        </form>
      )}

      {recent.length > 0 && (
        <section className="mt-8">
          <h2 className="text-xl font-bold text-ocean-700">Recent turnovers</h2>
          <ul className="mt-3 space-y-2">
            {recent.map((r) => {
              const done = Object.values(r.items).filter(Boolean).length;
              return (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-xl bg-white p-4 shadow-sm"
                >
                  <span className="min-w-0 font-semibold">
                    {r.property_name ?? "—"}
                    {r.notes && (
                      <span className="ml-2 font-normal text-ocean-900/60">
                        “{r.notes}”
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-ocean-900/60">
                    {done}/{TURNOVER_ITEMS.length} · {fmt(r.completed_at)}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </main>
  );
}
