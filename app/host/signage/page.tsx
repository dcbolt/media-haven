import { redirect } from "next/navigation";
import { signageName } from "@/lib/content";
import { isHostAuthenticated } from "@/lib/host-auth";
import { loadSections } from "@/lib/reservations";
import { supabaseAdmin } from "@/lib/supabase";
import { signagePlaylist, signageTiming, type SignagePlaylist } from "@/lib/tv";
import SignageEditor, { type Block } from "./editor";

/**
 * Signage playlist editor (host request 2026-07-17, Canva-inspired MVP):
 * every rotation block as a draggable card on a horizontal timeline —
 * reorder, remove, set per-slide seconds — plus a tray of parked blocks and
 * an ambient-photos toggle. Publish writes settings.playlist; TVs honor it
 * within one poll. Event slides (farewell, launch day) always play and so
 * don't appear here.
 */

type PropertyRow = {
  id: string;
  name: string;
  settings?: { playlist?: unknown; signage?: unknown } | null;
};

async function loadProperties(): Promise<PropertyRow[]> {
  const db = supabaseAdmin();
  if (!db) return [];
  const { data } = await db
    .from("properties")
    .select("id, name, settings")
    .order("name");
  return (data as PropertyRow[]) ?? [];
}

/** The arrangeable rotation blocks, mirroring the TV's slide builder. Keys
 *  must match app/tv/page.tsx slide keys exactly. */
async function blockCatalog(propertyId: string): Promise<Block[]> {
  const sections = (await loadSections(propertyId)).filter((s) => s.showOnTv);
  return [
    { key: "welcome", title: "Welcome", kind: "Slide" },
    { key: "wifi", title: "Wi-Fi", kind: "Slide" },
    ...sections
      // the static launches blurb yields to the live board on the TV too
      .filter((s) => s.slug !== "launches")
      .map((s) => ({ key: s.slug, title: s.title, kind: "Guide" as const })),
    { key: "beach-day", title: "Today at the beach", kind: "Feed" },
    { key: "forecast-3", title: "3-day outlook", kind: "Feed" },
    { key: "forecast-5", title: "5-day outlook", kind: "Feed" },
    { key: "sea-turtles", title: "Sea turtles", kind: "Feed" },
    { key: "launch-board", title: "Rocket launches", kind: "Feed" },
    { key: "streaming", title: "Entertainment", kind: "Page" },
    { key: "casting", title: "Casting", kind: "Slide" },
    { key: "our-havens", title: "Our Havens (upsell)", kind: "Slide" },
    { key: "book-direct", title: "Book Direct", kind: "Slide" },
  ];
}

export default async function SignagePage({
  searchParams,
}: {
  searchParams: Promise<{ property?: string; ok?: string; err?: string }>;
}) {
  if (!(await isHostAuthenticated())) redirect("/host/login");
  const { property, ok, err } = await searchParams;

  const properties = await loadProperties();
  const live = Boolean(supabaseAdmin());
  const selected =
    properties.find((p) => p.id === property) ?? properties[0] ?? null;

  let blocks: Block[] = [];
  let playlist: SignagePlaylist | null = null;
  let defaultSeconds = 20;
  if (selected) {
    blocks = await blockCatalog(selected.id);
    playlist = signagePlaylist(selected.settings?.playlist);
    defaultSeconds = Math.round(
      signageTiming(
        selected.settings?.signage as Parameters<typeof signageTiming>[0]
      ).slideMs / 1000
    );
  }

  return (
    <main className="mx-auto max-w-5xl p-4 pb-12 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-ocean-700">Signage</h1>
          <p className="mt-2 text-ocean-900/70">
            Arrange the TV rotation like a timeline: drag blocks into order,
            set how long each rests, park what shouldn&apos;t play. Publish and
            every TV on the property updates in about 10 seconds.
          </p>
        </div>
        {properties.length > 1 && selected && (
          <form method="GET" className="shrink-0">
            <select
              name="property"
              defaultValue={selected.id}
              // dynamic sizing (host 2026-07-17): never wider than the page
              className="w-full max-w-[16rem] truncate rounded-xl border border-sand-300 bg-white p-2 font-semibold text-ocean-700 outline-none focus:border-ocean-500"
            >
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {signageName(p.name)}
                </option>
              ))}
            </select>
            <noscript>
              <button type="submit" className="ml-2 font-semibold text-ocean-500">
                Switch
              </button>
            </noscript>
          </form>
        )}
      </header>

      {ok && (
        <p className="mt-4 rounded-xl bg-white p-3 font-semibold text-seafoam-500 shadow-sm">
          {ok === "published"
            ? "Published — TVs pick it up within ~10 seconds."
            : "Reset to the default rotation."}
        </p>
      )}
      {err && (
        <p className="mt-4 rounded-xl bg-white p-3 font-semibold text-red-600 shadow-sm">
          That didn&apos;t work ({err}). The timeline needs at least one block.
        </p>
      )}

      {!live && (
        <p className="mt-6 text-ocean-900/60">
          Supabase isn&apos;t configured — the signage editor needs the
          database. The TV demo loop keeps playing its default rotation.
        </p>
      )}
      {live && !selected && (
        <p className="mt-6 text-ocean-900/60">
          No properties yet — sync Guesty from the dashboard first.
        </p>
      )}

      {selected && (
        <SignageEditor
          propertyId={selected.id}
          blocks={blocks}
          initial={playlist}
          defaultSeconds={defaultSeconds}
        />
      )}
    </main>
  );
}
