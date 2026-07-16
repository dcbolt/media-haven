"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { TvContent, TvState } from "@/lib/tv";

/**
 * TV signage app. Runs full-screen in a TV browser (Tizen, Fire TV Silk,
 * or any HDMI stick pointed at this URL). Sized entirely in vw units so
 * HD and 4K landscape render identically. No interaction required — it
 * registers itself, shows a pairing code until claimed, then rotates
 * content panels and re-polls for fresh data.
 */

const POLL_MS = 30_000;
const SLIDE_MS = 12_000;

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

export default function TvApp() {
  const deviceId = useDeviceId();
  const [state, setState] = useState<TvState | null>(null);
  const [previewStandby, setPreviewStandby] = useState(false);

  useEffect(() => {
    // /tv?preview=standby forces the standby screen so hosts can check
    // screensaver media without waiting for an unoccupied night.
    setPreviewStandby(
      new URLSearchParams(window.location.search).get("preview") === "standby"
    );
  }, []);

  const poll = useCallback(async () => {
    if (!deviceId) return;
    try {
      const res = await fetch(`/api/tv/state?device=${deviceId}`, {
        cache: "no-store",
      });
      if (res.ok) setState((await res.json()) as TvState);
    } catch {
      // keep showing the last good state; TVs must never show an error page
    }
  }, [deviceId]);

  useEffect(() => {
    poll();
    const t = setInterval(poll, POLL_MS);
    return () => clearInterval(t);
  }, [poll]);

  if (!state) return <BrandSplash />;
  if (state.mode === "pairing") return <PairingScreen code={state.pairCode} />;
  if (previewStandby || !state.content.occupied)
    return <Standby assets={state.content.screensavers} />;
  return <Signage state={state} />;
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

function Signage({ state }: { state: Extract<TvState, { mode: "demo" | "active" }> }) {
  const c = state.content;
  const now = useClock();
  const [index, setIndex] = useState(0);

  const slides = useMemo<Slide[]>(() => {
    const list: Slide[] = [
      {
        key: "welcome",
        title: "Welcome",
        render: () => (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <p className="text-[2.2vw] text-white/70">Welcome to</p>
            <h2 className="mt-[0.5vw] text-[6vw] font-bold leading-tight">
              {c.propertyName}
            </h2>
            {c.guestFirstName && (
              <p className="mt-[2vw] text-[3vw]">
                So glad you&apos;re here, {c.guestFirstName}.
              </p>
            )}
            {c.checkOut && (
              <p className="mt-[1vw] text-[1.8vw] text-white/60">
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
    ];

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
            The Roku is in Guest Mode. Open any app and sign in with your own
            account — when the TV shows a code, your phone welcome portal has
            one-tap links to every sign-in page. Everything signs out and
            erases itself automatically the day you leave.
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
          <p className="mt-[2vw] text-[1.6vw] text-white/50">
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

    return list;
  }, [c]);

  useEffect(() => {
    const t = setInterval(() => setIndex((i) => (i + 1) % slides.length), SLIDE_MS);
    return () => clearInterval(t);
  }, [slides.length]);

  const slide = slides[index % slides.length];

  return (
    <div className="flex h-full flex-col bg-gradient-to-br from-ocean-900 via-ocean-700 to-ocean-900">
      <header className="flex items-center justify-between px-[3vw] pt-[2vw] text-[1.6vw] text-white/80">
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

      <main key={slide.key} className="min-h-0 flex-1 animate-[tvfade_1s_ease]">
        {slide.render()}
      </main>

      <footer className="flex items-center justify-center gap-[0.8vw] pb-[1.5vw]">
        {slides.map((s, i) => (
          <span
            key={s.key}
            className={`h-[0.5vw] rounded-full transition-all duration-500 ${
              i === index ? "w-[2.5vw] bg-white/90" : "w-[0.5vw] bg-white/30"
            }`}
          />
        ))}
        {state.mode === "demo" && (
          <span className="absolute right-[3vw] text-[1vw] text-white/40">demo</span>
        )}
      </footer>
    </div>
  );
}
