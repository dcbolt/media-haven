/**
 * F-2615 / F-2617 / F-2666 / F-2695 / F-2741–F-2748 — hide/unhide whole-settings CAS.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const {
  canonicalJsonbText,
  settingsJsonbTextCasFilter,
  patchHiddenUrlsMutate,
  estimateSettingsPatchQueryBytes,
  HIDDEN_URLS_PATCH_URL_SAFE_BYTES,
  HIDDEN_URLS_TOO_MANY_MESSAGE,
} = await import("../lib/screensaver-hidden-cas.ts");
const { sanitizeScreensaverHiddenUrlList } = await import(
  "../lib/screensaver-rotation-utils.ts"
);

const SETTINGS_KEY = "screensaverHiddenUrls";
const MAX_WRITE_ATTEMPTS = 6;
const ORG = "11111111-1111-4111-8111-111111111111";

let failed = 0;
function check(name, pass) {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
  if (!pass) failed = 1;
}

function expectedSettingsCasParam(settings) {
  return `eq.${canonicalJsonbText(settings)}`;
}

function createFullSettingsCasMockDb(initialSettings, hooks = {}) {
  let settings = structuredClone(initialSettings);
  const requests = [];
  const fetch = async (input, init) => {
    const url = String(input);
    requests.push({ url, method: init?.method ?? "GET", body: init?.body });
    if (init?.method === "GET" || !init?.method) {
      if (hooks.beforeRead) hooks.beforeRead(settings);
      return new Response(JSON.stringify([{ settings }]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (init?.method === "PATCH") {
      if (hooks.beforePatchAccept) {
        settings = hooks.beforePatchAccept(settings) ?? settings;
      }
      const u = new URL(url);
      const casParam = u.searchParams.get("settings::text");
      const expected = expectedSettingsCasParam(settings);
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
  return { db, requests, getSettings: () => settings };
}

/** Mutant: PATCH without settings::text CAS (lost concurrent writes). */
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
      row.settings && typeof row.settings === "object" ? row.settings : {};
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
    "F-2741 CAS uses settings::text not object eq",
    url.includes("settings%3A%3Atext=eq.") &&
      !url.includes("[object Object]") &&
      !url.includes("settings=eq.%5Bobject")
  );
}

{
  const absentKey = { brand: "florida-havens", qrScans: {} };
  const casAbsent = settingsJsonbTextCasFilter(absentKey);
  check(
    "F-2743 absent screensaverHiddenUrls uses whole settings as read",
    casAbsent.value === canonicalJsonbText(absentKey) &&
      !casAbsent.value.includes("screensaverHiddenUrls")
  );
  const nullHidden = { brand: "x", screensaverHiddenUrls: null };
  check(
    "F-2743 null hidden key preserved in CAS text",
    settingsJsonbTextCasFilter(nullHidden).value.includes('"screensaverHiddenUrls":null')
  );
}

{
  const hugeQr = {};
  for (let i = 0; i < 400; i += 1) {
    hugeQr[`slug-${i}:2026-01-01`] = i;
  }
  const prev = { brand: "florida-havens", qrScans: hugeQr };
  const prevMoreQr = {
    brand: "florida-havens",
    qrScans: { ...hugeQr, "extra:2026-01-02": 99 },
  };
  const qA = estimateSettingsPatchQueryBytes(ORG, prev);
  const qB = estimateSettingsPatchQueryBytes(ORG, prevMoreQr);
  check(
    "F-2695 URL size scales with full settings (qrScans)",
    qB > qA && qA > 8000
  );
}

{
  const initial = {
    bookBaseUrl: "https://www.thefloridahavens.com",
    brand: "florida-havens",
    qrScans: {},
  };
  const { db, requests, getSettings } = createFullSettingsCasMockDb(initial);
  const u1 = "https://lh3.googleusercontent.com/d/aaa=w3840";
  const u2 = "https://lh3.googleusercontent.com/d/bbb=w3840";
  const [r1, r2] = await Promise.all([
    patchHiddenUrlsMutate(ORG, (c) => (c.includes(u1) ? c : [...c, u1]), db),
    patchHiddenUrlsMutate(ORG, (c) => (c.includes(u2) ? c : [...c, u2]), db),
  ]);
  const settings = getSettings();
  check("F-2617 concurrent hide both succeed", r1.ok && r2.ok);
  check(
    "F-2617 both urls persisted",
    settings.screensaverHiddenUrls.includes(u1) &&
      settings.screensaverHiddenUrls.includes(u2)
  );
  check(
    "F-2741 PATCH uses settings::text CAS",
    requests.some(
      (r) => r.method === "PATCH" && r.url.includes("settings%3A%3Atext=eq.")
    )
  );
}

{
  const initial = { brand: "florida-havens", qrScans: {} };
  let injected = false;
  const { db, getSettings } = createFullSettingsCasMockDb(initial, {
    beforePatchAccept: (current) => {
      if (!injected) {
        injected = true;
        return { ...current, qrScans: { "book:2026-01-01": 3 } };
      }
      return current;
    },
  });
  const u1 = "https://lh3.googleusercontent.com/d/aaa=w3840";
  const r = await patchHiddenUrlsMutate(
    ORG,
    (c) => (c.includes(u1) ? c : [...c, u1]),
    db
  );
  const settings = getSettings();
  check("F-2744 recordScan between read and PATCH retries", r.ok);
  check(
    "F-2744 qrScans not clobbered after hide",
    settings.qrScans?.["book:2026-01-01"] === 3 &&
      settings.screensaverHiddenUrls.includes(u1)
  );
}

{
  const initial = { brand: "florida-havens", qrScans: {} };
  const { db, getSettings } = createFullSettingsCasMockDb(initial, {
    beforePatchAccept: () => ({ brand: "florida-havens", qrScans: { x: 1 } }),
  });
  await patchHiddenUrlsMutateWithoutCas(
    ORG,
    (c) =>
      c.includes("https://lh3.googleusercontent.com/d/aaa=w3840")
        ? c
        : [...c, "https://lh3.googleusercontent.com/d/aaa=w3840"],
    db
  );
  const settings = getSettings();
  check(
    "F-2744 mutant no-CAS can clobber qrScans (demonstrates need for full CAS)",
    !settings.qrScans || settings.qrScans.x !== 1
  );
}

{
  const hugeQr = {};
  for (let i = 0; i < 500; i += 1) {
    hugeQr[`slug-${i}:2026-01-01`] = i;
  }
  let settings = { brand: "x", qrScans: hugeQr };
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
  const rHide = await patchHiddenUrlsMutate(
    ORG,
    (c) => [...c, "https://lh3.googleusercontent.com/d/new=w3840"],
    db
  );
  check(
    "F-2742 hide refused when request URL over safe threshold",
    !rHide.ok && rHide.error === HIDDEN_URLS_TOO_MANY_MESSAGE
  );
}

{
  const urls = Array.from({ length: 30 }, (_, i) =>
    `https://lh3.googleusercontent.com/d/${"a".repeat(120)}${i}=w3840`
  );
  const hugeQr = {};
  for (let i = 0; i < 450; i += 1) {
    hugeQr[`slug-${i}:2026-01-01`] = i;
  }
  let settings = { brand: "x", qrScans: hugeQr, screensaverHiddenUrls: urls };
  const fetch = async (input, init) => {
    if (init?.method === "GET" || !init?.method) {
      return new Response(JSON.stringify([{ settings }]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (init?.method === "PATCH") {
      const u = new URL(String(input));
      const casParam = u.searchParams.get("settings::text");
      if (casParam !== expectedSettingsCasParam(settings)) {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      settings = JSON.parse(String(init.body)).settings;
      return new Response(JSON.stringify([{ id: ORG }]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response("unexpected", { status: 500 });
  };
  const db = createClient("https://example.supabase.co", "key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch },
  });
  const remove = urls[0];
  const bytes = estimateSettingsPatchQueryBytes(ORG, settings);
  check(
    "F-2742 precheck: oversized hide path over threshold",
    bytes > HIDDEN_URLS_PATCH_URL_SAFE_BYTES
  );
  const rUnhide = await patchHiddenUrlsMutate(
    ORG,
    (c) => c.filter((u) => u !== remove),
    db
  );
  check("F-2748 unhide allowed when list shrinks despite large URL", rUnhide.ok);
  check(
    "F-2748 unhide persisted",
    !settings.screensaverHiddenUrls.includes(remove)
  );
}

{
  let settings = { brand: "x" };
  const fetch = async (input, init) => {
    if (init?.method === "GET" || !init?.method) {
      return new Response(JSON.stringify([{ settings }]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (init?.method === "PATCH") {
      return new Response(JSON.stringify({ message: "" }), {
        status: 414,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response("unexpected", { status: 500 });
  };
  const db = createClient("https://example.supabase.co", "key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch },
  });
  const r = await patchHiddenUrlsMutate(
    ORG,
    (c) => [...c, "https://lh3.googleusercontent.com/d/x=w3840"],
    db
  );
  check(
    "F-2744 blank write error maps to clear message",
    !r.ok && r.error === HIDDEN_URLS_TOO_MANY_MESSAGE
  );
}

{
  const unsorted = [
    "https://lh3.googleusercontent.com/d/z=w3840",
    "https://lh3.googleusercontent.com/d/a=w3840",
  ];
  let settings = { brand: "x", screensaverHiddenUrls: unsorted };
  let patchBody = null;
  const fetch = async (input, init) => {
    if (init?.method === "GET" || !init?.method) {
      return new Response(JSON.stringify([{ settings }]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (init?.method === "PATCH") {
      patchBody = JSON.parse(String(init.body));
      settings = patchBody.settings;
      return new Response(JSON.stringify([{ id: ORG }]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response("unexpected", { status: 500 });
  };
  const db = createClient("https://example.supabase.co", "key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch },
  });
  const u = "https://lh3.googleusercontent.com/d/new=w3840";
  await patchHiddenUrlsMutate(ORG, (c) => [...c, u], db);
  const casOnRead = settingsJsonbTextCasFilter({
    brand: "x",
    screensaverHiddenUrls: unsorted,
  }).value;
  check(
    "F-2744 CAS compares stored list order not sorted copy",
    casOnRead.includes("z=w3840") &&
      casOnRead.indexOf("z=w3840") < casOnRead.indexOf("a=w3840")
  );
  check(
    "F-2744 write adds url without resorting entire stored list",
    patchBody?.settings?.screensaverHiddenUrls?.length === 3 &&
      patchBody.settings.screensaverHiddenUrls[2] === u
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
    "F-2744 UI surfaces server error on hide/unhide failure",
    /data\.error/.test(uiSrc) &&
      /throw new Error\(msg\)/.test(uiSrc) &&
      /onError\(e instanceof Error \? e\.message/.test(uiSrc)
  );
  check(
    "F-2744 mutant: UI must not ignore data.error",
    !/throw new Error\(\`\$\{res\.status\}\`\)/.test(uiSrc)
  );
}

process.exit(failed);
