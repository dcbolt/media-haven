/**
 * Blob listing guard reasons + source deletion mutants (F-998).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { fetchAllBlobRows } from "../lib/screensavers-blob-list.ts";

const srcPath = fileURLToPath(
  new URL("../lib/screensavers-blob-list.ts", import.meta.url)
);
const src = readFileSync(srcPath, "utf8");

let failed = 0;
function check(name, pass) {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
  if (!pass) failed = 1;
}

{
  let t = 0;
  const { partial, partialReason } = await fetchAllBlobRows(
    async () => ({
      blobs: [{ pathname: "screensavers/a.jpg", url: "https://x/a.jpg", size: 1 }],
      cursor: "loop",
      hasMore: true,
    }),
    {
      deadlineMs: 500,
      maxPages: 20,
      now: () => {
        t += 200;
        return t;
      },
    }
  );
  check("time_budget guard sets partialReason", partial && partialReason === "time_budget");
}

{
  let pages = 0;
  const { partial, partialReason } = await fetchAllBlobRows(
    async () => {
      pages += 1;
      return {
        blobs: [{ pathname: `screensavers/p${pages}.jpg`, url: "https://x/p.jpg", size: 1 }],
        cursor: `c${pages}`,
        hasMore: true,
      };
    },
    { maxPages: 2, deadlineMs: 60_000, now: () => 0 }
  );
  check("page_cap guard sets partialReason", partial && partialReason === "page_cap");
}

{
  let t = 0;
  const { partial, partialReason } = await fetchAllBlobRows(
    async () => ({
      blobs: [{ pathname: "screensavers/a.jpg", url: "https://x/a.jpg", size: 1 }],
      cursor: "stuck",
      hasMore: true,
    }),
    {
      deadlineMs: 500,
      maxPages: 10,
      now: () => {
        t += 1;
        return t;
      },
    }
  );
  check(
    "repeated_cursor guard sets partialReason",
    partial && partialReason === "repeated_cursor"
  );
}

{
  const { partial, partialReason } = await fetchAllBlobRows(
    async () => ({
      blobs: [{ pathname: "screensavers/a.jpg", url: "https://x/a.jpg", size: 1 }],
      hasMore: true,
    }),
    { maxPages: 5, deadlineMs: 60_000, now: () => 0 }
  );
  check(
    "missing_cursor guard sets partialReason",
    partial && partialReason === "missing_cursor"
  );
}

check("source has time_budget guard", /partialReason\s*=\s*["']time_budget["']/.test(src));
check(
  "source has missing_cursor guard",
  /partialReason\s*=\s*["']missing_cursor["']/.test(src)
);
check("source has page_cap guard", /partialReason\s*=\s*["']page_cap["']/.test(src));
check(
  "source has repeated_cursor guard",
  /seenCursors\.has\(cursor\)/.test(src) &&
    /partialReason\s*=\s*["']repeated_cursor["']/.test(src)
);

function stripGuard(srcText, pattern) {
  return srcText.replace(pattern, "");
}

check(
  "mutant: delete time_budget assignment fails source check",
  !/partialReason\s*=\s*["']time_budget["']/.test(
    stripGuard(src, /partialReason\s*=\s*["']time_budget["'];\s*\n/)
  )
);
check(
  "mutant: delete page_cap assignment fails source check",
  !/partialReason\s*=\s*["']page_cap["']/.test(
    stripGuard(src, /partialReason\s*=\s*["']page_cap["'];\s*\n/)
  )
);
check(
  "mutant: delete repeated_cursor block fails source check",
  !/seenCursors\.has\(cursor\)/.test(
    stripGuard(src, /if\s*\(\s*seenCursors\.has\(cursor\)\s*\)\s*\{[\s\S]*?\}/)
  )
);
check(
  "mutant: delete missing_cursor assignment fails source check",
  !/partialReason\s*=\s*["']missing_cursor["']/.test(
    stripGuard(src, /partialReason\s*=\s*["']missing_cursor["'];\s*\n/)
  )
);

process.exit(failed);
