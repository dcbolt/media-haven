/**
 * Host session forgery guard — cookie HMAC must use app_config access code
 * (same source as lib/host-auth signing), not env/default alone. F-5613.
 */
import { createHmac } from "node:crypto";

const APP_CONFIG_CODE = "app-config-layer-code";
const ENV_CODE = "env-layer-code";

process.env.HOST_ACCESS_CODE = ENV_CODE;

const {
  issueHostCookieForTests,
  verifyHostSessionCookie,
  overrideHostAccessCodeForTests,
  resetHostSessionAccessCodeCacheForTests,
} = await import("../lib/host-session-verify.ts");

let ok = true;
function check(name, pass) {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
  if (!pass) ok = false;
}

function cookieSignedWithCode(identity, code) {
  const id = identity.trim().slice(0, 120) || "host";
  const b64 = Buffer.from(id, "utf8").toString("base64url");
  const sig = createHmac("sha256", `fh-host-${code}`)
    .update(`host-session-v1:${id}`)
    .digest("hex");
  return `${b64}.${sig}`;
}

resetHostSessionAccessCodeCacheForTests();
overrideHostAccessCodeForTests(APP_CONFIG_CODE);

const fromAppConfig = await issueHostCookieForTests("access code");
check(
  "F-5613 cookie signed with app_config code verifies",
  await verifyHostSessionCookie(fromAppConfig)
);

const fromEnv = cookieSignedWithCode("access code", ENV_CODE);
check(
  "F-5613 cookie signed with HOST_ACCESS_CODE env alone rejected",
  !(await verifyHostSessionCookie(fromEnv))
);

const fromDemo = cookieSignedWithCode("access code", "demo");
check(
  "F-5613 cookie signed with default demo code rejected",
  !(await verifyHostSessionCookie(fromDemo))
);

check(
  "F-5613 forged fh_host value not verified",
  !(await verifyHostSessionCookie("forged-identity.deadbeef"))
);

resetHostSessionAccessCodeCacheForTests();

process.exit(ok ? 0 : 1);