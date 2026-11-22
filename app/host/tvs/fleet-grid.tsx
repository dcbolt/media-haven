"use client";

import { useEffect, useState } from "react";
import { signageName } from "@/lib/content";
import ApiForm from "../api-form";
import PropertySelect from "./property-select";
import {
  ago,
  guestFirstForTile,
  nowPlayingBoxTone,
  nowPlayingTone,
} from "./fleet-helpers";

export type FleetTileTv = {
  id: string;
  label: string | null;
  pair_code: string;
  property_id: string | null;
  property_name: string | null;
  last_seen: string;
  online: boolean;
  stale: boolean;
  occupied: boolean | null;
  guest_label: string | null;
  joined_name: string | null;
  joined_property_id: string | null;
  previewPropertyId: string | null;
  now: {
    mode: string;
    headline: string;
    detail: string | null;
  } | null;
};

export type FleetSection = {
  id: string;
  name: string;
  indent: boolean;
  combo: boolean;
  onlineCount: number;
  total: number;
  tvs: FleetTileTv[];
};

type PropertyOption = { id: string; name: string };

function statusBadge(tv: FleetTileTv): {
  label: string;
  className: string;
} {
  if (tv.stale) {
    return {
      label: "Stale",
      className: "bg-amber-100 text-amber-900 ring-amber-200",
    };
  }
  if (tv.online) {
    return {
      label: "Online",
      className: "bg-seafoam-100 text-seafoam-900 ring-seafoam-200",
    };
  }
  return {
    label: "Offline",
    className: "bg-sand-100 text-ocean-900/70 ring-sand-200",
  };
}

function occupancyLine(tv: FleetTileTv): string {
  if (tv.occupied === true) {
    const guest = guestFirstForTile(tv.guest_label);
    return guest ? `Occupied · ${guest}` : "Occupied";
  }
  if (tv.occupied === false) return "Vacant";
  return "Unlinked";
}

function FleetTvManageDrawer({
  tv,
  properties,
  open,
  onClose,
}: {
  tv: FleetTileTv;
  properties: PropertyOption[];
  open: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const modeLabel =
    tv.occupied === true
      ? `Occupied${tv.guest_label ? ` · ${tv.guest_label}` : ""}`
      : tv.occupied === false
        ? "Vacant"
        : "Unlinked";
  const nowTone = nowPlayingBoxTone(tv.now?.mode);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
      role="presentation"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-ocean-900/50" aria-hidden />
      <div
        className="relative z-10 flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl ring-1 ring-black/10 sm:rounded-2xl"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`fleet-drawer-${tv.id}`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-sand-100 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h3
              id={`fleet-drawer-${tv.id}`}
              className="truncate text-lg font-bold text-ocean-700"
            >
              {tv.label ?? "Unnamed TV"}
            </h3>
            <p className="font-mono text-xs text-ocean-900/45">
              {tv.pair_code} · {tv.id.slice(0, 8)}…
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full border border-sand-200 px-3 py-1 text-sm font-semibold text-ocean-700 hover:bg-sand-50"
          >
            Close
          </button>
        </div>

        <div className="overflow-y-auto px-4 py-4 sm:px-5">
          <p className="text-sm text-ocean-900/60">
            {tv.property_name
              ? signageName(tv.property_name)
              : "No property"}{" "}
            {tv.joined_name ? (
              <span
                className="ml-1 rounded-full bg-ocean-500/15 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-ocean-700"
                title={`Joined stay — ${tv.joined_name}`}
              >
                Joined · {tv.joined_name}
              </span>
            ) : null}{" "}
            · <span className="font-semibold">{modeLabel}</span> · seen{" "}
            {ago(tv.last_seen)}
          </p>

          {tv.now && (
            <p
              className={`mt-3 rounded-lg border px-2.5 py-2 text-sm ${nowTone}`}
            >
              <span className="font-semibold">Now · </span>
              {tv.now.headline}
              {tv.now.detail ? (
                <span className="mt-0.5 block text-xs opacity-80">
                  {tv.now.detail}
                </span>
              ) : null}
            </p>
          )}

          <div className="mt-4 space-y-3 border-t border-sand-100 pt-4">
            <ApiForm
              op="assign"
              endpoint="/api/host/tvs"
              className="flex w-full flex-col gap-2 sm:flex-row sm:items-center"
              successText="Linked"
            >
              <input type="hidden" name="deviceId" value={tv.id} />
              <span className="text-xs font-semibold uppercase tracking-wide text-ocean-900/45 sm:w-24">
                Property
              </span>
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
            </ApiForm>

            <div className="flex flex-wrap gap-2">
              {tv.property_id && (
                <ApiForm
                  op="unlink"
                  endpoint="/api/host/tvs"
                  successText="Unlinked"
                  className="min-w-[7rem] flex-1"
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
                className="min-w-[7rem] flex-1"
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
                className="min-w-[7rem] flex-1"
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

            <ApiForm
              op="rename"
              endpoint="/api/host/tvs"
              className="border-t border-sand-100 pt-4"
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
                  className="min-w-[12rem] flex-1 rounded-xl border border-sand-300 p-2 outline-none focus:border-ocean-500"
                />
                <button
                  type="submit"
                  className="shrink-0 rounded-full border border-ocean-500 px-4 py-2 text-sm font-semibold text-ocean-700 transition hover:bg-ocean-50"
                >
                  Save name
                </button>
              </div>
              <p className="mt-1 text-xs text-ocean-900/45">
                Room · Property for guest TVs; wall position for signage panels.
              </p>
            </ApiForm>
          </div>
        </div>
      </div>
    </div>
  );
}

function FleetTvTile({
  tv,
  properties,
}: {
  tv: FleetTileTv;
  properties: PropertyOption[];
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const badge = statusBadge(tv);
  const headline = tv.now?.headline ?? "—";
  const lineTone = nowPlayingTone(tv.now?.mode);

  return (
    <>
      <article className="flex h-full flex-col overflow-hidden rounded-2xl bg-white shadow-md ring-1 ring-black/5">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="group flex flex-1 flex-col text-left outline-none focus-visible:ring-2 focus-visible:ring-ocean-500"
          aria-label={`Manage ${tv.label ?? tv.pair_code}`}
        >
          {tv.previewPropertyId ? (
            <span className="relative aspect-video w-full shrink-0 overflow-hidden bg-black">
              <iframe
                src={`/tv?property=${tv.previewPropertyId}`}
                title={`Live rotation preview — ${tv.label ?? tv.pair_code}`}
                loading="lazy"
                className="pointer-events-none absolute left-0 top-0 origin-top-left"
                style={{
                  width: 1920,
                  height: 1080,
                  transform: "scale(0.19)",
                }}
              />
              {!tv.online && (
                <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-[10px] font-bold uppercase tracking-wider text-amber-400">
                  offline
                </span>
              )}
            </span>
          ) : (
            <span className="relative flex aspect-video w-full shrink-0 items-center justify-center bg-ocean-900/10 text-[10px] font-semibold uppercase tracking-wider text-ocean-900/40">
              pairing
            </span>
          )}

          <div className="flex flex-1 flex-col gap-1.5 p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 truncate text-base font-semibold text-ocean-900">
                {tv.label ?? "Unnamed TV"}
              </p>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ${badge.className}`}
              >
                {badge.label}
              </span>
            </div>
            <p className="text-xs text-ocean-900/50">
              {ago(tv.last_seen)}
              <span className="font-mono"> · {tv.pair_code}</span>
            </p>
            <p
              className={`text-sm font-semibold ${
                tv.occupied === true
                  ? "text-seafoam-600"
                  : tv.occupied === false
                    ? "text-ocean-900/55"
                    : "text-ocean-900/45"
              }`}
            >
              {occupancyLine(tv)}
            </p>
            <p
              className={`truncate text-xs font-medium ${lineTone}`}
              title={headline}
            >
              {headline}
            </p>
            <span className="mt-auto pt-1 text-xs font-semibold text-ocean-500 group-hover:text-ocean-700">
              Manage →
            </span>
          </div>
        </button>
      </article>

      <FleetTvManageDrawer
        tv={tv}
        properties={properties}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
    </>
  );
}

export default function FleetGrid({
  sections,
  unpaired,
  properties,
}: {
  sections: FleetSection[];
  unpaired: FleetTileTv[];
  properties: PropertyOption[];
}) {
  return (
    <div className="mt-6 space-y-8">
      {sections.map((sec) => (
        <section
          key={sec.id}
          className={sec.indent ? "ml-0 sm:ml-6" : ""}
        >
          <header className="mb-3 flex flex-wrap items-baseline gap-x-2 gap-y-1 px-0.5">
            <h2 className="text-sm font-bold uppercase tracking-wide text-ocean-700">
              {sec.indent && (
                <span className="mr-1 text-ocean-400" aria-hidden>
                  ⌐
                </span>
              )}
              {sec.name}
            </h2>
            {sec.combo && (
              <span className="rounded-full bg-ocean-500/15 px-2 py-0.5 text-[10px] font-bold text-ocean-700">
                Combined
              </span>
            )}
            <span className="text-sm font-semibold text-ocean-500">
              {sec.onlineCount}/{sec.total} online
            </span>
          </header>
          <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {sec.tvs.map((tv) => (
              <FleetTvTile key={tv.id} tv={tv} properties={properties} />
            ))}
          </div>
        </section>
      ))}

      {unpaired.length > 0 && (
        <section>
          <header className="mb-3 px-0.5">
            <h2 className="text-sm font-bold uppercase tracking-wide text-ocean-900/50">
              Awaiting pairing
            </h2>
            <span className="text-sm font-semibold text-ocean-900/45">
              {unpaired.length} screen{unpaired.length === 1 ? "" : "s"}
            </span>
          </header>
          <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {unpaired.map((tv) => (
              <FleetTvTile key={tv.id} tv={tv} properties={properties} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}