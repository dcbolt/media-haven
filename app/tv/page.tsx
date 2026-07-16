"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { TvState } from "@/lib/tv";

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
  return <Signage state={state} />;
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

    list.push({
      key: "streaming",
      title: "Streaming",
      render: () => (
        <div className="flex h-full flex-col justify-center px-[8vw]">
          <h2 className="text-[4vw] font-bold">Your shows, your accounts</h2>
          <p className="mt-[2vw] text-[2.2vw] leading-relaxed text-white/85">
            The Roku is in Guest Mode. Sign into Netflix, Disney+, Hulu — any
            app — with your own account and set your check-out date. Everything
            signs out and erases itself automatically the day you leave.
          </p>
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
