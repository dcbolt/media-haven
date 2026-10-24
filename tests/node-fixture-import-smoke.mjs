/**
 * Every lib/*.ts entry point pulled in by Node smokes must load under Node 22
 * --experimental-strip-types without extensionless relative import chains.
 */
import { readdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(testsDir, "..");

const importRe =
  /from\s+["'](\.\.\/lib\/[^"']+\.ts)["']/g;

const entries = new Set();
for (const name of readdirSync(testsDir)) {
  if (!name.endsWith(".mjs")) continue;
  const text = readFileSync(path.join(testsDir, name), "utf8");
  let m;
  while ((m = importRe.exec(text)) !== null) {
    entries.add(m[1]);
  }
}

let failed = 0;
for (const rel of [...entries].sort()) {
  const abs = path.join(testsDir, rel);
  const r = spawnSync(
    process.execPath,
    ["--experimental-strip-types", "--no-warnings", "-e", `import ${JSON.stringify(abs)}`],
    { encoding: "utf8" }
  );
  const ok = r.status === 0;
  console.log(`${ok ? "PASS" : "FAIL"}  node import ${rel}`);
  if (!ok) {
    failed = 1;
    console.error((r.stderr || r.stdout || "").trim().split("\n").slice(-4).join("\n"));
  }
}

process.exit(failed);
