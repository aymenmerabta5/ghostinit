/** Convex's generated browser module exports client-safe function-reference proxies. */
export function isConvexClientProtocolImport(file: string, statement: unknown): boolean {
  if (file.replace(/\\/g, "/").replace(/^\.\//, "") !== "convex/_generated/api.js") return false;
  if (!statement || typeof statement !== "object") return false;
  const node = statement as {
    type?: string;
    source?: { value?: unknown };
    specifiers?: Array<{ type?: string; imported?: { name?: unknown; value?: unknown } }>;
  };
  return (
    node.type === "ImportDeclaration" &&
    node.source?.value === "convex/server" &&
    Array.isArray(node.specifiers) &&
    node.specifiers.length > 0 &&
    node.specifiers.every(
      (specifier) =>
        specifier.type === "ImportSpecifier" &&
        ["anyApi", "componentsGeneric"].includes(
          String(specifier.imported?.name ?? specifier.imported?.value),
        ),
    )
  );
}

export function convexClientReferenceStarts(file: string, program: unknown): Set<number> {
  if (!program || typeof program !== "object") return new Set();
  const body = (program as { body?: Array<{ start?: number }> }).body;
  return new Set(
    (body ?? [])
      .filter((statement) => isConvexClientProtocolImport(file, statement))
      .map(({ start }) => start)
      .filter((start): start is number => typeof start === "number"),
  );
}
