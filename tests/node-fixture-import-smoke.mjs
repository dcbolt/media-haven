/**
 * Node 22 import guard (F-995): every lib module in the smoke fixture import
 * closure must load (transitive relative imports under lib/, stopping at server deps).
 */
import { readFileSync, statSync } from "node:fs";
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(testsDir, "..");
const libDir = path.join(root, "lib");

const importFromTestRe =
  /from\s+["'](\.\.\/lib\/[^"']+\.ts)["']/g;
const relativeImportRe = /from\s+["'](\.[^"']+)["']/g;

function walkTests(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const abs = path.join(dir, name);
    const st = statSync(abs);
    if (st.isDirectory()) out.push(...walkTests(abs));
    else if (name.endsWith(".mjs")) out.push(abs);
  }
  return out;
}

function resolveLibImport(fromFile, spec) {
  if (spec.startsWith("@/")) return null;
  let target = path.normalize(path.join(path.dirname(fromFile), spec));
  if (target.endsWith(".js")) target = target.slice(0, -3) + ".ts";
  else if (!target.endsWith(".ts")) target += ".ts";
  if (!target.startsWith(libDir)) return null;
  return target;
}

function tryImport(abs) {
  const r = spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      "--no-warnings",
      "-e",
      `import ${JSON.stringify(abs)}`,
    ],
    { encoding: "utf8" }
  );
  return r.status === 0 ? null : (r.stderr || r.stdout || "").trim();
}

const seeds = new Set();
for (const testFile of walkTests(testsDir)) {
  const text = readFileSync(testFile, "utf8");
  let m;
  while ((m = importFromTestRe.exec(text)) !== null) {
    seeds.add(path.join(testsDir, m[1]));
  }
}

const closure = new Set();
const queue = [...seeds];
while (queue.length) {
  const abs = queue.pop();
  if (!abs || closure.has(abs)) continue;
  closure.add(abs);
  let text;
  try {
    text = readFileSync(abs, "utf8");
  } catch {
    continue;
  }
  const valueOnly = text.replace(/^\s*import\s+type\s+.+$/gm, "");
  for (const m of valueOnly.matchAll(relativeImportRe)) {
    if (/^\s*export\s+type\s+/.test(m.input.slice(Math.max(0, m.index - 20), m.index))) {
      continue;
    }
    const resolved = resolveLibImport(abs, m[1]);
    if (resolved) queue.push(resolved);
  }
}

let failed = 0;
function check(name, pass) {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
  if (!pass) failed = 1;
}

check("F-995 closure non-empty", closure.size > 0);

for (const abs of [...closure].sort()) {
  const rel = path.relative(root, abs);
  const err = tryImport(abs);
  const ok = err === null;
  console.log(`${ok ? "PASS" : "FAIL"}  node import ${rel}`);
  if (!ok) {
    failed = 1;
    console.error(err.split("\n").slice(-4).join("\n"));
  }
}

process.exit(failed);
