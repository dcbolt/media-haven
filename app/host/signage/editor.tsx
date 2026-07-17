"use client";

import { useMemo, useRef, useState } from "react";
import { publishPlaylistAction } from "./actions";

/** One arrangeable rotation block (mirrors a TV slide key). */
export type Block = {
  key: string;
  title: string;
  kind: "Slide" | "Guide" | "Feed" | "Page";
};

type Item = { key: string; seconds: number | ""; transition: string };

const TRANSITIONS = [
  { value: "fade", label: "Fade" },
  { value: "glide", label: "Glide" },
  { value: "zoom", label: "Zoom" },
  { value: "none", label: "Cut" },
];

const KIND_TAG: Record<Block["kind"], string> = {
  Slide: "bg-ocean-500 text-white",
  Guide: "bg-sand-300 text-ocean-900",
  Feed: "bg-seafoam-500 text-white",
  Page: "bg-ocean-700 text-white",
};

/** Live miniature of the real TV slide: /tv pinned to one slide with the
 *  selected property's actual content (host-authed state override) — no
 *  screenshots to go stale. One fetch per tile, no polling. 160px card /
 *  1920px canvas = scale 1/12. */
function SlideThumb({
  blockKey,
  propertyId,
}: {
  blockKey: string;
  propertyId: string;
}) {
  return (
    <div className="pointer-events-none relative h-[90px] w-40 overflow-hidden rounded-t-[11px] bg-ocean-900">
      <iframe
        src={`/tv?property=${propertyId}&slide=${encodeURIComponent(blockKey)}`}
        loading="lazy"
        tabIndex={-1}
        aria-hidden
        scrolling="no"
        className="absolute left-0 top-0 h-[1080px] w-[1920px] origin-top-left border-0"
        style={{ transform: "scale(0.083333)" }}
      />
    </div>
  );
}

/**
 * Canva-inspired playlist timeline (MVP): a horizontal film-strip of block
 * cards. Drag to reorder (or nudge with ◀ ▶), set per-slide seconds, park
 * blocks in the tray below, publish. No external DnD lib — plain HTML5
 * drag events keep the bundle tiny for a page hosts touch occasionally.
 */
export default function SignageEditor({
  propertyId,
  blocks,
  initial,
  defaultSeconds,
}: {
  propertyId: string;
  blocks: Block[];
  initial: {
    items: { key: string; seconds?: number; transition?: string }[];
    photos: boolean;
  } | null;
  defaultSeconds: number;
}) {
  const byKey = useMemo(
    () => new Map(blocks.map((b) => [b.key, b])),
    [blocks]
  );
  const [items, setItems] = useState<Item[]>(() => {
    const source =
      initial?.items?.filter((it) => byKey.has(it.key)) ??
      blocks.map((b) => ({
        key: b.key,
        seconds: undefined,
        transition: undefined,
      }));
    return source.map((it) => ({
      key: it.key,
      seconds: it.seconds ?? "",
      transition: it.transition ?? "fade",
    }));
  });
  const [photos, setPhotos] = useState(initial ? initial.photos : true);
  const [dirty, setDirty] = useState(false);

  const tray = blocks.filter((b) => !items.some((it) => it.key === b.key));

  // Plain HTML5 drag-and-drop: remember what's being dragged, restack on
  // every card we drag across so the strip previews the final order live.
  const dragKey = useRef<string | null>(null);
  function dragOver(overKey: string) {
    const from = items.findIndex((it) => it.key === dragKey.current);
    const to = items.findIndex((it) => it.key === overKey);
    if (from === -1 || to === -1 || from === to) return;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setItems(next);
    setDirty(true);
  }
  function move(key: string, dir: -1 | 1) {
    const at = items.findIndex((it) => it.key === key);
    const to = at + dir;
    if (at === -1 || to < 0 || to >= items.length) return;
    const next = [...items];
    [next[at], next[to]] = [next[to], next[at]];
    setItems(next);
    setDirty(true);
  }
  function remove(key: string) {
    setItems(items.filter((it) => it.key !== key));
    setDirty(true);
  }
  function add(key: string) {
    setItems([...items, { key, seconds: "", transition: "fade" }]);
    setDirty(true);
  }
  function setTransition(key: string, transition: string) {
    setItems(
      items.map((it) => (it.key === key ? { ...it, transition } : it))
    );
    setDirty(true);
  }
  function setSeconds(key: string, raw: string) {
    const v = raw === "" ? "" : Math.max(0, Math.round(Number(raw)));
    setItems(
      items.map((it) =>
        it.key === key ? { ...it, seconds: v === 0 ? "" : (v as number | "") } : it
      )
    );
    setDirty(true);
  }

  const loopSeconds = items.reduce(
    (sum, it) => sum + (typeof it.seconds === "number" ? it.seconds : defaultSeconds),
    0
  );

  const payload = JSON.stringify({
    items: items.map((it) => ({
      key: it.key,
      ...(typeof it.seconds === "number" ? { seconds: it.seconds } : null),
      ...(it.transition !== "fade" ? { transition: it.transition } : null),
    })),
    photos,
  });

  return (
    <section className="mt-6">
      {/* ── Timeline ──────────────────────────────────────────────── */}
      <div className="rounded-2xl bg-white p-4 shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-ocean-700">Timeline</h2>
          <p className="text-sm text-ocean-900/50">
            {items.length} block{items.length === 1 ? "" : "s"} · full loop ≈{" "}
            {Math.round(loopSeconds / 60)}m {loopSeconds % 60}s
          </p>
        </div>

        {items.length === 0 && (
          <p className="mt-4 rounded-xl bg-sand-100 p-4 text-ocean-900/60">
            The timeline is empty — add blocks from the tray below. Publishing
            needs at least one block.
          </p>
        )}

        <ol className="mt-3 flex gap-3 overflow-x-auto pb-2">
          {items.map((it, i) => {
            const b = byKey.get(it.key);
            if (!b) return null;
            return (
              <li
                key={it.key}
                draggable
                onDragStart={() => (dragKey.current = it.key)}
                onDragEnd={() => (dragKey.current = null)}
                onDragOver={(e) => {
                  e.preventDefault();
                  dragOver(it.key);
                }}
                className="w-40 shrink-0 cursor-grab rounded-xl border border-sand-300 bg-white shadow-sm transition hover:border-ocean-500 active:cursor-grabbing"
              >
                <SlideThumb blockKey={it.key} propertyId={propertyId} />
                <div
                  className={`flex items-center justify-between px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider ${KIND_TAG[b.kind]}`}
                >
                  {b.kind}
                  <span className="font-mono font-normal normal-case opacity-70">
                    #{i + 1}
                  </span>
                </div>
                <div className="px-2.5 py-2">
                  <p className="min-h-10 text-sm font-semibold leading-snug text-ocean-900">
                    {b.title}
                  </p>
                  <div className="mt-1 flex items-center gap-1 text-sm text-ocean-900/60">
                    <input
                      type="number"
                      min={5}
                      max={120}
                      value={it.seconds}
                      placeholder={String(defaultSeconds)}
                      onChange={(e) => setSeconds(it.key, e.target.value)}
                      className="w-14 rounded-lg border border-sand-300 p-1 text-center outline-none focus:border-ocean-500"
                      aria-label={`${b.title} seconds`}
                    />
                    <span>sec</span>
                    <select
                      value={it.transition}
                      onChange={(e) => setTransition(it.key, e.target.value)}
                      className="ml-auto rounded-lg border border-sand-300 bg-white p-1 text-xs outline-none focus:border-ocean-500"
                      aria-label={`${b.title} transition`}
                      title="Entrance transition"
                    >
                      {TRANSITIONS.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-ocean-900/40">
                    <div className="flex gap-0.5">
                      <button
                        type="button"
                        onClick={() => move(it.key, -1)}
                        disabled={i === 0}
                        className="rounded px-1.5 py-0.5 hover:bg-ocean-50 hover:text-ocean-700 disabled:opacity-30"
                        aria-label={`Move ${b.title} earlier`}
                      >
                        ◀
                      </button>
                      <button
                        type="button"
                        onClick={() => move(it.key, 1)}
                        disabled={i === items.length - 1}
                        className="rounded px-1.5 py-0.5 hover:bg-ocean-50 hover:text-ocean-700 disabled:opacity-30"
                        aria-label={`Move ${b.title} later`}
                      >
                        ▶
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => remove(it.key)}
                      className="rounded px-1.5 py-0.5 hover:bg-red-50 hover:text-red-600"
                      aria-label={`Park ${b.title}`}
                      title="Park this block (stays reachable from the TV menu)"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>

        <label className="mt-3 flex items-center gap-2 text-sm text-ocean-900/70">
          <input
            type="checkbox"
            checked={photos}
            onChange={(e) => {
              setPhotos(e.target.checked);
              setDirty(true);
            }}
            className="h-4 w-4 accent-ocean-500"
          />
          Weave property photos between blocks (every third slide)
        </label>
      </div>

      {/* ── Parked blocks ─────────────────────────────────────────── */}
      <div className="mt-4 rounded-2xl bg-white p-4 shadow-md">
        <h2 className="font-semibold text-ocean-700">Parked blocks</h2>
        <p className="mt-1 text-sm text-ocean-900/50">
          Not in the loop, but guests can still reach them from the TV menu.
          Farewell and launch-day slides always play on their day — they
          aren&apos;t listed here.
        </p>
        {tray.length === 0 ? (
          <p className="mt-3 text-sm text-ocean-900/40">
            Everything is on the timeline.
          </p>
        ) : (
          <ul className="mt-3 flex flex-wrap gap-2">
            {tray.map((b) => (
              <li key={b.key}>
                <button
                  type="button"
                  onClick={() => add(b.key)}
                  className="group flex items-center gap-2 rounded-xl border border-dashed border-sand-300 px-3 py-2 text-sm font-semibold text-ocean-900/70 transition hover:border-ocean-500 hover:text-ocean-700"
                >
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${KIND_TAG[b.kind]}`}
                  >
                    {b.kind}
                  </span>
                  {b.title}
                  <span className="text-ocean-500 opacity-0 transition group-hover:opacity-100">
                    + add
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Publish ───────────────────────────────────────────────── */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <form action={publishPlaylistAction}>
          <input type="hidden" name="propertyId" value={propertyId} />
          <input type="hidden" name="playlist" value={payload} />
          <button
            type="submit"
            disabled={items.length === 0}
            className="rounded-full bg-ocean-500 px-6 py-2.5 font-semibold text-white shadow-sm transition hover:bg-ocean-700 disabled:opacity-40"
          >
            Publish to TVs
          </button>
        </form>
        <form action={publishPlaylistAction}>
          <input type="hidden" name="propertyId" value={propertyId} />
          <input type="hidden" name="reset" value="1" />
          <button
            type="submit"
            className="rounded-full border border-sand-300 px-5 py-2.5 font-semibold text-ocean-900/60 transition hover:bg-sand-100 hover:text-ocean-700"
          >
            Reset to default rotation
          </button>
        </form>
        {dirty && (
          <p className="text-sm font-semibold text-ocean-900/50">
            Unpublished changes
          </p>
        )}
      </div>
    </section>
  );
}
