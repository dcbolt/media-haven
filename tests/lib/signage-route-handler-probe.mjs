/**
 * F-1038 / F-1041 — real signage POST handler scenarios (publish, restore, bulk).
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

const EXPECTED_DROP = [{ key: "media-big", name: "big.mp4" }];

function playlistKeys(playlist) {
  return (playlist?.items ?? []).map((it) => it.key);
}

function assertFilteredPlaylist(errors, label, playlist) {
  const keys = playlistKeys(playlist);
  if (keys.includes("media-big")) {
    errors.push(`${label}: saved playlist must not include media-big`);
  }
  if (!keys.includes("media-ok") || !keys.includes("welcome")) {
    errors.push(`${label}: saved playlist missing expected blocks (${keys.join(",")})`);
  }
}

function assertDropped(errors, label, dropped) {
  if (JSON.stringify(dropped) !== JSON.stringify(EXPECTED_DROP)) {
    errors.push(
      `${label}: droppedOversized must be ${JSON.stringify(EXPECTED_DROP)}; got ${JSON.stringify(dropped)}`
    );
  }
}

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

  const byScenario = Object.fromEntries(
    (payload.results ?? []).map((row) => [row.scenario, row])
  );

  const publish = byScenario.publish;
  if (!publish?.ok) {
    errors.push("publish scenario failed");
  } else {
    assertDropped(errors, "publish", publish.droppedOversized);
    assertFilteredPlaylist(errors, "publish playlist", publish.savedPlaylist);
    assertFilteredPlaylist(errors, "publish history head", publish.historyHead);
  }

  const restore = byScenario.restore;
  if (!restore?.ok) {
    errors.push("restore scenario failed");
  } else {
    assertDropped(errors, "restore", restore.droppedOversized);
    assertFilteredPlaylist(errors, "restore playlist", restore.savedPlaylist);
    assertFilteredPlaylist(errors, "restore history head", restore.historyHead);
  }

  const bulk = byScenario.bulk;
  if (!bulk?.ok) {
    errors.push("bulk scenario failed");
  } else {
    assertDropped(errors, "bulk", bulk.droppedOversized);
    if ((bulk.applied ?? 0) < 2) {
      errors.push("bulk apply must update at least 2 properties");
    }
    for (const [i, snap] of (bulk.bulkSnapshots ?? []).entries()) {
      assertFilteredPlaylist(errors, `bulk snapshot ${i}`, snap.playlist);
      const head = snap.playlistHistory?.[0]?.playlist;
      assertFilteredPlaylist(errors, `bulk history ${i}`, head);
    }
  }

  return { ok: errors.length === 0, errors };
}
