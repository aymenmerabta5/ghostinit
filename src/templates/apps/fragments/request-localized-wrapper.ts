import type { parseSync } from "oxc-parser";

type Program = ReturnType<typeof parseSync>["program"];
type Node = { readonly type?: string; readonly [key: string]: unknown };

/** Avoid both module declaration collisions and lexical capture inside the page. */
export function requestMetadataBinding(program: Program): string {
  const names = new Set<string>();
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const item = node(value);
    if (!item) return;
    if (
      (item.type === "Identifier" || item.type === "JSXIdentifier") &&
      typeof item.name === "string"
    ) {
      names.add(item.name);
    }
    Object.values(item).forEach(visit);
  };
  visit(program);
  const base = "RequestLocalizedMetadataBoundary";
  let candidate = base;
  let suffix = 0;
  while (names.has(candidate)) candidate = `${base}${++suffix}`;
  return candidate;
}

function node(value: unknown): Node | undefined {
  return value !== null && typeof value === "object" ? (value as Node) : undefined;
}

function bindsName(value: unknown, name: string): boolean {
  if (Array.isArray(value)) return value.some((entry) => bindsName(entry, name));
  const pattern = node(value);
  if (!pattern) return false;
  switch (pattern.type) {
    case "Identifier":
      return pattern.name === name;
    case "AssignmentPattern":
      return bindsName(pattern.left, name);
    case "RestElement":
      return bindsName(pattern.argument, name);
    case "ArrayPattern":
      return bindsName(pattern.elements, name);
    case "ObjectPattern":
      return (
        Array.isArray(pattern.properties) &&
        pattern.properties.some((entry) => {
          const property = node(entry);
          return bindsName(
            property?.type === "RestElement" ? property.argument : property?.value,
            name,
          );
        })
      );
    case "TSParameterProperty":
      return bindsName(pattern.parameter, name);
    default:
      return false;
  }
}

/** Conservatively reject a local binding that could replace the imported component. */
function shadowsImport(value: unknown, name: string): boolean {
  if (Array.isArray(value)) return value.some((entry) => shadowsImport(entry, name));
  const item = node(value);
  if (!item) return false;
  if (
    [
      "VariableDeclarator",
      "FunctionDeclaration",
      "FunctionExpression",
      "ClassDeclaration",
      "TSEnumDeclaration",
    ].includes(item.type ?? "") &&
    bindsName(item.id, name)
  )
    return true;
  if (bindsName(item.params, name) || (item.type === "CatchClause" && bindsName(item.param, name)))
    return true;
  return Object.entries(item).some(
    ([key, child]) =>
      !["typeAnnotation", "typeParameters", "returnType", "comments"].includes(key) &&
      shadowsImport(child, name),
  );
}

function returnCount(value: unknown): number {
  if (Array.isArray(value)) return value.reduce((count, entry) => count + returnCount(entry), 0);
  const item = node(value);
  if (!item) return 0;
  if (
    ["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"].includes(
      item.type ?? "",
    )
  )
    return 0;
  if (item.type === "ReturnStatement") return 1;
  return Object.values(item).reduce<number>((count, child) => count + returnCount(child), 0);
}

/** A synchronous server entrypoint that directly delegates to a client import. */
export function isDirectClientPageWrapper(
  program: Program,
  isClientSource: (source: string) => boolean,
): boolean {
  const exported = program.body.find((entry) => entry.type === "ExportDefaultDeclaration");
  const component = exported?.type === "ExportDefaultDeclaration" ? exported.declaration : null;
  if (component?.type !== "FunctionDeclaration" || component.async || !component.body) return false;
  if (returnCount(component.body) !== 1) return false;
  const statement = component.body.body.find((entry) => entry.type === "ReturnStatement");
  let argument = statement?.type === "ReturnStatement" ? statement.argument : null;
  while (argument?.type === "ParenthesizedExpression") argument = argument.expression;
  if (argument?.type !== "JSXElement") return false;
  let tag = argument.openingElement.name;
  const member = tag.type === "JSXMemberExpression";
  while (tag.type === "JSXMemberExpression") tag = tag.object;
  if (tag.type !== "JSXIdentifier" || (!member && /^[a-z]/.test(tag.name))) return false;
  if (shadowsImport(component, tag.name)) return false;
  const name = tag.name;
  return program.body.some(
    (entry) =>
      entry.type === "ImportDeclaration" &&
      entry.importKind !== "type" &&
      entry.specifiers.some(
        (specifier) =>
          specifier.local.name === name &&
          (specifier.type !== "ImportSpecifier" || specifier.importKind !== "type"),
      ) &&
      isClientSource(entry.source.value),
  );
}
