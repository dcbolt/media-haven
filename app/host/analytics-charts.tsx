import type { DashboardIntel } from "@/lib/host-dashboard";
import type { ScanSeries } from "@/lib/qr-track";

/**
 * Host-dashboard charts (host 2026-07-25: "better dashboard graphs and
 * charts to show the analytics"). Plain server-rendered SVG — no chart
 * library, no client JS; native <title> tooltips on every mark.
 *
 * Palettes were run through the dataviz validator (CVD + contrast checks):
 * · scan stack ladder  #2a78d6 #eb6834 #1baf7a #eda100 (contrast WARN on the
 *   last pair → relief is direct labels + the numeric grid under the chart)
 * · platform bars      #f43f5e #0284c7 #4f46e5 #2e7d9a (ocean-500 Direct) —
 *   same buckets + brand token as multi-calendar bars (G10).
 * Occupancy is single-hue sequential ocean (height carries the value; full
 * nights step darker). Text always wears ink tokens, never series color.
 */

const INK = "#12333f"; // ocean-900

const STACK_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100"];

const PLATFORM_META: Record<string, { label: string; color: string }> = {
  airbnb: { label: "Airbnb", color: "#f43f5e" },
  vrbo: { label: "Vrbo", color: "#0284c7" },
  booking: { label: "Booking.com", color: "#4f46e5" },
  direct: { label: "Direct", color: "#2e7d9a" }, // ocean-500 — matches calendar
};

/** Column with a 3px-rounded top, square at the baseline. */
function topRoundedColumn(x: number, yTop: number, w: number, h: number): string {
  const r = Math.min(3, h, w / 2);
  return [
    `M${x} ${yTop + h}`,
    `v${-(h - r)}`,
    `q0 ${-r} ${r} ${-r}`,
    `h${w - 2 * r}`,
    `q${r} 0 ${r} ${r}`,
    `v${h - r}`,
    "z",
  ].join(" ");
}

function niceDay(ymd: string): string {
  return new Date(`${ymd}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/* ------------------------------------------------------------------ */
/* Occupancy — next 14 nights, villas booked per night                 */
/* ------------------------------------------------------------------ */

export function OccupancyChart({
  data,
}: {
  data: DashboardIntel["occupancy"];
}) {
  const W = 560;
  const plotH = 84;
  const top = 8;
  const labelH = 16;
  const H = top + plotH + labelH;
  const slot = W / data.length;
  const barW = Math.min(30, slot - 6);
  const max = Math.max(1, ...data.map((d) => d.total));

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="mt-2 w-full"
      role="img"
      aria-label="Villas booked per night, next 14 nights"
    >
      {/* recessive integer gridlines */}
      {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
        <line
          key={n}
          x1={0}
          x2={W}
          y1={top + plotH - (n / max) * plotH}
          y2={top + plotH - (n / max) * plotH}
          stroke={INK}
          strokeOpacity={0.07}
        />
      ))}
      {data.map((d, i) => {
        const x = i * slot + (slot - barW) / 2;
        const h = (d.occupied / max) * plotH;
        const full = d.occupied === d.total && d.total > 0;
        return (
          <g key={d.date}>
            {d.occupied > 0 && (
              <path
                d={topRoundedColumn(x, top + plotH - h, barW, h)}
                fill={full ? "#1d5468" : "#2e7d9a"}
              />
            )}
            <text
              x={i * slot + slot / 2}
              y={H - 4}
              textAnchor="middle"
              fontSize={9.5}
              fill={INK}
              fillOpacity={0.45}
            >
              {Number(d.date.slice(8, 10))}
            </text>
            {/* full-height hit target so the tooltip is easy to reach */}
            <rect x={i * slot} y={0} width={slot} height={H} fill="transparent">
              <title>
                {`${niceDay(d.date)}: ${d.occupied} of ${d.total} villas booked${full ? " — sold out" : ""}`}
              </title>
            </rect>
          </g>
        );
      })}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* QR scans — last 14 days, stacked by target (top 3 + Other)          */
/* ------------------------------------------------------------------ */

export function ScanStackChart({ data }: { data: ScanSeries }) {
  const W = 560;
  const plotH = 96;
  const top = 14; // room for the peak-day direct label
  const labelH = 16;
  const H = top + plotH + labelH;
  const slot = W / data.dates.length;
  const barW = Math.min(30, slot - 6);

  const totals = data.dates.map((_, i) =>
    data.series.reduce((a, s) => a + s.values[i], 0)
  );
  const max = Math.max(1, ...totals);
  const peak = totals.indexOf(Math.max(...totals));

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-2 w-full"
        role="img"
        aria-label="QR scans per day for the last 14 days, stacked by target"
      >
        {[0.5, 1].map((f) => (
          <line
            key={f}
            x1={0}
            x2={W}
            y1={top + plotH - f * plotH}
            y2={top + plotH - f * plotH}
            stroke={INK}
            strokeOpacity={0.07}
          />
        ))}
        {data.dates.map((date, i) => {
          const x = i * slot + (slot - barW) / 2;
          let cum = 0;
          const segs = data.series
            .map((s, si) => {
              const v = s.values[i];
              const y0 = cum;
              cum += v;
              return { v, y0, label: s.label, color: STACK_COLORS[si] };
            })
            .filter((s) => s.v > 0);
          return (
            <g key={date}>
              {segs.map((s, si) => {
                const isTop = si === segs.length - 1;
                const yTop = top + plotH - ((s.y0 + s.v) / max) * plotH;
                // 2px surface gap between stacked segments
                const h = Math.max(
                  1,
                  (s.v / max) * plotH - (isTop ? 0 : 2)
                );
                return isTop ? (
                  <path
                    key={s.label}
                    d={topRoundedColumn(x, yTop, barW, h)}
                    fill={s.color}
                  />
                ) : (
                  <rect
                    key={s.label}
                    x={x}
                    y={yTop}
                    width={barW}
                    height={h}
                    fill={s.color}
                  />
                );
              })}
              {i === peak && totals[i] > 0 && (
                <text
                  x={i * slot + slot / 2}
                  y={top + plotH - (totals[i] / max) * plotH - 4}
                  textAnchor="middle"
                  fontSize={10}
                  fontWeight={600}
                  fill={INK}
                  fillOpacity={0.7}
                >
                  {totals[i]}
                </text>
              )}
              <text
                x={i * slot + slot / 2}
                y={H - 4}
                textAnchor="middle"
                fontSize={9.5}
                fill={INK}
                fillOpacity={0.45}
              >
                {Number(date.slice(8, 10))}
              </text>
              <rect x={i * slot} y={0} width={slot} height={H} fill="transparent">
                <title>
                  {`${niceDay(date)}: ${totals[i]} scan${totals[i] === 1 ? "" : "s"}` +
                    (totals[i] > 0
                      ? `\n${segs.map((s) => `${s.label}: ${s.v}`).join("\n")}`
                      : "")}
                </title>
              </rect>
            </g>
          );
        })}
      </svg>
      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
        {data.series.map((s, si) => (
          <span key={s.slug} className="flex items-center gap-1.5 text-xs text-ocean-900/70">
            <span
              className="h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: STACK_COLORS[si] }}
            />
            {s.label}
            <span className="font-mono text-ocean-900/50">{s.total}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Booking source mix — horizontal bars in the calendar's colors       */
/* ------------------------------------------------------------------ */

export function SourceMixChart({
  data,
}: {
  data: DashboardIntel["sourceMix"];
}) {
  const total = data.reduce((a, s) => a + s.count, 0);
  const max = Math.max(1, ...data.map((s) => s.count));
  return (
    <div className="mt-2 space-y-2">
      {data.map((s) => {
        const meta = PLATFORM_META[s.platform] ?? {
          label: s.platform,
          color: "#0891b2",
        };
        const pct = total > 0 ? Math.round((s.count / total) * 100) : 0;
        return (
          <div
            key={s.platform}
            className="flex items-center gap-3"
            title={`${meta.label}: ${s.count} booking${s.count === 1 ? "" : "s"} (${pct}%)`}
          >
            <span className="w-24 shrink-0 text-sm text-ocean-900/70">
              {meta.label}
            </span>
            <div className="h-3.5 min-w-0 flex-1">
              <div
                className="h-full rounded-r-[4px]"
                style={{
                  width: `${(s.count / max) * 100}%`,
                  backgroundColor: meta.color,
                }}
              />
            </div>
            <span className="w-20 shrink-0 text-right font-mono text-sm text-ocean-900">
              {s.count}
              <span className="text-ocean-900/45"> · {pct}%</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
