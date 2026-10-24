"use client";

import { useEffect } from "react";
import {
  globalErrorFirstRetryDelayMs,
  globalErrorRetryDelayMs,
} from "@/lib/global-error-retry";

/**
 * Last-resort boundary for errors outside segment error.tsx handlers.
 * Keeps a branded recovery screen instead of a blank document.
 */
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    const w = window as Window & { __FH_GLOBAL_ERR_RETRY__?: boolean };
    if (w.__FH_GLOBAL_ERR_RETRY__) return;
    w.__FH_GLOBAL_ERR_RETRY__ = true;

    let cancelled = false;
    let attempt = 0;
    let timer: number | undefined;

    const schedule = (delayMs: number) => {
      timer = window.setTimeout(() => {
        void tick();
      }, delayMs);
    };

    const tick = () => {
      if (cancelled) return;
      reset();
      const delay = globalErrorRetryDelayMs(attempt);
      attempt += 1;
      schedule(delay);
    };

    schedule(globalErrorFirstRetryDelayMs());

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [reset]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0c4a6e",
          color: "#fff",
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
          padding: "2rem",
        }}
      >
        <div>
          <h1 style={{ fontSize: "clamp(1.5rem, 4vw, 2.5rem)", marginBottom: "1rem" }}>
            The Florida Havens
          </h1>
          <p style={{ opacity: 0.85, marginBottom: "1.5rem" }}>
            Something went wrong loading this page. Retrying automatically —
            no power cycle needed.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              fontSize: "1.1rem",
              padding: "0.75rem 1.5rem",
              borderRadius: "0.5rem",
              border: "none",
              background: "rgba(255,255,255,0.15)",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            Try again now
          </button>
        </div>
      </body>
    </html>
  );
}
