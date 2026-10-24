/** 429 retry policy — total sleep stays well under Vercel's 60s function limit. */

export {
  GUESTY_429_MAX_ATTEMPTS,
  GUESTY_429_MAX_TOTAL_SLEEP_MS,
  guesty429ShouldRetry,
  guesty429SleepMs,
} from "./guesty-http-loops";
