import { name, node, nodes, walk } from "./ast.js";
import type { FrontendImport } from "./types.js";

/** Standalone AST callers still enforce imports; resolved facts enrich these edges. */
export function frontendImportFacts(
  program: unknown,
  resolved: readonly FrontendImport[] = [],
): FrontendImport[] {
  const result: FrontendImport[] = [...resolved];
  walk(program, (item) => {
    let specifier: string | undefined;
    let typeOnly = false;
    if (
      ["ImportDeclaration", "ExportNamedDeclaration", "ExportAllDeclaration"].includes(
        item.type ?? "",
      )
    ) {
      specifier = name(item.source);
      const kind = item.type === "ImportDeclaration" ? "importKind" : "exportKind";
      const specifiers = nodes(item.specifiers);
      typeOnly =
        item[kind] === "type" ||
        (specifiers.length > 0 && specifiers.every((entry) => entry[kind] === "type"));
    } else if (item.type === "ImportExpression") specifier = name(item.source);
    else if (item.type === "CallExpression" && name(item.callee) === "require")
      specifier = name(nodes(item.arguments)[0]);
    else if (item.type === "TSImportEqualsDeclaration") {
      specifier = name(node(item.moduleReference)?.expression);
      typeOnly = item.importKind === "type";
    }
    if (
      specifier &&
      !result.some((entry) => entry.specifier === specifier && entry.typeOnly === typeOnly)
    )
      result.push({ specifier, typeOnly });
  });
  return result;
}
