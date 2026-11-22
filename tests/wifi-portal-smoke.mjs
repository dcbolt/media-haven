/**
 * Wi-Fi captive portal — consent separation, fail-open, no MAC persistence.
 * node tests/wifi-portal-smoke.mjs (BASE server required)
 */
import { createHmac } from "node:crypto";

const BASE = process.env.BASE ?? "http://127.0.0.1:3000";

function check(name, ok) {
  if (!ok) {
    console.error(`FAIL: ${name}`);
    process.exitCode = 1;
  } else {
    console.log(`ok: ${name}`);
  }
}

async function main() {
  const portal = await fetch(`${BASE}/portal?ssid=DUNES%20GUEST&id=aa:bb:cc:dd:ee:ff`);
  const portalHtml = await portal.text();
  check("portal page 200", portal.status === 200);
  check("portal form present", /data-wifi-portal-form/.test(portalHtml));
  check("marketing consent optional copy", /Optional:/i.test(portalHtml));

  const noEmail = await fetch(`${BASE}/api/portal/authorize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ssid: "DUNES GUEST" }),
  });
  check("authorize requires email", noEmail.status === 400);

  const tx = await fetch(`${BASE}/api/portal/authorize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: `wifi-tx-${Date.now()}@example.com`,
      ssid: "DUNES GUEST",
      clientMac: "aa:bb:cc:dd:ee:ff",
      consentMarketing: false,
    }),
  });
  const txJson = await tx.json();
  check("fail-open authorize ok", tx.status === 200 && txJson.ok === true);
  check("transactional flag", txJson.transactional === true);
  check("no mac in response", !("clientMac" in txJson) && !/aa:bb:cc/.test(JSON.stringify(txJson)));
  check("redirect to welcome", String(txJson.redirect).includes("/portal/welcome"));

  const { setAuthorizerFetchForTests, resetAuthorizerFetchForTests, authorizeGuestOnNode } =
    await import("../lib/node-authorizer.ts");
  let authBody = null;
  setAuthorizerFetchForTests(async (_url, init) => {
    authBody = JSON.parse(init.body);
    return new Response(JSON.stringify({ ok: true }), { status: 500 });
  });
  process.env.NODE_AUTHORIZER_URL = "http://127.0.0.1:1/authorize";
  process.env.NODE_AUTHORIZER_SECRET = "test-secret";
  try {
    const r = await authorizeGuestOnNode({
      clientMac: "11:22:33:44:55:66",
      minutes: 60,
      ssid: "DUNES GUEST",
      propertySlug: "dunes",
    });
    check("authorizer call even on 500 is failure", r.ok === false);
    check("mac only in flight", authBody?.mac === "11:22:33:44:55:66");
  } finally {
    resetAuthorizerFetchForTests();
    delete process.env.NODE_AUTHORIZER_URL;
    delete process.env.NODE_AUTHORIZER_SECRET;
  }

  const welcome = await fetch(`${BASE}/portal/welcome?property=dunes`);
  check("welcome page 200", welcome.status === 200);
  const welcomeHtml = await welcome.text();
  check("tracked story link", welcomeHtml.includes("/go/story"));
  check("tracked review link", welcomeHtml.includes("/go/review"));

  const { verifyNodeAuthorizerSignature } = await import("../lib/node-authorizer.ts");
  const body = JSON.stringify({ mac: "aa:bb:cc", minutes: 1 });
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = createHmac("sha256", "test-secret")
    .update(`${ts}.${body}`, "utf8")
    .digest("hex");
  check("hmac contract verifies", verifyNodeAuthorizerSignature("test-secret", ts, body, sig));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});