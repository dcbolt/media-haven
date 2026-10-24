/**
 * AST guard: any storage delete call shape (F-1020) — .remove, ['remove'], computed.
 */
import ts from "typescript";

function stringLikeValue(node) {
  if (ts.isStringLiteralLike(node)) return node.text;
  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.PlusToken
  ) {
    const left = stringLikeValue(node.left);
    const right = stringLikeValue(node.right);
    if (left != null && right != null) return left + right;
  }
  return null;
}

function callExpressionIsRemoveCall(expr) {
  if (ts.isPropertyAccessExpression(expr)) {
    return expr.name.text === "remove";
  }
  if (ts.isElementAccessExpression(expr)) {
    const lit = stringLikeValue(expr.argumentExpression);
    if (lit === "remove") return true;
    return true;
  }
  return false;
}

/** @returns {string[]} human-readable violations */
export function findStorageRemoveCallViolations(fileName, sourceText) {
  const sf = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  const violations = [];
  function visit(node) {
    if (ts.isCallExpression(node) && callExpressionIsRemoveCall(node.expression)) {
      const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
      violations.push(`${fileName}:${line + 1} storage remove call`);
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return violations;
}
