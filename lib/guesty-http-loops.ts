/** Guesty HTTP pagination + 429 backoff loops (import-free for node smoke). */

export const GUESTY_429_MAX_ATTEMPTS = 6;
export const GUESTY_429_MAX_TOTAL_SLEEP_MS = 45_000;

export function guesty429SleepMs(attempt: number): number {
  return Math.min(10_000, 1000 * 2 ** attempt);
}

export function guesty429ShouldRetry(
  attempt: number,
  totalSleepMs: number
): boolean {
  if (attempt >= GUESTY_429_MAX_ATTEMPTS) return false;
  const delay = guesty429SleepMs(attempt);
  return totalSleepMs + delay <= GUESTY_429_MAX_TOTAL_SLEEP_MS;
}

export const GUESTY_PAGE_SIZE = 100;
/** Cap backfill volume — ~5k upcoming rows is years of six listings. */
export const GUESTY_MAX_PAGES = 50;
export const GUESTY_MAX_RESULTS = GUESTY_PAGE_SIZE * GUESTY_MAX_PAGES;

export function shouldFetchAnotherGuestyPage(
  pageIndex: number,
  lastBatchSize: number,
  totalCollected: number
): boolean {
  if (lastBatchSize < GUESTY_PAGE_SIZE) return false;
  if (totalCollected >= GUESTY_MAX_RESULTS) return false;
  if (pageIndex + 1 >= GUESTY_MAX_PAGES) return false;
  return true;
}

const GUESTY_API_BASE = "https://open-api.guesty.com/v1";

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

export type GuestyApiGetDeps = {
  fetchImpl?: FetchLike;
  getToken?: () => Promise<string>;
  sleepImpl?: (ms: number) => Promise<void>;
};

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Guesty Open API GET with 429 backoff — production path via lib/guesty.ts. */
export async function guestyApiGet<T>(
  path: string,
  deps: GuestyApiGetDeps = {}
): Promise<T> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const getToken = deps.getToken ?? (async () => {
    throw new Error("guestyApiGet requires getToken in this context");
  });
  const sleepImpl = deps.sleepImpl ?? defaultSleep;
  let attempt = 0;
  let totalSleepMs = 0;
  while (true) {
    const token = await getToken();
    const res = await fetchImpl(`${GUESTY_API_BASE}${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
    });
    if (res.status === 429 && guesty429ShouldRetry(attempt, totalSleepMs)) {
      const delay = guesty429SleepMs(attempt);
      await sleepImpl(delay);
      totalSleepMs += delay;
      attempt += 1;
      continue;
    }
    if (!res.ok) {
      throw new Error(
        `Guesty API ${path} failed: ${res.status} ${await res.text()}`
      );
    }
    return res.json() as Promise<T>;
  }
}

export async function fetchGuestyResultPages<T extends { _id: string }>(
  pathPrefix: string,
  deps: GuestyApiGetDeps = {}
): Promise<T[]> {
  const out: T[] = [];
  for (let skip = 0, page = 0; page < GUESTY_MAX_PAGES; page++, skip += GUESTY_PAGE_SIZE) {
    const data = await guestyApiGet<{ results: T[] }>(
      `${pathPrefix}&skip=${skip}`,
      deps
    );
    out.push(...data.results);
    if (data.results.length < GUESTY_PAGE_SIZE) break;
    if (out.length >= GUESTY_MAX_RESULTS) break;
  }
  return out;
}
