"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * J1 joined stays panel — configure dual-property listings ("The Havens at
 * the Dunes" = Turtle + Shell) and see/force whether member TVs are
 * currently serving the joined listing's signage.
 */

type PropertyOption = { id: string; name: string };

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

export default function JoinedStaysPanel() {
  const [groups, setGroups] = useState<GroupStatus[] | null>(null);
  const [properties, setProperties] = useState<PropertyOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [draft, setDraft] = useState({
    key: "",
    name: "",
    joinedPropertyId: "",
    memberPropertyIds: [] as string[],
  });

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/host/joined");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "load failed");
      setGroups(json.groups ?? []);
      setProperties(json.properties ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "load failed");
      setGroups([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const post = useCallback(
    async (body: Record<string, unknown>) => {
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
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "save failed");
        return false;
      } finally {
        setBusy(false);
      }
    },
    []
  );

  const nameOf = (id: string) =>
    properties.find((p) => p.id === id)?.name ?? "…";

  const submitNew = async () => {
    const key =
      draft.key.trim() ||
      draft.name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40);
    const ok = await post({
      op: "upsert",
      group: { ...draft, key, mode: "auto" },
    });
    if (ok) {
      setShowNew(false);
      setDraft({ key: "", name: "", joinedPropertyId: "", memberPropertyIds: [] });
    }
  };

  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-bold text-ocean-700">Joined stays</h2>
        <button
          onClick={() => setShowNew((v) => !v)}
          className="rounded-full bg-ocean-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-ocean-700"
        >
          {showNew ? "Cancel" : "+ New group"}
        </button>
      </div>
      <p className="mt-1 text-sm text-ocean-900/70">
        When two Havens rent together as one listing, every TV at both houses
        switches to the joined listing&apos;s signage — Wi-Fi stays each
        house&apos;s own. Auto follows the joined listing&apos;s reservations;
        Force on works before Guesty is linked.
      </p>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {groups === null && <p className="mt-3 text-sm text-ocean-900/60">Loading…</p>}

      <div className="mt-4 space-y-3">
        {(groups ?? []).map((g) => (
          <div key={g.key} className="rounded-2xl bg-white p-5 shadow-md">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-lg font-semibold text-ocean-800">
                {g.name}
              </span>
              {g.active ? (
                <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-700">
                  LIVE{g.guestLabel ? ` — ${g.guestLabel}` : ""}
                  {g.checkOut
                    ? ` · out ${new Date(g.checkOut).toLocaleDateString()}`
                    : ""}
                </span>
              ) : (
                <span className="rounded-full bg-ocean-100 px-2.5 py-0.5 text-xs font-semibold text-ocean-700">
                  {g.mode === "off" ? "off" : "armed (auto)"}
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-ocean-900/70">
              {g.memberPropertyIds.map(nameOf).join(" + ")} → shows{" "}
              <span className="font-medium">{nameOf(g.joinedPropertyId)}</span>
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {(["auto", "on", "off"] as const).map((mode) => (
                <button
                  key={mode}
                  disabled={busy}
                  onClick={() => void post({ op: "set-mode", key: g.key, mode })}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    g.mode === mode
                      ? "bg-ocean-600 text-white"
                      : "bg-ocean-50 text-ocean-700 hover:bg-ocean-100"
                  }`}
                >
                  {mode === "auto" ? "Auto" : mode === "on" ? "Force on" : "Off"}
                </button>
              ))}
              <button
                disabled={busy}
                onClick={() => {
                  if (confirm(`Delete joined group "${g.name}"?`)) {
                    void post({ op: "delete", key: g.key });
                  }
                }}
                className="ml-auto rounded-full px-3 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
        {groups !== null && groups.length === 0 && !showNew && (
          <p className="text-sm text-ocean-900/60">
            No joined groups yet — add &quot;The Havens at the Dunes&quot;
            (Turtle + Shell) or &quot;The Havens at Beach Street&quot; (Sea +
            Beach).
          </p>
        )}
      </div>

      {showNew && (
        <div className="mt-4 rounded-2xl bg-white p-5 shadow-md">
          <label className="block text-sm font-semibold text-ocean-800">
            Joined listing name
            <input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="The Havens at the Dunes"
              className="mt-1 w-full rounded-lg border border-ocean-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="mt-3 block text-sm font-semibold text-ocean-800">
            Joined listing property (its signage gets served)
            <select
              value={draft.joinedPropertyId}
              onChange={(e) =>
                setDraft({ ...draft, joinedPropertyId: e.target.value })
              }
              className="mt-1 w-full rounded-lg border border-ocean-200 px-3 py-2 text-sm"
            >
              <option value="">Choose…</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="mt-3">
            <legend className="text-sm font-semibold text-ocean-800">
              Member properties (their TVs switch)
            </legend>
            <div className="mt-1 flex flex-wrap gap-2">
              {properties
                .filter((p) => p.id !== draft.joinedPropertyId)
                .map((p) => {
                  const on = draft.memberPropertyIds.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() =>
                        setDraft({
                          ...draft,
                          memberPropertyIds: on
                            ? draft.memberPropertyIds.filter((id) => id !== p.id)
                            : [...draft.memberPropertyIds, p.id],
                        })
                      }
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        on
                          ? "bg-ocean-600 text-white"
                          : "bg-ocean-50 text-ocean-700 hover:bg-ocean-100"
                      }`}
                    >
                      {p.name}
                    </button>
                  );
                })}
            </div>
          </fieldset>
          <button
            disabled={
              busy ||
              !draft.name.trim() ||
              !draft.joinedPropertyId ||
              draft.memberPropertyIds.length === 0
            }
            onClick={() => void submitNew()}
            className="mt-4 rounded-full bg-ocean-600 px-5 py-2 text-sm font-semibold text-white hover:bg-ocean-700 disabled:opacity-50"
          >
            Save group
          </button>
        </div>
      )}
    </section>
  );
}
