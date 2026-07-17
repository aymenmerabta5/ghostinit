import { existsSync, readFileSync } from "node:fs";
import { prepareGeneration, commitGeneration, pascalCase } from "./shared.js";
import { validateArtifactName } from "../lib/reserved.js";
import type { GlobalOptions } from "../commands/types.js";

function resolveUseCaseExport(
  cwd: string,
  moduleName: string,
  actionName: string,
): { functionName: string; inputName: string } {
  const pascal = pascalCase(actionName);
  const indexPath = `${cwd}/packages/modules/src/${moduleName}/application/index.ts`;
  let indexContent = "";
  try {
    indexContent = readFileSync(indexPath, "utf-8");
  } catch {
    // Leave empty; error below will be thrown.
  }

  for (const kind of ["Command", "Query"]) {
    const functionName = `${pascal}${kind}UseCase`;
    const inputName = `${pascal}Input`;
    const valueRe = new RegExp(`export\\s+\\{[^}]*\\b${functionName}\\b[^}]*\\}`);
    const typeRe = new RegExp(`export\\s+type\\s+\\{[^}]*\\b${inputName}\\b[^}]*\\}`);
    if (valueRe.test(indexContent) && typeRe.test(indexContent)) {
      return { functionName, inputName };
    }
  }

  throw new Error(
    `Module "${moduleName}" has no matching use-case export for "${actionName}". ` +
      `Create the use-case first with: ghostinit add use-case ${moduleName} ${actionName} --kind <command|query>`,
  );
}

export async function generateAction(
  cwd: string,
  moduleName: string,
  actionName: string,
  options: GlobalOptions,
): Promise<boolean> {
  const moduleCheck = validateArtifactName(moduleName, "module name");
  if (!moduleCheck.valid) {
    throw new Error(moduleCheck.reason);
  }
  const actionCheck = validateArtifactName(actionName, "action name");
  if (!actionCheck.valid) {
    throw new Error(actionCheck.reason);
  }

  const filePath = `apps/web/src/actions/${moduleName}/${actionName}.ts`;
  if (existsSync(`${cwd}/${filePath}`)) {
    return true; // noop
  }

  const ctx = await prepareGeneration(cwd, options);
  const pascal = pascalCase(actionName);
  const useCase = resolveUseCaseExport(cwd, moduleName, actionName);

  await ctx.tx.write(
    filePath,
    `"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ${useCase.functionName}, type ${useCase.inputName} } from "@repo/modules/${moduleName}";
import { ErrorCode } from "@repo/contracts";

const InputSchema = z.object({
  id: z.string().min(1),
});

export interface ${pascal}ActionData {
  id: string;
}

export type ${pascal}ActionResult =
  | { ok: true; data: ${pascal}ActionData }
  | { ok: false; error: string };

function mapError(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export async function ${pascal}Action(rawInput: unknown): Promise<${pascal}ActionResult> {
  const parseResult = InputSchema.safeParse(rawInput);
  if (!parseResult.success) {
    return { ok: false, error: ErrorCode.VALIDATION_ERROR };
  }

  try {
    const input: ${useCase.inputName} = { id: parseResult.data.id };
    const result = await ${useCase.functionName}(input, {});
    revalidatePath("/${moduleName}");
    return { ok: true, data: { id: result.id } };
  } catch (cause) {
    return { ok: false, error: mapError(cause) };
  }
}
`,
  );

  await commitGeneration(ctx);
  return false;
}
