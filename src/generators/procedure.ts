import { existsSync, readFileSync } from "node:fs";
import { commitGeneration, nameFromKebab, pascalCase, prepareGeneration } from "./shared.js";
import { validateArtifactName } from "../lib/reserved.js";
import type { GlobalOptions } from "../commands/types.js";

function resolveUseCaseExport(
  cwd: string,
  moduleName: string,
  procedureName: string,
): { functionName: string; inputName: string } {
  const pascal = pascalCase(procedureName);
  const indexPath = `${cwd}/packages/modules/src/${moduleName}/application/index.ts`;
  let indexContent = "";
  try {
    indexContent = readFileSync(indexPath, "utf-8");
  } catch {
    // Leave empty; the error below will be thrown.
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
    `Module "${moduleName}" has no matching use-case export for "${procedureName}". ` +
      `Create the use-case first with: ghostinit add use-case ${moduleName} ${procedureName} --kind <command|query>`,
  );
}

export async function generateProcedure(
  cwd: string,
  moduleName: string,
  procedureName: string,
  options: GlobalOptions,
): Promise<boolean> {
  const moduleCheck = validateArtifactName(moduleName, "module name");
  if (!moduleCheck.valid) {
    throw new Error(moduleCheck.reason);
  }
  const procedureCheck = validateArtifactName(procedureName, "procedure name");
  if (!procedureCheck.valid) {
    throw new Error(procedureCheck.reason);
  }

  const ctx = await prepareGeneration(cwd, options);
  const fileName = `${procedureName}.ts`;
  const filePath = `packages/api/src/procedures/${fileName}`;

  if (existsSync(`${cwd}/${filePath}`)) {
    return true; // noop
  }

  const identifier = nameFromKebab(procedureName);
  const useCase = resolveUseCaseExport(cwd, moduleName, procedureName);

  await ctx.tx.write(
    filePath,
    `import { oc } from "@orpc/contract";
import { implement, ORPCError } from "@orpc/server";
import { z } from "zod";
import { ${useCase.functionName}, type ${useCase.inputName} } from "@repo/modules/${moduleName}";
import type { ApiContext } from "../context";
import { ErrorCode } from "@repo/contracts";

const InputSchema = z.object({
  id: z.string().min(1),
});

const OutputSchema = z.object({
  id: z.string(),
  processed: z.boolean(),
});

const contract = {
  ${identifier}: oc
    .route({ method: "POST", path: "/${moduleName}/${procedureName}" })
    .input(InputSchema)
    .output(OutputSchema),
};

export const ${identifier}Contract = contract.${identifier};

const implementer = implement<typeof contract, ApiContext>(contract);

function mapError(cause: unknown): ORPCError<string, unknown> {
  return new ORPCError(
    ErrorCode.INTERNAL_ERROR,
    { message: cause instanceof Error ? cause.message : String(cause) },
  );
}

export const ${identifier} = implementer.${identifier}.handler(
  async ({ input }) => {
    try {
      const useCaseInput: ${useCase.inputName} = { id: input.id };
      const result = await ${useCase.functionName}(useCaseInput, {});
      return { id: result.id, processed: true };
    } catch (cause) {
      throw mapError(cause);
    }
  },
);
`,
  );

  await commitGeneration(ctx);
  return false;
}
