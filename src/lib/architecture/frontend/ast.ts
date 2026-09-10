import type { FrontendNode } from "./types.js";

export function node(value: unknown): FrontendNode | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) && "type" in value
    ? (value as FrontendNode)
    : undefined;
}

export function nodes(value: unknown): FrontendNode[] {
  return Array.isArray(value) ? value.map(node).filter((entry) => entry !== undefined) : [];
}

export function name(value: unknown): string | undefined {
  const item = node(value);
  if (item?.type === "Identifier" || item?.type === "JSXIdentifier") return String(item.name);
  if (item?.type === "Literal" && typeof item.value === "string") return item.value;
  return undefined;
}

export function unwrap(value: unknown): FrontendNode | undefined {
  let item = node(value);
  while (
    item &&
    [
      "TSAsExpression",
      "TSSatisfiesExpression",
      "TSNonNullExpression",
      "TSTypeAssertion",
      "ChainExpression",
      "ParenthesizedExpression",
    ].includes(item.type ?? "")
  )
    item = node(item.expression);
  return item;
}

export function children(value: FrontendNode): FrontendNode[] {
  const result: FrontendNode[] = [];
  for (const [key, child] of Object.entries(value)) {
    if (
      [
        "parent",
        "loc",
        "range",
        "typeAnnotation",
        "typeParameters",
        "typeArguments",
        "returnType",
        "comments",
      ].includes(key)
    )
      continue;
    if (Array.isArray(child)) result.push(...nodes(child));
    else {
      const item = node(child);
      if (item) result.push(item);
    }
  }
  return result;
}

export function walk(
  value: unknown,
  visit: (item: FrontendNode, parent?: FrontendNode) => void,
  skipFunctions = false,
): void {
  const root = node(value);
  if (!root) return;
  const stack: { item: FrontendNode; parent?: FrontendNode }[] = [{ item: root }];
  while (stack.length) {
    const current = stack.pop();
    if (!current) continue;
    visit(current.item, current.parent);
    if (skipFunctions && current.item !== root && isFunction(current.item)) continue;
    for (const child of children(current.item).reverse())
      stack.push({ item: child, parent: current.item });
  }
}

export function isFunction(item: FrontendNode): boolean {
  return ["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"].includes(
    item.type ?? "",
  );
}

export function staticMember(item: FrontendNode): string | undefined {
  if (!item.computed) return name(item.property);
  const property = node(item.property);
  return property?.type === "Literal" && typeof property.value === "string"
    ? property.value
    : undefined;
}
