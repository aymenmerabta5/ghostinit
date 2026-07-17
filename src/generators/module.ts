import { existsSync } from "node:fs";
import { pascalCase, prepareGeneration, commitGeneration } from "./shared.js";
import { validateArtifactName } from "../lib/reserved.js";
import type { GlobalOptions } from "../commands/types.js";

export async function generateModule(
  cwd: string,
  name: string,
  options: GlobalOptions,
): Promise<boolean> {
  const check = validateArtifactName(name, "module name");
  if (!check.valid) {
    throw new Error(check.reason);
  }

  const moduleDir = `packages/modules/src/${name}`;
  if (existsSync(`${cwd}/${moduleDir}`)) {
    return true; // noop
  }

  const ctx = await prepareGeneration(cwd, options);
  const pascal = pascalCase(name);

  await ctx.tx.write(
    `${moduleDir}/domain/types.ts`,
    `export interface ${pascal}Entity {
  id: string;
}
`,
  );
  await ctx.tx.write(
    `${moduleDir}/domain/index.ts`,
    `export { type ${pascal}Entity } from "./types";
`,
  );
  await ctx.tx.write(
    `${moduleDir}/application/index.ts`,
    `// Application use-cases for ${name}
export const ${pascal}ApplicationVersion = 1;
`,
  );
  await ctx.tx.write(
    `${moduleDir}/ports/index.ts`,
    `// Driven/driving ports for ${name}
export interface ${pascal}Port {
  id: string;
}
`,
  );
  await ctx.tx.write(
    `${moduleDir}/infrastructure/database/schema.ts`,
    `// ${name} module database schema (registered in packages/database/src/schema/index.ts on sync)
export const ${pascal}SchemaVersion = 1;
`,
  );
  await ctx.tx.write(
    `${moduleDir}/index.ts`,
    `export * from "./domain/index";
export * from "./application/index";
export type * from "./ports/index";
`,
  );

  await ctx.tx.write(
    `packages/modules/tests/${name}/domain-types.test.ts`,
    `import { describe, it, expect } from "bun:test";
import { type ${pascal}Entity } from "../../src/${name}/domain/types";

describe("${name} domain types", () => {
  it("compiles", () => {
    const entity: ${pascal}Entity = { id: "1" };
    expect(entity.id).toBe("1");
  });
});
`,
  );

  await commitGeneration(ctx);
  return false;
}
