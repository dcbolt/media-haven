/**
 * Real PostgREST + Postgres: orgs.settings version CAS (0024) + legacy fallback.
 * Requires SCREENSAVER_POSTGREST_URL (e.g. http://127.0.0.1:54321).
 *
 * POSTGREST_INTEGRATION_PHASE=fallback — DB without 0024 (legacy CAS only).
 * POSTGREST_INTEGRATION_PHASE=version — DB with 0024 applied (default in CI).
 */
import { spawnSync } from "node:child_process";
import { PostgrestClient } from "@supabase/postgrest-js";

const ORG = "11111111-1111-4111-8111-111111111111";
const BASE =
  process.env.SCREENSAVER_POSTGREST_URL?.replace(/\/$/, "") ||
  process.env.POSTGREST_INTEGRATION_URL?.replace(/\/$/, "");
const PHASE = process.env.POSTGREST_INTEGRATION_PHASE || "version";

const {
  HIDDEN_URLS_TOO_MANY_MESSAGE,
  estimateSettingsPatchQueryBytes,
  HIDDEN_URLS_PATCH_URL_SAFE_BYTES,
  SETTINGS_CONFLICT_MESSAGE,
  resetOrgSettingsVersionProbeForTests,
  patchOrgSettingsMutate,
} = await import("../lib/org-settings-cas.ts");
const { patchHiddenUrlsMutate: patchHidden } = await import(
  "../lib/screensaver-hidden-cas.ts"
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

async function hasVersionColumn(client) {
  const { error } = await client.from("orgs").select("version").limit(1);
  return !error;
}

async function resetProdLikeSettings(extra = {}) {
  const client = db();
  const settings = {
    bookBaseUrl: "https://www.thefloridahavens.com",
    brand: "florida-havens",
    ...extra,
  };
  delete settings.screensaverHiddenUrls;
  const { error } = await client.from("orgs").update({ settings }).eq("id", ORG);
  if (error) throw new Error(error.message);
  return settings;
}

async function readOrgRow() {
  const client = db();
  const cols = (await hasVersionColumn(client)) ? "settings,version" : "settings";
  const { data, error } = await client.from("orgs").select(cols).eq("id", ORG).single();
  if (error) throw new Error(error.message);
  return data;
}

async function recordScanCas(slug, client) {
  const day = new Date().toISOString().slice(0, 10);
  const key = `${slug}:${day}`;
  await patchOrgSettingsMutate(
    ORG,
    (prev) => {
      const scans =
        prev.qrScans && typeof prev.qrScans === "object"
          ? { ...prev.qrScans }
          : {};
      scans[key] = (Number(scans[key]) || 0) + 1;
      return { ...prev, qrScans: scans };
    },
    client
  );
}

async function deviceReloadCas(deviceId, client) {
  const at = new Date().toISOString();
  await patchOrgSettingsMutate(
    ORG,
    (prev) => {
      const map =
        prev.deviceReloads && typeof prev.deviceReloads === "object"
          ? { ...prev.deviceReloads }
          : {};
      map[deviceId] = { at };
      return { ...prev, deviceReloads: map };
    },
    client
  );
}

function execPg(sql) {
  const r = spawnSync(
    "docker",
    [
      "compose",
      "-f",
      "tests/postgrest/docker-compose.yml",
      "exec",
      "-T",
      "db",
      "psql",
      "-U",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      sql,
    ],
    { encoding: "utf8" }
  );
  if (r.status !== 0) {
    throw new Error(r.stderr?.trim() || r.stdout?.trim() || "psql failed");
  }
}

const client = db();
resetOrgSettingsVersionProbeForTests();
const ready = await waitReady(client);
check("postgrest ready", ready, ready ? "" : "orgs not reachable");
if (!ready) process.exit(1);

const versionCol = await hasVersionColumn(client);
if (PHASE === "fallback") {
  check("fallback phase: version column absent", !versionCol);
  if (versionCol) {
    console.log("FAIL  fallback phase requires DB without 0024 migration");
    process.exit(1);
  }
} else {
  check("version phase: migration 0024 column present", versionCol);
  if (!versionCol) {
    console.log("FAIL  version phase requires 0024 applied to CI database");
    process.exit(1);
  }
}

if (PHASE === "fallback") {
  await resetProdLikeSettings();
  const hugeQr = {};
  for (let i = 0; i < 520; i += 1) {
    hugeQr[`slug-${i}:2026-01-01`] = i;
  }
  await resetProdLikeSettings({ qrScans: hugeQr });
  const settings = (await readOrgRow()).settings;
  const bytes = estimateSettingsPatchQueryBytes(ORG, settings);
  check(
    "legacy: qrScans row exceeds URL guard threshold",
    bytes > HIDDEN_URLS_PATCH_URL_SAFE_BYTES
  );
  const blocked = await patchHidden(
    ORG,
    (c) => [...c, "https://lh3.googleusercontent.com/d/blocked=w3840"],
    client
  );
  check(
    "legacy: hide refused with clear message before gateway 414",
    !blocked.ok && blocked.error === HIDDEN_URLS_TOO_MANY_MESSAGE
  );
  await recordScanCas("after-block", client);
  const afterScan = (await readOrgRow()).settings;
  check(
    "legacy: recordScan works when hide guard blocks",
    Number(afterScan.qrScans?.[`after-block:${new Date().toISOString().slice(0, 10)}`]) >= 1
  );
  await resetProdLikeSettings({ brand: "florida-havens" });
  const legacyHideUrl = "https://lh3.googleusercontent.com/d/fallback-hide=w3840";
  const legacyHide = await patchHidden(
    ORG,
    (c) => (c.includes(legacyHideUrl) ? c : [...c, legacyHideUrl]),
    client
  );
  const afterLegacyHide = (await readOrgRow()).settings;
  check("legacy fallback hide succeeds without version column", legacyHide.ok);
  check(
    "legacy fallback persists hidden url via settings::text CAS path",
    afterLegacyHide?.screensaverHiddenUrls?.includes(legacyHideUrl)
  );
  process.exit(failed);
}

// --- version phase (0024 applied) ---
resetOrgSettingsVersionProbeForTests();

await resetProdLikeSettings();
const before = (await readOrgRow()).settings;
check(
  "prod-like row has no screensaverHiddenUrls key before first hide",
  before &&
    typeof before === "object" &&
    !Object.prototype.hasOwnProperty.call(before, "screensaverHiddenUrls")
);

const firstHideUrl = "https://lh3.googleusercontent.com/d/postgrest-first-hide=w3840";
const hide1 = await patchHidden(
  ORG,
  (c) => (c.includes(firstHideUrl) ? c : [...c, firstHideUrl]),
  client
);
check("first hide succeeds against real PostgREST", hide1.ok, hide1.ok ? "" : hide1.error);
const afterHide = (await readOrgRow()).settings;
check(
  "first hide persisted screensaverHiddenUrls",
  Array.isArray(afterHide.screensaverHiddenUrls) &&
    afterHide.screensaverHiddenUrls.includes(firstHideUrl)
);

let lostWrites = 0;
const deviceId = "22222222-2222-4222-8222-222222222222";
for (let i = 0; i < 42; i += 1) {
  await resetProdLikeSettings({
    qrScans: { [`seed-${i}:2026-01-01`]: i },
  });
  const url = `https://lh3.googleusercontent.com/d/iter-${i}=w3840`;
  const slug = `iter-scan-${i}`;

  const ops =
    i % 2 === 0
      ? [
          recordScanCas(slug, client),
          patchHidden(ORG, (c) => (c.includes(url) ? c : [...c, url]), client),
        ]
      : [
          deviceReloadCas(deviceId, client),
          patchHidden(ORG, (c) => (c.includes(url) ? c : [...c, url]), client),
        ];
  const results = await Promise.all(ops);
  const hideResult = results[1];
  if (!hideResult.ok) {
    lostWrites += 1;
    continue;
  }

  const row = await readOrgRow();
  const settings = row.settings;
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
  "42x interleaved hide + recordScan/reload — 0 lost writes",
  lostWrites === 0,
  `lost=${lostWrites}`
);

{
  const hugeQr = {};
  for (let i = 0; i < 1000; i += 1) {
    hugeQr[`slug-${i}:2026-01-01`] = i;
  }
  const hidden = Array.from(
    { length: 500 },
    (_, i) => `https://lh3.googleusercontent.com/d/huge-hidden-${i}=w3840`
  );
  await resetProdLikeSettings({ qrScans: hugeQr, screensaverHiddenUrls: hidden });
  const settings = (await readOrgRow()).settings;
  const bytes = estimateSettingsPatchQueryBytes(ORG, settings);
  check(
    "large row would exceed legacy URL guard (sanity)",
    bytes > HIDDEN_URLS_PATCH_URL_SAFE_BYTES
  );
  const addUrl = "https://lh3.googleusercontent.com/d/huge-add=w3840";
  const hideBig = await patchHidden(
    ORG,
    (c) => (c.includes(addUrl) ? c : [...c, addUrl]),
    client
  );
  check(
    "hide succeeds with 1000 qrScans + 500 hidden (version CAS URL)",
    hideBig.ok,
    hideBig.ok ? "" : hideBig.error
  );
  const removeUrl = hidden[0];
  const unhideBig = await patchHidden(
    ORG,
    (c) => c.filter((u) => u !== removeUrl),
    client
  );
  check("unhide succeeds on same large settings row", unhideBig.ok, unhideBig.ok ? "" : unhideBig.error);
}

{
  await resetProdLikeSettings();
  const rowBefore = await readOrgRow();
  const versionBefore = rowBefore.version ?? 0;
  const versionCasUrl = "https://lh3.googleusercontent.com/d/version-cas=w3840";
  const versionHide = await patchHidden(
    ORG,
    (c) => (c.includes(versionCasUrl) ? c : [...c, versionCasUrl]),
    client
  );
  const rowAfter = await readOrgRow();
  check("version CAS hide succeeds", versionHide.ok);
  check(
    "version column increments when settings change",
    (rowAfter.version ?? 0) > versionBefore
  );
  check(
    "version CAS persisted hidden url",
    rowAfter.settings?.screensaverHiddenUrls?.includes(versionCasUrl)
  );
}

{
  await resetProdLikeSettings();
  execPg(`update orgs set version = 0 where id = '${ORG}'`);
  let stopHammer = false;
  const hammer = (async () => {
    while (!stopHammer) {
      execPg(`update orgs set version = version + 1 where id = '${ORG}'`);
      await new Promise((r) => setTimeout(r, 5));
    }
  })();
  await new Promise((r) => setTimeout(r, 120));
  const forcedConflict = await patchHidden(
    ORG,
    (c) =>
      c.includes("https://lh3.googleusercontent.com/d/conflict=w3840")
        ? c
        : [...c, "https://lh3.googleusercontent.com/d/conflict=w3840"],
    client
  );
  stopHammer = true;
  await hammer;
  check(
    "stale version returns conflict after retries",
    !forcedConflict.ok && forcedConflict.error === SETTINGS_CONFLICT_MESSAGE
  );
}

{
  const DRIVE = "https://lh3.googleusercontent.com/d/postgrest-route=w3840";
  const hugeQr = {};
  for (let i = 0; i < 1000; i += 1) {
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
        patchHidden(
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
  check("rotation hide succeeds on large settings (not URL-guard 400)", r.status === 200);
}

process.exit(failed);
