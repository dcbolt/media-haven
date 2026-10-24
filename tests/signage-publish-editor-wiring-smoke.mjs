/**
 * F-1031 — route/editor must use filter *results* (saved playlist, notices, guard).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  SIGNAGE_WIRING_MUTANTS,
  verifySignageEditorWiring,
  verifySignageRouteWiring,
  wiringOk,
} from "./lib/signage-wiring-source-guard.mjs";
import { runSignageRouteHandlerProbe } from "./lib/signage-route-handler-probe.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const routeSrc = readFileSync(`${root}/app/api/host/signage/route.ts`, "utf8");
const editorSrc = readFileSync(`${root}/app/host/signage/editor.tsx`, "utf8");

let failed = 0;
function check(name, pass) {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
  if (!pass) failed = 1;
}

for (const err of verifySignageRouteWiring(routeSrc)) {
  check(`F-1031 route: ${err}`, false);
}
if (verifySignageRouteWiring(routeSrc).length === 0) {
  check("F-1038 route data-flow checks pass on source", true);
}

const handlerProbe = await runSignageRouteHandlerProbe();
for (const err of handlerProbe.errors) {
  check(`F-1038 handler: ${err}`, false);
}
if (handlerProbe.ok) {
  check("F-1038 POST handler saves filtered playlist and returns droppedOversized", true);
}

for (const err of verifySignageEditorWiring(editorSrc)) {
  check(`F-1031 editor: ${err}`, false);
}
if (verifySignageEditorWiring(editorSrc).length === 0) {
  check("F-1031 editor guard + publish/restore notices wired to droppedOversized", true);
}

for (const mut of SIGNAGE_WIRING_MUTANTS) {
  const [r, e] = mut.apply(routeSrc, editorSrc);
  const survived = wiringOk(r, e);
  check(`F-1031 mutant ${mut.id} killed (${mut.note})`, !survived);
}

process.exit(failed);
