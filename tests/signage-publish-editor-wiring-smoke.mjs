/**
 * F-1031 — real signage publish/editor modules (no regex / local copies).
 */
process.env.NEXT_PUBLIC_SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://woleywnwgjfcvowqyyix.supabase.co";

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { MAX_TV_VIDEO_BYTES } from "../lib/tv-video-byte-cap.ts";
import {
  buildSignagePublishOkResponse,
  prepareSignagePlaylistForPublish,
  prepareSignagePlaylistForRestore,
} from "../lib/signage-publish-prepare.ts";
import {
  canInsertSignageMedia,
  publishDroppedOversizedSuffix,
  restoreDroppedOversizedStorageValue,
  restoreSuccessMessageFromStorage,
} from "../lib/signage-editor-media.ts";

const root = fileURLToPath(new URL("..", import.meta.url));

let failed = 0;
function check(name, pass) {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
  if (!pass) failed = 1;
}

function functionBodyContainsCall(source, fnName, calleeName) {
  const sf = ts.createSourceFile(
    "f.ts",
    source,
    ts.ScriptTarget.Latest,
    true,
    source.includes("use client") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  let fn;
  function visit(node) {
    if (
      (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)) &&
      node.name?.text === fnName
    ) {
      fn = node;
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  if (!fn?.body) return false;
  let found = false;
  function scan(node) {
    if (ts.isCallExpression(node)) {
      const e = node.expression;
      if (ts.isIdentifier(e) && e.text === calleeName) found = true;
      if (
        ts.isPropertyAccessExpression(e) &&
        ts.isIdentifier(e.expression) &&
        e.expression.text === calleeName
      ) {
        found = true;
      }
    }
    if (!found) ts.forEachChild(node, scan);
  }
  scan(fn.body);
  return found;
}

function moduleCallsAny(source, names) {
  const sf = ts.createSourceFile(
    "f.ts",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const want = new Set(names);
  let found = new Set();
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      if (want.has(node.expression.text)) found.add(node.expression.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return names.every((n) => found.has(n));
}

const routeSrc = readFileSync(`${root}/app/api/host/signage/route.ts`, "utf8");
const editorSrc = readFileSync(`${root}/app/host/signage/editor.tsx`, "utf8");

check(
  "F-1031 route POST uses prepareSignagePlaylistForPublish",
  moduleCallsAny(routeSrc, ["prepareSignagePlaylistForPublish"])
);
check(
  "F-1031 route POST uses prepareSignagePlaylistForRestore",
  moduleCallsAny(routeSrc, ["prepareSignagePlaylistForRestore"])
);
check(
  "F-1031 route POST uses buildSignagePublishOkResponse",
  moduleCallsAny(routeSrc, ["buildSignagePublishOkResponse"])
);
check(
  "F-1031 editor insertMedia calls canInsertSignageMedia",
  functionBodyContainsCall(editorSrc, "insertMedia", "canInsertSignageMedia")
);

const HOST = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname;
const base = `https://${HOST}/storage/v1/object/public/screensavers/p`;
const huge = MAX_TV_VIDEO_BYTES + 1;
const storage = {
  list: async (_folder, opts) => ({
    data: [
      {
        name: opts?.search ?? "x.mp4",
        id: "id-1",
        metadata: {
          size: (opts?.search ?? "").includes("big") ? huge : 1000,
          mimetype: "video/mp4",
        },
      },
    ],
    error: null,
  }),
};

const rawPlaylist = {
  items: [
    { key: "media-ok", url: `${base}/ok.mp4`, mediaType: "video" },
    { key: "media-big", url: `${base}/big.mp4`, mediaType: "video" },
    { key: "welcome" },
  ],
  photos: true,
};

const publishPrep = await prepareSignagePlaylistForPublish(rawPlaylist, storage);
check(
  "F-1031 publish prep filters oversized (W6)",
  publishPrep.droppedOversized.length === 1 &&
    publishPrep.droppedOversized[0].key === "media-big" &&
    !publishPrep.playlist?.items.some((it) => it.key === "media-big")
);

const restorePrep = await prepareSignagePlaylistForRestore(rawPlaylist, storage);
check(
  "F-1031 restore prep filters oversized (W5)",
  restorePrep.droppedOversized.length === 1 &&
    !restorePrep.playlist?.items.some((it) => it.key === "media-big")
);

const okBody = buildSignagePublishOkResponse({
  reset: false,
  restored: false,
  vacant: false,
  droppedOversized: publishPrep.droppedOversized,
});
check(
  "F-1031 OK response passes droppedOversized (W7)",
  okBody.droppedOversized.length === 1 &&
    okBody.droppedOversized[0].name === "big.mp4"
);

const suffix = publishDroppedOversizedSuffix({
  droppedOversized: publishPrep.droppedOversized,
});
check(
  "F-1031 publish notice suffix (W8)",
  suffix.includes("big.mp4") && suffix.includes("not rotated")
);

const stored = restoreDroppedOversizedStorageValue(publishPrep.droppedOversized);
check(
  "F-1031 restore session payload (W9)",
  stored != null && stored.includes("media-big")
);
check(
  "F-1031 restore notice from storage (W9)",
  restoreSuccessMessageFromStorage(stored)?.includes("big.mp4") === true
);

check(
  "F-1031 insert guard rejects tooLargeForTv (W2/W4)",
  canInsertSignageMedia({
    url: `${base}/big.mp4`,
    type: "video",
    tooLargeForTv: true,
  }) === false &&
    canInsertSignageMedia({ url: `${base}/ok.mp4`, type: "video" }) === true
);

process.exit(failed);
