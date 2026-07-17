"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatTideTime } from "@/lib/tides";
import type { TvContent, TvState } from "@/lib/tv";

/**
 * TV kiosk app. Per DECISIONS.md it runs full-screen via Fully Kiosk (or
 * equivalent) on the unit's streamer — Shield TV Pro / Chromecast with
 * Google TV — as the boot + idle home screen. Sized entirely in vw units so
 * HD and 4K landscape render identically. No interaction required — it
 * registers itself, shows a pairing code until claimed, then rotates
 * content panels and re-polls for fresh data.
 */

const POLL_MS = 30_000;
const SLIDE_MS = 20_000;
// Browsers degrade over multi-day runs; the signage industry's standard fix
// is a scheduled full reload (DECISIONS kiosk spec: every 4-6h). Reloads
// re-render in <2s and the last-good cache guarantees content meanwhile.
const SELF_HEAL_RELOAD_MS = 5 * 3600_000;
// A TV that can't reach the server for this many consecutive polls hard
// reloads — recovers from wedged fetch/DNS state that in-page retries can't.
const MAX_FAILED_POLLS = 40; // ~20 minutes

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
    },
  };
}

export default function TvApp() {
  const deviceId = useDeviceId();
  const [state, setState] = useState<TvState | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    // Host preview switches: ?preview=standby shows the screensaver screen
    // without waiting for an unoccupied night; ?preview=lastnight shows the
    // farewell deck without waiting for a guest's final evening.
    setPreview(new URLSearchParams(window.location.search).get("preview"));

    // Never-blank: hydrate from the last good state immediately so a TV
    // that reboots during a server or network outage shows the guide, not
    // a splash screen. Live polling replaces it as soon as it succeeds.
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

  const poll = useCallback(async () => {
    if (!deviceId) return;
    try {
      const res = await fetch(`/api/tv/state?device=${deviceId}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const next = normalizeState((await res.json()) as TvState);
        setState(next);
        failedPolls.current = 0;
        if (next.mode === "demo" || next.mode === "active") {
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
    if (failedPolls.current >= MAX_FAILED_POLLS) window.location.reload();
  }, [deviceId]);

  useEffect(() => {
    poll();
    const t = setInterval(poll, POLL_MS);
    const heal = setTimeout(() => window.location.reload(), SELF_HEAL_RELOAD_MS);
    return () => {
      clearInterval(t);
      clearTimeout(heal);
    };
  }, [poll]);

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
  if (preview === "standby" || !state.content.occupied)
    return <Standby assets={state.content.screensavers} />;
  return <Signage state={state} forceLastNight={preview === "lastnight"} />;
}

/** Between stays: host-provided 4K photos/videos as a slow slideshow, or a
 *  near-black screen when none exist (OLED-safe, minimal power). The clock
 *  drifts position each minute to prevent burn-in. Flips back to signage
 *  automatically when the next reservation checks in. */
function Standby({ assets }: { assets: TvContent["screensavers"] }) {
  const now = useClock();
  const [assetIndex, setAssetIndex] = useState(0);
  const asset = assets.length > 0 ? assets[assetIndex % assets.length] : null;

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
      <h2 className="text-[4vw] font-bold">Rocket Launches</h2>
      <p className="mt-[1vw] text-[1.7vw] text-white/60">
        Visible from the beach — walk out to the sand or the upper deck.
      </p>
      <div className="mt-[2.5vw] space-y-[2vw]">
        {rows.map(({ launch, right }) => (
          <div
            key={launch.name + launch.net}
            className="flex items-center justify-between gap-[3vw] border-l-[0.4vw] border-seafoam-500 pl-[2vw]"
          >
            <div className="min-w-0">
              <p className="truncate text-[2.4vw] font-semibold">{launch.name}</p>
              <p className="text-[1.6vw] text-white/60">
                {[launch.provider, launch.vehicle].filter(Boolean).join(" · ")}
              </p>
            </div>
            {right}
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
        <h2 className="text-[2.6vw] font-bold">{title}</h2>
        <div className="mt-[1.5vw] max-h-[36vw] space-y-[0.8vw] overflow-hidden">
          {sections.map((s, i) => (
            <p
              key={s.slug}
              className={`rounded-[0.8vw] px-[1.4vw] py-[0.9vw] text-[1.7vw] font-semibold transition ${
                i === focus ? "bg-white text-ocean-900" : "bg-white/10 text-white/80"
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
        <p className="mt-[1.5vw] text-[1.1vw] uppercase tracking-widest text-white/40">
          ▲ ▼ browse · Back resumes
        </p>
      </div>
      <div className="min-w-0 flex-1 self-center">
        {sel && (
          <>
            <h3 className="text-[3.4vw] font-bold leading-tight">{sel.title}</h3>
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
        <h2 className="text-[4vw] font-bold">Your shows, your accounts</h2>
        <p className="mt-[1.2vw] text-[1.9vw] leading-relaxed text-white/85">
          {focus != null
            ? "Pick a service with the arrows, then press OK for the easiest way to sign in."
            : "Press OK, choose Entertainment, and pick a service — we'll walk you through the fastest sign-in."}
        </p>
        {services.length > 0 && (
          <div className="mt-[2vw] grid grid-cols-3 gap-[1vw]">
            {services.map((s, i) => (
              <div
                key={s.name}
                className={`rounded-[0.8vw] px-[1.3vw] py-[0.9vw] transition ${
                  focus === i ? "scale-105 bg-white" : "bg-white/10"
                }`}
                style={{ borderLeft: `0.35vw solid ${s.color}` }}
              >
                <p
                  className={`text-[1.7vw] font-bold leading-tight ${
                    focus === i ? "text-ocean-900" : ""
                  }`}
                >
                  {s.name}
                </p>
                <p
                  className={`text-[1vw] ${
                    focus === i ? "text-ocean-900/60" : "text-white/50"
                  }`}
                >
                  {s.activateLabel}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
      {c.portalQr && (
        <div className="shrink-0 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={c.portalQr}
            alt="Scan for one-tap sign-in links"
            className="h-[14vw] w-[14vw] rounded-[1.2vw] bg-white p-[0.7vw]"
          />
          <p className="mt-[0.8vw] max-w-[14vw] text-[1.1vw] text-white/70">
            All sign-in pages, one tap on your phone
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
              <ol className="mt-[1.5vw] space-y-[1.2vw] text-[1.9vw] leading-snug text-white/90">
                <li>
                  <span className="font-bold text-seafoam-500">1</span> · Press{" "}
                  <span className="font-bold">Home</span> on the remote and open{" "}
                  {sel.name}.
                </li>
                <li>
                  <span className="font-bold text-seafoam-500">2</span> · When a
                  sign-in code appears, scan this QR — or visit{" "}
                  <span className="font-mono text-seafoam-500">
                    {sel.activateLabel}
                  </span>{" "}
                  on your phone.
                </li>
                <li>
                  <span className="font-bold text-seafoam-500">3</span> · Enter
                  the code with your own account — that&apos;s it.
                </li>
              </ol>
              <p className="mt-[1.5vw] text-[1.3vw] text-white/50">
                Back returns to the guide · logins are cleared after checkout
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

function BrandSplash() {
  return (
    <div className="flex h-full items-center justify-center">
      <h1 className="text-[6vw] font-bold tracking-wide">The Florida Havens</h1>
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
}

function Signage({
  state,
  forceLastNight = false,
}: {
  state: Extract<TvState, { mode: "demo" | "active" }>;
  forceLastNight?: boolean;
}) {
  const c = state.content;
  const now = useClock();
  const [index, setIndex] = useState(0);

  // Hotel "last night" pattern: within 24h of checkout the deck leads with
  // departure logistics + the rebooking pitch instead of arrival orientation.
  const lastNight =
    forceLastNight ||
    Boolean(
      c.checkOut &&
        new Date(c.checkOut).getTime() - Date.now() < 24 * 3600_000 &&
        new Date(c.checkOut).getTime() > Date.now()
    );

  const slides = useMemo<Slide[]>(() => {
    const list: Slide[] = [];

    if (lastNight && c.checkOut) {
      const when = new Date(c.checkOut).toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
      });
      const leaveSection = c.sections.find((s) => s.slug === "leave");
      list.push({
        key: "farewell",
        title: "Until next time",
        render: () => (
          <div className="flex h-full items-center justify-center gap-[6vw] px-[6vw]">
            <div className="max-w-[48vw]">
              <h2 className="text-[4vw] font-bold leading-tight">
                Until next time{c.guestFirstName ? `, ${c.guestFirstName}` : ""}
              </h2>
              <p className="mt-[1.5vw] text-[2.2vw] leading-relaxed text-white/85">
                Check-out is {when}.
                {leaveSection ? ` ${leaveSection.body}` : ""}
              </p>
              <p className="mt-[1.5vw] text-[2vw] font-semibold text-seafoam-500">
                These exact dates next year are open now — returning guests
                book them first, direct at thefloridahavens.com.
              </p>
            </div>
            <div className="text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={c.bookQr}
                alt="Scan to book your next stay"
                className="h-[16vw] w-[16vw] rounded-[1.5vw] bg-white p-[0.8vw]"
              />
              <p className="mt-[1vw] text-[1.4vw] text-white/70">
                thefloridahavens.com
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
            <p className="relative text-[2.2vw] text-white/70">Welcome to</p>
            <h2 className="relative mt-[0.5vw] text-[6vw] font-bold leading-tight">
              {c.propertyName}
            </h2>
            {c.guestFirstName && (
              <p className="relative mt-[2vw] text-[3vw]">
                So glad you&apos;re here, {c.guestFirstName}.
              </p>
            )}
            {c.checkOut && (
              <p className="relative mt-[1vw] text-[1.8vw] text-white/60">
                With us through{" "}
                {new Date(c.checkOut).toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}
              </p>
            )}
          </div>
        ),
      },
    );

    if (c.wifiSsid && c.wifiPassword && c.wifiQr) {
      const { wifiSsid, wifiPassword, wifiQr } = c;
      list.push({
        key: "wifi",
        title: "Wi-Fi",
        render: () => (
          <div className="flex h-full items-center justify-center gap-[6vw]">
            <div>
              <h2 className="text-[4vw] font-bold">Get online</h2>
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
            <h2 className="text-[4vw] font-bold">{s.title}</h2>
            <p className="mt-[2vw] whitespace-pre-line text-[2.2vw] leading-relaxed text-white/85">
              {s.body}
            </p>
          </div>
        ),
      });
    }

    if (c.tides?.length || c.sun) {
      const tides = c.tides ?? [];
      const sun = c.sun;
      list.push({
        key: "beach-day",
        title: "Beach day",
        render: () => (
          <div className="flex h-full flex-col justify-center px-[8vw]">
            <h2 className="text-[4vw] font-bold">Today at the beach</h2>
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
          </div>
        ),
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
          <h2 className="text-[4vw] font-bold">Cast from your phone</h2>
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

    list.push({
      key: "book-direct",
      title: "Book Direct",
      render: () => (
        <div className="flex h-full items-center justify-center gap-[6vw]">
          <div className="max-w-[45vw]">
            <h2 className="text-[4vw] font-bold leading-tight">
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

    // Media sweep: full-bleed property photos interleaved every third slide,
    // property name whispered in the corner. Pure ambiance between content.
    if (c.photos.length > 0) {
      const ambient = c.photos.slice(0, 4).map((url, i) => ({
        key: `photo-${i}`,
        title: c.propertyName,
        render: () => (
          <div className="relative h-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-ocean-900/70 via-transparent to-transparent" />
            <p className="absolute bottom-[2vw] left-[3vw] text-[1.8vw] font-semibold text-white/80">
              {c.propertyName}
            </p>
          </div>
        ),
      }));
      const merged: Slide[] = [];
      let p = 0;
      list.forEach((s, i) => {
        merged.push(s);
        if ((i + 1) % 3 === 0 && p < ambient.length) merged.push(ambient[p++]);
      });
      while (p < ambient.length) merged.push(ambient[p++]);
      return merged;
    }

    return list;
  }, [c, lastNight]);

  // Remote navigation. Any D-pad press wakes a five-item menu — Home,
  // Entertainment, Casting, Rocket Launches, Book Direct. OK opens the page
  // and pauses rotation; on the Entertainment page the D-pad keeps going:
  // arrows move across the service tiles and OK opens that service's
  // sign-in walkthrough. Back steps out one level; ~60s idle resumes the
  // loop. Google TV / Shield remotes deliver these as normal DOM key events.
  const [navOpen, setNavOpen] = useState(false);
  const [navIndex, setNavIndex] = useState(0);
  const [manual, setManual] = useState(false);
  const [svcFocus, setSvcFocus] = useState(0);
  const [svcOpen, setSvcOpen] = useState<number | null>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bumpIdle = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => {
      setNavOpen(false);
      setManual(false);
      setSvcOpen(null);
      setVirtualPage(null);
    }, 60_000);
  }, []);

  // Guide Book / Dining / Nearby are virtual pages (browsers over the CMS
  // sections), not slides; Weather maps to the beach-day slide. Ambient
  // photo slides never appear in the menu.
  const [virtualPage, setVirtualPage] = useState<
    "guide" | "dining" | "nearby" | null
  >(null);
  const [guideFocus, setGuideFocus] = useState(0);

  const menu = useMemo(() => {
    const items: { key: string; title: string }[] = [{ key: "home", title: "Home" }];
    if (c.sections.length > 0) items.push({ key: "guide", title: "Guide Book" });
    if (sectionsFor("dining", c.sections).length > 0)
      items.push({ key: "dining", title: "Dining" });
    if (sectionsFor("nearby", c.sections).length > 0)
      items.push({ key: "nearby", title: "Nearby" });
    const slideDests: [string, string][] = [
      ["beach-day", "Weather"],
      ["streaming", "Entertainment"],
      ["casting", "Casting"],
      ["launch-board", "Rocket Launches"],
      ["book-direct", "Book Direct"],
    ];
    for (const [key, title] of slideDests) {
      if (slides.some((s) => s.key === key)) items.push({ key, title });
    }
    return items;
  }, [slides, c.sections]);

  const currentSlide = slides[index % slides.length];
  const onEntertainment =
    manual && !virtualPage && currentSlide.key === "streaming";
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
            }
          }
        } else {
          setNavOpen(false);
        }
        return;
      }

      // Guide Book / Dining / Nearby browser: up/down move the section list.
      if (virtualPage) {
        const n = virtualSections.length;
        if (k === "ArrowUp" || k === "ArrowLeft") {
          if (n > 0) setGuideFocus((f) => (f - 1 + n) % n);
        } else if (k === "ArrowDown" || k === "ArrowRight") {
          if (n > 0) setGuideFocus((f) => (f + 1) % n);
        } else if (isBack) {
          setVirtualPage(null);
          setManual(false);
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
          setSvcFocus((f) => (f + 3 < svcCount ? f + 3 : f));
        } else if (k === "Enter") {
          setSvcOpen(svcFocus);
        } else {
          setManual(false); // Back → resume the loop
        }
        return;
      }

      if (isBack) {
        setManual(false);
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
    onEntertainment,
    virtualPage,
    virtualSections.length,
    bumpIdle,
  ]);

  useEffect(() => {
    if (manual || navOpen) return; // guest is browsing — hold the rotation
    const t = setInterval(() => setIndex((i) => (i + 1) % slides.length), SLIDE_MS);
    return () => clearInterval(t);
  }, [slides.length, manual, navOpen]);

  const slide = currentSlide;
  // Brand ambiance: the property's drone footage runs muted behind every
  // slide (browser-cached after first play, so the loop costs no bandwidth).
  const bgVideo = c.screensavers.find((a) => a.type === "video")?.url ?? null;

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
  }, [bgCovered]);

  return (
    <div className="relative flex h-full flex-col bg-gradient-to-br from-ocean-900 via-ocean-700 to-ocean-900">
      {bgVideo && (
        <>
          <video
            ref={bgVideoRef}
            src={bgVideo}
            autoPlay
            muted
            loop
            playsInline
            className="absolute inset-0 h-full w-full object-cover"
          />
          {/* scrim keeps 10-foot text legible over moving footage */}
          <div className="absolute inset-0 bg-gradient-to-t from-ocean-900/90 via-ocean-900/60 to-ocean-900/70" />
        </>
      )}
      <header className="relative z-10 flex items-center justify-between px-[3vw] pt-[2vw] text-[1.6vw] text-white/80">
        <span className="font-semibold">{c.propertyName}</span>
        <span className="flex items-center gap-[2vw]">
          {c.weather && (
            <span>
              {c.weather.tempF}°F {c.weather.label}
            </span>
          )}
          <span>
            {now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
          </span>
        </span>
      </header>

      <main
        key={virtualPage ?? slide.key}
        className="relative z-10 min-h-0 flex-1 animate-[tvfade_2.5s_ease]"
      >
        {virtualPage ? (
          <GuideBrowser
            title={
              virtualPage === "guide"
                ? "Guide Book"
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
      </main>

      {navOpen && (
        <nav className="absolute inset-x-0 bottom-0 z-30 border-t border-white/10 bg-ocean-900/95 px-[3vw] py-[1.8vw]">
          <div className="flex items-center gap-[1.2vw]">
            {menu.map((m, i) => (
              <span
                key={m.key}
                className={`rounded-full px-[2vw] py-[0.9vw] text-[1.8vw] font-semibold transition ${
                  i === navIndex
                    ? "scale-110 bg-white text-ocean-900"
                    : "bg-white/10 text-white/80"
                }`}
              >
                {m.title}
              </span>
            ))}
            <span className="ml-auto text-[1.2vw] uppercase tracking-widest text-white/40">
              ◀ ▶ then OK · Back resumes
            </span>
          </div>
        </nav>
      )}

      <footer className="relative z-10 flex items-center justify-center gap-[0.8vw] pb-[1.5vw]">
        <span className="absolute left-[3vw] text-[1.1vw] tracking-wide text-white/40">
          www.thefloridahavens.com · press OK to browse
        </span>
        {slides.map((s, i) => (
          <span
            key={s.key}
            className={`h-[0.5vw] rounded-full transition-all duration-500 ${
              i === index ? "w-[2.5vw] bg-white/90" : "w-[0.5vw] bg-white/30"
            }`}
          />
        ))}
        <span className="absolute right-[3vw] flex items-center gap-[1.5vw] text-[1.1vw] tracking-wide text-white/40">
          {c.guestFirstName && (
            <span>
              {c.guestFirstName}
              {c.checkOut &&
                ` · through ${new Date(c.checkOut).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}`}
            </span>
          )}
          {state.mode === "demo" && <span className="text-[1vw]">demo</span>}
        </span>
      </footer>
    </div>
  );
}
