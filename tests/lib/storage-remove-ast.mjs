/**
 * AST guard: storage delete call shapes (F-1020 / F-1032 / F-1034 / F-1035).
 */
import ts from "typescript";

function stringLikeValue(node, constStrings = new Map()) {
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isIdentifier(node) && constStrings.has(node.text)) {
    return constStrings.get(node.text);
  }
  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.PlusToken
  ) {
    const left = stringLikeValue(node.left, constStrings);
    const right = stringLikeValue(node.right, constStrings);
    if (left != null && right != null) return left + right;
  }
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
    if (node.expression.name.text === "concat") {
      const base = stringLikeValue(node.expression.expression, constStrings);
      if (base == null) return null;
      let out = base;
      for (const arg of node.arguments) {
        const part = stringLikeValue(arg, constStrings);
        if (part == null) return null;
        out += part;
      }
      return out;
    }
  }
  if (ts.isElementAccessExpression(node)) {
    if (
      ts.isNumericLiteral(node.argumentExpression) &&
      node.argumentExpression.text === "0" &&
      ts.isArrayLiteralExpression(node.expression) &&
      node.expression.elements.length === 1
    ) {
      const el = stringLikeValue(node.expression.elements[0], constStrings);
      if (el != null) return el;
    }
    const lit = stringLikeValue(node.argumentExpression, constStrings);
    if (lit === "remove") return "remove";
  }
  if (ts.isTemplateExpression(node) && node.head.text === "" && node.templateSpans.length === 1) {
    const span = node.templateSpans[0];
    if (span.literal.text === "ove") {
      const mid = stringLikeValue(span.expression, constStrings);
      if (mid === "rem") return "remove";
    }
  }
  return null;
}

function isRemoveName(text) {
  return text === "remove";
}

function expressionReferencesRemove(expr, constStrings) {
  if (ts.isPropertyAccessExpression(expr)) {
    if (isRemoveName(expr.name.text)) return true;
    return expressionReferencesRemove(expr.expression, constStrings);
  }
  if (ts.isElementAccessExpression(expr)) {
    const lit = stringLikeValue(expr.argumentExpression, constStrings);
    if (lit === "remove") return true;
    return expressionReferencesRemove(expr.expression, constStrings);
  }
  if (ts.isIdentifier(expr)) {
    if (isRemoveName(expr.text)) return true;
    const init = constStrings.get(expr.text);
    if (init === "__remove_fn__") return true;
  }
  if (ts.isParenthesizedExpression(expr)) {
    return expressionReferencesRemove(expr.expression, constStrings);
  }
  if (ts.isBinaryExpression(expr) && expr.operatorToken.kind === ts.SyntaxKind.CommaToken) {
    return (
      expressionReferencesRemove(expr.left, constStrings) ||
      expressionReferencesRemove(expr.right, constStrings)
    );
  }
  return false;
}

function callExpressionIsRemoveRelated(node, constStrings) {
  const expr = node.expression;
  if (ts.isPropertyAccessExpression(expr)) {
    if (isRemoveName(expr.name.text)) return true;
    if (
      (expr.name.text === "call" ||
        expr.name.text === "apply" ||
        expr.name.text === "bind") &&
      expressionReferencesRemove(expr.expression, constStrings)
    ) {
      return true;
    }
  }
  if (ts.isElementAccessExpression(expr)) {
    const lit = stringLikeValue(expr.argumentExpression, constStrings);
    if (lit === "remove") return true;
    if (expressionReferencesRemove(expr.expression, constStrings)) return true;
    return false;
  }
  if (expressionReferencesRemove(expr, constStrings)) return true;
  if (ts.isIdentifier(expr) && isRemoveName(expr.text)) return true;

  if (ts.isPropertyAccessExpression(expr) && expr.name.text === "apply") {
    const target = expr.expression;
    if (ts.isIdentifier(target) && target.text === "Reflect") {
      const firstArg = node.arguments[0];
      const secondArg = node.arguments[1];
      if (firstArg && expressionReferencesRemove(firstArg, constStrings)) return true;
      if (
        secondArg &&
        stringLikeValue(secondArg, constStrings) === "remove"
      ) {
        return true;
      }
    }
  }

  if (ts.isPropertyAccessExpression(expr) && expr.name.text === "get") {
    const target = expr.expression;
    if (ts.isIdentifier(target) && target.text === "Reflect") {
      const keyArg = node.arguments[1];
      if (keyArg && stringLikeValue(keyArg, constStrings) === "remove") return true;
    }
  }

  for (const arg of node.arguments) {
    if (expressionReferencesRemove(arg, constStrings)) return true;
  }

  return false;
}

function collectConstStrings(node, constStrings) {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
    const lit = stringLikeValue(node.initializer, constStrings);
    if (lit != null) constStrings.set(node.name.text, lit);
    if (
      ts.isPropertyAccessExpression(node.initializer) &&
      isRemoveName(node.initializer.name.text)
    ) {
      constStrings.set(node.name.text, "__remove_fn__");
    }
  }
}

function bindingPatternReferencesRemove(nameNode, constStrings) {
  if (ts.isIdentifier(nameNode) && isRemoveName(nameNode.text)) return true;
  if (ts.isStringLiteralLike(nameNode) && isRemoveName(nameNode.text)) return true;
  if (ts.isComputedPropertyName(nameNode)) {
    return stringLikeValue(nameNode.expression, constStrings) === "remove";
  }
  return false;
}

function visitBindingPattern(pattern, constStrings, violations, fileName) {
  if (!ts.isObjectBindingPattern(pattern)) return;
  for (const el of pattern.elements) {
    const prop = el.propertyName ?? el.name;
    if (bindingPatternReferencesRemove(prop, constStrings)) {
      violations.push(`${fileName}: destructure remove binding`);
    }
    if (ts.isObjectBindingPattern(el.name)) {
      visitBindingPattern(el.name, constStrings, violations, fileName);
    }
  }
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
  const constStrings = new Map();
  const violations = [];
  function visit(node) {
    collectConstStrings(node, constStrings);
    if (ts.isVariableDeclaration(node) && node.name) {
      if (ts.isObjectBindingPattern(node.name)) {
        visitBindingPattern(node.name, constStrings, violations, fileName);
      }
    }
    if (ts.isCallExpression(node) && callExpressionIsRemoveRelated(node, constStrings)) {
      const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
      violations.push(`${fileName}:${line + 1} storage remove call`);
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return violations;
}
