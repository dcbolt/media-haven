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
    | { kind: "idle" }
    | { kind: "busy" }
    | { kind: "ok"; pickupHint?: string; pickupToken?: string }
    | { kind: "err"; text: string }
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
              statePickupToken?: string;
              statePickupExpiresAt?: string;
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
            const pickupHint =
              data.statePickupToken && data.statePickupExpiresAt
                ? `TV pickup ready (expires ${new Date(data.statePickupExpiresAt).toLocaleTimeString()}). Fully start URL: append ?pickup= then the one-time code from this response (host session only — do not paste in tickets).`
                : undefined;
            setState({
              kind: "ok",
              pickupHint,
              pickupToken: data.statePickupToken,
            });
            router.refresh();
            setTimeout(() => setState({ kind: "idle" }), 12_000);
          })
          .catch(() =>
            setState({ kind: "err", text: "network error — nothing was saved." })
          );
      }}
      aria-busy={state.kind === "busy"}
    >
      {children}
      {state.kind === "ok" && (
        <>
          <p className="mt-2 text-sm font-semibold text-seafoam-500">
            ✓ {successText}
          </p>
          {state.pickupHint ? (
            <p className="mt-1 text-xs text-ocean-900/70">{state.pickupHint}</p>
          ) : null}
          {state.pickupToken ? (
            <label className="mt-2 block text-xs text-ocean-900/70">
              Pickup code (single use)
              <input
                readOnly
                value={state.pickupToken}
                className="mt-1 w-full rounded-lg border border-sand-300 bg-sand-50 p-2 font-mono text-xs text-ocean-900"
                onFocus={(e) => e.currentTarget.select()}
              />
            </label>
          ) : null}
        </>
      )}
      {state.kind === "err" && (
        <p className="mt-2 text-sm font-semibold text-red-600">
          Failed: {state.text}
        </p>
      )}
    </form>
  );
}
