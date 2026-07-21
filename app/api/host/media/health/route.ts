import { NextRequest, NextResponse } from "next/server";
import { isHostAuthenticated } from "@/lib/host-auth";

/**
 * S5.3 content health — a black slide kills the luxury feel, so the editor
 * can ask the server to probe every media URL in the pool and badge the
 * unreachable ones before a guest ever sees them.
 *
 * Server-side on purpose: the browser can't HEAD cross-origin hosts
 * (Drive/Blob CORS), and the TV's fetch path is closer to this one anyway.
 */

const MAX_URLS = 60;
const PROBE_TIMEOUT_MS = 6000;
const CONCURRENCY = 6;

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

async function probe(url: string): Promise<{ url: string; ok: boolean; status: number | null }> {
  // HEAD first; some CDNs (Drive download links) reject HEAD, so fall back
  // to a 1-byte ranged GET before calling a URL dead.
  for (const method of ["HEAD", "GET"] as const) {
    try {
      const res = await fetch(url, {
        method,
        redirect: "follow",
        ...(method === "GET" ? { headers: { range: "bytes=0-0" } } : null),
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      });
      if (res.ok || res.status === 206) return { url, ok: true, status: res.status };
      if (method === "GET") return { url, ok: false, status: res.status };
    } catch {
      if (method === "GET") return { url, ok: false, status: null };
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

  const results: { url: string; ok: boolean; status: number | null }[] = [];
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

  return NextResponse.json({
    ok: true,
    checked: results.length,
    broken: results.filter((r) => !r.ok).map((r) => ({ url: r.url, status: r.status })),
  });
}
