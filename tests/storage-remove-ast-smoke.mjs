/**
 * F-1034 / F-1035 — storage.remove AST guard + mutant self-test.
 */
import { findStorageRemoveCallViolations } from "./lib/storage-remove-ast.mjs";

let failed = 0;
function check(name, pass) {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
  if (!pass) failed = 1;
}

function violations(code) {
  return findStorageRemoveCallViolations("probe.ts", code);
}

const clean = `
export async function POST() {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  await db.from("x").delete();
  arr[0]();
  set.delete(k);
  removeAll();
  return { ok: true };
}
`;
check("F-1034 clean probe has no false positives", violations(clean).length === 0);

const mutants = [
  ["F-1034 const k remove", 'const k = "remove"; s[k]();'],
  ["F-1032 s.remove()", "s.remove();"],
  ['F-1032 s["remove"]()', 's["remove"]();'],
  ["F-1032 concat key", 's["rem".concat("ove")]();'],
  ["F-1032 alias call", "const r = s.remove; r();"],
  ["F-1032 computed destructure", "const { [\"remove\"]: r } = s; r();"],
  ["F-1032 Reflect.get", 'Reflect.get(s, "remove");'],
  ["F-1032 nested index", 's[["remove"][0]]();'],
  ["F-1032 nested destructure", "const { storage: { remove: r } } = s; r();"],
  ["F-1032 callback arg", "list.map(s.remove);"],
  ["F-1032 template key", 'const a = "rem"; s[`${a}ove`]();'],
  ["F-1032 Reflect.apply", "Reflect.apply(s.remove, s, []);"],
  ["F-1032 call.bind", "s.remove.call(s);"],
  ["F-1032 comma paren", "(0, s.remove)();"],
];

for (const [name, code] of mutants) {
  check(`${name} detected`, violations(code).length > 0);
}

process.exit(failed);
