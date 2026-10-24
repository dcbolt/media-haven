/**
 * Simulated TV media churn — registry must stay capped (proxy for slide leaks).
 */
import {
  simulateTvMediaSlideCycles,
  TV_WARM_MEDIA_CAP,
  tvMemorySimulationFlat,
} from "../lib/tv-media-memory.ts";

const CYCLES = 500;

let failed = 0;
function check(name, pass) {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
  if (!pass) failed = 1;
}

check("memory simulation flat over N cycles", tvMemorySimulationFlat(CYCLES));
const { peakActive, releasedTotal } = simulateTvMediaSlideCycles(CYCLES);
check("peak warm media within cap", peakActive <= TV_WARM_MEDIA_CAP);
check("eviction runs during churn", releasedTotal > 0);

process.exit(failed);
