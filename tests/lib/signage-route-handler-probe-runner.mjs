import { fileURLToPath } from "node:url";

const propertyId =
  process.env.SIGNAGE_PROBE_PROPERTY ??
  "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const propertyId2 = "bbbbbbbb-bbbb-4ccc-8ddd-bbbbbbbbbbbb";
const base =
  process.env.SIGNAGE_PROBE_BASE ??
  "https://woleywnwgjfcvowqyyix.supabase.co/storage/v1/object/public/screensavers/shared";
const restoreAt = "2026-01-15T12:00:00.000Z";

process.env.NEXT_PUBLIC_SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://woleywnwgjfcvowqyyix.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "smoke-service-role-key";
process.env.SIGNAGE_PROBE_HUGE = process.env.SIGNAGE_PROBE_HUGE ?? "157286442";

const mixedPlaylist = {
  items: [
    { key: "media-ok", url: `${base}/ok.mp4`, mediaType: "video" },
    { key: "media-big", url: `${base}/big.mp4`, mediaType: "video" },
    { key: "welcome", seconds: 12 },
  ],
  photos: true,
};

function resetCapture() {
  globalThis.__signageCapturedSettings = null;
  globalThis.__signageCapturedBulk = [];
}

async function runPost(body, settingsSeed = {}) {
  resetCapture();
  globalThis.__signageProbeSettings = settingsSeed;
  globalThis.__signageProbeBulkRows = [
    { id: propertyId, settings: {} },
    { id: propertyId2, settings: {} },
  ];
  const { POST } = await import(
    fileURLToPath(new URL("../../app/api/host/signage/route.ts", import.meta.url))
  );
  const req = { json: async () => body };
  const res = await POST(req);
  const json = await res.json();
  return {
    ok: res.ok,
    json,
    settings: globalThis.__signageCapturedSettings,
    bulk: [...(globalThis.__signageCapturedBulk ?? [])],
  };
}

const results = [];

try {
  const publish = await runPost({
    propertyId,
    playlist: mixedPlaylist,
  });
  results.push({
    scenario: "publish",
    ok: publish.ok,
    droppedOversized: publish.json.droppedOversized,
    savedPlaylist: publish.settings?.playlist ?? null,
    historyHead: publish.settings?.playlistHistory?.[0]?.playlist ?? null,
  });

  const restore = await runPost(
    { propertyId, restoreAt },
    { playlistHistory: [{ at: restoreAt, playlist: mixedPlaylist }] }
  );
  results.push({
    scenario: "restore",
    ok: restore.ok,
    droppedOversized: restore.json.droppedOversized,
    savedPlaylist: restore.settings?.playlist ?? null,
    historyHead: restore.settings?.playlistHistory?.[0]?.playlist ?? null,
  });

  const bulk = await runPost({
    propertyId,
    playlist: mixedPlaylist,
    allProperties: true,
  });
  results.push({
    scenario: "bulk",
    ok: bulk.ok,
    droppedOversized: bulk.json.droppedOversized,
    applied: bulk.json.applied,
    bulkSnapshots: bulk.bulk,
  });

  console.log(JSON.stringify({ ok: true, results }));
  process.exit(0);
} catch (e) {
  console.log(JSON.stringify({ ok: false, error: String(e), results }));
  process.exit(1);
}
