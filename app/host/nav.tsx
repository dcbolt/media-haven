"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Shared host navigation — one bar across every backend page, plus preview
 * shortcuts that open the guest-facing outputs in a new tab. Previews hit
 * /tv like a real device, so a preview browser shows up on the TVs page;
 * Forget it there if it bothers you.
 */

const PAGES = [
  { href: "/host", label: "Dashboard" },
  { href: "/host/tvs", label: "TVs" },
  { href: "/host/media", label: "Media" },
  { href: "/host/turnover", label: "Turnover" },
];

const PREVIEWS = [
  { href: "/tv", label: "TV guide" },
  { href: "/tv?preview=standby", label: "Standby" },
  { href: "/tv?preview=lastnight", label: "Farewell" },
];

export default function HostNav() {
  const pathname = usePathname();
  return (
    <nav className="sticky top-0 z-20 border-b border-sand-300 bg-white/90 backdrop-blur print:hidden">
      <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-x-1 gap-y-1 px-4 py-2 sm:px-6">
        {PAGES.map((p) => {
          const active = pathname === p.href;
          return (
            <Link
              key={p.href}
              href={p.href}
              className={`rounded-full px-3 py-1.5 font-semibold transition ${
                active
                  ? "bg-ocean-500 text-white"
                  : "text-ocean-700 hover:bg-ocean-50"
              }`}
            >
              {p.label}
            </Link>
          );
        })}
        <span className="ml-auto flex flex-wrap items-center gap-x-1 text-sm">
          <span className="mr-1 text-ocean-900/40">Preview:</span>
          {PREVIEWS.map((p) => (
            <a
              key={p.href}
              href={p.href}
              target="_blank"
              rel="noreferrer"
              className="rounded-full px-2.5 py-1 font-semibold text-ocean-500 transition hover:bg-ocean-50 hover:text-ocean-700"
            >
              {p.label} ↗
            </a>
          ))}
        </span>
      </div>
    </nav>
  );
}
