import { existsSync } from "node:fs";
import {
  commitGeneration,
  nameFromKebab,
  prepareGeneration,
  resolveUseCaseFromCwd,
} from "./shared.js";
import { validateArtifactName } from "../lib/reserved.js";
import type { GlobalOptions } from "../commands/types.js";

export async function generateProcedure(
  cwd: string,
  moduleName: string,
  procedureName: string,
  options: GlobalOptions,
): Promise<boolean> {
  const moduleCheck = validateArtifactName(moduleName, "module name");
  if (!moduleCheck.valid) throw new Error(moduleCheck.reason);
  const procedureCheck = validateArtifactName(procedureName, "procedure name");
  if (!procedureCheck.valid) throw new Error(procedureCheck.reason);

  const ctx = await prepareGeneration(cwd, options);
  const fileName = `${procedureName}.ts`;
  const filePath = `packages/api/src/procedures/${fileName}`;

  if (existsSync(`${cwd}/${filePath}`)) return true;

  const identifier = nameFromKebab(procedureName);
  const useCase = resolveUseCaseFromCwd(cwd, moduleName, procedureName);

  await ctx.tx.write(
    filePath,
    `import { oc } from "@orpc/contract";
import { implement, ORPCError } from "@orpc/server";
import { z } from "zod";
import { ${useCase.functionName}, type ${useCase.inputName} } from "@repo/modules/${moduleName}";
import type { ApiContext } from "../context";
import { ErrorCode } from "@repo/contracts";

// InputSchema validates base fields and passthrough for forward-compat with ${useCase.inputName} extensions.
const InputSchema = z
  .object({
    id: z.string().min(1),
  })
  .passthrough();

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
      const useCaseInput: ${useCase.inputName} = { ...input } as ${useCase.inputName};
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
