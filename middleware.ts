import { NextResponse, type NextRequest } from "next/server";
import {
  TV_DOC_LOAD_COOKIE,
  TV_DOC_LOAD_HEADER,
  tvHarnessLoadCounterEnabled,
} from "./lib/tv-harness-middleware";

/**
 * Hostname-aware root routing (host request 2026-08-10).
 *
 * Each Stay OS subdomain should be a usable endpoint on its own, so a device
 * configured with a bare hostname lands where it belongs instead of on the
 * generic landing page:
 *
 *   tv.thefloridahavens.com/     → /tv     (Shield / signage panel start URL)
 *   host.thefloridahavens.com/   → /host   (host dashboard)
 *   media.thefloridahavens.com/  → /host   (admin — same backend today)
 *
 * Deliberately narrow, because this sits in front of every request:
 *
 * - **Only the exact root path `/` is touched.** Every other path resolves
 *   normally on every hostname, so `/tv`, `/welcome`, `/host/...` and all of
 *   `/api` keep working everywhere. That also keeps the fleet thumbnails on
 *   `/host/tvs` same-origin — they iframe a *relative* `/tv?property=`, which
 *   would break under `X-Frame-Options: SAMEORIGIN` if this rewrote across
 *   hosts.
 * - **The query string is carried over**, so a panel can be configured as
 *   `tv.thefloridahavens.com/?class=signage&device=<uuid>` and still reach
 *   `/tv` with both params intact.
 * - **Rewrite, not redirect.** The device stays on the hostname it was given;
 *   no extra round trip on a TV browser, and the origin never changes (device
 *   identity lives in per-origin `localStorage`).
 * - Unknown hosts — `*.vercel.app`, previews, `localhost` — fall through
 *   untouched, so the landing page and every existing URL are unaffected.
 *
 * Matching is on the leftmost label of a `thefloridahavens.com` host only. We
 * do not guess for other domains.
 */

const ROOT_FOR_SUBDOMAIN: Record<string, string> = {
  tv: "/tv",
  host: "/host",
  media: "/host",
};

const BRAND_SUFFIX = ".thefloridahavens.com";

function isTvDocumentRequest(req: NextRequest): boolean {
  if (req.headers.get("rsc") === "1") return false;
  const dest = req.headers.get("sec-fetch-dest");
  if (dest === "document") return true;
  if (dest && dest !== "empty") return false;
  const accept = req.headers.get("accept") ?? "";
  if (accept.includes("text/x-component")) return false;
  return accept.includes("text/html");
}

function tvDocumentLoadCounter(req: NextRequest): NextResponse {
  const reset = req.nextUrl.searchParams.get("__tv_load_reset") === "1";
  let count = 0;
  if (reset) {
    count = 0;
  } else {
    const raw = req.cookies.get(TV_DOC_LOAD_COOKIE)?.value;
    count = raw ? parseInt(raw, 10) || 0 : 0;
    if (isTvDocumentRequest(req)) count += 1;
  }

  const res = NextResponse.next();
  res.cookies.set(TV_DOC_LOAD_COOKIE, String(count), {
    path: "/",
    sameSite: "lax",
  });
  res.headers.set(TV_DOC_LOAD_HEADER, String(count));
  return res;
}

export function middleware(req: NextRequest) {
  if (
    req.nextUrl.pathname === "/tv" &&
    tvHarnessLoadCounterEnabled()
  ) {
    return tvDocumentLoadCounter(req);
  }

  if (req.nextUrl.pathname !== "/") return NextResponse.next();

  // Host header can carry a port; strip it before matching.
  const host = req.headers.get("host")?.toLowerCase().split(":")[0] ?? "";
  if (!host.endsWith(BRAND_SUFFIX)) return NextResponse.next();

  const label = host.slice(0, -BRAND_SUFFIX.length);
  const target = ROOT_FOR_SUBDOMAIN[label];
  if (!target) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = target; // search is preserved on the cloned URL
  return NextResponse.rewrite(url);
}

/** Root hostname rewrite; /tv load counter only when harness enabled (F-970). */
export const config = {
  matcher: ["/", "/tv"],
};
