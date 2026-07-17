"use client";

/**
 * Property picker that applies itself: changing the selection submits the
 * surrounding server-action form immediately. Hosts kept changing the
 * dropdown and walking away without pressing "Link" (2026-07-17) — the
 * visible Link button remains only as a no-JS fallback.
 */
export default function PropertySelect({
  name,
  defaultValue,
  options,
}: {
  name: string;
  defaultValue: string;
  options: { value: string; label: string; title?: string }[];
}) {
  return (
    <select
      name={name}
      defaultValue={defaultValue}
      onChange={(e) => e.currentTarget.form?.requestSubmit()}
      className="w-full min-w-0 rounded-xl border border-sand-300 bg-white p-2 outline-none focus:border-ocean-500 sm:max-w-[16rem]"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value} title={o.title}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
