/**
 * F-1031 / F-1038 / F-1039 — filter results used at save/render (not assignment lines only).
 */
import ts from "typescript";

function exprText(node, src) {
  return node ? src.slice(node.getStart(), node.getEnd()) : "";
}

function assignmentTargetsUnfilteredPlaylist(initText) {
  return (
    /body\.playlist/.test(initText) ||
    /signagePlaylist\s*\(\s*body\.playlist/.test(initText) ||
    /entry\.playlist/.test(initText) ||
    /signagePlaylist\s*\(\s*entry\.playlist/.test(initText)
  );
}

/** @returns {string[]} */
export function verifySignageRouteDataFlow(sourceText) {
  const errors = [];
  const src = sourceText;
  const sf = ts.createSourceFile(
    "route.ts",
    src,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );

  let filteredPlaylistAssignCount = 0;
  let sawFilteredDroppedAssign = false;

  function visit(node) {
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      const left = node.left;
      const initText = exprText(node.right, src);
      if (ts.isIdentifier(left) && left.text === "playlist") {
        if (/filtered\.playlist/.test(initText)) filteredPlaylistAssignCount++;
        if (assignmentTargetsUnfilteredPlaylist(initText)) {
          errors.push(
            "playlist must not be reassigned from body/entry after filter (R1/W5/W6)"
          );
        }
      }
      if (ts.isIdentifier(left) && left.text === "droppedOversized") {
        if (/filtered\.droppedOversized/.test(initText)) {
          sawFilteredDroppedAssign = true;
        }
        if (
          sawFilteredDroppedAssign &&
          (/^\s*\[\s*\]\s*$/.test(initText) || /=\s*\[\s*\]/.test(initText))
        ) {
          errors.push(
            "droppedOversized must not be cleared after filter (R2)"
          );
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  if (filteredPlaylistAssignCount < 2) {
    errors.push("route must assign playlist from filtered.playlist in publish and restore");
  }

  return errors;
}

/** @returns {string[]} */
export function verifySignageRouteWiring(sourceText) {
  const errors = [...verifySignageRouteDataFlow(sourceText)];
  const src = sourceText;

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

  let restoreFn = null;
  function findRestore(node) {
    if (
      (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)) &&
      node.name?.text === "restore"
    ) {
      restoreFn = node;
    }
    ts.forEachChild(node, findRestore);
  }
  findRestore(sf);

  if (restoreFn?.body) {
    let setItemPos = -1;
    let reloadPos = -1;
    function scanRestore(node) {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === "setItem" &&
        exprText(node.arguments[0], src).includes("DROPPED_OVERSIZED_STORAGE_KEY")
      ) {
        setItemPos = node.getStart();
      }
      if (
        ts.isPropertyAccessExpression(node) &&
        node.name.text === "reload" &&
        exprText(node.expression, src) === "location"
      ) {
        reloadPos = node.getStart();
      }
      ts.forEachChild(node, scanRestore);
    }
    scanRestore(restoreFn.body);
    if (setItemPos < 0 || reloadPos < 0 || setItemPos > reloadPos) {
      errors.push("restore must persist sessionStorage before location.reload (R6)");
    }
  }

  let restoreNoticeRendered = false;
  function scanEffects(node) {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "useEffect"
    ) {
      const bodyText = exprText(node.arguments[0], src);
      if (bodyText.includes("getItem") && bodyText.includes("DROPPED_OVERSIZED_STORAGE_KEY")) {
        if (
          /setPublishMsg\s*\(\s*\{[\s\S]*formatDroppedOversizedNotice\s*\(\s*dropped/.test(
            bodyText
          )
        ) {
          restoreNoticeRendered = true;
        }
        if (/void\s*\(\s*\{/.test(bodyText) && !/setPublishMsg\s*\(/.test(bodyText)) {
          errors.push("restore notice must call setPublishMsg (N3)");
        }
      }
    }
    ts.forEachChild(node, scanEffects);
  }
  scanEffects(sf);
  if (!restoreNoticeRendered) {
    errors.push("restore reload must render formatDroppedOversizedNotice via setPublishMsg (N3)");
  }

  if (
    !/const dropped\s*=[\s\S]*formatDroppedOversizedNotice\s*\(\s*data\.droppedOversized/.test(
      src
    )
  ) {
    errors.push("publish must compute dropped suffix from data.droppedOversized");
  }
  if (
    !/text:\s*reset[\s\S]*\$\{dropped\}/.test(src) &&
    !/seconds\.\$\{dropped\}/.test(src)
  ) {
    errors.push("publish setPublishMsg text must include dropped suffix (R7)");
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
    note: "restore notice computed but not shown",
    apply: (route, editor) => [
      route,
      editor.replace(
        /setPublishMsg\s*\(\s*\{\s*\n\s*ok: true,\s*\n\s*text: `\$\{formatDroppedOversizedNotice\(dropped, "restore"\)\}/,
        "void ({ ok: true, text: `${formatDroppedOversizedNotice(dropped, \"restore\")}"
      ),
    ],
  },
  {
    id: "R1",
    note: "publish playlist reassigned to body after filter",
    apply: (route, editor) => {
      let n = 0;
      const r = route.replace(/playlist\s*=\s*filtered\.playlist;/g, (m) => {
        n++;
        return n === 2
          ? `${m}\n    playlist = signagePlaylist(body.playlist);`
          : m;
      });
      return [r, editor];
    },
  },
  {
    id: "R2",
    note: "droppedOversized cleared before response",
    apply: (route, editor) => [
      route.replace(
        /if \(error\) \{\s*\n\s*return NextResponse\.json\(\{ error: "save failed" \}, \{ status: 500 \}\);\s*\n\s*\}/,
        'if (error) {\n    return NextResponse.json({ error: "save failed" }, { status: 500 });\n  }\n  droppedOversized = [];'
      ),
      editor,
    ],
  },
  {
    id: "R6",
    note: "reload before sessionStorage persist",
    apply: (route, editor) => [
      route,
      editor.replace(
        /sessionStorage\.setItem\s*\(\s*\n\s*DROPPED_OVERSIZED_STORAGE_KEY,[\s\S]*?\);\s*\n\s*\}\s*catch[\s\S]*?\}\s*\n\s*\}\s*\n\s*location\.reload\(\);/,
        "location.reload();"
      ),
    ],
  },
  {
    id: "R7",
    note: "publish suffix dropped from rendered text",
    apply: (route, editor) => [
      route,
      editor.replace(/\$\{dropped\}/g, ""),
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
