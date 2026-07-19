/**
 * Import/directive extraction via oxc-parser.
 * Single responsibility: parse TS/JS source into imports + directives.
 *
 * Handles:
 * - static ImportDeclaration / ExportAll/Named with source
 * - dynamic import('pkg') via CallExpression[callee.type=Import] and ImportExpression
 * - require('pkg') via CallExpression[callee=Identifier(require)]
 *
 * Limitations (by design, keep simple):
 * - Only literal string arguments are tracked; dynamic/template imports like import(`./${x}`) are ignored
 * - require with non-literal or destructured is ignored (can't statically resolve)
 * - oxc-parser version pinned in packages/versions to avoid breaking changes in AST shape
 */

import { parseSync } from "oxc-parser";
import type { ParsedFile } from "../types.js";

export function parseFile(source: string, ext: string): ParsedFile {
  const imports = new Set<string>();
  const directives = new Set<string>();
  const lang = ext.endsWith("x") ? (ext.endsWith("jsx") ? "jsx" : "tsx") : undefined;
  const result = parseSync("source" + ext, source, { sourceType: "module", lang });

  // Top-level directive + static import collection (fast path)
  for (const stmt of result.program.body) {
    if (
      stmt.type === "ExpressionStatement" &&
      stmt.expression.type === "Literal" &&
      typeof stmt.expression.value === "string" &&
      (stmt.expression.value === "use client" || stmt.expression.value === "use server")
    ) {
      directives.add(stmt.expression.value);
    }
    if (stmt.type === "ImportDeclaration" && typeof (stmt as any).source?.value === "string") {
      imports.add((stmt as any).source.value);
    }
    if (stmt.type === "ExportAllDeclaration" || stmt.type === "ExportNamedDeclaration") {
      if ((stmt as any).source && typeof (stmt as any).source.value === "string") {
        imports.add((stmt as any).source.value);
      }
    }
  }

  // Recursive walk for dynamic import() and require()
  // oxc-parser may emit ImportExpression or CallExpression with callee.type === "Import"
  const stack: any[] = [result.program];
  const seen = new Set<any>();
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node || typeof node !== "object") continue;
    if (seen.has(node)) continue;
    seen.add(node);

    if (Array.isArray(node)) {
      for (const el of node) stack.push(el);
      continue;
    }

    const t = node.type as string | undefined;

    if (t === "CallExpression") {
      const callee = (node as any).callee;
      const args = (node as any).arguments as any[] | undefined;

      // require('pkg')
      if (callee?.type === "Identifier" && callee.name === "require" && args && args[0]) {
        const first = args[0];
        if (first.type === "Literal" && typeof first.value === "string") {
          imports.add(first.value);
        }
        // allow require("pkg") inside nested expressions
      }

      // dynamic import('pkg') — oxc often models as CallExpression with callee.type === "Import"
      if (callee?.type === "Import" && args && args[0]) {
        const first = args[0];
        if (first.type === "Literal" && typeof first.value === "string") {
          imports.add(first.value);
        }
      }
    }

    if (t === "ImportExpression") {
      const src = (node as any).source;
      if (src?.type === "Literal" && typeof src.value === "string") {
        imports.add(src.value);
      }
      // ImportExpression with options second arg ignored
    }

    // Push child nodes onto stack for traversal
    for (const key of Object.keys(node)) {
      if (key === "range" || key === "loc" || key === "start" || key === "end") continue;
      const child = (node as any)[key];
      if (child && typeof child === "object") {
        stack.push(child);
      }
    }
  }

  return { imports: Array.from(imports).filter(Boolean), directives };
}
