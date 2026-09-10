/**
 * Import/directive extraction via oxc-parser.
 * Single responsibility: parse TS/JS source into imports + directives.
 */

import { parseSync } from "oxc-parser";
import type {
  ImportKind,
  ImportReference,
  ParsedFile,
  ParserDiagnostic,
  SourceLocation,
} from "../types.js";

type AstNode = Record<string, unknown> & {
  type?: string;
  start?: number;
  end?: number;
};

type ParserLanguage = "js" | "jsx" | "ts" | "tsx" | "dts";
type ParserSourceType = "script" | "module" | "commonjs" | "unambiguous";

interface CollectedReference {
  reference: ImportReference;
  order: number;
}

function asNode(value: unknown): AstNode | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as AstNode)
    : undefined;
}

function literalString(value: unknown): string | undefined {
  const node = asNode(value);
  return node?.type === "Literal" && typeof node.value === "string" ? node.value : undefined;
}

function lineStarts(source: string): number[] {
  const starts = [0];
  for (let offset = 0; offset < source.length; offset += 1) {
    if (source.charCodeAt(offset) === 10) starts.push(offset + 1);
  }
  return starts;
}

function positionAt(offset: number, starts: number[]): { line: number; column: number } {
  let low = 0;
  let high = starts.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if ((starts[middle] ?? 0) <= offset) low = middle + 1;
    else high = middle - 1;
  }
  const lineIndex = Math.max(0, high);
  return { line: lineIndex + 1, column: offset - (starts[lineIndex] ?? 0) + 1 };
}

function sourceLocation(node: AstNode, starts: number[], sourceLength: number): SourceLocation {
  const start = Math.min(sourceLength, Math.max(0, node.start ?? 0));
  const end = Math.min(sourceLength, Math.max(start, node.end ?? start));
  const startPosition = positionAt(start, starts);
  const endPosition = positionAt(end, starts);
  return {
    start,
    end,
    line: startPosition.line,
    column: startPosition.column,
    endLine: endPosition.line,
    endColumn: endPosition.column,
  };
}

function allSpecifiersTypeOnly(node: AstNode, kindKey: "importKind" | "exportKind"): boolean {
  if (node[kindKey] === "type") return true;
  const specifiers = node.specifiers;
  return (
    Array.isArray(specifiers) &&
    specifiers.length > 0 &&
    specifiers.every((specifier) => asNode(specifier)?.[kindKey] === "type")
  );
}

function parserMode(ext: string): {
  filename: string;
  lang?: ParserLanguage;
  sourceType: ParserSourceType;
} {
  const normalized = ext.trim().toLowerCase().replace(/^\./, "") || "ts";
  const lang = (() => {
    if (normalized === "tsx") return "tsx";
    if (normalized === "jsx") return "jsx";
    if (normalized === "ts" || normalized === "mts" || normalized === "cts") return "ts";
    if (normalized === "d.ts") return "dts";
    if (normalized === "js" || normalized === "mjs" || normalized === "cjs") return "js";
    return undefined;
  })();
  const sourceType =
    normalized === "cjs" || normalized === "cts"
      ? "commonjs"
      : normalized === "mjs" || normalized === "mts"
        ? "module"
        : "unambiguous";
  return { filename: `source.${normalized}`, lang, sourceType };
}

function copyDiagnostics(errors: ReturnType<typeof parseSync>["errors"]): ParserDiagnostic[] {
  return errors.map((error) => ({
    severity: error.severity as ParserDiagnostic["severity"],
    message: error.message,
    labels: error.labels.map((label) => ({
      message: label.message,
      start: label.start,
      end: label.end,
    })),
    helpMessage: error.helpMessage,
    codeframe: error.codeframe,
  }));
}

export function parseFile(source: string, ext: string): ParsedFile {
  const mode = parserMode(ext);
  const result = parseSync(mode.filename, source, {
    sourceType: mode.sourceType,
    lang: mode.lang,
  });
  const starts = lineStarts(source);
  const collected: CollectedReference[] = [];
  let order = 0;

  const addReference = (
    node: AstNode,
    specifier: string | undefined,
    kind: ImportKind,
    typeOnly: boolean,
  ): void => {
    if (!specifier) return;
    collected.push({
      reference: {
        specifier,
        kind,
        typeOnly,
        location: sourceLocation(node, starts, source.length),
      },
      order,
    });
    order += 1;
  };

  const stack: unknown[] = [result.program];
  const seen = new Set<unknown>();
  while (stack.length > 0) {
    const value = stack.pop();
    if (!value || typeof value !== "object" || seen.has(value)) continue;
    seen.add(value);

    if (Array.isArray(value)) {
      for (const child of value) stack.push(child);
      continue;
    }

    const node = value as AstNode;
    if (node.type === "ImportDeclaration") {
      addReference(
        node,
        literalString(node.source),
        "import",
        allSpecifiersTypeOnly(node, "importKind"),
      );
    } else if (node.type === "ExportAllDeclaration" || node.type === "ExportNamedDeclaration") {
      addReference(
        node,
        literalString(node.source),
        "reexport",
        allSpecifiersTypeOnly(node, "exportKind"),
      );
    } else if (node.type === "TSImportEqualsDeclaration") {
      const moduleReference = asNode(node.moduleReference);
      const expression =
        moduleReference?.type === "TSExternalModuleReference"
          ? moduleReference.expression
          : undefined;
      addReference(node, literalString(expression), "import-equals", node.importKind === "type");
    } else if (node.type === "CallExpression") {
      const callee = asNode(node.callee);
      const args = Array.isArray(node.arguments) ? node.arguments : [];
      const specifier = literalString(args[0]);
      if (callee?.type === "Identifier" && callee.name === "require") {
        addReference(node, specifier, "require", false);
      } else if (callee?.type === "Import") {
        addReference(node, specifier, "dynamic-import", false);
      }
    } else if (node.type === "ImportExpression") {
      addReference(node, literalString(node.source), "dynamic-import", false);
    }

    for (const [key, child] of Object.entries(node)) {
      if (key === "range" || key === "loc" || key === "start" || key === "end") continue;
      if (child && typeof child === "object") stack.push(child);
    }
  }

  const importReferences = collected
    .sort(
      (left, right) =>
        left.reference.location.start - right.reference.location.start ||
        left.reference.location.end - right.reference.location.end ||
        left.order - right.order,
    )
    .map(({ reference }) => reference);
  const imports = Array.from(new Set(importReferences.map(({ specifier }) => specifier)));
  const directives = new Set<string>();
  for (const statement of result.program.body) {
    const node = asNode(statement);
    const directive =
      node?.type === "ExpressionStatement" ? literalString(asNode(node.expression)) : undefined;
    if (!directive) break;
    if (directive === "use client" || directive === "use server") directives.add(directive);
  }
  const serverActionValid =
    directives.has("use server") &&
    result.program.body.every((statement) => {
      const node = asNode(statement);
      if (
        !node ||
        (node.type !== "ExportNamedDeclaration" && node.type !== "ExportDefaultDeclaration")
      ) {
        return true;
      }
      if (node.exportKind === "type") return true;
      const declaration = asNode(node.declaration);
      if (declaration?.type === "FunctionDeclaration") return declaration.async === true;
      if (declaration?.type === "VariableDeclaration") {
        const declarations = Array.isArray(declaration.declarations)
          ? declaration.declarations
          : [];
        return declarations.every((entry) => {
          const init = asNode(asNode(entry)?.init);
          return (
            (init?.type === "ArrowFunctionExpression" || init?.type === "FunctionExpression") &&
            init.async === true
          );
        });
      }
      return false;
    });

  return {
    program: result.program,
    comments: result.comments,
    imports,
    importReferences,
    directives,
    serverActionValid,
    diagnostics: copyDiagnostics(result.errors),
  };
}
