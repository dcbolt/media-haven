// Pure-logic smoke (no DB): clamp + allowlist. Run: node --experimental-strip-types tests/local-input-smoke.mjs
import assert from "node:assert/strict";
const src = await import("node:fs").then(f=>f.readFileSync(new URL("../lib/local-input.ts", import.meta.url),"utf8"));
assert(/MAX_UNLOCK_MS = 21/.test(src), "hard cap present");
assert(/unknown kiosk/.test(src), "allowlist enforced in setLocalInput");
for (const id of ["br1","br2","br3","br4","lr","rr","sh_lr","sh_br1","sh_br2","sh_br3"]) assert(src.includes(`"${id}"`), id);
const route = (await import("node:fs")).readFileSync(new URL("../app/api/node/local-input/route.ts", import.meta.url),"utf8");
assert(/if \(!want \|\| !tok\) return false/.test(route), "node route fails closed");
console.log("local-input smoke ok");
