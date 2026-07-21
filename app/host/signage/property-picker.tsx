"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

/**
 * Signage property switcher: changing the selection navigates immediately —
 * the timeline, playlist, and media library reload for the picked listing
 * (host 2026-07-20; the old GET form only submitted without JS).
 */
export default function PropertyPicker({
  selected,
  options,
}: {
  selected: string;
  options: { value: string; label: string; title?: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <select
      value={selected}
      disabled={pending}
      onChange={(e) =>
        startTransition(() =>
          router.push(`/host/signage?property=${e.currentTarget.value}`)
        )
      }
      className={`w-full max-w-[18rem] truncate rounded-xl border border-sand-300 bg-white p-2 font-semibold text-ocean-700 outline-none focus:border-ocean-500 ${
        pending ? "opacity-60" : ""
      }`}
      aria-label="Property"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value} title={o.title}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
