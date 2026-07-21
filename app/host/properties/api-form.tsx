"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Drop-in replacement for `<form action={serverAction}>` in the property
 * editor: posts the form's FormData (plus an `op` discriminator) to
 * POST /api/host/property and shows the outcome inline. Deploy-proof —
 * API routes survive redeploys where server-action ids go stale and
 * silently drop the submit (host CMS incident 2026-07-20).
 *
 * On success the router refreshes so server-rendered data (section lists,
 * saved values) re-seeds without losing scroll position.
 */
export default function ApiForm({
  op,
  className,
  confirmText,
  successText = "Saved",
  children,
}: {
  op: string;
  className?: string;
  /** window.confirm guard for destructive ops (delete). */
  confirmText?: string;
  successText?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [state, setState] = useState<
    { kind: "idle" } | { kind: "busy" } | { kind: "ok" } | { kind: "err"; text: string }
  >({ kind: "idle" });

  return (
    <form
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        if (confirmText && !window.confirm(confirmText)) return;
        const fd = new FormData(e.currentTarget);
        fd.set("op", op);
        setState({ kind: "busy" });
        fetch("/api/host/property", { method: "POST", body: fd })
          .then(async (res) => {
            const data = (await res.json().catch(() => ({}))) as {
              error?: string;
            };
            if (!res.ok) {
              setState({
                kind: "err",
                text: `${data.error ?? res.status} — nothing was saved.`,
              });
              return;
            }
            setState({ kind: "ok" });
            router.refresh();
            setTimeout(() => setState({ kind: "idle" }), 4000);
          })
          .catch(() =>
            setState({ kind: "err", text: "network error — nothing was saved." })
          );
      }}
      // Disable every control while in flight without cloning children.
      aria-busy={state.kind === "busy"}
    >
      {children}
      {state.kind === "ok" && (
        <p className="mt-2 text-sm font-semibold text-seafoam-500">
          ✓ {successText}
        </p>
      )}
      {state.kind === "err" && (
        <p className="mt-2 text-sm font-semibold text-red-600">
          Failed: {state.text}
        </p>
      )}
    </form>
  );
}
