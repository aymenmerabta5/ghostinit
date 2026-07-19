import { existsSync } from "node:fs";
import { pascalCase, prepareGeneration, commitGeneration } from "./shared.js";
import { validateArtifactName } from "../lib/reserved.js";
import type { GlobalOptions } from "../commands/types.js";

export async function generateUseCase(
  cwd: string,
  moduleName: string,
  useCaseName: string,
  kind: "command" | "query",
  options: GlobalOptions,
): Promise<boolean> {
  const moduleCheck = validateArtifactName(moduleName, "module name");
  if (!moduleCheck.valid) {
    throw new Error(moduleCheck.reason);
  }
  const useCaseCheck = validateArtifactName(useCaseName, "use-case name");
  if (!useCaseCheck.valid) {
    throw new Error(useCaseCheck.reason);
  }
  if (kind !== "command" && kind !== "query") {
    throw new Error(`Invalid use-case kind: ${kind}. Use "command" or "query".`);
  }

  const ctx = await prepareGeneration(cwd, options);
  const pascalUseCase = pascalCase(useCaseName);
  const kindPascal = kind === "command" ? "Command" : "Query";
  const functionName = `${pascalUseCase}${kindPascal}UseCase`;
  const fileName = `${useCaseName}.${kind}.ts`;
  const filePath = `packages/modules/src/${moduleName}/application/${fileName}`;
  const indexPath = `packages/modules/src/${moduleName}/application/index.ts`;

  const existingFile = existsSync(`${cwd}/${filePath}`);
  const existingIndex = (await ctx.tx.readText(indexPath)) ?? "";
  const newExport = `export { ${functionName} } from "./${useCaseName}.${kind}";`;
  const newTypeExport = `export type { ${pascalUseCase}Input, ${pascalUseCase}Output, ${pascalUseCase}Deps, ${pascalUseCase}UseCase } from "./${useCaseName}.${kind}";`;

  if (
    existingFile &&
    hasNormalizedExport(existingIndex, newExport) &&
    hasNormalizedExport(existingIndex, newTypeExport)
  ) {
    return true; // noop
  }

  if (!existingFile) {
    await ctx.tx.write(
      filePath,
      `export interface ${pascalUseCase}Input {
  id: string;
}

export interface ${pascalUseCase}Output {
  id: string;
}

export interface ${pascalUseCase}Deps {}

export type ${pascalUseCase}UseCase = (
  input: ${pascalUseCase}Input,
  deps: ${pascalUseCase}Deps,
) => Promise<${pascalUseCase}Output>;

export async function ${functionName}(
  input: ${pascalUseCase}Input,
  _deps: ${pascalUseCase}Deps,
): Promise<${pascalUseCase}Output> {
  return { id: input.id };
}
`,
    );
  }

  const addValueExports = !hasNormalizedExport(existingIndex, newExport);
  const addTypeExports = !hasNormalizedExport(existingIndex, newTypeExport);
  if (addValueExports || addTypeExports) {
    const suffix = [addValueExports ? newExport : "", addTypeExports ? newTypeExport : ""]
      .filter(Boolean)
      .join("\n");
    const base = existingIndex ? existingIndex.trimEnd() : "";
    const combined = base
      ? `${base}\n${suffix}\n`
      : `// Application use-cases for ${moduleName}\n${suffix}\n`;
    await ctx.tx.write(indexPath, dedupeExports(combined));
  }

  function normalizeExportLine(line: string): string {
    // Trim, remove trailing semicolon (with optional surrounding whitespace), collapse interior whitespace
    const withoutSemi = line.trim().replace(/\s*;\s*$/, "");
    return withoutSemi.replace(/\s+/g, " ").trim();
  }

  function hasNormalizedExport(content: string, target: string): boolean {
    const normTarget = normalizeExportLine(target);
    if (!normTarget) return false;
    const lines = content.split("\n");
    for (const l of lines) {
      if (normalizeExportLine(l) === normTarget) {
        return true;
      }
    }
    return false;
  }

  function isExportLine(trimmedLine: string): boolean {
    return (
      trimmedLine.startsWith("export {") ||
      trimmedLine.startsWith("export type {") ||
      trimmedLine.startsWith("export type{") ||
      trimmedLine.startsWith("export{") ||
      trimmedLine.startsWith("export { ") ||
      trimmedLine.startsWith("export type ")
    );
  }

  function dedupeExports(content: string): string {
    const lines = content.split("\n");
    const seen = new Set<string>();
    const out: string[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (isExportLine(trimmed)) {
        const norm = normalizeExportLine(line);
        if (seen.has(norm)) continue;
        seen.add(norm);
      }
      out.push(line);
    }
    let result = out.join("\n");
    // Ensure file ends with exactly one newline, no extra blank lines stacking
    if (!result.endsWith("\n")) {
      result += "\n";
    } else {
      result = result.replace(/\n+$/, "\n");
    }
    return result;
  }

  await commitGeneration(ctx);
  return false;
}
