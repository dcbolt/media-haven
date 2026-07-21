"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Drop-in replacement for `<form action={serverAction}>` across the host
 * CMS. Posts FormData (plus an `op` discriminator) to a deploy-proof API
 * route and shows the outcome inline. Server actions are deployment-bound
 * and a host's long-lived tab silently dropped every submit after deploys
 * (signage publish incident 2026-07-20; property editor #73).
 *
 * On success: optional JSON `redirect` → full navigation (mint token QR
 * banner); otherwise router.refresh() so server data re-seeds.
 */
export default function ApiForm({
  op,
  endpoint,
  className,
  confirmText,
  successText = "Saved",
  children,
}: {
  op: string;
  /** Default: property editor route. Dashboard/TVs pass their own. */
  endpoint?: string;
  className?: string;
  confirmText?: string;
  successText?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const url = endpoint ?? "/api/host/property";
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
        fetch(url, { method: "POST", body: fd })
          .then(async (res) => {
            const data = (await res.json().catch(() => ({}))) as {
              error?: string;
              redirect?: string;
            };
            if (!res.ok) {
              setState({
                kind: "err",
                text: `${data.error ?? res.status} — nothing was saved.`,
              });
              return;
            }
            if (data.redirect) {
              window.location.href = data.redirect;
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
