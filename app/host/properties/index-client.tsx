"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * J1b nested properties index. Member properties render indented under
 * their combined listing ("The Havens at the Dunes" ⌐ Turtle + Shell), and
 * the nesting itself IS the joined-stays configuration: pick "Nest under…"
 * on a property to create/join the parent's group (auto mode), "—" to
 * un-nest. Parent cards carry the live status pill and Auto / Force on /
 * Off controls for the takeover.
 */

export type PropertyRow = {
  id: string;
  name: string;
  wifi_ssid: string | null;
  hero_image_url: string | null;
  sections: number;
};

type GroupStatus = {
  key: string;
  name: string;
  joinedPropertyId: string;
  memberPropertyIds: string[];
  mode: "auto" | "on" | "off";
  active: boolean;
  guestLabel: string | null;
  checkOut: string | null;
};

export default function PropertiesIndex({ rows }: { rows: PropertyRow[] }) {
  const [groups, setGroups] = useState<GroupStatus[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/host/joined");
        const json = await res.json();
        if (res.ok) setGroups(json.groups ?? []);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  const post = useCallback(async (body: Record<string, unknown>) => {
    setBusy(true);
    try {
      const res = await fetch("/api/host/joined", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "save failed");
      setGroups(json.groups ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "save failed");
    } finally {
      setBusy(false);
    }
  }, []);

  const parentOf = (id: string) =>
    groups.find((g) => g.memberPropertyIds.includes(id)) ?? null;
  const groupFor = (id: string) =>
    groups.find((g) => g.joinedPropertyId === id) ?? null;

  const parents = rows.filter((r) => groupFor(r.id));
  const nested = new Set(
    groups.flatMap((g) => g.memberPropertyIds)
  );
  const standalone = rows.filter((r) => !groupFor(r.id) && !nested.has(r.id));

  const card = (p: PropertyRow, indent: boolean) => {
    const group = groupFor(p.id);
    const isParent = Boolean(group);
    const myParent = parentOf(p.id);
    return (
      <div key={p.id} className={indent ? "ml-6 sm:ml-10" : ""}>
        <div className="rounded-2xl bg-white p-5 shadow-md transition hover:shadow-lg">
          <div className="flex items-center justify-between gap-4">
            <a href={`/host/properties/${p.id}`} className="min-w-0 grow">
              <p className="truncate text-lg font-semibold">
                {indent && <span className="mr-1 text-ocean-400">⌐</span>}
                {p.name}
              </p>
              <p className="mt-1 text-sm text-ocean-900/60">
                {p.wifi_ssid ? `Wi-Fi: ${p.wifi_ssid}` : "No Wi-Fi set"} ·{" "}
                {p.sections} guide section{p.sections === 1 ? "" : "s"}
                {p.hero_image_url ? "" : " · no hero photo"}
              </p>
            </a>
            <a
              href={`/host/properties/${p.id}`}
              className="shrink-0 font-semibold text-ocean-500"
            >
              Edit →
            </a>
          </div>

          {isParent && group && (
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-ocean-100 pt-3">
              {group.active ? (
                <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-700">
                  LIVE on member TVs{group.guestLabel ? ` — ${group.guestLabel}` : ""}
                  {group.checkOut
                    ? ` · out ${new Date(group.checkOut).toLocaleDateString()}`
                    : ""}
                </span>
              ) : (
                <span className="rounded-full bg-ocean-100 px-2.5 py-0.5 text-xs font-semibold text-ocean-700">
                  {group.mode === "off" ? "takeover off" : "armed — follows bookings"}
                </span>
              )}
              <span className="grow" />
              {(["auto", "on", "off"] as const).map((mode) => (
                <button
                  key={mode}
                  disabled={busy}
                  onClick={() =>
                    void post({ op: "set-mode", key: group.key, mode })
                  }
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    group.mode === mode
                      ? "bg-ocean-600 text-white"
                      : "bg-ocean-50 text-ocean-700 hover:bg-ocean-100"
                  }`}
                >
                  {mode === "auto" ? "Auto" : mode === "on" ? "Force on" : "Off"}
                </button>
              ))}
            </div>
          )}

          {!isParent && loaded && (
            <div className="mt-3 flex items-center gap-2 border-t border-ocean-100 pt-3 text-sm">
              <label className="text-ocean-900/60">Nest under</label>
              <select
                disabled={busy}
                value={myParent?.joinedPropertyId ?? ""}
                onChange={(e) =>
                  void post({
                    op: "nest",
                    propertyId: p.id,
                    parentId: e.target.value || null,
                  })
                }
                className="max-w-full rounded-lg border border-ocean-200 px-2 py-1 text-sm"
              >
                <option value="">—</option>
                {rows
                  .filter((r) => r.id !== p.id && !parentOf(r.id))
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name.split(" - ")[0]}
                    </option>
                  ))}
              </select>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="mt-6 space-y-3">
      {error && <p className="text-sm text-red-600">{error}</p>}
      {parents.map((parent) => {
        const group = groupFor(parent.id)!;
        const children = rows.filter((r) =>
          group.memberPropertyIds.includes(r.id)
        );
        return (
          <div key={parent.id} className="space-y-3">
            {card(parent, false)}
            {children.map((c) => card(c, true))}
          </div>
        );
      })}
      {standalone.map((p) => card(p, false))}
      {loaded && parents.length === 0 && (
        <p className="text-sm text-ocean-900/60">
          Tip: rent two Havens as one listing? Nest each house under its
          combined property and the TVs switch automatically while it&apos;s
          booked.
        </p>
      )}
    </div>
  );
}
