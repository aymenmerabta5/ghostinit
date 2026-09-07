import { existsSync } from "node:fs";
import {
  commitGeneration,
  nameFromKebab,
  prepareGeneration,
  resolveUseCaseFromCwd,
} from "./shared.js";
import type { GenerationExecution } from "./shared.js";
import { validateArtifactName } from "../lib/reserved.js";
import { ValidationError } from "../lib/errors.js";
import type { GlobalOptions } from "../commands/types.js";

export async function generateProcedure(
  cwd: string,
  moduleName: string,
  procedureName: string,
  options: GlobalOptions,
  execution: GenerationExecution = {},
): Promise<boolean> {
  const moduleCheck = validateArtifactName(moduleName, "module name");
  if (!moduleCheck.valid) throw new Error(moduleCheck.reason);
  const procedureCheck = validateArtifactName(procedureName, "procedure name");
  if (!procedureCheck.valid) throw new Error(procedureCheck.reason);

  const ctx = await prepareGeneration(cwd, options, execution);
  if (
    !ctx.layout.apiEnabled ||
    !existsSync(`${cwd}/${ctx.layout.apiRoot}/contract.ts`) ||
    !existsSync(`${cwd}/${ctx.layout.apiRoot}/router.ts`)
  ) {
    throw new ValidationError(
      "This project has API transport disabled. Enable --with-api before adding a procedure.",
    );
  }
  const fileName = `${procedureName}.ts`;
  const filePath = `${ctx.layout.apiRoot}/procedures/${fileName}`;

  if (existsSync(`${cwd}/${filePath}`)) return true;

  const identifier = nameFromKebab(procedureName);
  const useCase = resolveUseCaseFromCwd(cwd, moduleName, procedureName, ctx.layout.moduleRoot);
  const moduleImport = `${ctx.layout.moduleImportPrefix}/${moduleName}`;
  const errorCodeImport =
    ctx.layout.mode === "monorepo" ? 'import { ErrorCode } from "@repo/contracts";\n' : "";
  const internalErrorCode =
    ctx.layout.mode === "monorepo" ? "ErrorCode.INTERNAL_ERROR" : '"INTERNAL_SERVER_ERROR"';

  await ctx.tx.write(
    filePath,
    `import { oc } from "@orpc/contract";
import { implement, ORPCError } from "@orpc/server";
import { z } from "zod";
import { ${useCase.functionName}, type ${useCase.inputName} } from "${moduleImport}";
import type { ApiContext } from "../context";
${errorCodeImport}

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
    ${internalErrorCode},
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
