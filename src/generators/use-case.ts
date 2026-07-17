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

  if (existingFile && existingIndex.includes(newExport) && existingIndex.includes(newTypeExport)) {
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

  const addValueExports = !existingIndex.includes(newExport);
  const addTypeExports = !existingIndex.includes(newTypeExport);
  if (addValueExports || addTypeExports) {
    const suffix = [addValueExports ? newExport : "", addTypeExports ? newTypeExport : ""]
      .filter(Boolean)
      .join("\n");
    await ctx.tx.write(
      indexPath,
      existingIndex
        ? dedupeExports(`${existingIndex.replace(/\n+$/, "")}\n${suffix}\n`)
        : `// Application use-cases for ${moduleName}\n${suffix}\n`,
    );
  }

  function dedupeExports(content: string): string {
    const lines = content.split("\n");
    const seen = new Set<string>();
    const out = [];
    for (const line of lines) {
      if (line.startsWith("export { ") || line.startsWith("export type ")) {
        if (seen.has(line)) continue;
        seen.add(line);
      }
      out.push(line);
    }
    return out.join("\n") + "\n";
  }

  await commitGeneration(ctx);
  return false;
}
