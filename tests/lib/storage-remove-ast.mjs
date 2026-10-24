/**
 * AST guard: storage delete call shapes (F-1020 / F-1032).
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

function isRemoveName(text) {
  return text === "remove";
}

function expressionReferencesRemove(expr) {
  if (ts.isPropertyAccessExpression(expr)) {
    if (isRemoveName(expr.name.text)) return true;
    return expressionReferencesRemove(expr.expression);
  }
  if (ts.isElementAccessExpression(expr)) {
    const lit = stringLikeValue(expr.argumentExpression);
    if (lit === "remove") return true;
    return expressionReferencesRemove(expr.expression);
  }
  if (ts.isIdentifier(expr) && isRemoveName(expr.text)) return true;
  if (ts.isParenthesizedExpression(expr)) {
    return expressionReferencesRemove(expr.expression);
  }
  if (ts.isBinaryExpression(expr) && expr.operatorToken.kind === ts.SyntaxKind.CommaToken) {
    return (
      expressionReferencesRemove(expr.left) ||
      expressionReferencesRemove(expr.right)
    );
  }
  return false;
}

function callExpressionIsRemoveRelated(node) {
  const expr = node.expression;
  if (ts.isPropertyAccessExpression(expr)) {
    if (isRemoveName(expr.name.text)) return true;
    if (
      (expr.name.text === "call" ||
        expr.name.text === "apply" ||
        expr.name.text === "bind") &&
      expressionReferencesRemove(expr.expression)
    ) {
      return true;
    }
  }
  if (ts.isElementAccessExpression(expr)) {
    const lit = stringLikeValue(expr.argumentExpression);
    if (lit === "remove") return true;
    if (expressionReferencesRemove(expr.expression)) return true;
    return false;
  }
  if (expressionReferencesRemove(expr)) return true;
  if (ts.isIdentifier(expr) && isRemoveName(expr.text)) return true;

  if (ts.isPropertyAccessExpression(expr) && expr.name.text === "apply") {
    const target = expr.expression;
    if (ts.isIdentifier(target) && target.text === "Reflect") {
      const firstArg = node.arguments[0];
      if (firstArg && expressionReferencesRemove(firstArg)) return true;
    }
  }
  return false;
}

function bindingPatternReferencesRemove(name) {
  return isRemoveName(name);
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
    if (ts.isVariableDeclaration(node) && node.name) {
      if (ts.isObjectBindingPattern(node.name)) {
        for (const el of node.name.elements) {
          const prop = el.propertyName ?? el.name;
          if (ts.isIdentifier(prop) && bindingPatternReferencesRemove(prop.text)) {
            violations.push(`${fileName}: destructure remove binding`);
          }
        }
      }
    }
    if (ts.isCallExpression(node) && callExpressionIsRemoveRelated(node)) {
      const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
      violations.push(`${fileName}:${line + 1} storage remove call`);
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return violations;
}
