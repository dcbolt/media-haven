"use client";

import { useId, useState } from "react";
import { signageName } from "@/lib/content";
import type { NowPlaying } from "@/lib/tv-now-playing";
import type { TvDeviceRow } from "@/lib/tv";
import ApiForm from "../api-form";
import PropertySelect from "./property-select";
import TvPreviewThumbnail from "./tv-preview-thumbnail";
import { ago, isOnline } from "./fleet-utils";

export type TvFleetTileProps = {
  tv: TvDeviceRow;
  now: NowPlaying | undefined;
  properties: { id: string; name: string }[];
};

function nowTone(now: NowPlaying | undefined): string {
  if (!now) return "text-ocean-900/55";
  if (now.mode === "emergency") return "text-amber-800";
  if (now.mode === "vacant") return "text-ocean-800/80";
  if (now.mode === "guest") return "text-seafoam-800";
  return "text-ocean-900/55";
}

function statusBadge(
  onlineNow: boolean,
  lastSeen: string,
  linked: boolean
): { label: string; className: string } {
  const stale = linked && !onlineNow;
  if (onlineNow) {
    return {
      label: "Online",
      className: "bg-seafoam-500/15 text-seafoam-800 border-seafoam-200",
    };
  }
  if (stale) {
    return {
      label: "Stale",
      className: "bg-amber-500/15 text-amber-900 border-amber-200",
    };
  }
  return {
    label: "Offline",
    className: "bg-sand-200/80 text-ocean-900/60 border-sand-300",
  };
}

export default function TvFleetTile({ tv, now, properties }: TvFleetTileProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const onlineNow = isOnline(tv.last_seen);
  const linked = Boolean(tv.property_id);
  const badge = statusBadge(onlineNow, tv.last_seen, linked);
  const previewProperty = tv.joined_property_id ?? tv.property_id;

  const nowLine = now
    ? now.detail
      ? `${now.headline} — ${now.detail}`
      : now.headline
    : "—";

  return (
    <article className="flex h-full flex-col overflow-hidden rounded-2xl bg-white shadow-md ring-1 ring-black/5">
      <button
        type="button"
        className="flex flex-1 flex-col text-left outline-none focus-visible:ring-2 focus-visible:ring-ocean-500"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
      >
        {previewProperty ? (
          <TvPreviewThumbnail
            propertyId={previewProperty}
            title={`Live rotation preview — ${tv.label ?? tv.pair_code}`}
            offline={!onlineNow}
          />
        ) : (
          <div className="relative aspect-video w-full overflow-hidden bg-ocean-900/10">
            <span className="flex h-full min-h-[5.5rem] items-center justify-center text-[11px] font-semibold uppercase tracking-wider text-ocean-900/40">
              Pairing
            </span>
          </div>
        )}

        <div className="space-y-1.5 p-3">
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 text-base font-semibold leading-snug text-ocean-900">
              <span className="line-clamp-2">{tv.label ?? "Unnamed TV"}</span>
            </p>
            <span
              className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${badge.className}`}
            >
              {badge.label}
            </span>
          </div>
          <p className="text-xs text-ocean-900/50">
            <span className="font-mono">{tv.pair_code}</span>
            <span aria-hidden="true"> · </span>
            seen {ago(tv.last_seen)}
          </p>
          {tv.joined_name ? (
            <p className="text-[11px] font-bold uppercase tracking-wide text-ocean-700">
              Joined · {tv.joined_name}
            </p>
          ) : null}
          <p
            className={`line-clamp-1 text-sm font-medium ${nowTone(now)}`}
            title={nowLine}
          >
            {nowLine}
          </p>
          <p className="text-xs font-semibold text-ocean-500">
            {open ? "Hide controls ▲" : "Manage TV ▼"}
          </p>
        </div>
      </button>

      {open && (
        <div
          id={panelId}
          className="border-t border-sand-100 bg-sand-50/50 p-3 pt-3"
          onClick={(e) => e.stopPropagation()}
        >
          {now && (
            <p
              className={`mb-3 rounded-lg border bg-white px-2.5 py-1.5 text-sm ${nowTone(now)} border-sand-200`}
              title="Expected content — not a live pixel capture"
            >
              <span className="font-semibold">Now · </span>
              {now.headline}
              {now.detail ? (
                <span className="mt-0.5 block text-xs opacity-80">{now.detail}</span>
              ) : null}
            </p>
          )}

          <p className="font-mono text-xs text-ocean-900/35">{tv.id.slice(0, 8)}…</p>

          <div className="mt-3 flex flex-col gap-2">
            <ApiForm
              op="assign"
              endpoint="/api/host/tvs"
              className="flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:items-center"
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

            <div className="flex flex-wrap gap-2">
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
            className="mt-4 border-t border-sand-200 pt-3"
            successText="Name saved"
          >
            <input type="hidden" name="deviceId" value={tv.id} />
            <label
              htmlFor={`label-${tv.id}`}
              className="text-xs font-semibold uppercase tracking-wide text-ocean-900/45"
            >
              Display name
            </label>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <input
                id={`label-${tv.id}`}
                name="label"
                defaultValue={tv.label ?? ""}
                placeholder="Living · Turtle Haven"
                className="min-w-[12rem] flex-1 rounded-xl border border-sand-300 bg-white p-2 outline-none focus:border-ocean-500"
              />
              <button
                type="submit"
                className="shrink-0 rounded-full border border-ocean-500 px-4 py-2 text-sm font-semibold text-ocean-700 transition hover:bg-ocean-50"
              >
                Save name
              </button>
            </div>
            <p className="mt-1 text-xs text-ocean-900/45">
              What this screen is called everywhere — fleet, cast target, and Open
              on TV.
            </p>
          </ApiForm>
        </div>
      )}
    </article>
  );
}