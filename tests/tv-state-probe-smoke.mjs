/**
 * F-1143 — TV state probe JSON shape.
 */
import { isTvStateProbePayload } from "../lib/tv-state-probe.ts";
import { probeTvStateReachable } from "../lib/tv-reload.ts";

let failed = 0;
function check(name, pass) {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
  if (!pass) failed = 1;
}

check("demo mode valid", isTvStateProbePayload({ mode: "demo", content: {} }));
check("pairing valid", isTvStateProbePayload({ mode: "pairing", pairCode: "1234" }));
check("active valid", isTvStateProbePayload({ mode: "active", content: {} }));
check("html-ish body invalid", !isTvStateProbePayload({ mode: "html" }));
check("missing mode invalid", !isTvStateProbePayload({ content: {} }));

{
  const mockFetch = async () => ({
    status: 200,
    ok: true,
    json: async () => "<html></html>",
  });
  const ok = await probeTvStateReachable(
    "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    null,
    mockFetch
  );
  check("200 non-json body fails probe", !ok);
}

{
  const mockFetch = async () => ({
    status: 200,
    ok: true,
    json: async () => ({ mode: "demo", content: { propertyName: "X" } }),
  });
  const ok = await probeTvStateReachable(
    "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    null,
    mockFetch
  );
  check("200 valid JSON passes probe", ok);
}

// Mutation: accept any 200 object without mode
check(
  "mutation: loose probe guard fails",
  !isTvStateProbePayload({ ok: true })
);

process.exit(failed);
