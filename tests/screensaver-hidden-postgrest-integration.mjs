/**
 * Real PostgREST + Postgres checks for whole-settings CAS (auditor try 2).
 * Requires SCREENSAVER_POSTGREST_URL (e.g. http://127.0.0.1:54321).
 */
import { PostgrestClient } from "@supabase/postgrest-js";

const ORG = "11111111-1111-4111-8111-111111111111";
const BASE =
  process.env.SCREENSAVER_POSTGREST_URL?.replace(/\/$/, "") ||
  process.env.POSTGREST_INTEGRATION_URL?.replace(/\/$/, "");
const KEY =
  process.env.SCREENSAVER_POSTGREST_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  "integration-test-key";

const {
  patchHiddenUrlsMutate,
  settingsJsonbTextCasFilter,
  HIDDEN_URLS_TOO_MANY_MESSAGE,
  estimateSettingsPatchQueryBytes,
  HIDDEN_URLS_PATCH_URL_SAFE_BYTES,
} = await import("../lib/screensaver-hidden-cas.ts");
const { sanitizeScreensaverHiddenUrlList } = await import(
  "../lib/screensaver-rotation-utils.ts"
);
const { runHostMediaRotationRequest, hostMediaRotationSameOrigin, hostMediaRotationJsonContentType } =
  await import("../lib/host-media-rotation-request.ts");

let failed = 0;
function check(name, pass, detail = "") {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failed = 1;
}

if (!BASE) {
  console.log("SKIP  postgrest integration (SCREENSAVER_POSTGREST_URL unset)");
  process.exit(0);
}

function db() {
  /** Plain PostgREST in CI has no JWT secret; do not send Bearer auth. */
  return new PostgrestClient(BASE, {
    headers: { Prefer: "return=representation" },
  });
}

async function waitReady(client, attempts = 60) {
  let lastErr = "";
  for (let i = 0; i < attempts; i += 1) {
    const probe = await fetch(`${BASE}/orgs?select=id&limit=1`, {
      headers: { Accept: "application/json" },
    });
    if (probe.ok) return true;
    lastErr = `fetch ${probe.status}`;
    const { error } = await client.from("orgs").select("id").limit(1);
    if (!error) return true;
    lastErr = error.message || lastErr;
    await new Promise((r) => setTimeout(r, 500));
  }
  console.log(`postgrest probe last error: ${lastErr}`);
  return false;
}

async function resetProdLikeSettings(extra = {}) {
  const client = db();
  const settings = {
    bookBaseUrl: "https://www.thefloridahavens.com",
    brand: "florida-havens",
    ...extra,
  };
  delete settings.screensaverHiddenUrls;
  const { error } = await client
    .from("orgs")
    .update({ settings })
    .eq("id", ORG);
  if (error) throw new Error(error.message);
  return settings;
}

async function readSettings() {
  const client = db();
  const { data, error } = await client
    .from("orgs")
    .select("settings")
    .eq("id", ORG)
    .single();
  if (error) throw new Error(error.message);
  return data.settings;
}

/** Same pattern as lib/qr-track.ts recordScan (no CAS). */
async function recordScanLike(slug) {
  const client = db();
  const { data: row, error: readErr } = await client
    .from("orgs")
    .select("settings")
    .eq("id", ORG)
    .single();
  if (readErr) throw new Error(readErr.message);
  const prev =
    row.settings && typeof row.settings === "object" ? row.settings : {};
  const scans =
    prev.qrScans && typeof prev.qrScans === "object"
      ? { ...prev.qrScans }
      : {};
  const day = new Date().toISOString().slice(0, 10);
  const key = `${slug}:${day}`;
  scans[key] = (Number(scans[key]) || 0) + 1;
  const { error: writeErr } = await client
    .from("orgs")
    .update({ settings: { ...prev, qrScans: scans } })
    .eq("id", ORG);
  if (writeErr) throw new Error(writeErr.message);
  return scans;
}

/** Same pattern as lib/fleet-reload.ts requestDeviceReload (no CAS). */
async function deviceReloadLike(deviceId) {
  const client = db();
  const { data: row, error: readErr } = await client
    .from("orgs")
    .select("settings")
    .eq("id", ORG)
    .single();
  if (readErr) throw new Error(readErr.message);
  const prev =
    row.settings && typeof row.settings === "object" ? row.settings : {};
  const map =
    prev.deviceReloads && typeof prev.deviceReloads === "object"
      ? { ...prev.deviceReloads }
      : {};
  const at = new Date().toISOString();
  map[deviceId] = { at };
  const { error: writeErr } = await client
    .from("orgs")
    .update({ settings: { ...prev, deviceReloads: map } })
    .eq("id", ORG);
  if (writeErr) throw new Error(writeErr.message);
  return map;
}

const client = db();
const ready = await waitReady(client);
check("postgrest ready", ready, ready ? "" : "orgs not reachable");
if (!ready) process.exit(1);

await resetProdLikeSettings();
const before = await readSettings();
check(
  "prod-like row has no screensaverHiddenUrls key before first hide",
  before &&
    typeof before === "object" &&
    !Object.prototype.hasOwnProperty.call(before, "screensaverHiddenUrls")
);

const firstHideUrl = "https://lh3.googleusercontent.com/d/postgrest-first-hide=w3840";
const hide1 = await patchHiddenUrlsMutate(
  ORG,
  (c) => (c.includes(firstHideUrl) ? c : [...c, firstHideUrl]),
  client
);
check("first hide (absent key) succeeds against real PostgREST", hide1.ok, hide1.ok ? "" : hide1.error);
const afterHide = await readSettings();
check(
  "first hide persisted screensaverHiddenUrls via PostgREST CAS",
  Array.isArray(afterHide.screensaverHiddenUrls) &&
    afterHide.screensaverHiddenUrls.includes(firstHideUrl)
);

let lostWrites = 0;
const deviceId = "22222222-2222-4222-8222-222222222222";
for (let i = 0; i < 40; i += 1) {
  await resetProdLikeSettings({
    qrScans: { [`seed-${i}:2026-01-01`]: i },
  });
  const url = `https://lh3.googleusercontent.com/d/iter-${i}=w3840`;
  const slug = `iter-scan-${i}`;

  const { data: rowAtRead, error: readErr } = await client
    .from("orgs")
    .select("settings")
    .eq("id", ORG)
    .single();
  if (readErr) {
    lostWrites += 1;
    continue;
  }
  const settingsAsRead = rowAtRead.settings;
  const prev =
    settingsAsRead && typeof settingsAsRead === "object"
      ? { ...settingsAsRead }
      : {};
  const currentList = sanitizeScreensaverHiddenUrlList(
    prev.screensaverHiddenUrls
  );
  const nextList = sanitizeScreensaverHiddenUrlList([...currentList, url]);
  const nextSettings = { ...prev, screensaverHiddenUrls: nextList };
  const cas = settingsJsonbTextCasFilter(settingsAsRead);

  if (i % 2 === 0) {
    await recordScanLike(slug);
  } else {
    await deviceReloadLike(deviceId);
  }

  const { data: stalePatch } = await client
    .from("orgs")
    .update({ settings: nextSettings })
    .eq("id", ORG)
    .filter(cas.column, cas.operator, cas.value)
    .select("id");
  if (stalePatch?.length) {
    lostWrites += 1;
    continue;
  }

  const hideResult = await patchHiddenUrlsMutate(
    ORG,
    (c) => (c.includes(url) ? c : [...c, url]),
    client
  );
  if (!hideResult.ok) {
    lostWrites += 1;
    continue;
  }

  const settings = await readSettings();
  const day = new Date().toISOString().slice(0, 10);
  const hasHide = settings.screensaverHiddenUrls?.includes(url);
  const hasSeed = settings.qrScans?.[`seed-${i}:2026-01-01`] === i;
  const hasScan =
    i % 2 === 0 ? Number(settings.qrScans?.[`${slug}:${day}`]) >= 1 : true;
  const hasReload =
    i % 2 === 1
      ? typeof settings.deviceReloads?.[deviceId]?.at === "string"
      : true;
  if (!hasHide || !hasSeed || !hasScan || !hasReload) {
    lostWrites += 1;
  }
}
check(
  "40x interleaved recordScan/deviceReload between read and PATCH — 0 lost writes",
  lostWrites === 0,
  `lost=${lostWrites}`
);

{
  const hugeQr = {};
  for (let i = 0; i < 520; i += 1) {
    hugeQr[`slug-${i}:2026-01-01`] = i;
  }
  await resetProdLikeSettings({ qrScans: hugeQr });
  const settings = await readSettings();
  const bytes = estimateSettingsPatchQueryBytes(ORG, settings);
  check(
    "qrScans-only row exceeds URL guard threshold (sanity)",
    bytes > HIDDEN_URLS_PATCH_URL_SAFE_BYTES
  );
  const blocked = await patchHiddenUrlsMutate(
    ORG,
    (c) => [...c, "https://lh3.googleusercontent.com/d/blocked=w3840"],
    client
  );
  check(
    "hide refused with clear JSON-side error before PostgREST (no 414)",
    !blocked.ok && blocked.error === HIDDEN_URLS_TOO_MANY_MESSAGE
  );
  const scanAfterBlock = await recordScanLike("after-block");
  check(
    "recordScan still works when hide guard blocks (unrelated write)",
    Number(scanAfterBlock[`after-block:${new Date().toISOString().slice(0, 10)}`]) >= 1
  );
  await client
    .from("orgs")
    .update({
      settings: {
        ...settings,
        screensaverHiddenUrls: [
          "https://lh3.googleusercontent.com/d/a=w3840",
          "https://lh3.googleusercontent.com/d/b=w3840",
        ],
      },
    })
    .eq("id", ORG);
  const unhide = await patchHiddenUrlsMutate(
    ORG,
    (c) => c.filter((u) => u !== "https://lh3.googleusercontent.com/d/a=w3840"),
    client
  );
  check("unhide succeeds when qrScans pushes URL over guard threshold", unhide.ok, unhide.ok ? "" : unhide.error);
}

{
  const DRIVE = "https://lh3.googleusercontent.com/d/postgrest-route=w3840";
  const hugeQr = {};
  for (let i = 0; i < 520; i += 1) {
    hugeQr[`route-${i}:2026-01-01`] = i;
  }
  await resetProdLikeSettings({ qrScans: hugeQr });
  const r = await runHostMediaRotationRequest(
    {
      headers: {
        get(k) {
          const m = {
            host: "media-haven.example",
            "sec-fetch-site": "same-origin",
            "content-type": "application/json",
          };
          return m[k.toLowerCase()] ?? null;
        },
      },
    },
    { action: "hide", url: DRIVE, confirmed: true },
    {
      isAuthenticated: async () => true,
      hostIdentity: async () => "test@example.com",
      orgId: ORG,
      clientIp: () => "127.0.0.1",
      listingContains: async () => true,
      listInventory: async () => [],
      hideUrl: () =>
        patchHiddenUrlsMutate(
          ORG,
          (c) => (c.includes(DRIVE) ? c : [...c, DRIVE]),
          client
        ),
      unhideUrl: async () => ({ ok: true }),
      deleteUpload: async () => ({ ok: false, error: "n/a" }),
      invalidateBlobCache: () => {},
      sameOrigin: hostMediaRotationSameOrigin,
      jsonContentType: hostMediaRotationJsonContentType,
    }
  );
  check(
    "rotation route returns 400 JSON for guarded hide",
    r.status === 400 && r.body.error === HIDDEN_URLS_TOO_MANY_MESSAGE
  );
}

process.exit(failed);
