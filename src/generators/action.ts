import { existsSync } from "node:fs";
import {
  commitGeneration,
  pascalCase,
  prepareGeneration,
  resolveUseCaseFromCwd,
} from "./shared.js";
import { validateArtifactName } from "../lib/reserved.js";
import type { GlobalOptions } from "../commands/types.js";

export async function generateAction(
  cwd: string,
  moduleName: string,
  actionName: string,
  options: GlobalOptions,
): Promise<boolean> {
  const moduleCheck = validateArtifactName(moduleName, "module name");
  if (!moduleCheck.valid) throw new Error(moduleCheck.reason);
  const actionCheck = validateArtifactName(actionName, "action name");
  if (!actionCheck.valid) throw new Error(actionCheck.reason);

  const filePath = `apps/web/src/actions/${moduleName}/${actionName}.ts`;
  if (existsSync(`${cwd}/${filePath}`)) return true;

  const ctx = await prepareGeneration(cwd, options);
  const pascal = pascalCase(actionName);
  const useCase = resolveUseCaseFromCwd(cwd, moduleName, actionName);

  await ctx.tx.write(
    filePath,
    `"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ${useCase.functionName}, type ${useCase.inputName} } from "@repo/modules/${moduleName}";
import { ErrorCode } from "@repo/contracts";

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
    return { ok: false, error: ErrorCode.VALIDATION_ERROR };
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
