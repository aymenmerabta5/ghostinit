import { existsSync } from "node:fs";
import {
  commitGeneration,
  pascalCase,
  prepareGeneration,
  resolveUseCaseFromCwd,
} from "./shared.js";
import type { GenerationExecution } from "./shared.js";
import { validateArtifactName } from "../lib/reserved.js";
import { ValidationError } from "../lib/errors.js";
import type { GlobalOptions } from "../commands/types.js";

export async function generateAction(
  cwd: string,
  moduleName: string,
  actionName: string,
  options: GlobalOptions,
  execution: GenerationExecution = {},
): Promise<boolean> {
  const moduleCheck = validateArtifactName(moduleName, "module name");
  if (!moduleCheck.valid) throw new Error(moduleCheck.reason);
  const actionCheck = validateArtifactName(actionName, "action name");
  if (!actionCheck.valid) throw new Error(actionCheck.reason);

  const ctx = await prepareGeneration(cwd, options, execution);
  if (ctx.layout.framework !== "nextjs" || !ctx.state.project.apps.includes("web")) {
    throw new ValidationError(
      "Server actions require a Next.js web app. Use `add procedure` for other targets.",
    );
  }
  const filePath = `${ctx.layout.actionRoot}/${moduleName}/${actionName}.ts`;
  if (existsSync(`${cwd}/${filePath}`)) return true;

  const pascal = pascalCase(actionName);
  const useCase = resolveUseCaseFromCwd(cwd, moduleName, actionName, ctx.layout.moduleRoot);
  const moduleImport = `${ctx.layout.moduleImportPrefix}/${moduleName}`;
  const errorCodeImport =
    ctx.layout.mode === "monorepo" ? 'import { ErrorCode } from "@repo/contracts";\n' : "";
  const validationError =
    ctx.layout.mode === "monorepo" ? "ErrorCode.VALIDATION_ERROR" : '"VALIDATION_ERROR"';

  await ctx.tx.write(
    filePath,
    `"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ${useCase.functionName}, type ${useCase.inputName} } from "${moduleImport}";
${errorCodeImport}

// InputSchema validates base fields and passthrough for forward-compat with ${useCase.inputName} extensions.
const InputSchema = z
  .object({
    id: z.string().min(1),
  })
  .passthrough();

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
    return { ok: false, error: ${validationError} };
  }

  try {
    const input: ${useCase.inputName} = {
      ...parseResult.data,
    } as ${useCase.inputName};
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
