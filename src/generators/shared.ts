import { readFileSync } from "node:fs";
import { FsTransaction } from "../lib/fs.js";
import { loadState, saveState } from "../lib/state.js";
import { relativeChecksum } from "../lib/checksum.js";
import type { GlobalOptions } from "../commands/types.js";
import { parseSync as oxcParseSync } from "oxc-parser";

export type ExportList = { values: string[]; types: string[] };

function regexExports(content: string): { values: Set<string>; types: Set<string> } {
  const values = new Set<string>();
  const types = new Set<string>();
  const typeRe = /export\s+type\s+\{([^}]*)\}/g;
  const valueRe = /export\s+\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = typeRe.exec(content)) !== null) {
    for (const part of (m[1] ?? "").split(",")) {
      const [a, b] = part.split(/\s+as\s+/i).map((s) => s.trim());
      const exp = (b ?? a ?? "").replace(/[^A-Za-z0-9_$]/g, "");
      const loc = (a ?? "").replace(/[^A-Za-z0-9_$]/g, "");
      if (exp) types.add(exp);
      if (loc && loc !== exp) types.add(loc);
    }
  }
  while ((m = valueRe.exec(content)) !== null) {
    // Skip if this is actually "export type {" already handled – lookbehind check
    const before = content.slice(Math.max(0, (m.index ?? 0) - 20), m.index ?? 0);
    if (/\btype\s*$/.test(before)) continue;
    for (const part of (m[1] ?? "").split(",")) {
      if (!part.trim()) continue;
      if (/^\s*type\s+/i.test(part)) {
        const clean = part
          .replace(/^\s*type\s+/i, "")
          .trim()
          .replace(/[^A-Za-z0-9_$]/g, "");
        if (clean) types.add(clean);
        continue;
      }
      const [a, b] = part.split(/\s+as\s+/i).map((s) => s.trim());
      const exp = (b ?? a ?? "").replace(/[^A-Za-z0-9_$]/g, "");
      const loc = (a ?? "").replace(/[^A-Za-z0-9_$]/g, "");
      if (exp) values.add(exp);
      if (loc && loc !== exp) values.add(loc);
    }
  }
  return { values, types };
}

export function extractExportsAst(content: string): ExportList {
  const vals = new Set<string>();
  const typs = new Set<string>();
  try {
    const result = oxcParseSync("index.ts", content, { sourceType: "module" });
    for (const stmt of result.program.body as unknown as Array<Record<string, unknown>>) {
      if (stmt.type !== "ExportNamedDeclaration") continue;
      const exportKind = (stmt as { exportKind?: string }).exportKind;
      const specs = (stmt as { specifiers?: Array<Record<string, unknown>> }).specifiers ?? [];
      for (const spec of specs) {
        const exported = (spec.exported as { name?: string } | undefined)?.name;
        const local = (spec.local as { name?: string } | undefined)?.name;
        const cand = exported ?? local;
        if (!cand) continue;
        const kind = (spec as { exportKind?: string }).exportKind ?? exportKind;
        if (kind === "type") typs.add(cand);
        else vals.add(cand);
        if (local && local !== cand) {
          if (kind === "type") typs.add(local);
          else vals.add(local);
        }
      }
    }
  } catch {
    // fallback below
  }
  try {
    const fb = regexExports(content);
    for (const v of fb.values) vals.add(v);
    for (const t of fb.types) {
      typs.add(t);
      vals.delete(t);
    }
  } catch {}
  return { values: [...vals], types: [...typs] };
}

export function parseUseCaseFile(
  cwd: string,
  moduleName: string,
): { content: string; exports: ExportList; filePath: string } {
  const filePath = `${cwd}/packages/modules/src/${moduleName}/application/index.ts`;
  let content = "";
  try {
    content = readFileSync(filePath, "utf-8");
  } catch {}
  return { content, exports: extractExportsAst(content), filePath };
}

export function resolveUseCaseExport(
  exports: { values: string[] | Set<string>; types: string[] | Set<string> },
  moduleName: string,
  name: string,
): { exportName: string; filePath: string; functionName: string; inputName: string } {
  const pascal = pascalCase(name);
  const values = exports.values instanceof Set ? exports.values : new Set(exports.values);
  const types = exports.types instanceof Set ? exports.types : new Set(exports.types);
  for (const kind of ["Command", "Query"] as const) {
    const fn = `${pascal}${kind}UseCase`;
    const input = `${pascal}Input`;
    if (values.has(fn) && types.has(input)) {
      return {
        exportName: fn,
        filePath: `packages/modules/src/${moduleName}/application/${name}.${kind.toLowerCase()}.ts`,
        functionName: fn,
        inputName: input,
      };
    }
  }
  for (const v of values) {
    if (v.toLowerCase().includes(pascal.toLowerCase())) {
      return {
        exportName: v,
        filePath: `packages/modules/src/${moduleName}/application/${name}.ts`,
        functionName: v,
        inputName: `${pascal}Input`,
      };
    }
  }
  throw new Error(
    `Module "${moduleName}" has no matching use-case export for "${name}". ` +
      `Create the use-case first with: ghostinit add use-case ${moduleName} ${name} --kind <command|query>`,
  );
}

export function resolveUseCaseFromCwd(
  cwd: string,
  moduleName: string,
  name: string,
): {
  functionName: string;
  inputName: string;
  content: string;
  filePath: string;
  exportName: string;
} {
  const { content, exports, filePath: indexPath } = parseUseCaseFile(cwd, moduleName);
  try {
    const r = resolveUseCaseExport(exports, moduleName, name);
    return { ...r, content, filePath: indexPath };
  } catch {
    // regex fallback directly on content for edge cases
    const pascal = pascalCase(name);
    for (const kind of ["Command", "Query"] as const) {
      const fn = `${pascal}${kind}UseCase`;
      const input = `${pascal}Input`;
      const vRe = new RegExp(`export\\s+\\{[^}]*\\b${fn}\\b[^}]*\\}`);
      const tRe = new RegExp(`export\\s+type\\s+\\{[^}]*\\b${input}\\b[^}]*\\}`);
      if (vRe.test(content) && tRe.test(content)) {
        return { functionName: fn, inputName: input, content, filePath: indexPath, exportName: fn };
      }
    }
    throw new Error(
      `Module "${moduleName}" has no matching use-case export for "${name}". ` +
        `Create the use-case first with: ghostinit add use-case ${moduleName} ${name} --kind <command|query>`,
    );
  }
}

export interface GenerationContext {
  cwd: string;
  tx: FsTransaction;
  options: GlobalOptions;
}

export function nameFromKebab(name: string): string {
  return name.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

export function camelCaseFromKebab(name: string): string {
  return name
    .split("-")
    .map((part, idx) => {
      if (idx === 0) return part;
      if (!part) return "";
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join("");
}

export function pascalCase(name: string): string {
  return name
    .split(/[-_]/)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join("");
}

export function toSafeIdentifier(name: string): string {
  const parts = name.split(/[-_]/).filter(Boolean);
  if (parts.length === 0) return "_table";
  const camel = parts
    .map((part, idx) => {
      const cleaned = part.replace(/[^A-Za-z0-9_$]/g, "");
      if (!cleaned) return "";
      if (idx === 0) return cleaned.charAt(0).toLowerCase() + cleaned.slice(1);
      return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    })
    .join("");
  const withoutInvalid = camel.replace(/[^A-Za-z0-9_$]/g, "");
  if (!withoutInvalid) return "_table";
  return /^[0-9]/.test(withoutInvalid) ? `_${withoutInvalid}` : withoutInvalid;
}

export async function prepareGeneration(
  cwd: string,
  options: GlobalOptions,
): Promise<GenerationContext> {
  const tx = new FsTransaction(cwd);
  return { cwd, tx, options };
}

export async function commitGeneration(ctx: GenerationContext): Promise<void> {
  const state = await loadState(ctx.cwd);
  if (!state) throw new Error("No GhostInit project state found");
  const staged = ctx.tx.getStagedFiles();
  if (staged.length === 0) return;
  const checksums = staged.map(({ path, content }) => relativeChecksum(ctx.cwd, path, content));
  const { written } = await ctx.tx.commit();
  if (written.length === 0) return;
  try {
    await saveState(ctx.cwd, state.project, checksums, state.modules, state.procedures);
  } catch (err) {
    try {
      await ctx.tx.rollback();
    } catch {}
    throw err;
  }
}
