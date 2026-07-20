/**
 * Import/directive extraction via oxc-parser.
 * Single responsibility: parse TS/JS source into imports + directives.
 */

import { parseSync } from "oxc-parser";
import type { ParsedFile } from "../types.js";

type LiteralNode = { type: string; value: unknown };
type SourceNode = { value: unknown };
type ImportDeclLike = { type: string; source?: SourceNode };
type CalleeNode = { type?: string; name?: string };
type ArgNode = { type: string; value?: unknown };
type CallExprLike = { type: string; callee?: CalleeNode; arguments?: ArgNode[] };
type ImportExprLike = { type: string; source?: LiteralNode };
type ExprStmtLike = { type: string; expression: { type: string; value?: unknown } };
type ProgramLike = { body: unknown[] };
type ParseResultLike = { program: ProgramLike };

function getStringValue(node: unknown): string | undefined {
  if (!node || typeof node !== "object") return undefined;
  const n = node as { type?: string; source?: { value?: unknown } };
  const src = n.source;
  if (src && typeof src.value === "string") return src.value;
  return undefined;
}

export function parseFile(source: string, ext: string): ParsedFile {
  const imports = new Set<string>();
  const directives = new Set<string>();
  const lang = ext.endsWith("x") ? (ext.endsWith("jsx") ? "jsx" : "tsx") : undefined;
  const result = parseSync("source" + ext, source, {
    sourceType: "module",
    lang,
  }) as unknown as ParseResultLike;

  for (const stmt of result.program.body) {
    const s = stmt as unknown as ExprStmtLike & ImportDeclLike;
    if (
      s.type === "ExpressionStatement" &&
      s.expression?.type === "Literal" &&
      typeof s.expression.value === "string" &&
      (s.expression.value === "use client" || s.expression.value === "use server")
    ) {
      directives.add(s.expression.value);
    }
    if (s.type === "ImportDeclaration") {
      const val = getStringValue(s);
      if (val) imports.add(val);
    }
    if (s.type === "ExportAllDeclaration" || s.type === "ExportNamedDeclaration") {
      const val = getStringValue(s);
      if (val) imports.add(val);
    }
  }

  const stack: unknown[] = [result.program];
  const seen = new Set<unknown>();
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node || typeof node !== "object") continue;
    if (seen.has(node)) continue;
    seen.add(node);

    if (Array.isArray(node)) {
      for (const el of node) stack.push(el);
      continue;
    }

    const t = (node as { type?: string }).type;

    if (t === "CallExpression") {
      const ce = node as CallExprLike;
      const callee = ce.callee;
      const args = ce.arguments;
      if (callee?.type === "Identifier" && callee.name === "require" && args && args[0]) {
        const first = args[0];
        if (first.type === "Literal" && typeof first.value === "string") {
          imports.add(first.value);
        }
      }
      if (callee?.type === "Import" && args && args[0]) {
        const first = args[0];
        if (first.type === "Literal" && typeof first.value === "string") {
          imports.add(first.value);
        }
      }
    }

    if (t === "ImportExpression") {
      const ie = node as ImportExprLike;
      const src = ie.source;
      if (src?.type === "Literal" && typeof src.value === "string") {
        imports.add(src.value);
      }
    }

    for (const key of Object.keys(node as Record<string, unknown>)) {
      if (key === "range" || key === "loc" || key === "start" || key === "end") continue;
      const child = (node as Record<string, unknown>)[key];
      if (child && typeof child === "object") {
        stack.push(child);
      }
    }
  }

  return { imports: Array.from(imports).filter(Boolean), directives };
}
