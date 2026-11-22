import {
  sanitizePropertyParam,
  sanitizeSlideId,
} from "../lib/qr-attribution-core.ts";

function check(name, pass) {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
  return pass;
}

let ok = true;
ok =
  check(
    "property + slide sanitization",
    sanitizePropertyParam("turtle-haven") === "turtle-haven" &&
      sanitizeSlideId("guestbook-review") === "guestbook-review"
  ) && ok;

ok = check("unknown property quarantined", sanitizePropertyParam("DROP") === "unknown") && ok;

process.exit(ok ? 0 : 1);