/**
 * Default self-heal schedule wiring for /tv (client bundle).
 */

import {
  shouldAttemptNightlyReload,
} from "./tv-nightly-reload";
import { msUntilNightlySelfHeal } from "./tv-self-heal-schedule";
import type { SelfHealScheduleDeps } from "./tv-scheduled-self-reload";

export const tvSelfHealScheduleDeps: SelfHealScheduleDeps = {
  canAttemptTonight: shouldAttemptNightlyReload,
  nightlyDelayMs: (nowMs) => msUntilNightlySelfHeal(nowMs),
};
