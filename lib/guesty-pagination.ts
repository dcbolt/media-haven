export const GUESTY_PAGE_SIZE = 100;
/** Cap backfill volume — ~5k upcoming rows is years of six listings. */
export const GUESTY_MAX_PAGES = 50;
export const GUESTY_MAX_RESULTS = GUESTY_PAGE_SIZE * GUESTY_MAX_PAGES;

/** Pure pagination stop/continue — mirrors fetchGuestyResultPages loop. */
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
