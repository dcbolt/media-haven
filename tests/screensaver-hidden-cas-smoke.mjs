/**
 * F-2615 / F-2617 — hide/unhide CAS + concurrent hide persistence.
 */
import { createClient } from "@supabase/supabase-js";

const {
  canonicalJsonbText,
  settingsJsonbTextCasFilter,
  patchHiddenUrlsMutate,
} = await import("../lib/screensaver-hidden-cas.ts");
const { sanitizeScreensaverHiddenUrlList } = await import(
  "../lib/screensaver-rotation-utils.ts"
);

const SETTINGS_KEY = "screensaverHiddenUrls";
const MAX_WRITE_ATTEMPTS = 6;

/** Mutant: same retry loop but PATCH has no settings::text CAS (must fail F-2617). */
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
    const nextList = sanitizeScreensaverHiddenUrlList(mutate(currentList));
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
      const casParam = u.searchParams.get("settings::text");
      const expectedCas = `eq.${canonicalJsonbText(settings)}`;
      if (casParam !== null && casParam !== expectedCas) {
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
  const cas = settingsJsonbTextCasFilter(prev);
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
    "F-2615 CAS uses settings::text not object eq",
    url.includes("settings%3A%3Atext=eq.") &&
      !url.includes("[object Object]") &&
      !url.includes("settings=eq.%5Bobject")
  );
  check(
    "F-2615 CAS filter value is canonical json text",
    url.includes(encodeURIComponent(canonicalJsonbText(prev)).replace(/'/g, "%27"))
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
    "F-2615 PATCH requests use settings::text CAS",
    requests.some(
      (r) =>
        r.method === "PATCH" &&
        r.url.includes("settings%3A%3Atext=eq.")
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

process.exit(failed);
