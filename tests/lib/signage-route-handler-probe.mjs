/**
 * F-1038 — run real signage POST handler; assert saved playlist + response JSON.
 */
process.env.NEXT_PUBLIC_SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://woleywnwgjfcvowqyyix.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "smoke-service-role-key";

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { MAX_TV_VIDEO_BYTES } from "../../lib/tv-video-byte-cap.ts";

const PROPERTY_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const HOST = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname;
const base = `https://${HOST}/storage/v1/object/public/screensavers/shared`;

const runner = fileURLToPath(
  new URL("./signage-route-handler-probe-runner.mjs", import.meta.url)
);
const registerHooks = fileURLToPath(
  new URL("./signage-route-handler-register.mjs", import.meta.url)
);

/** @returns {{ ok: boolean, errors: string[] }} */
export async function runSignageRouteHandlerProbe() {
  const errors = [];
  const r = spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      "--no-warnings",
      "--import",
      registerHooks,
      runner,
    ],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        SIGNAGE_PROBE_HUGE: String(MAX_TV_VIDEO_BYTES + 42),
        SIGNAGE_PROBE_PROPERTY: PROPERTY_ID,
        SIGNAGE_PROBE_BASE: base,
      },
    }
  );

  let payload = null;
  try {
    payload = JSON.parse((r.stdout || "").trim().split("\n").pop() || "{}");
  } catch {
    errors.push(
      `handler probe subprocess failed: ${(r.stderr || r.stdout || "").slice(0, 200)}`
    );
    return { ok: false, errors };
  }

  if (r.status !== 0 || !payload.ok) {
    errors.push(payload.error ?? `probe exit ${r.status}`);
    return { ok: false, errors };
  }

  if (
    !Array.isArray(payload.droppedOversized) ||
    payload.droppedOversized.length !== 1 ||
    payload.droppedOversized[0].key !== "media-big"
  ) {
    errors.push(
      `response droppedOversized must list media-big; got ${JSON.stringify(payload.droppedOversized)}`
    );
  }

  const saved = payload.savedPlaylist;
  if (!saved?.items) {
    errors.push("saved playlist missing from DB update");
  } else {
    const keys = saved.items.map((it) => it.key);
    if (keys.includes("media-big")) {
      errors.push("saved playlist must not include oversized media-big");
    }
    if (!keys.includes("media-ok") || !keys.includes("welcome")) {
      errors.push(`saved playlist missing expected blocks: ${keys.join(",")}`);
    }
  }

  return { ok: errors.length === 0, errors };
}
