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
      title: "Streaming",
      render: () => (
        <div className="flex h-full flex-col justify-center px-[8vw]">
          <h2 className="text-[4vw] font-bold">Your shows, your accounts</h2>
          <p className="mt-[2vw] text-[2.2vw] leading-relaxed text-white/85">
            This screen is your house guide. Press Home for Netflix, Disney+,
            Hulu, and more — sign in with your own accounts. When an app shows
            a code, your phone portal has one-tap links to every sign-in page.
            When you&apos;re done, this guide comes back. We clear logins after
            checkout.
          </p>
          <p className="mt-[2vw] text-[1.6vw] text-white/50">
            netflix.com/tv8 · disneyplus.com/begin · hulu.com/activate ·
            amazon.com/mytv · max.com/signin
          </p>
        </div>
      ),
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

  useEffect(() => {
    const t = setInterval(() => setIndex((i) => (i + 1) % slides.length), SLIDE_MS);
    return () => clearInterval(t);
  }, [slides.length]);

  const slide = slides[index % slides.length];
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

      <main key={slide.key} className="relative z-10 min-h-0 flex-1 animate-[tvfade_2.5s_ease]">
        {slide.render()}
      </main>

      <footer className="relative z-10 flex items-center justify-center gap-[0.8vw] pb-[1.5vw]">
        <span className="absolute left-[3vw] text-[1.1vw] tracking-wide text-white/40">
          www.thefloridahavens.com
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
