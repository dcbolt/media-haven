/**
 * TV dark first paint (blank-paint) — isolated from memory/nightly follow-ups.
 */
import { TV_BLANK_PAINT_BG, TV_BLANK_PAINT_CRITICAL_CSS } from "../lib/tv-blank-paint.ts";

let failed = 0;
function check(name, pass) {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
  if (!pass) failed = 1;
}

check("blank paint is ocean-900", TV_BLANK_PAINT_BG === "#12333f");
check(
  "critical css paints html/body",
  TV_BLANK_PAINT_CRITICAL_CSS.includes("#12333f") &&
    TV_BLANK_PAINT_CRITICAL_CSS.includes("html,body")
);

process.exit(failed);
