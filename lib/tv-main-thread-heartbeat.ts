/** Detect main-thread stalls (frozen compositor / dead renderer). */

export const TV_MAIN_THREAD_STALL_MS = 60_000;

export function mainThreadStalled(
  lastRafMs: number,
  nowMs: number,
  stallMs = TV_MAIN_THREAD_STALL_MS
): boolean {
  return nowMs - lastRafMs > stallMs;
}

export function startTvMainThreadHeartbeat(
  onStall: () => void,
  opts?: {
    stallMs?: number;
    now?: () => number;
    raf?: (cb: FrameRequestCallback) => number;
    caf?: (id: number) => void;
  }
): () => void {
  const stallMs = opts?.stallMs ?? TV_MAIN_THREAD_STALL_MS;
  const now = opts?.now ?? (() => Date.now());
  const raf = opts?.raf ?? ((cb) => requestAnimationFrame(cb));
  const caf = opts?.caf ?? ((id) => cancelAnimationFrame(id));
  let last = now();
  let id = 0;
  let cancelled = false;

  const tick = () => {
    if (cancelled) return;
    const t = now();
    if (mainThreadStalled(last, t, stallMs)) {
      onStall();
      last = t;
    } else {
      last = t;
    }
    id = raf(tick);
  };
  id = raf(tick);

  return () => {
    cancelled = true;
    caf(id);
  };
}
