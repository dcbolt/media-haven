import { NextRequest, NextResponse } from "next/server";
import { isHostAuthenticated } from "@/lib/host-auth";

/**
 * S5.3 content health — a black slide kills the luxury feel, so the editor
 * can ask the server to probe every media URL in the pool and badge the
 * unreachable ones before a guest ever sees them.
 *
 * Server-side on purpose: the browser can't HEAD cross-origin hosts
 * (Drive/Blob CORS), and the TV's fetch path is closer to this one anyway.
 *
 * G3: probes use browser-shaped Sec-Fetch-* headers so hosts see BROKEN on
 * URLs that pass bare curl but fail on real TVs (Drive cross-site video 403).
 */

const MAX_URLS = 60;
const PROBE_TIMEOUT_MS = 6000;
const CONCURRENCY = 6;

const CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

type ProbeFlag = "sec-fetch-blocked";

type ProbeResult = {
  url: string;
  ok: boolean;
  status: number | null;
  flag?: ProbeFlag;
};

/** Only probe public https media hosts — never internal targets. */
function probeAllowed(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return false;
    const h = u.hostname;
    if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal"))
      return false;
    // Raw IPs (v4/v6) are out — media lives on named CDNs.
    if (/^[\d.]+$/.test(h) || h.includes(":")) return false;
    return true;
  } catch {
    return false;
  }
}

function looksLikeVideo(url: string): boolean {
  try {
    const path = new URL(url).pathname.toLowerCase();
    if (/\.(mp4|webm|mov|m4v|mkv)(\?|$)/.test(path)) return true;
    // Extension-less Drive paths often only hint via query. Treat Drive
    // download endpoints as video when export=download or confirm=t
    // (the failure mode G3 targets).
    if (
      /drive\.(google|usercontent)\.com/i.test(new URL(url).hostname) &&
      (/export=download/i.test(url) || /confirm=t/i.test(url))
    ) {
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

function browserHeaders(url: string, method: "HEAD" | "GET"): HeadersInit {
  const dest = looksLikeVideo(url) ? "video" : "image";
  const headers: Record<string, string> = {
    "user-agent": CHROME_UA,
    "sec-fetch-dest": dest,
    "sec-fetch-mode": "no-cors",
    "sec-fetch-site": "cross-site",
    accept: dest === "video" ? "video/*,*/*;q=0.8" : "image/*,*/*;q=0.8",
  };
  if (method === "GET") headers.range = "bytes=0-0";
  return headers;
}

async function probe(url: string): Promise<ProbeResult> {
  // HEAD first; some CDNs (Drive download links) reject HEAD, so fall back
  // to a 1-byte ranged GET before calling a URL dead.
  let lastStatus: number | null = null;
  for (const method of ["HEAD", "GET"] as const) {
    try {
      const res = await fetch(url, {
        method,
        redirect: "follow",
        headers: browserHeaders(url, method),
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      });
      lastStatus = res.status;
      if (res.ok || res.status === 206) {
        return { url, ok: true, status: res.status };
      }
      if (method === "GET") {
        // Google Drive (and similar) 403s cross-site media with Sec-Fetch-Dest
        // video/image while bare curl still returns 200 — flag distinctly so
        // hosts know "works in curl, dies on TV".
        const flag: ProbeFlag | undefined =
          res.status === 403 || res.status === 401
            ? "sec-fetch-blocked"
            : undefined;
        return { url, ok: false, status: res.status, flag };
      }
    } catch {
      if (method === "GET") return { url, ok: false, status: lastStatus };
    }
  }
  return { url, ok: false, status: null };
}

export async function POST(req: NextRequest) {
  if (!(await isHostAuthenticated())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as { urls?: unknown };
  const urls = [
    ...new Set(
      (Array.isArray(body.urls) ? body.urls : [])
        .filter((u): u is string => typeof u === "string")
        .slice(0, MAX_URLS)
    ),
  ];
  if (urls.length === 0) {
    return NextResponse.json({ error: "urls required" }, { status: 400 });
  }

  const results: ProbeResult[] = [];
  const queue = [...urls];
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      for (let u = queue.shift(); u !== undefined; u = queue.shift()) {
        results.push(
          probeAllowed(u)
            ? await probe(u)
            : { url: u, ok: false, status: null }
        );
      }
    })
  );

  const broken = results
    .filter((r) => !r.ok)
    .map((r) => ({
      url: r.url,
      status: r.status,
      ...(r.flag ? { flag: r.flag } : {}),
    }));

  return NextResponse.json({
    ok: true,
    checked: results.length,
    broken,
    // Distinct list for hosts/UI that want a dedicated badge for the
    // curl-green / TV-black class of failure (G3 / Drive lesson).
    secFetchBlocked: broken
      .filter((b) => b.flag === "sec-fetch-blocked")
      .map((b) => b.url),
  });
}
