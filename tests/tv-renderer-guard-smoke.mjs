/**
 * TV blank-paint, nightly self-heal schedule, media cap.
 */
import { TV_BLANK_PAINT_BG, TV_BLANK_PAINT_CRITICAL_CSS } from "../lib/tv-blank-paint.ts";
import {
  TV_WARM_MEDIA_CAP,
  TvWarmMediaRegistry,
  revokeObjectUrlIfBlob,
} from "../lib/tv-media-memory.ts";
import { msUntilNightlySelfHeal } from "../lib/tv-self-heal-schedule.ts";

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

{
  const at230am = new Date("2026-10-24T02:30:00").getTime();
  const ms = msUntilNightlySelfHeal(at230am, () => 0);
  const target = new Date(at230am + ms);
  check(
    "nightly self-heal targets 3-4am window",
    target.getHours() === 3 && target.getMinutes() === 0
  );
  check("nightly self-heal under 6h cap", ms <= 6 * 3600_000);
}

check("warm media cap is small", TV_WARM_MEDIA_CAP === 4);
{
  const reg = new TvWarmMediaRegistry();
  const released = reg.noteActive(["a", "b", "c", "d", "e"]);
  check("registry evicts beyond cap", released.length >= 1);
  reg.noteActive(["e"]);
  check("registry keeps active url", reg.noteActive(["e"]).length === 0);
}

check("blob revoke is safe on http urls", (() => {
  revokeObjectUrlIfBlob("https://x/y");
  return true;
})());

process.exit(failed);
