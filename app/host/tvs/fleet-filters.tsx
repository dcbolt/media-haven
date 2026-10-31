"use client";

import { useRouter, usePathname } from "next/navigation";

type Props = {
  properties: { id: string; name: string }[];
  current: {
    property?: string;
    type?: string;
    status?: string;
  };
  types: string[];
};

export default function FleetFilters({ properties, current, types }: Props) {
  const router = useRouter();
  const pathname = usePathname();

  function apply(form: HTMLFormElement) {
    const fd = new FormData(form);
    const params = new URLSearchParams();
    for (const [k, v] of fd.entries()) {
      const val = String(v).trim();
      if (val) params.set(k, val);
    }
    const q = params.toString();
    router.push(q ? `${pathname}?${q}` : pathname);
  }

  return (
    <form
      className="mt-4 flex flex-col gap-2 rounded-xl bg-white p-3 shadow-sm sm:flex-row sm:flex-wrap sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        apply(e.currentTarget);
      }}
    >
      <label className="flex min-w-[8rem] flex-1 flex-col gap-1 text-xs font-semibold text-ocean-900/50">
        Property
        <select
          name="property"
          defaultValue={current.property ?? ""}
          className="rounded-lg border border-sand-300 bg-sand-50 px-2 py-2 text-sm font-normal text-ocean-900"
        >
          <option value="">All</option>
          {properties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex min-w-[8rem] flex-1 flex-col gap-1 text-xs font-semibold text-ocean-900/50">
        Type
        <select
          name="type"
          defaultValue={current.type ?? ""}
          className="rounded-lg border border-sand-300 bg-sand-50 px-2 py-2 text-sm font-normal text-ocean-900"
        >
          <option value="">All</option>
          {types.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>
      <label className="flex min-w-[8rem] flex-1 flex-col gap-1 text-xs font-semibold text-ocean-900/50">
        Status
        <select
          name="status"
          defaultValue={current.status ?? ""}
          className="rounded-lg border border-sand-300 bg-sand-50 px-2 py-2 text-sm font-normal text-ocean-900"
        >
          <option value="">All</option>
          <option value="online">Online</option>
          <option value="stale">Stale</option>
          <option value="offline">Offline</option>
        </select>
      </label>
      <button
        type="submit"
        className="rounded-full bg-ocean-500 px-4 py-2 text-sm font-semibold text-white hover:bg-ocean-700"
      >
        Filter
      </button>
    </form>
  );
}
