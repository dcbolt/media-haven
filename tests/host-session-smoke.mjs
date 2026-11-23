/**
 * Host session forgery guard — forged fh_host cookie must not verify.
 */
process.env.HOST_ACCESS_CODE = "smoke-test-code";

const { issueHostCookieForTests, verifyHostSessionCookie } = await import(
  "../lib/host-session-verify.ts"
);

let ok = true;
function check(name, pass) {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
  if (!pass) ok = false;
}

const legit = await issueHostCookieForTests("access code");
check("legit host cookie verifies", await verifyHostSessionCookie(legit));
check(
  "forged fh_host value not verified",
  !(await verifyHostSessionCookie("forged-identity.deadbeef"))
);
check(
  "truncated cookie not verified",
  !(await verifyHostSessionCookie("YWNjZXNzIGNvZGU.tampered"))
);

process.exit(ok ? 0 : 1);