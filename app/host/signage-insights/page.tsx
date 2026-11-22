import Link from "next/link";
import { redirect } from "next/navigation";
import { isHostAuthenticated } from "@/lib/host-auth";
import { loadSignageInsights } from "@/lib/signage-analytics";

export default async function SignageInsightsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  if (!(await isHostAuthenticated())) redirect("/host/login");
  const { days } = await searchParams;
  const windowDays: 7 | 30 = days === "30" ? 30 : 7;
  const rows = await loadSignageInsights(windowDays);

  return (
    <main className="mx-auto max-w-5xl p-4 pb-12 sm:p-6">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold text-ocean-700">Signage insights</h1>
          <p className="text-sm text-ocean-900/60">
            Slide impressions, QR scans, scan rate, and guest TV ratings — test traffic
            excluded.
          </p>
        </div>
        <div className="flex gap-2 text-sm font-semibold">
          <Link
            href="/host/signage-insights?days=7"
            className={windowDays === 7 ? "text-ocean-700 underline" : "text-ocean-900/50"}
          >
            7 days
          </Link>
          <span className="text-ocean-900/30">·</span>
          <Link
            href="/host/signage-insights?days=30"
            className={windowDays === 30 ? "text-ocean-700 underline" : "text-ocean-900/50"}
          >
            30 days
          </Link>
        </div>
      </header>

      {!rows ? (
        <p className="mt-6 text-sm text-ocean-900/60">
          Insights need Supabase and migration{" "}
          <code className="rounded bg-sand-100 px-1">0025_qr_scan_events.sql</code>{" "}
          applied. Legacy QR counters still show on the dashboard.
        </p>
      ) : rows.length === 0 ? (
        <p className="mt-6 text-sm text-ocean-900/60">
          No attributable impressions or scans in the last {windowDays} days yet.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-ocean-100">
          <table className="w-full min-w-[52rem] text-left text-sm">
            <thead className="bg-ocean-50/80 text-xs font-bold uppercase tracking-wide text-ocean-700">
              <tr>
                <th className="px-3 py-2">Slide</th>
                <th className="px-3 py-2">Property</th>
                <th className="px-3 py-2">TV</th>
                <th className="px-3 py-2 text-right">Impr.</th>
                <th className="px-3 py-2 text-right">Screen s</th>
                <th className="px-3 py-2 text-right">Scans</th>
                <th className="px-3 py-2 text-right">Scan /100</th>
                <th className="px-3 py-2 text-right">Rating</th>
                <th className="px-3 py-2">Latest notes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={`${r.slideId}-${r.propertySlug}-${r.tvDeviceId ?? ""}`}
                  className="border-t border-ocean-50"
                >
                  <td className="px-3 py-2 font-mono text-ocean-900">{r.slideId}</td>
                  <td className="px-3 py-2 font-mono text-ocean-900/80">
                    {r.propertySlug}
                  </td>
                  <td className="px-3 py-2 font-mono text-ocean-900/50">
                    {r.tvDeviceId ? r.tvDeviceId.slice(0, 8) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">{r.impressions}</td>
                  <td className="px-3 py-2 text-right font-mono">
                    {r.secondsOnScreen}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">{r.scans}</td>
                  <td className="px-3 py-2 text-right font-mono">
                    {r.scanRatePer100 != null ? r.scanRatePer100.toFixed(1) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {r.ratingAvg != null
                      ? `${r.ratingAvg} (${r.ratingCount})`
                      : "—"}
                  </td>
                  <td className="max-w-xs px-3 py-2 text-xs text-ocean-900/70">
                    {r.latestComments.map((c) => (
                      <p key={`${c.at}-${c.rating}`} className="truncate">
                        {c.rating}★ {c.comment ?? "—"}
                      </p>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 text-xs text-ocean-900/50">
        <Link href="/host" className="text-ocean-600 underline">
          ← Host dashboard
        </Link>
      </p>
    </main>
  );
}