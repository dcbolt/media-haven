"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { formatTideTime } from "@/lib/tides";
import { turtleSeason } from "@/lib/turtles";
import {
  applyLaunchWeightToRotation,
  launchRotationWeight,
} from "@/lib/launch-weight";
import type { TvContent, TvState } from "@/lib/tv";

/**
 * TV kiosk app. Per DECISIONS.md it runs full-screen via Fully Kiosk (or
 * equivalent) on the unit's streamer — Shield TV Pro / Chromecast with
 * Google TV — as the boot + idle home screen. Sized entirely in vw units so
 * HD and 4K landscape render identically. No interaction required — it
 * registers itself, shows a pairing code until claimed, then rotates
 * content panels and re-polls for fresh data.
 */

// 10s: hosts relink TVs between properties during turnovers and expect the
// switch to feel immediate (was 30s; state builds are cheap + budgeted).
const POLL_MS = 10_000;
// Browsers degrade over multi-day runs; the signage industry's standard fix
// is a scheduled full reload. Per ROADMAP 1.7 we reload at ~4am local (the
// quietest hour, nobody watching) with a few minutes of per-load jitter so a
// whole fleet doesn't reload in the same second; a 6h cap covers TVs that
// boot just after 4am. Reloads re-render in <2s and the last-good cache
// guarantees content meanwhile.
function msUntilSelfHeal(): number {
  const next = new Date();
  next.setHours(4, 0, 0, 0);
  if (next.getTime() <= Date.now()) next.setDate(next.getDate() + 1);
  const untilFourAm = next.getTime() - Date.now() + Math.random() * 8 * 60_000;
  return Math.min(untilFourAm, 6 * 3600_000);
}
// A TV that can't reach the server for this many consecutive polls hard
// reloads — recovers from wedged fetch/DNS state that in-page retries can't.
const MAX_FAILED_POLLS = 120; // ~20 minutes at the 10s poll

function useDeviceId(): string | null {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    const key = "fh_tv_device";
    let value = localStorage.getItem(key);
    if (!value) {
      value = crypto.randomUUID();
      localStorage.setItem(key, value);
    }
    setId(value);
  }, []);
  return id;
}

function useClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

/** Addressing the family directly: "Until next time, The Butlers" reads
 *  wrong — drop the article in vocative position only ("Butlers"). The
 *  formal "The Butlers" stays everywhere else (host 2026-07-17). */
function vocative(label: string): string {
  return label.replace(/^The\s+/i, "");
}

const LAST_GOOD_KEY = "fh_tv_last_good";

/** Older deployments cached a narrower TvContent (no photos / screensavers /
 *  sections). Fill any missing arrays so a stale last-good cache — or an old
 *  server payload — can never crash the renderer. TVs must never show an
 *  error page. */
function normalizeState(s: TvState): TvState {
  if (s.mode !== "demo" && s.mode !== "active") return s;
  // Cast: the compile-time type says these keys always exist; stale cached
  // JSON is exactly the case where they don't.
  const c = s.content as Partial<TvContent>;
  return {
    ...s,
    content: {
      ...s.content,
      sections: c.sections ?? [],
      photos: c.photos ?? [],
      screensavers: c.screensavers ?? [],
      guestLabel: c.guestLabel ?? c.guestFirstName ?? null,
      checkIn: c.checkIn ?? null,
      forecast: c.forecast ?? null,
      timing: c.timing ?? { slideMs: 20_000, fadeMs: 2_500 },
      nextYear: c.nextYear ?? null,
      showTurtles: c.showTurtles ?? true,
      upsell: c.upsell ?? null,
      playlist: c.playlist ?? null,
      takeover: c.takeover ?? null,
      vacantPlaylist: c.vacantPlaylist ?? null,
    },
  };
}

export default function TvApp() {
  const deviceId = useDeviceId();
  const [state, setState] = useState<TvState | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  // Signage-editor thumbnails: ?property=<id> (host-authed content, no
  // device rows) + ?slide=<key> (pin one slide, no rotation). One fetch,
  // no polling loops, and never touching the real TV's last-good cache.
  const [previewProperty] = useState(() =>
    typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.search).get("property")
  );
  const [pinSlide] = useState(() =>
    typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.search).get("slide")
  );
  const thumbMode = Boolean(previewProperty || pinSlide);

  useEffect(() => {
    // Host preview switches: ?preview=standby shows the screensaver screen
    // without waiting for an unoccupied night; ?preview=lastnight shows the
    // farewell deck without waiting for a guest's final evening.
    setPreview(new URLSearchParams(window.location.search).get("preview"));

    // Never-blank: hydrate from the last good state immediately so a TV
    // that reboots during a server or network outage shows the guide, not
    // a splash screen. Live polling replaces it as soon as it succeeds.
    if (new URLSearchParams(window.location.search).get("property")) return;
    try {
      const cached = localStorage.getItem(LAST_GOOD_KEY);
      if (cached) {
        const parsed = JSON.parse(cached) as TvState;
        if (parsed && (parsed.mode === "demo" || parsed.mode === "active")) {
          setState((s) => s ?? normalizeState(parsed));
        }
      }
    } catch {
      // corrupt cache — live poll will repopulate it
    }
  }, []);

  const failedPolls = useRef(0);
  const deploySha = useRef<string | null>(null);
  // Path C: one-shot launch per command id (sessionStorage survives intent return).
  const handledCommands = useRef<Set<string>>(new Set());

  const poll = useCallback(async () => {
    if (!deviceId && !previewProperty) return;
    try {
      const res = await fetch(
        previewProperty
          ? `/api/tv/state?property=${encodeURIComponent(previewProperty)}`
          : `/api/tv/state?device=${deviceId}`,
        { cache: "no-store" }
      );
      if (res.ok) {
        const payload = (await res.json()) as TvState & {
          deploy?: string | null;
          forceReloadAt?: string | null;
          pendingCommand?: {
            id: string;
            action: string;
            slug: string;
            androidPackage: string;
            launchUrl: string;
          } | null;
        };
        // New deploy → reload into the fresh bundle within one poll. The
        // first sha seen is the baseline (this page may already be newer or
        // older than any given serverless instance; only a *change* matters).
        if (payload.deploy) {
          // ≥2min uptime before honoring a change — mixed responses during a
          // rolling deploy must not bounce the TV in a reload loop.
          if (
            deploySha.current &&
            deploySha.current !== payload.deploy &&
            performance.now() > 120_000
          ) {
            window.location.reload();
            return;
          }
          deploySha.current ??= payload.deploy;
        }

        // S0.3b: host force-reload stamp (org settings.deviceReloads).
        // sessionStorage guards against reload loops while the stamp is fresh.
        if (payload.forceReloadAt && !previewProperty) {
          const reloadKey = `fh_force_reload_${payload.forceReloadAt}`;
          let already = false;
          try {
            already = Boolean(sessionStorage.getItem(reloadKey));
          } catch {
            /* private mode */
          }
          if (!already && performance.now() > 5_000) {
            try {
              sessionStorage.setItem(reloadKey, "1");
            } catch {
              /* ignore */
            }
            window.location.reload();
            return;
          }
        }

        // Path C: portal "Open on TV" — claim is already done server-side;
        // fire intent once, then fire-and-forget ack.
        const cmd = payload.pendingCommand;
        if (cmd?.id && cmd.launchUrl && !previewProperty) {
          const seenKey = `fh_tv_cmd_${cmd.id}`;
          let already = handledCommands.current.has(cmd.id);
          try {
            if (sessionStorage.getItem(seenKey)) already = true;
          } catch {
            /* private mode */
          }
          if (!already) {
            handledCommands.current.add(cmd.id);
            try {
              sessionStorage.setItem(seenKey, "1");
            } catch {
              /* ignore */
            }
            try {
              window.location.href = cmd.launchUrl;
            } catch {
              /* non-Android preview */
            }
            void fetch(`/api/tv/command/${cmd.id}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                status: "done",
                deviceId: deviceId ?? undefined,
              }),
            }).catch(() => {
              /* TTL covers lost acks */
            });
          }
        }

        const next = normalizeState(payload);
        setState(next);
        failedPolls.current = 0;
        if ((next.mode === "demo" || next.mode === "active") && !previewProperty) {
          try {
            localStorage.setItem(LAST_GOOD_KEY, JSON.stringify(next));
          } catch {
            // storage full/unavailable — cache is best-effort
          }
        }
        return;
      }
      failedPolls.current++;
    } catch {
      // keep showing the last good state; TVs must never show an error page
      failedPolls.current++;
    }
    if (failedPolls.current >= MAX_FAILED_POLLS && !previewProperty)
      window.location.reload();
  }, [deviceId, previewProperty]);

  useEffect(() => {
    poll();
    if (thumbMode) return; // thumbnails: one fetch, no reload/poll loops
    const t = setInterval(poll, POLL_MS);
    const heal = setTimeout(() => window.location.reload(), msUntilSelfHeal());
    return () => {
      clearInterval(t);
      clearTimeout(heal);
    };
  }, [poll, thumbMode]);

  useEffect(() => {
    // Best-effort: keep the display awake on browsers that support it
    // (Fully Kiosk handles keep-awake natively; this covers plain browsers).
    let lock: { release(): Promise<void> } | null = null;
    async function acquire() {
      try {
        lock = await (
          navigator as Navigator & {
            wakeLock?: { request(type: "screen"): Promise<{ release(): Promise<void> }> };
          }
        ).wakeLock?.request("screen") ?? null;
      } catch {
        // unsupported or denied — TV-side sleep settings take over
      }
    }
    acquire();
    const onVisible = () => document.visibilityState === "visible" && acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      lock?.release().catch(() => {});
    };
  }, []);

  if (!state) return <BrandSplash />;
  if (state.mode === "pairing") return <PairingScreen code={state.pairCode} />;
  // S1.3b: fleet emergency takeover beats standby AND normal rotation —
  // storm messages must reach vacant homes too (Rise Vision–style override).
  // (mode is already narrowed past "pairing" by the early return above)
  if (!pinSlide && "content" in state && state.content.takeover) {
    return <TakeoverScreen takeover={state.content.takeover} />;
  }
  // Pinned-slide thumbnails always show signage — an unoccupied property
  // would otherwise thumbnail as a black standby frame.
  // S1.4: vacant playlist media plays before ambient screensavers/photos.
  if (!pinSlide && (preview === "standby" || !state.content.occupied)) {
    const vacantMedia = vacantAssets(state.content);
    const assets =
      vacantMedia.length > 0 ? vacantMedia : state.content.screensavers;
    return <Standby assets={assets} />;
  }
  return (
    <Signage
      state={state}
      forceLastNight={preview === "lastnight"}
      pinSlide={pinSlide}
    />
  );
}

/** Media blocks from the vacant-mode playlist (S1.4), in playlist order. */
function vacantAssets(
  c: TvContent
): { url: string; type: "image" | "video" }[] {
  const pl = c.vacantPlaylist;
  if (!pl?.items?.length) return [];
  const out: { url: string; type: "image" | "video" }[] = [];
  for (const it of pl.items) {
    if (it.url && (it.mediaType === "image" || it.mediaType === "video")) {
      out.push({ url: it.url, type: it.mediaType });
    }
  }
  return out;
}

/** Full-bleed emergency message (S1.3b). No rotation, no menu — clear only. */
function TakeoverScreen({
  takeover,
}: {
  takeover: NonNullable<TvContent["takeover"]>;
}) {
  const accent =
    takeover.kind === "storm"
      ? "from-ocean-900 via-ocean-800 to-slate-900"
      : takeover.kind === "water"
        ? "from-sky-900 via-ocean-800 to-ocean-900"
        : "from-ocean-900 via-ocean-700 to-ocean-900";
  return (
    <div
      className={`flex h-full w-full flex-col items-center justify-center bg-gradient-to-br ${accent} px-[8vw] text-center text-white`}
    >
      <p className="text-[1.8vw] font-semibold uppercase tracking-[0.35em] text-seafoam-500">
        {takeover.kind === "storm"
          ? "Weather alert"
          : takeover.kind === "water"
            ? "Water advisory"
            : "Notice"}
      </p>
      <h1 className="mt-[2vw] max-w-[80vw] font-serif text-[5.5vw] font-semibold leading-tight">
        {takeover.title}
      </h1>
      <p className="mt-[2.5vw] max-w-[70vw] text-[2.4vw] leading-relaxed text-white/90">
        {takeover.body}
      </p>
      <p className="mt-[3vw] text-[1.4vw] text-white/45">
        Auto-clears {new Date(takeover.until).toLocaleString()} · host can clear
        anytime
      </p>
    </div>
  );
}

/** Between stays: host-provided 4K photos/videos as a slow slideshow, or a
 *  near-black screen when none exist (OLED-safe, minimal power). The clock
 *  drifts position each minute to prevent burn-in. Flips back to signage
 *  automatically when the next reservation checks in. */
function Standby({ assets }: { assets: TvContent["screensavers"] }) {
  const now = useClock();
  const [assetIndex, setAssetIndex] = useState(0);
  const asset = assets.length > 0 ? assets[assetIndex % assets.length] : null;
  // Warm the next asset while this one rests — 4K standby photos otherwise
  // fade in over a cold fetch every 45s.
  const next =
    assets.length > 1 ? assets[(assetIndex + 1) % assets.length] : null;

  const advance = useCallback(
    () => setAssetIndex((i) => (i + 1) % Math.max(assets.length, 1)),
    [assets.length]
  );

  useEffect(() => {
    if (!asset || asset.type === "video") return; // videos advance on ended
    const t = setTimeout(advance, 45_000);
    return () => clearTimeout(t);
  }, [asset, assetIndex, advance]);

  const minute = now.getHours() * 60 + now.getMinutes();
  const top = 20 + ((minute * 7) % 55);
  const left = 15 + ((minute * 13) % 60);

  return (
    <div className="relative h-full bg-black">
      {asset && asset.type === "image" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={asset.url}
          src={asset.url}
          alt=""
          onError={advance}
          className="h-full w-full object-cover animate-[tvfade_2s_ease]"
        />
      )}
      {asset && asset.type === "video" && (
        <video
          key={asset.url}
          src={asset.url}
          autoPlay
          muted
          playsInline
          onEnded={advance}
          onError={advance}
          className="h-full w-full object-cover"
        />
      )}
      <div
        className="absolute text-white/40 transition-all duration-1000"
        style={{ top: `${top}%`, left: `${left}%`, textShadow: "0 0 1vw rgba(0,0,0,0.8)" }}
      >
        <p className="text-[3vw] font-light">
          {now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
        </p>
        <p className="text-[1vw]">The Florida Havens</p>
      </div>
      {next && <MediaPreloader media={[next]} />}
    </div>
  );
}

/** Season-aware sea turtle slide: nesting / hatching phase, key facts, and
 *  the beach rules that matter right now (Archie Carr refuge). */
function TurtleSlide() {
  const season = turtleSeason();
  return (
    <div className="flex h-full items-center gap-[5vw] px-[7vw]">
      <div className="min-w-0 flex-1">
        <p className="text-[1.1vw] font-semibold uppercase tracking-[0.45em] text-seafoam-500">
          {season.eyebrow}
        </p>
        <h2 className="mt-[0.8vw] font-serif text-[4vw] font-semibold leading-tight">
          {season.headline}
        </h2>
        <p className="mt-[1.2vw] text-[1.7vw] leading-relaxed text-white/85">
          {season.sub}
        </p>
        <p className="mt-[1.6vw] text-[1.35vw] leading-relaxed text-white/60">
          {season.facts[0]}
        </p>
      </div>
      <div className="w-[34vw] shrink-0 rounded-[1.2vw] border-l-[0.35vw] border-seafoam-500 bg-white/10 p-[2vw]">
        <p className="text-[1vw] font-semibold uppercase tracking-[0.3em] text-white/55">
          How to help
        </p>
        <ul className="mt-[1vw] space-y-[1vw]">
          {season.rules.map((r) => (
            <li key={r} className="flex gap-[0.8vw] text-[1.35vw] leading-snug text-white/90">
              <span className="text-seafoam-500">•</span>
              {r}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ── Weather section (host 2026-07-17): today + 3-day + 5-day slides ── */

type ConditionGroup = "sun" | "partly" | "cloud" | "fog" | "rain" | "storm";

function conditionGroup(code: number): ConditionGroup {
  if (code >= 95) return "storm";
  if (code >= 51) return "rain"; // drizzle, rain, showers
  if (code === 45 || code === 48) return "fog";
  if (code === 3) return "cloud";
  if (code === 2) return "partly";
  return "sun"; // 0–1, and unknown codes read optimistic at the beach
}

/** Brand-styled line icons — thin strokes in the seafoam accent, matching
 *  the header's sunrise/sunset marks. */
function ConditionIcon({ code, className }: { code: number; className: string }) {
  const g = conditionGroup(code);
  const cloud = (
    <path d="M22.5 22.5H10a5 5 0 1 1 1-9.9 7 7 0 0 1 13.5 2A4 4 0 0 1 22.5 22.5z" />
  );
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {g === "sun" && (
        <>
          <circle cx="16" cy="16" r="5.5" />
          <path d="M16 4v3M16 25v3M4 16h3M25 16h3M7.5 7.5l2.1 2.1M22.4 22.4l2.1 2.1M24.5 7.5l-2.1 2.1M9.6 22.4l-2.1 2.1" />
        </>
      )}
      {g === "partly" && (
        <>
          <circle cx="11" cy="11" r="4" />
          <path d="M11 3.5V6M3.5 11H6M5.7 5.7l1.8 1.8M16.3 5.7l-1.8 1.8" />
          <path d="M25 25H14a4.2 4.2 0 1 1 .9-8.3 6 6 0 0 1 11.5 1.8A3.3 3.3 0 0 1 25 25z" />
        </>
      )}
      {g === "cloud" && cloud}
      {g === "fog" && (
        <>
          <path d="M22.5 18H10a5 5 0 1 1 1-9.9 7 7 0 0 1 13.5 2A4 4 0 0 1 22.5 18z" />
          <path d="M9 22.5h14M12 26.5h8" />
        </>
      )}
      {g === "rain" && (
        <>
          <path d="M22.5 19.5H10a5 5 0 1 1 1-9.9 7 7 0 0 1 13.5 2 4 4 0 0 1-2 7.9z" />
          <path d="M11.5 23.5l-1.2 3M16.5 23.5l-1.2 3M21.5 23.5l-1.2 3" />
        </>
      )}
      {g === "storm" && (
        <>
          <path d="M22.5 18.5H10a5 5 0 1 1 1-9.9 7 7 0 0 1 13.5 2 4 4 0 0 1-2 7.9z" />
          <path d="M16.5 20.5 13 25.5h4l-2.5 4.5" />
        </>
      )}
    </svg>
  );
}

/** "YYYY-MM-DD" at local noon — plain new Date() would parse UTC midnight
 *  and shift the weekday for US timezones. */
function forecastDate(iso: string): Date {
  return new Date(`${iso}T12:00:00`);
}

function forecastDayName(iso: string, i: number, short = false): string {
  if (i === 0) return "Today";
  if (i === 1 && !short) return "Tomorrow";
  return forecastDate(iso).toLocaleDateString("en-US", {
    weekday: short ? "short" : "long",
  });
}

/** Dots under each Weather slide: where you are in today / 3-day / 5-day,
 *  and the ◀ ▶ affordance for paging between them. */
function WeatherPager({ page, count }: { page: number; count: number }) {
  if (count < 2 || page < 0) return null;
  return (
    <div className="mt-[2.4vw] flex items-center gap-[0.9vw]">
      <span className="text-[1vw] text-white/30">◀</span>
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className={`h-[0.55vw] w-[0.55vw] rounded-full ${
            i === page ? "bg-seafoam-500" : "bg-white/25"
          }`}
        />
      ))}
      <span className="text-[1vw] text-white/30">▶</span>
      <span className="ml-[0.7vw] text-[1vw] uppercase tracking-[0.22em] text-white/30">
        Weather
      </span>
    </div>
  );
}

type ForecastDays = NonNullable<TvContent["forecast"]>;

/** Detailed 3-day outlook — three roomy cards with big condition marks. */
function ForecastThreeDay({
  days,
  pager,
}: {
  days: ForecastDays;
  pager: { page: number; count: number };
}) {
  return (
    <div className="flex h-full flex-col justify-center px-[8vw]">
      <p className="text-[1.1vw] font-semibold uppercase tracking-[0.45em] text-seafoam-500">
        The days ahead
      </p>
      <h2 className="mt-[0.8vw] font-serif text-[4.4vw] font-semibold">
        Three-day outlook
      </h2>
      <div className="mt-[2.2vw] flex gap-[2.2vw]">
        {days.slice(0, 3).map((d, i) => (
          <div
            key={d.date}
            className="flex-1 rounded-[1.2vw] bg-white/[0.07] px-[2vw] py-[2.2vw] text-center ring-1 ring-white/10"
          >
            <p className="text-[1.3vw] uppercase tracking-[0.24em] text-white/55">
              {forecastDayName(d.date, i)}
            </p>
            <ConditionIcon
              code={d.code}
              className="mx-auto mt-[1.4vw] h-[6.5vw] w-[6.5vw] text-seafoam-500"
            />
            <p className="mt-[1vw] text-[1.6vw] text-white/75">
              {d.label || " "}
            </p>
            <p className="mt-[0.7vw] text-[2.9vw] font-semibold tabular-nums leading-none">
              {d.hiF}°
              <span className="ml-[0.6vw] text-[1.8vw] font-normal text-white/55">
                {d.loF}°
              </span>
            </p>
            <p
              className={`mt-[0.9vw] text-[1.3vw] ${
                d.precipPct >= 20 ? "text-seafoam-500/90" : "text-white/35"
              }`}
            >
              {d.precipPct >= 20
                ? `${d.precipPct}% chance of rain`
                : "Rain unlikely"}
            </p>
          </div>
        ))}
      </div>
      <WeatherPager {...pager} />
    </div>
  );
}

/** Compact 5-day strip — the week at a glance. */
function ForecastFiveDay({
  days,
  pager,
}: {
  days: ForecastDays;
  pager: { page: number; count: number };
}) {
  return (
    <div className="flex h-full flex-col justify-center px-[8vw]">
      <p className="text-[1.1vw] font-semibold uppercase tracking-[0.45em] text-seafoam-500">
        The week ahead
      </p>
      <h2 className="mt-[0.8vw] font-serif text-[4.4vw] font-semibold">
        Five-day outlook
      </h2>
      <div className="mt-[2.2vw] flex gap-[1.6vw]">
        {days.slice(0, 5).map((d, i) => (
          <div
            key={d.date}
            className="flex-1 rounded-[1.2vw] bg-white/[0.06] px-[1vw] py-[1.8vw] text-center ring-1 ring-white/10"
          >
            <p className="text-[1.15vw] uppercase tracking-[0.2em] text-white/55">
              {forecastDayName(d.date, i, true)}
            </p>
            <ConditionIcon
              code={d.code}
              className="mx-auto mt-[1vw] h-[3.8vw] w-[3.8vw] text-seafoam-500"
            />
            <p className="mt-[0.9vw] text-[2.1vw] font-semibold tabular-nums leading-none">
              {d.hiF}°
            </p>
            <p className="mt-[0.4vw] text-[1.4vw] tabular-nums text-white/50">
              {d.loF}°
            </p>
            <p
              className={`mt-[0.6vw] text-[1.05vw] ${
                d.precipPct >= 20 ? "text-seafoam-500/80" : "text-white/25"
              }`}
            >
              {d.precipPct >= 20 ? `${d.precipPct}% rain` : " "}
            </p>
          </div>
        ))}
      </div>
      <WeatherPager {...pager} />
    </div>
  );
}

/** Launch-day announcement (host request 2026-07-17): when a launch is
 *  scheduled today, a dedicated slide joins the rotation with a live
 *  T-minus so guests don't miss it. */
function LaunchDayAlert({
  launch,
}: {
  launch: NonNullable<TvContent["launches"]>[number];
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const diff = new Date(launch.net).getTime() - now;
  const pad = (n: number) => String(n).padStart(2, "0");
  const h = Math.floor(diff / 3600_000);
  const m = Math.floor((diff % 3600_000) / 60_000);
  const s = Math.floor((diff % 60_000) / 1000);
  const at = new Date(launch.net).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <p className="text-[1.2vw] font-semibold uppercase tracking-[0.45em] text-seafoam-500">
        Rocket launch today
      </p>
      <h2 className="mt-[1vw] max-w-[70vw] font-serif text-[4.6vw] font-semibold leading-tight">
        {launch.name}
      </h2>
      <p className="mt-[0.6vw] text-[1.6vw] text-white/70">
        {[launch.provider, launch.vehicle].filter(Boolean).join(" · ")}
      </p>
      {diff > 0 ? (
        <>
          <p className="mt-[2.2vw] font-mono text-[6.5vw] font-bold leading-none tabular-nums">
            T–{pad(h)}:{pad(m)}:{pad(s)}
          </p>
          <p className="mt-[1vw] text-[1.2vw] uppercase tracking-[0.3em] text-white/50">
            take-off {at}
          </p>
        </>
      ) : (
        <p className="mt-[2.2vw] font-mono text-[6.5vw] font-bold leading-none text-seafoam-500">
          LIFTOFF
        </p>
      )}
      <p className="mt-[2vw] max-w-[46vw] text-[1.5vw] leading-relaxed text-white/80">
        Step onto the sand and look north up the coastline — Cape Canaveral
        launches are visible right from your beach.
      </p>
    </div>
  );
}

/** Live launch board: every launch inside the 12-hour window gets a ticking
 *  T-minus countdown; further-out launches show their date. */
function LaunchBoard({ launches }: { launches: NonNullable<TvContent["launches"]> }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const rows = launches.slice(0, 3).map((l) => {
    const diff = new Date(l.net).getTime() - now;
    let right: React.ReactNode;
    if (diff <= 0 && diff > -30 * 60_000) {
      right = <span className="font-mono text-[3vw] font-bold text-seafoam-500">LIFTOFF</span>;
    } else if (diff > 0 && diff <= 12 * 3600_000) {
      const h = Math.floor(diff / 3600_000);
      const m = Math.floor((diff % 3600_000) / 60_000);
      const s = Math.floor((diff % 60_000) / 1000);
      const pad = (n: number) => String(n).padStart(2, "0");
      right = (
        <span className="font-mono text-[3vw] font-bold tabular-nums">
          T–{pad(h)}:{pad(m)}:{pad(s)}
        </span>
      );
    } else {
      right = (
        <span className="text-[1.8vw] text-white/70">
          {new Date(l.net).toLocaleString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}
        </span>
      );
    }
    return { launch: l, right };
  });

  return (
    <div className="flex h-full flex-col justify-center px-[8vw]">
      <h2 className="font-serif text-[4.4vw] font-semibold">Rocket Launches</h2>
      <p className="mt-[1vw] text-[1.7vw] text-white/60">
        Visible from the beach — walk out to the sand or the upper deck.
      </p>
      <div className="mt-[2.5vw] space-y-[2vw]">
        {rows.map(({ launch, right }) => (
          <div
            key={launch.name + launch.net}
            className="flex items-center justify-between gap-[3vw] border-l-[0.4vw] border-seafoam-500 pl-[2vw]"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-[2.4vw] font-semibold">{launch.name}</p>
              <p className="truncate text-[1.6vw] text-white/60">
                {[launch.provider, launch.vehicle].filter(Boolean).join(" · ")}
              </p>
            </div>
            {/* Fixed-width right column so dates/countdowns stay aligned no
                matter how long the mission title runs (host 2026-07-17). */}
            <span className="w-[21vw] shrink-0 text-right tabular-nums">
              {right}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Category filters for the Dining / Nearby menu items. Hosts label
 *  sections in the CMS; unlabeled sections fall back to keyword matching
 *  so existing guidebooks work day one. */
const DINING_RE = /din|food|restaurant|eat|coffee|brunch|breakfast|bar\b/i;
const NEARBY_RE =
  /near|local|around|attraction|beach|shop|surf|inlet|park|launch|things/i;

function sectionsFor(
  kind: "guide" | "dining" | "nearby",
  sections: TvContent["sections"]
): TvContent["sections"] {
  if (kind === "guide") return sections;
  const re = kind === "dining" ? DINING_RE : NEARBY_RE;
  return sections.filter((s) =>
    s.category ? s.category === kind : re.test(`${s.slug} ${s.title}`)
  );
}

/** Guide Book browser: D-pad moves through section titles on the left, the
 *  selected section's copy fills the right pane. Dining and Nearby are the
 *  same browser over a filtered slice of the guidebook. */
function GuideBrowser({
  title,
  sections,
  focus,
}: {
  title: string;
  sections: TvContent["sections"];
  focus: number;
}) {
  const sel = sections[Math.min(focus, Math.max(sections.length - 1, 0))];
  return (
    <div className="flex h-full gap-[4vw] px-[6vw] py-[4vw]">
      <div className="w-[27vw] shrink-0">
        <h2 className="font-serif text-[2.8vw] font-semibold">{title}</h2>
        {/* Same focus language as the main menu: seafoam accent + white on
            the focused item, letterspaced light for the rest. */}
        <div className="mt-[1.5vw] max-h-[36vw] space-y-[0.5vw] overflow-hidden">
          {sections.map((s, i) => (
            <p
              key={s.slug}
              className={`border-l-[0.2vw] px-[1.3vw] py-[0.75vw] text-[1.4vw] uppercase transition-all duration-200 ${
                i === focus
                  ? "border-seafoam-500 tracking-[0.2em] font-medium text-white"
                  : "border-white/15 tracking-[0.18em] font-light text-white/45"
              }`}
            >
              {s.title}
            </p>
          ))}
          {sections.length === 0 && (
            <p className="text-[1.7vw] text-white/60">
              Nothing here yet — the host can add sections from the dashboard.
            </p>
          )}
        </div>
        <p className="mt-[1.5vw] text-[0.95vw] uppercase tracking-[0.22em] text-white/30">
          ▲ ▼ browse · Back menu
        </p>
      </div>
      <div className="min-w-0 flex-1 self-center">
        {sel && (
          <>
            <h3 className="font-serif text-[3.4vw] font-semibold leading-tight">
              {sel.title}
            </h3>
            <p className="mt-[1.5vw] whitespace-pre-line text-[2vw] leading-relaxed text-white/85">
              {sel.body}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

/** Entertainment page — the biggest destination in the guest menu. In the
 *  idle rotation it's a static overview; opened from the menu it's fully
 *  navigable: D-pad moves the highlight across service tiles and OK brings
 *  up that service's sign-in walkthrough (activation QR + URL). Playback
 *  stays in the native apps via Home, per DECISIONS. */
function EntertainmentPage({
  c,
  focus,
  open,
}: {
  c: TvContent;
  focus: number | null;
  open: number | null;
}) {
  const services = c.streaming ?? [];
  const sel = open != null ? services[open] : null;
  return (
    <div className="relative flex h-full items-center gap-[4vw] px-[6vw]">
      <div className="min-w-0 flex-1">
        <h2 className="font-serif text-[4.4vw] font-semibold">Your shows, your accounts</h2>
        <p className="mt-[1.2vw] text-[1.9vw] leading-relaxed text-white/85">
          {focus != null
            ? "Pick a service with the arrows, press OK, and it opens right here — no inputs, no Home button."
            : "Press OK, choose Entertainment, and pick a service — it opens on this TV, ready to watch."}
        </p>
        {services.length > 0 && (
          <div className="mt-[2vw] grid grid-cols-3 gap-[1vw]">
            {services.map((s, i) => (
              <div
                key={s.name}
                className={`rounded-[0.8vw] px-[1.3vw] py-[0.9vw] transition-all duration-200 ${
                  focus === i
                    ? "scale-[1.04] bg-white/15 ring-[0.15vw] ring-seafoam-500"
                    : "bg-white/10"
                }`}
                style={{ borderLeft: `0.35vw solid ${s.color}` }}
              >
                <p className="text-[1.7vw] font-semibold leading-tight text-white">
                  {s.name}
                </p>
                <p
                  className={`text-[1vw] tracking-wide ${
                    focus === i ? "text-seafoam-500" : "text-white/50"
                  }`}
                >
                  {s.activateLabel}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
      {/* Wi-Fi join QR (host 2026-07-17): the first thing a guest needs
          before any streaming works is their phone on the house network. */}
      {c.wifiQr && (
        <div className="shrink-0 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={c.wifiQr}
            alt="Scan to join Wi-Fi"
            className="h-[14vw] w-[14vw] rounded-[1.2vw] bg-white p-[0.7vw]"
          />
          <p className="mt-[0.8vw] max-w-[14vw] text-[1.1vw] text-white/70">
            Scan to join {c.wifiSsid ?? "the Wi-Fi"} — connects automatically
          </p>
        </div>
      )}

      {sel && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-ocean-900/92 backdrop-blur-sm">
          <div
            className="flex items-center gap-[4vw] rounded-[1.5vw] bg-white/10 p-[3vw]"
            style={{ borderTop: `0.5vw solid ${sel.color}` }}
          >
            <div className="max-w-[42vw]">
              <h3 className="text-[3.2vw] font-bold">{sel.name}</h3>
              <p className="mt-[0.6vw] text-[1.7vw] font-semibold text-seafoam-500">
                Opening {sel.name} on this TV…
              </p>
              <ol className="mt-[1.5vw] space-y-[1.2vw] text-[1.9vw] leading-snug text-white/90">
                <li>
                  <span className="font-bold text-seafoam-500">1</span> ·
                  Already signed in? Pick something and press play — enjoy.
                </li>
                <li>
                  <span className="font-bold text-seafoam-500">2</span> · Need
                  to sign in? Scan this QR — it opens {sel.name}&apos;s code
                  page (
                  <span className="font-mono text-seafoam-500">
                    {sel.activateLabel}
                  </span>
                  ) on your phone. Keep it open.
                </li>
                <li>
                  <span className="font-bold text-seafoam-500">3</span> · Type
                  the code the {sel.name} app shows on this TV — done.
                </li>
              </ol>
              <p className="mt-[1.5vw] text-[1.3vw] text-white/50">
                If {sel.name} didn&apos;t open, press{" "}
                <span className="font-semibold">Home</span> on the remote and
                pick it there · logins are cleared after checkout
              </p>
            </div>
            {sel.activateQr && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={sel.activateQr}
                alt={`Scan to open ${sel.activateLabel}`}
                className="h-[16vw] w-[16vw] rounded-[1.2vw] bg-white p-[0.7vw]"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** "07:02 AM" — leading zero, matches the stat-block reference styling. */
function fmtClock(t: string | Date): string {
  return new Date(t).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Header stat: small uppercase label (optional icon) over a bold value —
 *  the WelcomeScreen-style lockup the host asked for (2026-07-17). */
function HeaderStat({
  icon,
  label,
  value,
}: {
  icon?: ReactNode;
  label: string;
  value: string;
}) {
  return (
    // Compact + right-anchored: the stat cluster is glanceable data, not a
    // headline — the In Residence lockup owns the header (host 2026-07-17).
    <span className="text-right leading-tight">
      <span className="flex items-center justify-end gap-[0.3vw] text-[0.65vw] font-semibold uppercase tracking-[0.16em] text-white/50">
        {icon}
        {label}
      </span>
      <span className="mt-[0.1vw] block text-[1.05vw] font-semibold tabular-nums text-white/85">
        {value}
      </span>
    </span>
  );
}

function HeaderDivider() {
  return <span aria-hidden className="w-px self-stretch bg-white/20" />;
}

function SunriseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[0.75vw] w-[0.75vw]"
    >
      <path d="M12 9V2m-4 4 4-4 4 4" />
      <path d="M4.93 15.93l1.41-1.41M2 20h2m16 0h2m-4.34-5.48 1.41 1.41M22 22H2" />
      <path d="M16 20a4 4 0 0 0-8 0" />
    </svg>
  );
}

function SunsetIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[0.75vw] w-[0.75vw]"
    >
      <path d="M12 2v7m-4-3 4 4 4-4" />
      <path d="M4.93 15.93l1.41-1.41M2 20h2m16 0h2m-4.34-5.48 1.41 1.41M22 22H2" />
      <path d="M16 20a4 4 0 0 0-8 0" />
    </svg>
  );
}

function BrandSplash() {
  return (
    <div className="flex h-full items-center justify-center">
      <h1 className="font-serif text-[6vw] font-medium tracking-wide">The Florida Havens</h1>
    </div>
  );
}

function PairingScreen({ code }: { code: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-[3vw]">
      <h1 className="text-[3.5vw] font-bold">The Florida Havens</h1>
      <p className="text-[1.8vw] text-white/70">
        Pair this TV from the host dashboard using the code:
      </p>
      <div className="flex gap-[1vw]">
        {code.split("").map((ch, i) => (
          <span
            key={i}
            className="flex h-[8vw] w-[6vw] items-center justify-center rounded-[1vw] bg-white/10 font-mono text-[4.5vw] font-bold"
          >
            {ch}
          </span>
        ))}
      </div>
      <p className="text-[1.4vw] text-white/50">
        Host dashboard → Pair a TV → enter this code
      </p>
    </div>
  );
}

interface Slide {
  key: string;
  title: string;
  render: () => React.ReactNode;
  /** Full-bleed media this slide will show — warmed one slide ahead so 4K
   *  Drive photos and videos don't pop in cold on the big screen. */
  preload?: { url: string; type: "image" | "video" };
  /** Playlist override — this slide rests this long instead of timing.slideMs. */
  durationMs?: number;
  /** Playlist override — entrance animation ("fade" default, "glide",
   *  "zoom", "none"). */
  transition?: string;
  /** Video media block with no set seconds: advance when playback ends
   *  (MediaSlide dispatches fh:media-ended) instead of on the dwell timer. */
  advanceOnEnd?: boolean;
  /** False = host removed it from the loop; still reachable from the menu. */
  inRotation?: boolean;
}

/** Warm the next media ahead of its slide: hidden nodes fetch upcoming 4K
 *  Drive photos (browser cache) and start buffering the next video, so
 *  full-bleed slides enter already painted instead of popping in cold.
 *  Bounded to the next two media-bearing slides — TV boxes have small
 *  caches and one HDMI's worth of bandwidth. */
function MediaPreloader({
  media,
}: {
  media: { url: string; type: "image" | "video" }[];
}) {
  return (
    <div aria-hidden className="hidden">
      {media.map((m) =>
        m.type === "video" ? (
          <video key={m.url} src={m.url} preload="auto" muted />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={m.url} src={m.url} alt="" />
        )
      )}
    </div>
  );
}

/** The next N distinct media entries at-or-after `from` in deck order. */
function upcomingMedia(
  slides: Slide[],
  from: number,
  count = 2
): { url: string; type: "image" | "video" }[] {
  const out: { url: string; type: "image" | "video" }[] = [];
  const seen = new Set<string>();
  for (let i = 1; i <= slides.length && out.length < count; i++) {
    const p = slides[(from + i) % slides.length]?.preload;
    if (p && !seen.has(p.url)) {
      seen.add(p.url);
      out.push(p);
    }
  }
  return out;
}

/** Keyframe per transition choice; empty string = no animation. */
const TRANSITION_ANIM: Record<string, string> = {
  fade: "tvfade",
  glide: "tvglide",
  zoom: "tvzoom",
  none: "",
};

/** Full-bleed media block from the signage editor's library (Drive/Blob).
 *  Same footer-safe cutoff and corner caption as the ambient photo slides;
 *  videos run muted and loop for however long the block rests. */
function MediaSlide({
  url,
  type,
  caption,
  loop,
}: {
  url: string;
  type: "image" | "video";
  caption: string;
  /** Loop (fixed dwell set) vs play-once-then-advance (host 2026-07-17). */
  loop: boolean;
}) {
  return (
    <div className="relative h-full pb-[1.2vw]">
      <div className="relative h-full overflow-hidden">
        {type === "video" ? (
          <video
            src={url}
            autoPlay
            muted
            loop={loop}
            playsInline
            onEnded={() => {
              if (!loop) window.dispatchEvent(new Event("fh:media-ended"));
            }}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="absolute inset-0 h-full w-full object-cover" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-ocean-900/70 via-transparent to-transparent" />
        <p className="absolute bottom-[2.6vw] left-[3vw] font-serif text-[2vw] font-medium tracking-wide text-white/85">
          {caption}
        </p>
      </div>
    </div>
  );
}

/** Which scheduling window the TV is in right now (device-local clock):
 *  morning 5–11, afternoon 12–16, evening 17 onward through the night. */
function daypartOf(now: Date): "morning" | "afternoon" | "evening" {
  const h = now.getHours();
  if (h >= 5 && h < 12) return "morning";
  if (h >= 12 && h < 17) return "afternoon";
  return "evening";
}

function Signage({
  state,
  forceLastNight = false,
  pinSlide = null,
}: {
  state: Extract<TvState, { mode: "demo" | "active" }>;
  forceLastNight?: boolean;
  /** Thumbnail mode: hold this slide key, no rotation (signage editor). */
  pinSlide?: string | null;
}) {
  const c = state.content;
  const now = useClock();
  const [index, setIndex] = useState(0);

  // Hotel "last night" pattern: within 36h of checkout (host 2026-07-17)
  // the deck leads with departure logistics + the rebooking pitch instead
  // of arrival orientation. 10 AM checkout → appears from ~10 PM two
  // nights out.
  const lastNight =
    forceLastNight ||
    Boolean(
      c.checkOut &&
        new Date(c.checkOut).getTime() - Date.now() < 36 * 3600_000 &&
        new Date(c.checkOut).getTime() > Date.now()
    );
  const sameLocalDay = (iso: string) =>
    new Date(iso).toDateString() === now.toDateString();
  // Arrival day is extra welcome-y; departure day is bon voyage with the
  // checkout time + protocols front and center (host 2026-07-17).
  const arrivalDay = Boolean(c.checkIn && sameLocalDay(c.checkIn));
  const departureDay =
    forceLastNight || Boolean(c.checkOut && sameLocalDay(c.checkOut));
  // Scheduling granularity for playlist day-parts; useClock ticks carry the
  // deck across window boundaries without a reload.
  const daypart = daypartOf(now);

  const slides = useMemo<Slide[]>(() => {
    const list: Slide[] = [];

    if (lastNight && c.checkOut) {
      const when = new Date(c.checkOut).toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
      });
      const coDate = new Date(c.checkOut);
      const leaveSection = c.sections.find((s) => s.slug === "leave");
      // The headline states the checkout time exactly once: prefer the time
      // written in the host's leave copy (its own line gets dropped from the
      // bullets), fall back to the reservation timestamp when its hour is
      // plausible — demo timestamps carry arbitrary hours.
      const bodyTime =
        leaveSection?.body.match(
          /\b\d{1,2}(?::\d{2})?\s?(?:a\.?m\.?|p\.?m\.?)\b/i
        )?.[0] ?? null;
      const plausibleHour = coDate.getHours() >= 6 && coDate.getHours() <= 20;
      const showAt = Boolean(bodyTime) || plausibleHour;
      const at =
        bodyTime?.toUpperCase().replace(/\./g, "") ??
        coDate.toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
        });
      // Host-authored protocol wins; sensible defaults otherwise. Either
      // way it renders as short bullets, never a wall of prose ("TOO
      // wordy" — host 2026-07-17): the leave body splits on newlines and
      // sentences, keeping only crisp lines and dropping any that restate
      // the checkout time the headline already carries.
      const protocols = (
        leaveSection
          ? leaveSection.body
              .split(/\n+|(?<=[.!])\s+(?=[A-Z])/)
              .map((l) => l.replace(/^[•\-–\s]+/, "").replace(/\.$/, "").trim())
              .filter((l) => l.length > 3 && !/check.?\s?out/i.test(l))
          : [
              "Start the dishwasher and bag up trash to the outdoor bins",
              "Bring in beach gear; close and lock every door and window",
              "Leave keys and fobs where you found them",
              "Text us when you're on the road — safe travels!",
            ]
      ).slice(0, 5);
      list.push({
        key: "farewell",
        title: "Until next time",
        render: () => (
          <div className="flex h-full items-center justify-center gap-[5vw] px-[6vw]">
            <div className="max-w-[48vw]">
              {departureDay && (
                <p className="text-[1.1vw] font-semibold uppercase tracking-[0.45em] text-seafoam-500">
                  Departure day
                </p>
              )}
              <h2 className="mt-[0.6vw] font-serif text-[4.4vw] font-semibold leading-tight">
                {departureDay ? "Bon voyage" : "Until next time"}
                {c.guestLabel ? `, ${vocative(c.guestLabel)}` : ""}
              </h2>
              <p className="mt-[1.2vw] text-[2.2vw] leading-relaxed text-white/85">
                Check-out is {departureDay ? "today" : when}
                {showAt ? (
                  <>
                    {" at "}
                    <span className="font-semibold text-white">{at}</span>
                  </>
                ) : null}
                .
              </p>
              {protocols.length > 0 && (
                <ul className="mt-[1.2vw] space-y-[0.5vw]">
                  {protocols.map((p) => (
                    <li
                      key={p}
                      className="flex gap-[0.8vw] text-[1.5vw] leading-snug text-white/75"
                    >
                      <span className="text-seafoam-500">•</span>
                      {p}
                    </li>
                  ))}
                </ul>
              )}
              {/* Only promise "these exact dates are open" when the Guesty
                  calendar confirmed it; the QR pre-loads those dates. */}
              {c.nextYear ? (
                <p className="mt-[1.5vw] text-[2vw] font-semibold text-seafoam-500">
                  These exact dates next year are open now — returning guests
                  book them first, direct at thefloridahavens.com.
                </p>
              ) : (
                <p className="mt-[1.5vw] text-[2vw] font-semibold text-seafoam-500">
                  Pick your week for next year — returning guests book first,
                  direct at thefloridahavens.com.
                </p>
              )}
            </div>
            <div className="text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={c.nextYear?.qr ?? c.bookQr}
                alt="Scan to book your next stay"
                className="h-[16vw] w-[16vw] rounded-[1.5vw] bg-white p-[0.8vw]"
              />
              <p className="mt-[1vw] text-[1.4vw] text-white/70">
                {c.nextYear
                  ? "scan — your dates are pre-loaded"
                  : "thefloridahavens.com"}
              </p>
            </div>
          </div>
        ),
      });
    }

    list.push(
      {
        key: "welcome",
        title: "Welcome",
        render: () => (
          <div className="relative flex h-full flex-col items-center justify-center text-center">
            {c.heroPhoto && (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={c.heroPhoto}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-ocean-900/90 via-ocean-900/50 to-ocean-900/60" />
              </>
            )}
            {c.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={c.logoUrl}
                alt=""
                className="relative mb-[1.5vw] h-[14vw] w-auto object-contain"
              />
            )}
            {arrivalDay && (
              <p className="relative mb-[0.6vw] text-[1.1vw] font-semibold uppercase tracking-[0.45em] text-seafoam-500">
                Welcome day — you made it
              </p>
            )}
            <p className="relative text-[2.2vw] text-white/70">Welcome to</p>
            {/* Long titles scale down instead of billboarding across three
                lines — display names should be short, but hosts type freely. */}
            <h2
              className={`relative mt-[0.5vw] max-w-[80vw] font-serif font-semibold leading-tight ${
                c.propertyName.length > 42
                  ? "text-[3.2vw]"
                  : c.propertyName.length > 24
                    ? "text-[4.4vw]"
                    : "text-[6vw]"
              }`}
            >
              {c.propertyName}
            </h2>
            {/* The through-date lives in the persistent header — repeating it
                here would double up on the welcome slide. */}
            {c.guestLabel && (
              <p className="relative mt-[2vw] font-serif text-[2.8vw] font-light text-white/90">
                We&apos;re honored to host{" "}
                <span className="font-medium">{c.guestLabel}</span>
              </p>
            )}
            {arrivalDay && (
              <p className="relative mt-[1vw] text-[1.6vw] text-white/70">
                Bags down, shoes off — the beach is steps away, and everything
                you need is one press of OK.
              </p>
            )}
          </div>
        ),
      },
    );

    // Launch-day announcement: a launch scheduled today (and not long past)
    // gets its own slide right after the welcome, with a live countdown.
    const todayLaunch = (c.launches ?? []).find((l) => {
      const t = new Date(l.net);
      return (
        t.toDateString() === new Date().toDateString() &&
        t.getTime() - Date.now() > -30 * 60_000
      );
    });
    if (todayLaunch) {
      list.push({
        key: "launch-today",
        title: "Launch today",
        render: () => <LaunchDayAlert launch={todayLaunch} />,
      });
    }

    if (c.wifiSsid && c.wifiPassword && c.wifiQr) {
      const { wifiSsid, wifiPassword, wifiQr } = c;
      list.push({
        key: "wifi",
        title: "Wi-Fi",
        render: () => (
          <div className="flex h-full items-center justify-center gap-[6vw]">
            <div>
              <h2 className="font-serif text-[4.4vw] font-semibold">Get online</h2>
              <p className="mt-[2vw] text-[2vw] text-white/70">Network</p>
              <p className="text-[3vw] font-semibold">{wifiSsid}</p>
              <p className="mt-[1.5vw] text-[2vw] text-white/70">Password</p>
              <p className="font-mono text-[3vw] font-semibold">{wifiPassword}</p>
            </div>
            <div className="text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={wifiQr}
                alt="Scan to join Wi-Fi"
                className="h-[24vw] w-[24vw] rounded-[1.5vw] bg-white p-[1vw]"
              />
              <p className="mt-[1vw] text-[1.6vw] text-white/70">
                Point your phone camera here — joins automatically
              </p>
            </div>
          </div>
        ),
      });
    }

    for (const s of c.sections) {
      // The static launches blurb yields to the live board when data exists.
      if (s.slug === "launches" && c.launches?.length) continue;
      list.push({
        key: s.slug,
        title: s.title,
        render: () => (
          <div className="flex h-full flex-col justify-center px-[8vw]">
            <h2 className="font-serif text-[4.4vw] font-semibold">{s.title}</h2>
            <p className="mt-[2vw] whitespace-pre-line text-[2.2vw] leading-relaxed text-white/85">
              {s.body}
            </p>
          </div>
        ),
      });
    }

    // Weather trio: today (beach-day) → 3-day → 5-day. Days with missing
    // temps (Open-Meteo gaps round to NaN) are dropped up front.
    const fdays = (c.forecast ?? []).filter(
      (d) => Number.isFinite(d.hiF) && Number.isFinite(d.loF)
    );
    const weatherPages = [
      c.tides?.length || c.sun ? "beach-day" : null,
      fdays.length >= 3 ? "forecast-3" : null,
      fdays.length >= 5 ? "forecast-5" : null,
    ].filter((k): k is string => k !== null);
    const weatherPager = (key: string) => ({
      page: weatherPages.indexOf(key),
      count: weatherPages.length,
    });

    if (c.tides?.length || c.sun) {
      const tides = c.tides ?? [];
      const sun = c.sun;
      list.push({
        key: "beach-day",
        title: "Beach day",
        render: () => (
          <div className="flex h-full flex-col justify-center px-[8vw]">
            <h2 className="font-serif text-[4.4vw] font-semibold">Today at the beach</h2>
            {sun && (
              <p className="mt-[1.5vw] text-[2.2vw] text-white/85">
                Sunrise{" "}
                <span className="font-semibold">
                  {new Date(sun.sunrise).toLocaleTimeString("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
                {"  ·  "}Sunset{" "}
                <span className="font-semibold">
                  {new Date(sun.sunset).toLocaleTimeString("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
              </p>
            )}
            {tides.length > 0 && (
              <div className="mt-[2.5vw] flex gap-[3vw]">
                {tides.map((t) => (
                  <div
                    key={t.time}
                    className="rounded-[1vw] bg-white/10 px-[2.5vw] py-[1.5vw] text-center"
                  >
                    <p className="text-[1.5vw] uppercase tracking-widest text-white/60">
                      {t.type === "high" ? "High tide" : "Low tide"}
                    </p>
                    <p className="mt-[0.5vw] text-[2.6vw] font-bold">
                      {formatTideTime(t.time)}
                    </p>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-[2.5vw] text-[1.6vw] text-white/50">
              Low tide is the best shelling and the firmest sand for walking.
            </p>
            <WeatherPager {...weatherPager("beach-day")} />
          </div>
        ),
      });
    }

    if (fdays.length >= 3) {
      list.push({
        key: "forecast-3",
        title: "3-day outlook",
        render: () => (
          <ForecastThreeDay days={fdays} pager={weatherPager("forecast-3")} />
        ),
      });
    }
    if (fdays.length >= 5) {
      list.push({
        key: "forecast-5",
        title: "5-day outlook",
        render: () => (
          <ForecastFiveDay days={fdays} pager={weatherPager("forecast-5")} />
        ),
      });
    }

    // Season-aware sea turtle awareness (Archie Carr refuge beaches).
    if (c.showTurtles !== false) {
      list.push({
        key: "sea-turtles",
        title: "Sea turtles",
        render: () => <TurtleSlide />,
      });
    }

    if (c.launches?.length) {
      const launches = c.launches;
      list.push({
        key: "launch-board",
        title: "Rocket Launches",
        render: () => <LaunchBoard launches={launches} />,
      });
    }

    list.push({
      key: "streaming",
      title: "Entertainment",
      // Rendered specially in <main> — the Entertainment page is interactive
      // (D-pad focus + per-service sign-in) and needs live component state
      // that a memoized render closure can't hold.
      render: () => null,
    });

    list.push({
      key: "casting",
      title: "Casting",
      render: () => (
        <div className="flex h-full flex-col justify-center px-[8vw]">
          <h2 className="font-serif text-[4.4vw] font-semibold">Cast from your phone</h2>
          <p className="mt-[2vw] text-[2.2vw] leading-relaxed text-white/85">
            Unlike a hotel, the whole house — and its network — is yours. Join
            the Wi-Fi and cast exactly like you do at home: AirPlay from
            iPhone, or the cast button inside YouTube, Netflix, and Spotify on
            any phone.
          </p>
          <p className="mt-[2vw] text-[2vw] font-semibold text-seafoam-500">
            Cast to: {c.deviceLabel ?? "Living Room"} · {c.propertyName}
          </p>
          <p className="mt-[1.5vw] text-[1.6vw] text-white/50">
            Phone and TV just need the same Wi-Fi — the network name is on the
            Wi-Fi screen.
          </p>
        </div>
      ),
    });

    // Cross-property upsell (host 2026-07-17): tasteful pitch chosen by
    // which unit this TV lives in — never a downgrade, always direct-book.
    if (c.upsell) {
      const upsell = c.upsell;
      list.push({
        key: "our-havens",
        title: "Our Havens",
        render: () => (
          <div className="flex h-full items-center justify-center gap-[6vw] px-[6vw]">
            <div className="max-w-[45vw]">
              <p className="text-[1.1vw] font-semibold uppercase tracking-[0.45em] text-seafoam-500">
                {upsell.eyebrow}
              </p>
              <h2 className="mt-[0.8vw] font-serif text-[4vw] font-semibold leading-tight">
                {upsell.headline}
              </h2>
              <p className="mt-[1.5vw] text-[2vw] leading-relaxed text-white/85">
                {upsell.body}
              </p>
              <p className="mt-[1.5vw] text-[1.8vw] font-semibold text-seafoam-500">
                thefloridahavens.com
              </p>
            </div>
            <div className="shrink-0 text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={upsell.qr}
                alt={upsell.qrLabel}
                className="h-[16vw] w-[16vw] rounded-[1.5vw] bg-white p-[0.8vw]"
              />
              <p className="mt-[1vw] text-[1.3vw] text-white/70">
                {upsell.qrLabel}
              </p>
            </div>
          </div>
        ),
      });
    }

    list.push({
      key: "book-direct",
      title: "Book Direct",
      render: () => (
        <div className="flex h-full items-center justify-center gap-[6vw]">
          <div className="max-w-[45vw]">
            <h2 className="font-serif text-[4.4vw] font-semibold leading-tight">
              Come back to the beach
            </h2>
            <p className="mt-[1.5vw] text-[2.2vw] leading-relaxed text-white/85">
              Book your next stay directly with us — best rates, no platform
              fees, and returning guests get first pick of launch-week dates.
            </p>
            <p className="mt-[1.5vw] text-[2vw] font-semibold text-seafoam-500">
              thefloridahavens.com
            </p>
          </div>
          <div className="text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={c.bookQr}
              alt="Scan to book direct"
              className="h-[18vw] w-[18vw] rounded-[1.5vw] bg-white p-[0.8vw]"
            />
            <p className="mt-[1vw] text-[1.4vw] text-white/70">Scan to book</p>
          </div>
        </div>
      ),
    });

    // Host-arranged rotation (signage editor, settings.playlist): the
    // playlist dictates block order and per-slide pacing. Event slides
    // (farewell, launch-today) stay pinned up front; blocks the host removed
    // are parked — reachable from the menu but skipped by the idle loop.
    let rotation = list;
    let parked: Slide[] = [];
    const pl = c.playlist;
    if (pl?.items?.length) {
      const byKey = new Map(list.map((s) => [s.key, s]));
      const pinned = list.filter(
        (s) => s.key === "farewell" || s.key === "launch-today"
      );
      const picked: Slide[] = [];
      const chosen = new Set(pinned.map((s) => s.key));
      for (const it of pl.items) {
        // Day-part gate: outside its window the block parks (menu-reachable,
        // out of the loop) and rejoins when the clock re-enters it.
        if (it.daypart && it.daypart !== daypart) continue;
        // Media blocks (editor library): full-bleed image/video slides.
        // Videos with no set seconds play once and advance on end.
        if (it.url && it.mediaType) {
          if (chosen.has(it.key)) continue;
          chosen.add(it.key);
          const url = it.url;
          const mediaType = it.mediaType;
          const fixed = Boolean(it.seconds);
          picked.push({
            key: it.key,
            title: "Gallery",
            preload: { url, type: mediaType },
            ...(it.seconds ? { durationMs: it.seconds * 1000 } : null),
            ...(it.transition ? { transition: it.transition } : null),
            ...(mediaType === "video" && !fixed ? { advanceOnEnd: true } : null),
            render: () => (
              <MediaSlide
                url={url}
                type={mediaType}
                caption={c.propertyName}
                loop={mediaType === "video" && fixed}
              />
            ),
          });
          continue;
        }
        const s = byKey.get(it.key);
        if (!s || chosen.has(s.key)) continue;
        chosen.add(s.key);
        picked.push(
          it.seconds || it.transition
            ? {
                ...s,
                ...(it.seconds ? { durationMs: it.seconds * 1000 } : null),
                ...(it.transition ? { transition: it.transition } : null),
              }
            : s
        );
      }
      // A playlist of nothing but stale keys must never blank the TV.
      if (picked.length > 0) {
        rotation = [...pinned, ...picked];
        parked = list
          .filter((s) => !chosen.has(s.key))
          .map((s) => ({ ...s, inRotation: false }));
      }
    }

    // S1.6: when a Cape launch is near, pull launch slides earlier and
    // multi-slot launch-board through the idle deck. Scrubbed / past NETs
    // decay to weight 1 (no-op). Host-parked launch-board stays parked.
    const launchWeight = launchRotationWeight(c.launches);
    if (launchWeight > 1) {
      rotation = applyLaunchWeightToRotation(rotation, launchWeight);
    }

    // Media sweep: full-bleed property photos interleaved every third slide,
    // property name whispered in the corner. Pure ambiance between content.
    if (c.photos.length > 0 && pl?.photos !== false) {
      const ambient = c.photos.slice(0, 4).map((url, i) => ({
        key: `photo-${i}`,
        title: c.propertyName,
        preload: { url, type: "image" as const },
        render: () => (
          // Media stops short of the footer band — full-bleed photos were
          // visually colliding with the footer line (host 2026-07-17).
          <div className="relative h-full pb-[1.2vw]">
            <div className="relative h-full overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="absolute inset-0 h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-ocean-900/70 via-transparent to-transparent" />
              <p className="absolute bottom-[2.6vw] left-[3vw] font-serif text-[2vw] font-medium tracking-wide text-white/85">
                {c.propertyName}
              </p>
            </div>
          </div>
        ),
      }));
      const merged: Slide[] = [];
      let p = 0;
      rotation.forEach((s, i) => {
        merged.push(s);
        if ((i + 1) % 3 === 0 && p < ambient.length) merged.push(ambient[p++]);
      });
      while (p < ambient.length) merged.push(ambient[p++]);
      return [...merged, ...parked];
    }

    return [...rotation, ...parked];
  }, [c, lastNight, arrivalDay, departureDay, daypart]);

  // Remote navigation. Any D-pad press wakes the menu. OK opens the page
  // and pauses rotation; on the Entertainment page the D-pad keeps going:
  // arrows move across the service tiles and OK opens that service's
  // sign-in walkthrough. Back steps out one level. After 3 idle minutes
  // the TV returns to Home and the full content cycle (host 2026-07-17) —
  // unless a guest is mid sign-in walkthrough (connecting a streaming
  // app), which never gets yanked away. Actual app playback replaces this
  // page entirely, so streaming itself is naturally exempt.
  const [navOpen, setNavOpen] = useState(false);
  const [navIndex, setNavIndex] = useState(0);
  const [manual, setManual] = useState(false);
  const [svcFocus, setSvcFocus] = useState(0);
  const [svcOpen, setSvcOpen] = useState<number | null>(null);
  // True only when Weather was opened from the menu — that's when the trio
  // auto-tours. Deck arrow-paging (◀ ▶) never auto-advances underneath you.
  const [weatherTour, setWeatherTour] = useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const svcOpenRef = useRef<number | null>(null);
  const bumpIdle = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    const arm = () => {
      idleTimer.current = setTimeout(() => {
        if (svcOpenRef.current != null) {
          arm(); // mid streaming sign-in — hold and check again
          return;
        }
        setNavOpen(false);
        setManual(false);
        setSvcOpen(null);
        setVirtualPage(null);
        setWeatherTour(false);
        setIndex(0); // Home: restart the full content cycle
      }, 180_000);
    };
    arm();
  }, []);
  useEffect(() => {
    svcOpenRef.current = svcOpen;
  }, [svcOpen]);

  // Guide Book / Dining / Nearby are virtual pages (browsers over the CMS
  // sections), not slides; Weather maps to the beach-day slide. Ambient
  // photo slides never appear in the menu.
  const [virtualPage, setVirtualPage] = useState<
    "guide" | "dining" | "nearby" | null
  >(null);
  const [guideFocus, setGuideFocus] = useState(0);

  // Final menu (host 2026-07-17): Home · Entertainment · Guidebook ·
  // Weather · Book Direct. Casting is parked until the hardware environment
  // confirms support; Dining/Nearby live inside the Guidebook browser.
  // Rocket Launches and Casting slides stay in the rotation only.
  const menu = useMemo(() => {
    const items: { key: string; title: string }[] = [{ key: "home", title: "Home" }];
    if (slides.some((s) => s.key === "streaming"))
      items.push({ key: "streaming", title: "Entertainment" });
    if (c.sections.length > 0) items.push({ key: "guide", title: "Guidebook" });
    // Weather opens the section's first page (today), or the 3-day outlook
    // when tides/sun are off but the forecast feed is up.
    const weatherEntry = slides.find(
      (s) => s.key === "beach-day" || s.key === "forecast-3"
    );
    if (weatherEntry) items.push({ key: weatherEntry.key, title: "Weather" });
    if (slides.some((s) => s.key === "book-direct"))
      items.push({ key: "book-direct", title: "Book Direct" });
    return items;
  }, [slides, c.sections]);

  const currentSlide = slides[index % slides.length];
  const onEntertainment =
    manual && !virtualPage && currentSlide.key === "streaming";
  // Weather is a mini-section of slides; ◀ ▶ page within it (host 2026-07-17).
  const weatherKeys = useMemo(
    () =>
      ["beach-day", "forecast-3", "forecast-5"].filter((k) =>
        slides.some((s) => s.key === k)
      ),
    [slides]
  );
  const onWeather =
    manual && !virtualPage && weatherKeys.includes(currentSlide.key);
  const svcCount = c.streaming?.length ?? 0;
  const virtualSections = virtualPage
    ? sectionsFor(virtualPage, c.sections)
    : [];

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const k = e.key;
      const isBack = k === "Escape" || k === "Backspace" || k === "GoBack";
      const isArrow = k.startsWith("Arrow");
      if (!isArrow && k !== "Enter" && !isBack) return;
      e.preventDefault();
      bumpIdle();

      // Deepest level first: a service's sign-in walkthrough.
      if (svcOpen != null) {
        if (isBack || k === "Enter") setSvcOpen(null);
        return;
      }

      if (navOpen) {
        if (k === "ArrowLeft" || k === "ArrowUp") {
          setNavIndex((i) => (i - 1 + menu.length) % menu.length);
        } else if (k === "ArrowRight" || k === "ArrowDown") {
          setNavIndex((i) => (i + 1) % menu.length);
        } else if (k === "Enter") {
          const item = menu[navIndex];
          setNavOpen(false);
          setVirtualPage(null);
          if (item.key === "home") {
            setManual(false);
          } else if (
            item.key === "guide" ||
            item.key === "dining" ||
            item.key === "nearby"
          ) {
            setVirtualPage(item.key);
            setGuideFocus(0);
            setManual(true);
          } else {
            const at = slides.findIndex((s) => s.key === item.key);
            if (at >= 0) {
              setIndex(at);
              setManual(true);
              if (item.key === "streaming") setSvcFocus(0);
              setWeatherTour(weatherKeys.includes(item.key));
            }
          }
        } else {
          // Back from the menu itself → resume the idle rotation.
          setNavOpen(false);
          setManual(false);
          setVirtualPage(null);
        }
        return;
      }

      // Guide Book / Dining / Nearby browser: up/down move the section list.
      if (virtualPage) {
        const n = virtualSections.length;
        if (k === "ArrowUp" || k === "ArrowLeft") {
          if (n > 0) setGuideFocus((f) => (f - 1 + n) % n);
        } else if (k === "ArrowDown" || k === "ArrowRight") {
          // Past the last section, Down lands on the footer menu — the
          // remote's natural "keep going down" gesture (host 2026-07-17).
          if (n > 0 && guideFocus < n - 1) setGuideFocus(guideFocus + 1);
          else if (k === "ArrowDown") setNavOpen(true);
          else if (n > 0) setGuideFocus(0);
        } else if (isBack) {
          // Step UP to the menu, not out to the loop — guests kept getting
          // stranded with no path back to the other destinations.
          setVirtualPage(null);
          setNavOpen(true);
        }
        return;
      }

      // On the Entertainment page the D-pad drives the service grid.
      if (onEntertainment && svcCount > 0) {
        if (k === "ArrowLeft") {
          setSvcFocus((f) => (f - 1 + svcCount) % svcCount);
        } else if (k === "ArrowRight") {
          setSvcFocus((f) => (f + 1) % svcCount);
        } else if (k === "ArrowUp") {
          setSvcFocus((f) => (f - 3 >= 0 ? f - 3 : f));
        } else if (k === "ArrowDown") {
          // Below the bottom tile row, Down drops to the footer menu.
          if (svcFocus + 3 < svcCount) setSvcFocus(svcFocus + 3);
          else setNavOpen(true);
        } else if (k === "Enter") {
          // Choose → watch: fire the Android intent so the real app opens on
          // this same device and input, no Home press. The walkthrough
          // renders underneath as the safety net — it's what the guest sees
          // if the launch was blocked or the app isn't installed.
          const svc = c.streaming?.[svcFocus];
          if (svc?.appUrl) {
            try {
              window.location.href = svc.appUrl;
            } catch {
              // non-Android preview browser — walkthrough carries it
            }
          }
          setSvcOpen(svcFocus);
        } else {
          // Back → up one level to the main menu (guests lost menu access
          // from Entertainment; the loop resumes from the menu's Back).
          setNavOpen(true);
        }
        return;
      }

      // Home deck (host 2026-07-17): ◀ ▶ page the slides directly — no menu
      // detour — pausing the auto-loop until the 3-minute idle reset. Parked
      // blocks stay skipped. OK / Up / Down summon the menu; Back resumes
      // the loop.
      if (k === "ArrowLeft" || k === "ArrowRight") {
        const dir = k === "ArrowRight" ? 1 : -1;
        setManual(true);
        setWeatherTour(false);
        setIndex((i) => {
          const list = slidesRef.current;
          let n = (i + dir + list.length) % list.length;
          for (let hop = 0; hop < list.length && list[n].inRotation === false; hop++)
            n = (n + dir + list.length) % list.length;
          return n;
        });
        return;
      }
      if (isBack) {
        setManual(false);
        setWeatherTour(false);
        return;
      }
      setNavIndex(0);
      setNavOpen(true);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    navOpen,
    navIndex,
    menu,
    slides,
    svcOpen,
    svcFocus,
    svcCount,
    c.streaming,
    onEntertainment,
    onWeather,
    weatherKeys,
    currentSlide.key,
    virtualPage,
    virtualSections.length,
    guideFocus,
    bumpIdle,
  ]);

  // Thumbnail pin (signage editor): hold the requested slide, no rotation.
  useEffect(() => {
    if (!pinSlide) return;
    const at = slides.findIndex((s) => s.key === pinSlide);
    if (at >= 0) {
      setIndex(at);
      setManual(true);
    }
  }, [pinSlide, slides]);

  // The 10s poll rebuilds `slides` (new array identity) every cycle. Timer
  // effects must NOT depend on that identity — they'd re-arm on every poll
  // and a 20s dwell would never complete (TVs froze on one slide, host
  // 2026-07-17). Read the live deck through a ref instead.
  const slidesRef = useRef(slides);
  useEffect(() => {
    slidesRef.current = slides;
  }, [slides]);

  // Skip parked slides (host removed them from the loop); bounded so an
  // all-parked list can't spin forever.
  const stepIndex = useCallback((i: number): number => {
    const list = slidesRef.current;
    let n = (i + 1) % list.length;
    for (let hop = 0; hop < list.length && list[n].inRotation === false; hop++)
      n = (n + 1) % list.length;
    return n;
  }, []);

  useEffect(() => {
    if (manual || navOpen) return; // guest is browsing — hold the rotation
    // Per-slide pacing: a playlist item can override the property default,
    // so the timer re-arms each advance instead of ticking a fixed interval.
    // Play-to-end videos advance on fh:media-ended; the timer is only their
    // stall safety net.
    const cur = slidesRef.current[index % slidesRef.current.length];
    const dwell = cur?.advanceOnEnd
      ? 5 * 60_000
      : cur?.durationMs ?? c.timing.slideMs;
    const t = setTimeout(() => setIndex(stepIndex), dwell);
    const onEnded = () => {
      const now = slidesRef.current[index % slidesRef.current.length];
      if (now?.advanceOnEnd) setIndex(stepIndex);
    };
    window.addEventListener("fh:media-ended", onEnded);
    return () => {
      clearTimeout(t);
      window.removeEventListener("fh:media-ended", onEnded);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- slides via ref
  }, [index, slides.length, manual, navOpen, c.timing.slideMs, stepIndex]);

  // The Weather section auto-scrolls its own pages (host 2026-07-17):
  // today → 3-day → 5-day on the normal pacing, wrapping, until the guest
  // pages manually (which restarts the dwell) or the idle timeout returns
  // the TV to the main rotation.
  const weatherSig = weatherKeys.join("|"); // stable across poll rebuilds
  useEffect(() => {
    if (!weatherTour || !onWeather || weatherKeys.length < 2 || navOpen || pinSlide)
      return;
    const list = slidesRef.current;
    const cur = list[index % list.length];
    const t = setTimeout(() => {
      const at = weatherKeys.indexOf(cur.key);
      const to = slidesRef.current.findIndex(
        (s) => s.key === weatherKeys[(at + 1) % weatherKeys.length]
      );
      if (to >= 0) setIndex(to);
    }, cur?.durationMs ?? c.timing.slideMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deck via ref, keys via sig
  }, [weatherTour, onWeather, weatherSig, index, navOpen, pinSlide, c.timing.slideMs]);

  const slide = currentSlide;
  // Name + dates stay up at all times — the Entertainment page is a picker,
  // not playback (host feedback 2026-07-17), so only Casting drops the
  // lockup while a guest mirrors their own screen.
  const lockupHidden = !virtualPage && slide.key === "casting";
  // Brand ambiance: drone / screensaver videos run muted behind slides.
  // G2: onError advances to the next video asset (or none → ocean gradient)
  // so a Drive 403 / HEVC-decode miss never leaves a silent black scrim.
  const bgVideos = useMemo(
    () => c.screensavers.filter((a) => a.type === "video"),
    [c.screensavers]
  );
  const bgVideoSig = bgVideos.map((a) => a.url).join("\0");
  const [bgVideoIdx, setBgVideoIdx] = useState(0);
  useEffect(() => {
    setBgVideoIdx(0);
  }, [bgVideoSig]);
  const bgVideo =
    bgVideoIdx < bgVideos.length ? (bgVideos[bgVideoIdx]?.url ?? null) : null;
  const onBgVideoError = useCallback(() => {
    setBgVideoIdx((i) => i + 1); // past last → bgVideo null → gradient only
  }, []);

  // Decode load-shedding: full-bleed slides (ambient photos, hero welcome)
  // cover the footage completely, so decoding it underneath is pure waste —
  // pause while covered, resume when a gradient slide returns.
  const bgVideoRef = useRef<HTMLVideoElement | null>(null);
  const bgCovered =
    slide.key.startsWith("photo-") ||
    (slide.key === "welcome" && Boolean(c.heroPhoto));
  useEffect(() => {
    const v = bgVideoRef.current;
    if (!v) return;
    if (bgCovered) v.pause();
    else v.play().catch(() => {}); // autoplay quirks — scrim keeps text legible
  }, [bgCovered, bgVideo]);

  return (
    <div className="relative flex h-full flex-col bg-gradient-to-br from-ocean-900 via-ocean-700 to-ocean-900">
      {bgVideo && (
        <>
          <video
            key={bgVideo}
            ref={bgVideoRef}
            src={bgVideo}
            autoPlay
            muted
            loop
            playsInline
            onError={onBgVideoError}
            className="absolute inset-0 h-full w-full object-cover"
          />
          {/* scrim keeps 10-foot text legible over moving footage */}
          <div className="absolute inset-0 bg-gradient-to-t from-ocean-900/90 via-ocean-900/60 to-ocean-900/70" />
        </>
      )}
      {/* pb keeps Cormorant descenders ("July", "through") clear of the
          header's bottom edge on the hero band (host feedback 2026-07-17). */}
      <header className="relative z-10 flex items-center justify-between px-[3vw] pb-[1vw] pt-[1.4vw] text-[1.6vw] text-white/80">
        {/* Logo zone: per-property brand mark ahead of the title (host
            2026-07-17). CMS Logo URL / auto-match; hidden when absent. */}
        <span className="flex min-w-0 items-center gap-[1.1vw]">
          {c.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            // Larger, more prominent mark (host 2026-07-20); negative margin
            // lets it breathe into the header padding without fattening the
            // whole band.
            <img
              src={c.logoUrl}
              alt=""
              className="-my-[1.4vw] h-[6.5vw] w-auto shrink-0 object-contain"
            />
          )}
          {/* Same Cormorant as the logo/welcome title — not the blocky sans
              (host 2026-07-17). */}
          <span className="truncate font-serif text-[2vw] font-medium tracking-wide text-white/90">
            {c.propertyName}
          </span>
        </span>
        {/* Formal lockup rides the header on every view except Entertainment
            and Casting, where the guest is mid-task (host preference
            2026-07-17). */}
        {c.guestLabel && !lockupHidden && (
          <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 text-center leading-tight">
            <span className="block text-[0.75vw] font-semibold uppercase tracking-[0.45em] text-seafoam-500/90">
              In Residence
            </span>
            <span className="mt-[0.1vw] block font-serif text-[1.7vw] font-medium tracking-wide text-white/90">
              {c.guestLabel}
              {c.checkOut && (
                <span className="font-light text-white/45">
                  {"  ·  through "}
                  {new Date(c.checkOut).toLocaleDateString("en-US", {
                    month: "long",
                    day: "numeric",
                  })}
                </span>
              )}
            </span>
          </span>
        )}
        <span className="ml-auto flex shrink-0 items-stretch justify-end gap-[1.1vw] pl-[2vw]">
          {c.weather && (
            <>
              <HeaderStat label={c.weather.label} value={`${c.weather.tempF}°F`} />
              <HeaderDivider />
            </>
          )}
          {c.sun && (
            <>
              <HeaderStat
                icon={<SunriseIcon />}
                label="Sunrise"
                value={fmtClock(c.sun.sunrise)}
              />
              <HeaderDivider />
              <HeaderStat
                icon={<SunsetIcon />}
                label="Sunset"
                value={fmtClock(c.sun.sunset)}
              />
              <HeaderDivider />
            </>
          )}
          <HeaderStat
            label={now.toLocaleDateString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
            })}
            value={fmtClock(now)}
          />
        </span>
      </header>

      <main
        key={virtualPage ?? slide.key}
        className="relative z-10 min-h-0 flex-1"
        // Entrance animation: the playlist can pick a per-block transition
        // (fade default · glide · zoom · none); duration stays the host's
        // fade knob (settings.signage.fadeSeconds).
        style={{
          animation: (() => {
            const name =
              TRANSITION_ANIM[slide.transition ?? "fade"] ?? "tvfade";
            return name ? `${name} ${c.timing.fadeMs}ms ease` : "none";
          })(),
        }}
      >
        {virtualPage ? (
          <GuideBrowser
            title={
              virtualPage === "guide"
                ? "Guidebook"
                : virtualPage === "dining"
                  ? "Dining"
                  : "Nearby"
            }
            sections={virtualSections}
            focus={guideFocus}
          />
        ) : slide.key === "streaming" ? (
          <EntertainmentPage
            c={c}
            focus={onEntertainment ? svcFocus : null}
            open={onEntertainment ? svcOpen : null}
          />
        ) : (
          slide.render()
        )}
        <MediaPreloader media={upcomingMedia(slides, index)} />
      </main>

      {navOpen && (
        /* Menu as an extension of thefloridahavens.com: quiet letterspaced
           small caps on deep ocean, seafoam underline on the focused item —
           no app-style pills (host feedback 2026-07-17). */
        <nav className="absolute inset-x-0 bottom-0 z-30 border-t border-white/15 bg-ocean-900/95 px-[4vw] py-[2vw] backdrop-blur-sm">
          <div className="flex items-baseline gap-[2.2vw]">
            {menu.map((m, i) => (
              <span
                key={m.key}
                className={`relative whitespace-nowrap pb-[0.6vw] text-[1.15vw] uppercase tracking-[0.22em] transition-all duration-200 ${
                  i === navIndex
                    ? "font-medium text-white"
                    : "font-light text-white/45"
                }`}
              >
                {m.title}
                <span
                  className={`absolute inset-x-0 bottom-0 h-[0.14vw] rounded-full bg-seafoam-500 transition-opacity duration-200 ${
                    i === navIndex ? "opacity-100" : "opacity-0"
                  }`}
                />
              </span>
            ))}
            <span className="ml-auto whitespace-nowrap text-[0.85vw] uppercase tracking-[0.22em] text-white/30">
              ◀ ▶ · OK · Back
            </span>
          </div>
        </nav>
      )}

      <footer className="relative z-10 flex items-center justify-center gap-[0.8vw] pb-[1vw] pt-[0.8vw]">
        <span className="absolute left-[3vw] text-[1.1vw] tracking-wide text-white/40">
          www.thefloridahavens.com · ◀ ▶ slides · OK menu
        </span>
        {slides.map((s, i) => (
          <span
            key={s.key}
            className={`h-[0.5vw] rounded-full transition-all duration-500 ${
              i === index ? "w-[2.5vw] bg-white/90" : "w-[0.5vw] bg-white/30"
            }`}
          />
        ))}
        {state.mode === "demo" && (
          <span className="absolute right-[3vw] text-[1vw] text-white/40">
            demo
          </span>
        )}
      </footer>
    </div>
  );
}
