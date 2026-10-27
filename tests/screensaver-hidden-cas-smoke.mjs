/**
 * F-2615 / F-2617 — hide/unhide CAS + concurrent hide persistence.
 */
import { createClient } from "@supabase/supabase-js";

const {
  canonicalJsonbText,
  settingsJsonbTextCasFilter,
  patchHiddenUrlsMutate,
} = await import("../lib/screensaver-hidden-cas.ts");

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
  let settings = {
    bookBaseUrl: "https://www.thefloridahavens.com",
    brand: "florida-havens",
    screensaverHiddenUrls: [],
  };
  const requests = [];

  const fetch = async (input, init) => {
    const url = String(input);
    requests.push({ url, method: init?.method ?? "GET", body: init?.body });

    if (init?.method === "GET" || !init?.method) {
      return new Response(
        JSON.stringify([
          {
            settings,
          },
        ]),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }

    if (init?.method === "PATCH") {
      const u = new URL(url);
      const casParam = u.searchParams.get("settings::text");
      const expectedCas = `eq.${canonicalJsonbText(settings)}`;
      if (casParam !== expectedCas) {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: {
            "content-type": "application/json",
            prefer: "return=representation",
          },
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

process.exit(failed);
