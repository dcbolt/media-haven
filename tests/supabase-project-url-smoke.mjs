/**
 * F-1009 — Supabase host from env, loud miss when unset.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const enforceSrc = readFileSync(
  fileURLToPath(
    new URL("../lib/supabase-screensaver-upload-enforce.ts", import.meta.url)
  ),
  "utf8"
);

let failed = 0;
function check(name, pass) {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
  if (!pass) failed = 1;
}

check(
  "F-1009 no hard-coded supabase.co tenant host in enforce",
  !/woleywnwgjfcvowqyyix\.supabase\.co/.test(enforceSrc)
);

const isolated = spawnSync(
  process.execPath,
  [
    "--experimental-strip-types",
    "--no-warnings",
    "-e",
    `
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      delete process.env.SUPABASE_URL;
      const logs = [];
      const orig = console.error;
      console.error = (...a) => { logs.push(a); orig(...a); };
      const { getSupabaseProjectHost } = await import("./lib/supabase-project-url.ts");
      const host = getSupabaseProjectHost();
      const miss = logs.some((r) => r[0] === "[media-upload]" && r[1]?.result === "supabase_project_url_missing");
      console.log(JSON.stringify({ host, miss }));
    `,
  ],
  { encoding: "utf8", cwd: fileURLToPath(new URL("..", import.meta.url)) }
);

try {
  const row = JSON.parse(
    (isolated.stdout || "").trim().split("\n").pop() || "{}"
  );
  check("F-1009 missing env returns null host", row.host === null);
  check("F-1009 missing env logs loudly", row.miss === true);
} catch {
  check(
    "F-1009 isolated env subprocess",
    false
  );
}

process.exit(failed);
