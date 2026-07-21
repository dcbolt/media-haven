import { redirect } from "next/navigation";
import { signageName } from "@/lib/content";
import { isHostAuthenticated } from "@/lib/host-auth";
import { loadSections } from "@/lib/reservations";
import { listScreensavers } from "@/lib/screensavers";
import { supabaseAdmin } from "@/lib/supabase";
import { loadCampaigns } from "@/lib/campaigns";
import { loadChannels } from "@/lib/channels";
import {
  allTags,
  loadMediaMeta,
  type MediaMetaMap,
} from "@/lib/media-meta";
import {
  playlistHistory,
  signagePlaylist,
  signageTiming,
  type SignagePlaylist,
} from "@/lib/tv";
import SignageEditor, { type Block, type MediaAsset } from "./editor";
import PropertyPicker from "./property-picker";

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
  photos?: unknown;
  settings?: {
    playlist?: unknown;
    playlistHistory?: unknown;
    vacantPlaylist?: unknown;
    vacantPlaylistHistory?: unknown;
    signage?: unknown;
  } | null;
};

async function loadProperties(): Promise<PropertyRow[]> {
  const db = supabaseAdmin();
  if (!db) return [];
  const { data } = await db
    .from("properties")
    .select("id, name, photos, settings")
    .order("name");
  return (data as PropertyRow[]) ?? [];
}

/** Draggable media pool: Drive folder + Blob/default media + the listing's
 *  Guesty photos (host choice 2026-07-17: everything). Deduped by URL.
 *  S2.1: merge org mediaMeta (title/tags/expiry); expired stay in the list
 *  so the editor can show them when "Show expired" is on — the editor
 *  filters them from the default grid. */
async function mediaPool(
  p: PropertyRow,
  meta: MediaMetaMap
): Promise<MediaAsset[]> {
  const screensavers = await listScreensavers(p.id);
  const photos = Array.isArray(p.photos)
    ? (p.photos as string[]).filter((u) => typeof u === "string")
    : [];
  const seen = new Set<string>();
  return [
    ...screensavers.map((a) => ({ url: a.url, type: a.type })),
    ...photos.map((url) => ({ url, type: "image" as const })),
  ]
    .filter((a) => {
      if (seen.has(a.url)) return false;
      seen.add(a.url);
      return true;
    })
    .map((a) => {
      const m = meta[a.url];
      if (!m) return a;
      return {
        ...a,
        ...(m.title ? { title: m.title } : null),
        ...(m.tags.length ? { tags: m.tags } : null),
        ...(m.expiresAt ? { expiresAt: m.expiresAt } : null),
      };
    });
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
  let media: MediaAsset[] = [];
  let knownTags: string[] = [];
  let channels: {
    id: string;
    name: string;
    blocks: number;
    media: number;
  }[] = [];
  let campaigns: {
    id: string;
    name: string;
    startDate: string;
    endDate: string;
    blocks: number;
    media: number;
    propertyIds: string[];
  }[] = [];
  let playlist: SignagePlaylist | null = null;
  let vacantPlaylist: SignagePlaylist | null = null;
  let history: { at: string; blocks: number; media: number }[] = [];
  let vacantHistory: { at: string; blocks: number; media: number }[] = [];
  let defaultSeconds = 20;
  if (selected) {
    const meta = await loadMediaMeta();
    knownTags = allTags(meta);
    const [b, m, ch, camp] = await Promise.all([
      blockCatalog(selected.id),
      mediaPool(selected, meta),
      loadChannels(),
      loadCampaigns(),
    ]);
    blocks = b;
    media = m;
    channels = ch.map((c) => ({
      id: c.id,
      name: c.name,
      blocks: c.playlist.items.length,
      media: c.playlist.items.filter((it) => it.url).length,
    }));
    campaigns = camp.map((c) => ({
      id: c.id,
      name: c.name,
      startDate: c.startDate,
      endDate: c.endDate,
      blocks: c.playlist.items.length,
      media: c.playlist.items.filter((it) => it.url).length,
      propertyIds: c.propertyIds,
    }));
    playlist = signagePlaylist(selected.settings?.playlist);
    vacantPlaylist = signagePlaylist(selected.settings?.vacantPlaylist);
    // Slim summaries only — the restore round-trips through the API.
    history = playlistHistory(selected.settings?.playlistHistory).map((e) => {
      const p = signagePlaylist(e.playlist);
      return {
        at: e.at,
        blocks: p?.items.length ?? 0,
        media: p?.items.filter((it) => it.url).length ?? 0,
      };
    });
    vacantHistory = playlistHistory(
      selected.settings?.vacantPlaylistHistory
    ).map((e) => {
      const p = signagePlaylist(e.playlist);
      return {
        at: e.at,
        blocks: p?.items.length ?? 0,
        media: p?.items.filter((it) => it.url).length ?? 0,
      };
    });
    defaultSeconds = Math.round(
      signageTiming(
        selected.settings?.signage as Parameters<typeof signageTiming>[0]
      ).slideMs / 1000
    );
  }

  return (
    // Full-width canvas (host 2026-07-17): the timeline wants every pixel.
    <main className="w-full p-4 pb-12 sm:p-6">
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
          <div className="shrink-0">
            <PropertyPicker
              selected={selected.id}
              options={properties.map((p) => ({
                value: p.id,
                label: signageName(p.name),
                title: p.name,
              }))}
            />
          </div>
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
        // key: force a full editor remount per property — client state
        // (timeline, media library, dirty flag) must never leak across
        // listings when the picker navigates (host 2026-07-20).
        <SignageEditor
          key={selected.id}
          propertyId={selected.id}
          blocks={blocks}
          media={media}
          knownTags={knownTags}
          channels={channels}
          campaigns={campaigns}
          initial={playlist}
          vacantInitial={vacantPlaylist}
          history={history}
          vacantHistory={vacantHistory}
          defaultSeconds={defaultSeconds}
        />
      )}
    </main>
  );
}
