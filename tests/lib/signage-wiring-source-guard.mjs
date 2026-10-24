/**
 * F-1031 — prove route.ts / editor.tsx use filter *results*, not just call helpers.
 */
import ts from "typescript";

/** @returns {string[]} */
export function verifySignageRouteWiring(sourceText) {
  const errors = [];
  const src = sourceText;

  const assignFromFiltered =
    (src.match(/playlist\s*=\s*filtered\.playlist/g) || []).length >= 2 &&
    (src.match(/droppedOversized\s*=\s*filtered\.droppedOversized/g) || []).length >=
      2;
  if (!assignFromFiltered) {
    errors.push(
      "playlist and droppedOversized must be assigned from filtered.* (publish + restore)"
    );
  }

  const filterCalls = src.match(/await\s+filterOversizedPlaylistMedia\s*\(/g);
  if (!filterCalls || filterCalls.length < 2) {
    errors.push("route must await filterOversizedPlaylistMedia in restore and publish paths");
  }

  if (
    /\[playlistKey\]\s*:\s*body\.playlist/.test(src) ||
    /\[playlistKey\]\s*:\s*signagePlaylist\s*\(\s*body\.playlist/.test(src)
  ) {
    errors.push("must not persist body.playlist — use filtered playlist variable");
  }
  if (
    /\[playlistKey\]\s*:\s*entry\.playlist/.test(src) ||
    /\[playlistKey\]\s*:\s*signagePlaylist\s*\(\s*entry\.playlist/.test(src)
  ) {
    errors.push("must not persist entry.playlist — use filtered playlist variable");
  }

  if (/droppedOversized\s*:\s*\[\s*\]/.test(src)) {
    errors.push("must not hard-code droppedOversized: [] in JSON responses");
  }

  const sf = ts.createSourceFile(
    "route.ts",
    src,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  let dbUpdateUsesPlaylistVar = false;
  let jsonReturnUsesDroppedVar = 0;
  function visit(node) {
    if (ts.isPropertyAssignment(node)) {
      const key =
        ts.isIdentifier(node.name) ? node.name.text
        : ts.isComputedPropertyName(node.name) &&
            ts.isIdentifier(node.name.expression)
          ? node.name.expression.text
          : null;
      if (
        key === "playlistKey" &&
        ts.isIdentifier(node.initializer) &&
        node.initializer.text === "playlist"
      ) {
        dbUpdateUsesPlaylistVar = true;
      }
    }
    if (ts.isShorthandPropertyAssignment(node) && node.name.text === "droppedOversized") {
      jsonReturnUsesDroppedVar++;
    }
    if (
      ts.isPropertyAssignment(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === "droppedOversized" &&
      ts.isIdentifier(node.initializer) &&
      node.initializer.text === "droppedOversized"
    ) {
      jsonReturnUsesDroppedVar++;
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  if (!dbUpdateUsesPlaylistVar) {
    errors.push("DB update must set playlistKey to the filtered playlist variable");
  }
  if (jsonReturnUsesDroppedVar < 2) {
    errors.push(
      "JSON responses must pass droppedOversized from the filter result (publish + bulk)"
    );
  }

  return errors;
}

function conditionReferencesTooLarge(node) {
  const text = node.getText();
  return text.includes("tooLargeForTv");
}

function isFalseGuard(node) {
  const t = node.getText();
  return /&&\s*false\b/.test(t) || /\bfalse\s*&&/.test(t);
}

/** @returns {string[]} */
export function verifySignageEditorWiring(sourceText) {
  const errors = [];
  const sf = ts.createSourceFile(
    "editor.tsx",
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );

  let insertFn = null;
  function findInsert(node) {
    if (
      (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)) &&
      node.name?.text === "insertMedia"
    ) {
      insertFn = node;
    }
    ts.forEachChild(node, findInsert);
  }
  findInsert(sf);
  if (!insertFn?.body) {
    errors.push("insertMedia function not found");
    return errors;
  }

  let guardReturnBeforeMutate = false;
  function scanInsert(node) {
    if (ts.isIfStatement(node) && conditionReferencesTooLarge(node.expression)) {
      if (isFalseGuard(node.expression)) {
        errors.push("insertMedia guard must not be permanently false (W3)");
        return;
      }
      const then = node.thenStatement;
      const returns =
        ts.isReturnStatement(then) ||
        (ts.isBlock(then) && then.statements.some((s) => ts.isReturnStatement(s)));
      if (returns) guardReturnBeforeMutate = true;
    }
    if (
      ts.isExpressionStatement(node) &&
      ts.isCallExpression(node.expression) &&
      conditionReferencesTooLarge(node.expression)
    ) {
      errors.push("insertMedia must not ignore tooLargeForTv (guard result unused)");
    }
    ts.forEachChild(node, scanInsert);
  }
  scanInsert(insertFn.body);
  if (!guardReturnBeforeMutate) {
    errors.push("insertMedia must return early when asset.tooLargeForTv");
  }

  const src = sourceText;
  if (
    !/formatDroppedOversizedNotice\s*\(\s*data\.droppedOversized/.test(src)
  ) {
    errors.push("publish success must render notice from data.droppedOversized");
  }
  if (
    !/sessionStorage\.setItem\s*\(\s*DROPPED_OVERSIZED_STORAGE_KEY[\s\S]*data\.droppedOversized/.test(
      src
    )
  ) {
    errors.push("restore must persist data.droppedOversized to sessionStorage");
  }
  if (
    !/sessionStorage\.getItem\s*\(\s*DROPPED_OVERSIZED_STORAGE_KEY/.test(src) ||
    !/formatDroppedOversizedNotice\s*\(\s*dropped/.test(src)
  ) {
    errors.push("restore reload must show notice from sessionStorage payload");
  }

  return errors;
}

export function wiringOk(routeSrc, editorSrc) {
  return (
    verifySignageRouteWiring(routeSrc).length === 0 &&
    verifySignageEditorWiring(editorSrc).length === 0
  );
}

/** Mutants on real file text — each must fail wiringOk. */
export const SIGNAGE_WIRING_MUTANTS = [
  {
    id: "W1",
    note: "delete insertMedia guard",
    apply: (route, editor) => [
      route,
      editor.replace(
        /if\s*\(\s*asset\.tooLargeForTv\s*\)\s*return;\s*\n/,
        ""
      ),
    ],
  },
  {
    id: "W2",
    note: "comment insert guard",
    apply: (route, editor) => [
      route,
      editor.replace(
        /if\s*\(\s*asset\.tooLargeForTv\s*\)\s*return;/,
        "// if (asset.tooLargeForTv) return;"
      ),
    ],
  },
  {
    id: "W3",
    note: "dead guard",
    apply: (route, editor) => [
      route,
      editor.replace(
        /if\s*\(\s*asset\.tooLargeForTv\s*\)/,
        "if (asset.tooLargeForTv && false)"
      ),
    ],
  },
  {
    id: "W4",
    note: "guard result ignored",
    apply: (route, editor) => [
      route,
      editor.replace(
        /if\s*\(\s*asset\.tooLargeForTv\s*\)\s*return;/,
        "asset.tooLargeForTv;"
      ),
    ],
  },
  {
    id: "W5",
    note: "restore saves unfiltered playlist",
    apply: (route, editor) => [
      route.replace(
        /playlist\s*=\s*filtered\.playlist;/,
        "playlist = signagePlaylist(entry.playlist);"
      ),
      editor,
    ],
  },
  {
    id: "W6",
    note: "publish saves unfiltered playlist",
    apply: (route, editor) => {
      let n = 0;
      const r = route.replace(/playlist\s*=\s*filtered\.playlist;/g, (m) => {
        n++;
        return n === 2 ? "playlist = signagePlaylist(body.playlist);" : m;
      });
      return [r, editor];
    },
  },
  {
    id: "W7",
    note: "droppedOversized zeroed in response",
    apply: (route, editor) => [
      route.replace(/droppedOversized,/g, "droppedOversized: [],"),
      editor,
    ],
  },
  {
    id: "W8",
    note: "publish notice removed",
    apply: (route, editor) => [
      route,
      editor.replace(
        /`\s*\$\{formatDroppedOversizedNotice\(data\.droppedOversized,\s*"publish"\)\}`/,
        '""'
      ),
    ],
  },
  {
    id: "W9",
    note: "restore payload not persisted",
    apply: (route, editor) => [
      route,
      editor.replace(
        /sessionStorage\.setItem\s*\(\s*DROPPED_OVERSIZED_STORAGE_KEY[\s\S]*?\);\s*\n\s*\}\s*catch/,
        "/* no persist */ } catch"
      ),
    ],
  },
  {
    id: "N2",
    note: "bulk apply droppedOversized zeroed",
    apply: (route, editor) => [
      route.replace(
        /return NextResponse\.json\(\{\s*ok: true,\s*applied,\s*vacant,\s*droppedOversized,/,
        "return NextResponse.json({ ok: true, applied, vacant, droppedOversized: [],"
      ),
      editor,
    ],
  },
  {
    id: "N3",
    note: "restore notice not shown on reload",
    apply: (route, editor) => [
      route,
      editor.replace(
        /sessionStorage\.getItem\s*\(\s*DROPPED_OVERSIZED_STORAGE_KEY\s*\)/,
        'sessionStorage.getItem("never")'
      ),
    ],
  },
  {
    id: "N4",
    note: "main OK response droppedOversized zeroed",
    apply: (route, editor) => [
      route.replace(
        /return NextResponse\.json\(\{\s*ok: true,\s*reset: Boolean\(body\.reset\),[\s\S]*?droppedOversized,\s*\}\);/,
        "return NextResponse.json({ ok: true, reset: Boolean(body.reset), restored: Boolean(body.restoreAt), vacant, droppedOversized: [] });"
      ),
      editor,
    ],
  },
];
