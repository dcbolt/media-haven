"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * Multi-calendar — ported from HavenOps (components/multi-calendar.tsx) and
 * adapted to media-haven: rows come from the properties table (joined
 * listings render as bold "Combined" rows via the joinedStays config),
 * bookings from the Guesty-synced reservations table, palette mapped to the
 * host dashboard's ocean/white system. HavenOps' fabricated nightly prices
 * were dropped — this shows only real data.
 */

/** How many days before/after today the scrollable window spans. */
const DAYS_BEFORE = 14;
const DAYS_AFTER = 140;

export type CalListing = {
  id: string;
  name: string;
  kind: "combo" | "single";
  thumbUrl: string | null;
};

export type BookingSource = "airbnb" | "vrbo" | "booking" | "direct";

export type CalBooking = {
  id: string;
  listingId: string;
  guest: string;
  source: BookingSource;
  start: string; // YYYY-MM-DD
  end: string;
};

/** Per-platform bar styling (ported from HavenOps, media-haven palette). */
const SOURCE: Record<BookingSource, { bar: string; glyph: string; label: string }> = {
  airbnb: { bar: "bg-rose-500", glyph: "⌂", label: "Airbnb" },
  vrbo: { bar: "bg-sky-600", glyph: "V", label: "Vrbo" },
  booking: { bar: "bg-indigo-600", glyph: "B", label: "Booking.com" },
  direct: { bar: "bg-ocean-600", glyph: "↗", label: "Direct / Reserved" },
};

interface Dims {
  DAY_W: number;
  LEFT_W: number;
  ROW_H: number;
}
const DESKTOP: Dims = { DAY_W: 56, LEFT_W: 212, ROW_H: 60 };

function useDims(): Dims {
  const [dims, setDims] = useState<Dims>(DESKTOP);
  useEffect(() => {
    const compute = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      if (w < 640) setDims({ DAY_W: 44, LEFT_W: 116, ROW_H: 52 });
      else if (h < 500) setDims({ DAY_W: 46, LEFT_W: 150, ROW_H: 44 });
      else if (w < 1024) setDims({ DAY_W: 50, LEFT_W: 176, ROW_H: 58 });
      else setDims(DESKTOP);
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, []);
  return dims;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/** Parse an ISO date (YYYY-MM-DD) into a UTC-safe Date to avoid TZ drift. */
function parseDate(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Days from `from` to `iso` (negative = before). */
function daysBetween(iso: string, from: string): number {
  return Math.round((parseDate(iso).getTime() - parseDate(from).getTime()) / 86_400_000);
}

function addDaysISO(startISO: string, i: number): string {
  const d = parseDate(startISO);
  d.setUTCDate(d.getUTCDate() + i);
  return d.toISOString().slice(0, 10);
}

/** The viewer's local date (so "today" matches their timezone, not the server's). */
function localTodayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface DayCell {
  iso: string;
  day: number;
  weekday: string;
  isWeekend: boolean;
  month: number;
  year: number;
}

export default function MultiCalendar({
  listings,
  bookings,
  serverToday,
}: {
  listings: CalListing[];
  bookings: CalBooking[];
  serverToday: string;
}) {
  const d = useDims();
  const [query, setQuery] = useState("");
  // Start from the server's date (matches SSR), then correct to the viewer's
  // local date after mount so the calendar is always current.
  const [today, setToday] = useState(serverToday);
  useEffect(() => {
    const local = localTodayISO();
    if (local !== today) setToday(local);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scrollRef = useRef<HTMLDivElement>(null);

  const start = useMemo(() => addDaysISO(today, -DAYS_BEFORE), [today]);
  const numDays = DAYS_BEFORE + DAYS_AFTER;
  const days = useMemo<DayCell[]>(
    () =>
      Array.from({ length: numDays }, (_, i) => {
        const iso = addDaysISO(start, i);
        const dt = parseDate(iso);
        return {
          iso,
          day: dt.getUTCDate(),
          weekday: WEEKDAYS[dt.getUTCDay()],
          isWeekend: dt.getUTCDay() === 0 || dt.getUTCDay() === 6,
          month: dt.getUTCMonth(),
          year: dt.getUTCFullYear(),
        };
      }),
    [start, numDays]
  );
  const monthSpans = useMemo(() => {
    const spans: { label: string; count: number }[] = [];
    for (const day of days) {
      const label = `${MONTHS[day.month]} ${day.year}`;
      const last = spans[spans.length - 1];
      if (last && last.label === label) last.count++;
      else spans.push({ label, count: 1 });
    }
    return spans;
  }, [days]);
  const todayOffset = DAYS_BEFORE;

  const [step, setStep] = useState<"week" | "month">("week");

  const scrollToToday = useCallback(
    (smooth = true) => {
      scrollRef.current?.scrollTo({
        left: Math.max(0, todayOffset * d.DAY_W - 60),
        behavior: smooth ? "smooth" : "auto",
      });
    },
    [todayOffset, d.DAY_W]
  );
  const scrollToIndex = (i: number) =>
    scrollRef.current?.scrollTo({ left: Math.max(0, i * d.DAY_W), behavior: "smooth" });
  const leftIndex = () =>
    scrollRef.current ? Math.round(scrollRef.current.scrollLeft / d.DAY_W) : 0;

  function slide(dir: 1 | -1) {
    if (step === "week") {
      scrollRef.current?.scrollBy({ left: dir * 7 * d.DAY_W, behavior: "smooth" });
      return;
    }
    const i = leftIndex();
    const m = days[i]?.month;
    if (dir === 1) {
      let j = i;
      while (j < days.length && days[j].month === m) j++;
      scrollToIndex(j);
    } else {
      let cur = i;
      while (cur > 0 && days[cur - 1].month === m) cur--;
      if (i - cur <= 1 && cur > 0) {
        let p = cur - 1;
        const pm = days[p].month;
        while (p > 0 && days[p - 1].month === pm) p--;
        scrollToIndex(p);
      } else {
        scrollToIndex(cur);
      }
    }
  }
  useEffect(() => {
    scrollToToday(false);
  }, [scrollToToday, start]);

  const shownListings = useMemo(
    () => listings.filter((l) => l.name.toLowerCase().includes(query.trim().toLowerCase())),
    [listings, query]
  );
  const bookingsByListing = useMemo(() => {
    const map = new Map<string, CalBooking[]>();
    for (const b of bookings) {
      const arr = map.get(b.listingId) ?? [];
      arr.push(b);
      map.set(b.listingId, arr);
    }
    return map;
  }, [bookings]);

  const trackW = numDays * d.DAY_W;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <div className="flex items-center gap-0.5 rounded-full bg-ocean-50 p-0.5 ring-1 ring-ocean-100">
          <button
            onClick={() => slide(-1)}
            aria-label="Previous"
            className="flex h-8 w-8 items-center justify-center rounded-full text-ocean-700 transition active:scale-90 hover:bg-ocean-100"
          >
            ‹
          </button>
          {(["week", "month"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStep(s)}
              className={cn(
                "rounded-full px-2.5 py-1.5 text-xs font-medium capitalize transition",
                step === s ? "bg-white text-ocean-900 shadow" : "text-ocean-900/50"
              )}
            >
              {s}
            </button>
          ))}
          <button
            onClick={() => slide(1)}
            aria-label="Next"
            className="flex h-8 w-8 items-center justify-center rounded-full text-ocean-700 transition active:scale-90 hover:bg-ocean-100"
          >
            ›
          </button>
        </div>
        <button
          onClick={() => scrollToToday(true)}
          className="min-h-[36px] rounded-full bg-ocean-50 px-3 py-1.5 text-xs font-medium text-ocean-700 ring-1 ring-ocean-100 transition active:scale-95 hover:bg-ocean-100"
        >
          Today
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl bg-white shadow-md ring-1 ring-ocean-100">
        <div
          ref={scrollRef}
          className="overflow-x-auto [-webkit-overflow-scrolling:touch] [touch-action:pan-x_pan-y]"
        >
          <div className="relative" style={{ width: d.LEFT_W + trackW }}>
            {/* ---------- Header ---------- */}
            <div className="sticky top-0 z-30 flex border-b border-ocean-100">
              <div
                className="sticky left-0 z-40 flex items-center bg-white px-2 sm:px-3"
                style={{ width: d.LEFT_W, minWidth: d.LEFT_W }}
              >
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search"
                  className="min-h-[36px] w-full rounded-full bg-ocean-50 px-3 py-2 text-xs text-ocean-900 ring-1 ring-ocean-100 placeholder:text-ocean-900/45 focus:outline-none focus:ring-2 focus:ring-ocean-300"
                />
              </div>
              <div className="bg-white" style={{ width: trackW }}>
                <div className="flex">
                  {monthSpans.map((m, mi) => (
                    <div
                      key={`${m.label}-${mi}`}
                      className="border-l border-ocean-100 px-2 py-1 text-xs font-semibold text-ocean-700"
                      style={{ width: m.count * d.DAY_W }}
                    >
                      {m.label}
                    </div>
                  ))}
                </div>
                <div className="flex">
                  {days.map((day, i) => (
                    <div
                      key={day.iso}
                      className={cn(
                        "flex flex-col items-center justify-center border-l border-ocean-50 pb-1 pt-0.5",
                        day.isWeekend && "bg-ocean-50/60",
                        i === todayOffset && "bg-ocean-100/70"
                      )}
                      style={{ width: d.DAY_W }}
                    >
                      <span className="text-[10px] uppercase tracking-wide text-ocean-900/50">
                        {day.weekday}
                      </span>
                      <span
                        className={cn(
                          "text-xs font-semibold",
                          i === todayOffset ? "text-ocean-700" : "text-ocean-900"
                        )}
                      >
                        {String(day.day).padStart(2, "0")}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ---------- Rows ---------- */}
            {shownListings.map((listing) => (
              <ListingRow
                key={listing.id}
                listing={listing}
                bookings={bookingsByListing.get(listing.id) ?? []}
                d={d}
                start={start}
                days={days}
                numDays={numDays}
              />
            ))}

            {shownListings.length === 0 && (
              <div className="px-4 py-10 text-center text-sm text-ocean-900/60">
                No properties match “{query}”.
              </div>
            )}

            {/* today line */}
            <div
              className="pointer-events-none absolute bottom-0 z-20 w-px bg-red-500"
              style={{ left: d.LEFT_W + todayOffset * d.DAY_W, top: 48 }}
            >
              <span className="absolute -top-1 -left-[3px] h-1.5 w-1.5 rounded-full bg-red-500" />
            </div>
          </div>
        </div>
      </div>

      {/* Legend — only the platforms actually present in the window. */}
      <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-ocean-900/60">
        {(Object.keys(SOURCE) as BookingSource[])
          .filter((k) => bookings.some((b) => b.source === k))
          .map((k) => (
            <span key={k} className="flex items-center gap-1.5">
              <span className={cn("h-2.5 w-4 rounded-sm", SOURCE[k].bar)} />
              {SOURCE[k].label}
            </span>
          ))}
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-px bg-red-500" /> Today
        </span>
      </div>
    </div>
  );
}

function ListingRow({
  listing,
  bookings,
  d,
  start,
  days,
  numDays,
}: {
  listing: CalListing;
  bookings: CalBooking[];
  d: Dims;
  start: string;
  days: DayCell[];
  numDays: number;
}) {
  const isCombo = listing.kind === "combo";
  const compact = d.LEFT_W < 160;

  return (
    <div className="flex border-b border-ocean-50">
      <div
        className={cn(
          "sticky left-0 z-10 flex items-center gap-2 border-r border-ocean-100 bg-white px-2 sm:px-3",
          isCombo && "bg-ocean-50/60"
        )}
        style={{ width: d.LEFT_W, minWidth: d.LEFT_W, height: d.ROW_H }}
      >
        {listing.thumbUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={listing.thumbUrl}
            alt=""
            className={cn(
              "shrink-0 rounded-lg object-cover ring-1 ring-black/5",
              compact ? "h-7 w-7" : "h-9 w-9"
            )}
          />
        ) : (
          <span
            className={cn(
              "shrink-0 rounded-lg bg-gradient-to-br from-ocean-400 to-ocean-700 ring-1 ring-black/5",
              compact ? "h-7 w-7" : "h-9 w-9"
            )}
          />
        )}
        <span className="min-w-0">
          <span
            className={cn(
              "block truncate leading-tight text-ocean-900",
              compact ? "text-xs" : "text-sm",
              isCombo ? "font-bold" : "font-medium"
            )}
          >
            {listing.name}
          </span>
          {!compact && (
            <span className="block text-[11px] text-ocean-900/50">
              {isCombo ? "Combined · 2 villas" : "Single villa"}
            </span>
          )}
        </span>
      </div>

      <div className="relative" style={{ width: numDays * d.DAY_W, height: d.ROW_H }}>
        <div className="flex h-full">
          {days.map((day) => (
            <div
              key={day.iso}
              className={cn(
                "h-full border-l border-ocean-50",
                day.isWeekend && "bg-ocean-50/40"
              )}
              style={{ width: d.DAY_W }}
            />
          ))}
        </div>

        {bookings.map((b) => (
          <BookingBar key={b.id} booking={b} d={d} start={start} numDays={numDays} />
        ))}
      </div>
    </div>
  );
}

function BookingBar({
  booking,
  d,
  start,
  numDays,
}: {
  booking: CalBooking;
  d: Dims;
  start: string;
  numDays: number;
}) {
  const off = daysBetween(booking.start, start);
  const nights = daysBetween(booking.end, booking.start);
  const s = SOURCE[booking.source];

  // Check-in afternoon → check-out morning: bars run midday to midday.
  const left = (off + 0.5) * d.DAY_W;
  const right = (off + nights + 0.5) * d.DAY_W;
  const maxRight = numDays * d.DAY_W;
  const clippedLeft = Math.max(2, left);
  const clippedRight = Math.min(maxRight - 2, right);
  const width = clippedRight - clippedLeft;
  if (width <= 0 || clippedLeft >= maxRight) return null;

  return (
    <div
      className={cn(
        "absolute flex items-center gap-1.5 overflow-hidden rounded-lg px-1.5 text-white shadow-sm ring-1 ring-black/10",
        s.bar
      )}
      style={{ left: clippedLeft, width, top: 8, height: d.ROW_H - 16 }}
      title={`${booking.guest} · ${s.label} · ${booking.start} → ${booking.end}`}
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/25 text-[11px]">
        {s.glyph}
      </span>
      {width > 56 && <span className="truncate text-xs font-medium">{booking.guest}</span>}
    </div>
  );
}
