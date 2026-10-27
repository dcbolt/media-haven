/**
 * F-2615 / F-2617 / F-2666 / F-2695 / F-2696 / F-2662 — hide/unhide subkey CAS.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const {
  canonicalHiddenUrlsJson,
  canonicalJsonbText,
  hiddenUrlsSubkeyCasFilter,
  patchHiddenUrlsMutate,
  estimateHiddenUrlsPatchQueryBytes,
  HIDDEN_URLS_PATCH_URL_SAFE_BYTES,
  HIDDEN_URLS_TOO_MANY_MESSAGE,
  HIDDEN_URLS_LIST_CAP_MESSAGE,
} = await import("../lib/screensaver-hidden-cas.ts");
const { MAX_SCREENSAVER_HIDDEN_URLS } = await import(
  "../lib/screensaver-rotation-utils.ts"
);
const { sanitizeScreensaverHiddenUrlList } = await import(
  "../lib/screensaver-rotation-utils.ts"
);

const SETTINGS_KEY = "screensaverHiddenUrls";
const MAX_WRITE_ATTEMPTS = 6;
const HIDDEN_CAS_COLUMN = "settings->screensaverHiddenUrls";

function casParamFromPatchUrl(url) {
  const u = new URL(url);
  return (
    u.searchParams.get(HIDDEN_CAS_COLUMN) ??
    u.searchParams.get("settings->screensaverHiddenUrls")
  );
}

function expectedCasParam(settings, list) {
  const cas = hiddenUrlsSubkeyCasFilter(settings, list);
  if (cas.operator === "is") return "is.null";
  return `eq.${cas.value}`;
}

/** Mutant: same retry loop but PATCH has no subkey CAS (must fail F-2617). */
async function patchHiddenUrlsMutateWithoutCas(orgId, mutate, db) {
  if (!db) return { ok: false, error: "no database" };
  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt += 1) {
    const { data: row, error: readErr } = await db
      .from("orgs")
      .select("settings")
      .eq("id", orgId)
      .maybeSingle();
    if (readErr) return { ok: false, error: readErr.message };
    if (!row) return { ok: false, error: "org missing" };
    const prev =
      row.settings && typeof row.settings === "object"
        ? row.settings
        : {};
    const currentList = sanitizeScreensaverHiddenUrlList(prev[SETTINGS_KEY]);
    const mutated = mutate(currentList);
    if (mutated.length > MAX_SCREENSAVER_HIDDEN_URLS) {
      return { ok: false, error: HIDDEN_URLS_LIST_CAP_MESSAGE };
    }
    const nextList = sanitizeScreensaverHiddenUrlList([...mutated].sort());
    if (
      nextList.length === currentList.length &&
      nextList.every((u, i) => u === currentList[i])
    ) {
      return { ok: true };
    }
    const nextSettings = { ...prev, [SETTINGS_KEY]: nextList };
    const { data: updated, error: writeErr } = await db
      .from("orgs")
      .update({ settings: nextSettings })
      .eq("id", orgId)
      .select("id");
    if (writeErr) return { ok: false, error: writeErr.message };
    if (updated && updated.length > 0) return { ok: true };
  }
  return { ok: false, error: "settings conflict — retry" };
}

function createConcurrentHideMockDb(initialSettings) {
  let settings = { ...initialSettings };
  const requests = [];
  const fetch = async (input, init) => {
    const url = String(input);
    requests.push({ url, method: init?.method ?? "GET", body: init?.body });
    if (init?.method === "GET" || !init?.method) {
      return new Response(JSON.stringify([{ settings }]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (init?.method === "PATCH") {
      const u = new URL(url);
      const casParam = casParamFromPatchUrl(url);
      const currentList = sanitizeScreensaverHiddenUrlList(
        settings[SETTINGS_KEY]
      );
      const expected = expectedCasParam(settings, currentList);
      if (casParam !== null && casParam !== expected) {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      const body = JSON.parse(String(init.body));
      settings = body.settings;
      return new Response(JSON.stringify([{ id: ORG }]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response("unexpected", { status: 500 });
  };
  const db = createClient("https://example.supabase.co", "service-role-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch },
  });
  return {
    db,
    requests,
    getSettings: () => settings,
  };
}

const ORG = "11111111-1111-4111-8111-111111111111";

let failed = 0;
function check(name, pass) {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
  if (!pass) failed = 1;
}

{
  const prev = { brand: "florida-havens", screensaverHiddenUrls: [] };
  const cas = hiddenUrlsSubkeyCasFilter(prev, []);
  const sb = createClient("https://example.supabase.co", "service-role-key", {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const chain = sb
    .from("orgs")
    .update({ settings: { ...prev, screensaverHiddenUrls: ["https://a"] } })
    .eq("id", ORG)
    .filter(cas.column, cas.operator, cas.value);
  const url = chain.url.toString();
  check(
    "F-2666 CAS uses settings->screensaverHiddenUrls not settings::text",
    url.includes("settings-%3EscreensaverHiddenUrls=") &&
      !url.includes("settings%3A%3Atext=") &&
      !url.includes("[object Object]")
  );
  check(
    "F-2662 CAS filter value is canonical sorted hidden JSON",
    url.includes(encodeURIComponent(canonicalHiddenUrlsJson([])))
  );
}

{
  const hugeQr = {};
  for (let i = 0; i < 400; i += 1) {
    hugeQr[`slug-${i}:2026-01-01`] = i;
  }
  const prev = {
    brand: "florida-havens",
    qrScans: hugeQr,
    screensaverHiddenUrls: [],
  };
  const hidden = ["https://lh3.googleusercontent.com/d/aaa=w3840"];
  const prevMoreQr = {
    ...prev,
    qrScans: { ...hugeQr, "extra:2026-01-02": 99 },
  };
  const casA = hiddenUrlsSubkeyCasFilter(prev, hidden);
  const casB = hiddenUrlsSubkeyCasFilter(prevMoreQr, hidden);
  const qA = estimateHiddenUrlsPatchQueryBytes(ORG, casA);
  const qB = estimateHiddenUrlsPatchQueryBytes(ORG, casB);
  check(
    "F-2695 large qrScans does not change CAS query size",
    qA === qB && qA < 512
  );
  check(
    "F-2695 whole-settings CAS would grow with qrScans (mutant guard)",
    canonicalJsonbText(prev).length > 8000
  );
}

{
  const initial = {
    bookBaseUrl: "https://www.thefloridahavens.com",
    brand: "florida-havens",
    screensaverHiddenUrls: [],
  };
  const { db, requests, getSettings } = createConcurrentHideMockDb(initial);

  const u1 = "https://lh3.googleusercontent.com/d/aaa=w3840";
  const u2 = "https://lh3.googleusercontent.com/d/bbb=w3840";

  const [r1, r2] = await Promise.all([
    patchHiddenUrlsMutate(
      ORG,
      (c) => (c.includes(u1) ? c : [...c, u1]),
      db
    ),
    patchHiddenUrlsMutate(
      ORG,
      (c) => (c.includes(u2) ? c : [...c, u2]),
      db
    ),
  ]);

  const settings = getSettings();
  check("F-2617 concurrent hide both succeed", r1.ok && r2.ok);
  check(
    "F-2617 both urls persisted",
    settings.screensaverHiddenUrls.includes(u1) &&
      settings.screensaverHiddenUrls.includes(u2)
  );
  check(
    "F-2666 PATCH requests use subkey CAS",
    requests.some(
      (r) =>
        r.method === "PATCH" &&
        r.url.includes("settings-%3EscreensaverHiddenUrls=")
    )
  );
}

{
  const initial = {
    bookBaseUrl: "https://www.thefloridahavens.com",
    brand: "florida-havens",
    screensaverHiddenUrls: [],
  };
  const { db, getSettings } = createConcurrentHideMockDb(initial);
  const u1 = "https://lh3.googleusercontent.com/d/aaa=w3840";
  const u2 = "https://lh3.googleusercontent.com/d/bbb=w3840";

  await Promise.all([
    patchHiddenUrlsMutateWithoutCas(
      ORG,
      (c) => (c.includes(u1) ? c : [...c, u1]),
      db
    ),
    patchHiddenUrlsMutateWithoutCas(
      ORG,
      (c) => (c.includes(u2) ? c : [...c, u2]),
      db
    ),
  ]);
  const settings = getSettings();
  const bothPersisted =
    settings.screensaverHiddenUrls.includes(u1) &&
    settings.screensaverHiddenUrls.includes(u2);
  check(
    "F-2615 mutant: without CAS concurrent persist fails (lost hide)",
    !bothPersisted
  );
}

{
  const longUrl = `https://lh3.googleusercontent.com/d/${"x".repeat(1900)}=w3840`;
  const list = Array.from(
    { length: MAX_SCREENSAVER_HIDDEN_URLS + 1 },
    (_, i) => `https://lh3.googleusercontent.com/d/${i}=w3840`
  );
  list.push(longUrl);
  const cas = hiddenUrlsSubkeyCasFilter({ screensaverHiddenUrls: list }, list);
  const bytes = estimateHiddenUrlsPatchQueryBytes(ORG, cas);
  check(
    "F-2696 size guard threshold is wired",
    HIDDEN_URLS_PATCH_URL_SAFE_BYTES === 12 * 1024
  );
  check(
    "F-2696 oversized hidden list blows CAS query past safe threshold",
    bytes > HIDDEN_URLS_PATCH_URL_SAFE_BYTES
  );

  const urls = Array.from({ length: 200 }, (_, i) =>
    `https://lh3.googleusercontent.com/d/${"a".repeat(80)}${i}=w3840`
  );
  let settings = { brand: "x", screensaverHiddenUrls: urls };
  const fetch = async (input, init) => {
    if (init?.method === "GET" || !init?.method) {
      return new Response(JSON.stringify([{ settings }]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify([]), { status: 200 });
  };
  const db = createClient("https://example.supabase.co", "key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch },
  });
  const r = await patchHiddenUrlsMutate(
    ORG,
    (c) => [...c, "https://lh3.googleusercontent.com/d/one-more=w3840"],
    db
  );
  check(
    "F-2696 patchHiddenUrlsMutate returns clear too-many message",
    !r.ok && r.error === HIDDEN_URLS_TOO_MANY_MESSAGE
  );
}

{
  const capList = Array.from({ length: MAX_SCREENSAVER_HIDDEN_URLS }, (_, i) =>
    `https://lh3.googleusercontent.com/d/cap${i}=w3840`
  );
  let settings = { brand: "x", screensaverHiddenUrls: capList };
  const fetch = async (input, init) => {
    if (init?.method === "GET" || !init?.method) {
      return new Response(JSON.stringify([{ settings }]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify([]), { status: 200 });
  };
  const db = createClient("https://example.supabase.co", "key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch },
  });
  const r = await patchHiddenUrlsMutate(
    ORG,
    (c) => [...c, "https://lh3.googleusercontent.com/d/new=w3840"],
    db
  );
  check(
    "F-2696 list cap returns clear message",
    !r.ok && r.error === HIDDEN_URLS_LIST_CAP_MESSAGE
  );
}

{
  const uiSrc = readFileSync(
    fileURLToPath(
      new URL("../app/host/media/media-rotation-list.tsx", import.meta.url)
    ),
    "utf8"
  );
  check(
    "F-2696 UI surfaces server error on hide/unhide failure",
    /data\.error/.test(uiSrc) &&
      /throw new Error\(msg\)/.test(uiSrc) &&
      /onError\(e instanceof Error \? e\.message/.test(uiSrc)
  );
}

process.exit(failed);
