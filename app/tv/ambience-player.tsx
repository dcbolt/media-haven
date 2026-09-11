"use client";

import { useEffect, useState } from "react";
import {
  AMBIENCE_FADE_MS,
  AMBIENCE_ROTATE_MS,
  firstRotateBed,
  nextRotateBed,
  resolveAmbience,
  type AmbienceBedId,
  type AmbienceSettings,
} from "@/lib/ambience";

/**
 * Soft looping ambience under `/tv` signage. Videos stay muted (existing
 * never-blank / autoplay policy); this graph is a separate Web Audio
 * context so it does not unmute drone footage.
 *
 * Recovery (H1): try resume on mount, then on pointer/key/visibility, then
 * every 12s while still suspended. Failure is silent — a TV must never
 * crash because audio is blocked.
 */

type ProbeState = "running" | "suspended" | "off" | "unsupported";

export function SignageAmbience({
  settings,
  silent = false,
}: {
  settings: AmbienceSettings | null | undefined;
  /** Host editor thumbs — never play (H4). */
  silent?: boolean;
}) {
  // Poll rebuilds mint a new settings object every 10s — read values so
  // the graph is not torn down mid-loop (same rule as the slide timer).
  const search = typeof window === "undefined" ? "" : window.location.search;
  const resolved = resolveAmbience(settings, search, silent);
  const want = resolved.enabled && resolved.volume > 0 && !silent;
  const chosenBed: AmbienceBedId =
    resolved.bed === "rotate" ? firstRotateBed() : resolved.bed;

  const [audioState, setAudioState] = useState<ProbeState>(
    want ? "suspended" : "off"
  );
  const [playingBed, setPlayingBed] = useState<AmbienceBedId>(chosenBed);

  useEffect(() => {
    if (!want) return;

    let cancelled = false;
    let engine: Engine | null = null;
    let rotateTimer: ReturnType<typeof setInterval> | null = null;
    let retryTimer: ReturnType<typeof setInterval> | null = null;

    const publish = (state: ProbeState, nextBed: AmbienceBedId) => {
      if (cancelled) return;
      setAudioState(state);
      setPlayingBed(nextBed);
    };

    const boot = async () => {
      try {
        engine = new Engine(resolved.volume);
        const startBed: AmbienceBedId =
          resolved.bed === "rotate" ? firstRotateBed() : resolved.bed;
        await engine.start(startBed);
        if (cancelled) {
          engine.stop();
          return;
        }
        publish(engine.probe(), startBed);

        if (resolved.bed === "rotate") {
          let current = startBed;
          rotateTimer = setInterval(() => {
            if (!engine || cancelled) return;
            current = nextRotateBed(current);
            engine.crossfadeTo(current);
            publish(engine.probe(), current);
          }, AMBIENCE_ROTATE_MS);
        }
      } catch {
        publish("unsupported", firstRotateBed());
      }
    };

    void boot();

    const tryResume = () => {
      if (!engine || cancelled) return;
      void engine.resume();
      publish(engine.probe(), engine.currentBed ?? firstRotateBed());
    };

    const onVis = () => {
      if (!engine || cancelled) return;
      if (document.visibilityState === "hidden") engine.suspend();
      else void engine.resume();
      publish(engine.probe(), engine.currentBed ?? firstRotateBed());
    };

    const onHide = () => engine?.suspend();

    window.addEventListener("pointerdown", tryResume);
    window.addEventListener("keydown", tryResume);
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onVis);
    retryTimer = setInterval(tryResume, 12_000);

    return () => {
      cancelled = true;
      window.removeEventListener("pointerdown", tryResume);
      window.removeEventListener("keydown", tryResume);
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onVis);
      if (rotateTimer) clearInterval(rotateTimer);
      if (retryTimer) clearInterval(retryTimer);
      engine?.stop();
    };
    // volume / bed choice restart the graph; want gates mount.
  }, [want, resolved.volume, resolved.bed]);

  return (
    <div
      hidden
      suppressHydrationWarning
      data-fh-ambience={want ? "on" : "off"}
      data-fh-ambience-bed={want ? playingBed : chosenBed}
      data-fh-ambience-state={want ? audioState : "off"}
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Web Audio graph — all samples generated here (H3).                 */
/* ------------------------------------------------------------------ */

type Disposable = { stop?: () => void; disconnect: () => void };

class Engine {
  readonly ctx: AudioContext;
  readonly master: GainNode;
  currentBed: AmbienceBedId | null = null;
  private active: { gain: GainNode; nodes: Disposable[] } | null = null;
  private fading: { gain: GainNode; nodes: Disposable[] } | null = null;

  constructor(volume: number) {
    const AC =
      window.AudioContext ||
      (
        window as unknown as {
          webkitAudioContext?: typeof AudioContext;
        }
      ).webkitAudioContext;
    if (!AC) throw new Error("no AudioContext");
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = volume;
    this.master.connect(this.ctx.destination);
  }

  probe(): ProbeState {
    if (this.ctx.state === "running") return "running";
    if (this.ctx.state === "closed") return "off";
    return "suspended";
  }

  async start(bed: AmbienceBedId): Promise<void> {
    this.attach(bed, 0.001);
    await this.resume();
    const now = this.ctx.currentTime;
    this.active?.gain.gain.setTargetAtTime(1, now, 1.8);
  }

  crossfadeTo(bed: AmbienceBedId): void {
    if (bed === this.currentBed) return;
    if (this.fading) this.dispose(this.fading);
    this.fading = this.active;
    this.attach(bed, 0.0001);
    const now = this.ctx.currentTime;
    const fade = AMBIENCE_FADE_MS / 1000;
    if (this.fading) {
      this.fading.gain.gain.cancelScheduledValues(now);
      this.fading.gain.gain.setValueAtTime(this.fading.gain.gain.value, now);
      this.fading.gain.gain.linearRampToValueAtTime(0.0001, now + fade);
    }
    if (this.active) {
      this.active.gain.gain.cancelScheduledValues(now);
      this.active.gain.gain.setValueAtTime(0.0001, now);
      this.active.gain.gain.linearRampToValueAtTime(1, now + fade);
    }
    const outgoing = this.fading;
    window.setTimeout(() => {
      if (this.fading === outgoing && outgoing) {
        this.dispose(outgoing);
        this.fading = null;
      }
    }, AMBIENCE_FADE_MS + 400);
  }

  resume(): Promise<void> {
    if (this.ctx.state === "suspended") {
      return this.ctx.resume().catch(() => {});
    }
    return Promise.resolve();
  }

  suspend(): void {
    if (this.ctx.state === "running") {
      void this.ctx.suspend().catch(() => {});
    }
  }

  stop(): void {
    if (this.active) this.dispose(this.active);
    if (this.fading) this.dispose(this.fading);
    this.active = null;
    this.fading = null;
    try {
      void this.ctx.close();
    } catch {
      /* already closed */
    }
  }

  private attach(bed: AmbienceBedId, initialGain: number): void {
    const gain = this.ctx.createGain();
    gain.gain.value = initialGain;
    gain.connect(this.master);
    const nodes =
      bed === "ocean"
        ? buildOcean(this.ctx, gain)
        : bed === "bath"
          ? buildBath(this.ctx, gain)
          : buildHorizon(this.ctx, gain);
    this.active = { gain, nodes };
    this.currentBed = bed;
  }

  private dispose(slot: { gain: GainNode; nodes: Disposable[] }): void {
    for (const n of slot.nodes) {
      try {
        n.stop?.();
      } catch {
        /* already stopped */
      }
      try {
        n.disconnect();
      } catch {
        /* already disconnected */
      }
    }
    try {
      slot.gain.disconnect();
    } catch {
      /* ignore */
    }
  }
}

function noiseBuffer(
  ctx: AudioContext,
  seconds: number,
  kind: "brown" | "pink" | "white"
): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * seconds);
  const buffer = ctx.createBuffer(2, length, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    let last = 0;
    let b0 = 0,
      b1 = 0,
      b2 = 0,
      b3 = 0,
      b4 = 0,
      b5 = 0,
      b6 = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      if (kind === "white") {
        data[i] = white * 0.35;
      } else if (kind === "brown") {
        last = (last + 0.02 * white) / 1.02;
        data[i] = last * 3.2;
      } else {
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.969 * b2 + white * 0.153852;
        b3 = 0.8665 * b3 + white * 0.3104856;
        b4 = 0.55 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.016898;
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
        b6 = white * 0.115926;
      }
    }
  }
  return buffer;
}

function loopSource(ctx: AudioContext, buffer: AudioBuffer): AudioBufferSourceNode {
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  src.start();
  return src;
}

function lfo(
  ctx: AudioContext,
  freq: number,
  depth: number,
  dest: AudioParam,
  offset: number,
  nodes: Disposable[]
): OscillatorNode {
  dest.value = offset;
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.value = depth;
  osc.connect(g);
  g.connect(dest);
  osc.start();
  nodes.push(osc, g);
  return osc;
}

function buildOcean(ctx: AudioContext, out: GainNode): Disposable[] {
  const nodes: Disposable[] = [];
  const brown = noiseBuffer(ctx, 6, "brown");
  const pink = noiseBuffer(ctx, 5, "pink");
  const white = noiseBuffer(ctx, 4, "white");

  // Low rumble — distant swell, never a crash.
  {
    const src = loopSource(ctx, brown);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 180;
    lp.Q.value = 0.6;
    const g = ctx.createGain();
    g.gain.value = 0.42;
    src.connect(lp);
    lp.connect(g);
    g.connect(out);
    nodes.push(src, lp, g);
  }

  // Mid foam — slow wash, filter breathes like a tide line.
  {
    const src = loopSource(ctx, pink);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 0.55;
    lfo(ctx, 0.07, 380, bp.frequency, 720, nodes);
    const g = ctx.createGain();
    lfo(ctx, 0.09, 0.09, g.gain, 0.2, nodes);
    src.connect(bp);
    bp.connect(g);
    g.connect(out);
    nodes.push(src, bp, g);
  }

  // Fine spray, very quiet — keeps the bed from feeling muffled.
  {
    const src = loopSource(ctx, white);
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 1800;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 5200;
    const g = ctx.createGain();
    lfo(ctx, 0.05, 0.018, g.gain, 0.04, nodes);
    src.connect(hp);
    hp.connect(lp);
    lp.connect(g);
    g.connect(out);
    nodes.push(src, hp, lp, g);
  }

  return nodes;
}

function tone(
  ctx: AudioContext,
  freq: number,
  gain: number,
  dest: AudioNode,
  nodes: Disposable[]
): OscillatorNode {
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.value = gain;
  osc.connect(g);
  g.connect(dest);
  osc.start();
  nodes.push(osc, g);
  return osc;
}

function buildBath(ctx: AudioContext, out: GainNode): Disposable[] {
  const nodes: Disposable[] = [];
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 1600;
  lp.Q.value = 0.4;
  const cluster = ctx.createGain();
  cluster.gain.value = 1;
  lfo(ctx, 0.035, 0.18, cluster.gain, 0.82, nodes);
  cluster.connect(lp);
  lp.connect(out);
  nodes.push(cluster, lp);

  // 174 Hz "foundation" + a 0.11 Hz beat; octave + 528 Hz air.
  tone(ctx, 174, 0.038, cluster, nodes);
  tone(ctx, 174.11, 0.032, cluster, nodes);
  tone(ctx, 348, 0.016, cluster, nodes);
  tone(ctx, 522, 0.01, cluster, nodes);
  return nodes;
}

function buildHorizon(ctx: AudioContext, out: GainNode): Disposable[] {
  const nodes: Disposable[] = [];
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 1400;
  const cluster = ctx.createGain();
  lfo(ctx, 0.04, 0.14, cluster.gain, 0.78, nodes);
  cluster.connect(lp);
  lp.connect(out);
  nodes.push(cluster, lp);

  tone(ctx, 285, 0.03, cluster, nodes);
  tone(ctx, 285.14, 0.024, cluster, nodes);
  tone(ctx, 396, 0.018, cluster, nodes);
  tone(ctx, 198, 0.01, cluster, nodes);

  // Distant surf under the bowls so the bed still feels coastal.
  const brown = noiseBuffer(ctx, 6, "brown");
  const src = loopSource(ctx, brown);
  const rumble = ctx.createBiquadFilter();
  rumble.type = "lowpass";
  rumble.frequency.value = 140;
  const g = ctx.createGain();
  g.gain.value = 0.16;
  src.connect(rumble);
  rumble.connect(g);
  g.connect(out);
  nodes.push(src, rumble, g);
  return nodes;
}
