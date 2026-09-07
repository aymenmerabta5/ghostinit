import { existsSync } from "node:fs";
import { pascalCase, prepareGeneration, commitGeneration, toSafeIdentifier } from "./shared.js";
import type { GenerationExecution } from "./shared.js";
import { validateArtifactName } from "../lib/reserved.js";
import type { GlobalOptions } from "../commands/types.js";

export async function generateModule(
  cwd: string,
  name: string,
  options: GlobalOptions,
  execution: GenerationExecution = {},
): Promise<boolean> {
  const check = validateArtifactName(name, "module name");
  if (!check.valid) {
    throw new Error(check.reason);
  }

  const ctx = await prepareGeneration(cwd, options, execution);
  const moduleDir = `${ctx.layout.moduleRoot}/${name}`;
  if (existsSync(`${cwd}/${moduleDir}`)) {
    return true; // noop
  }

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
  if (ctx.layout.schemaRoot) {
    const tableNameSql = name.endsWith("s") ? name : `${name}s`;
    const tableVarName = toSafeIdentifier(tableNameSql);
    await ctx.tx.write(
      `${ctx.layout.schemaRoot}/${name}.ts`,
      `import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./auth";

export const ${tableVarName} = pgTable("${tableNameSql}", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
`,
    );
  }
  await ctx.tx.write(
    `${moduleDir}/index.ts`,
    `export type { ${pascal}Entity } from "./domain/index";
export { ${pascal}ApplicationVersion } from "./application/index";
export type { ${pascal}Port } from "./ports/index";
`,
  );

  await ctx.tx.write(
    `${ctx.layout.moduleTestsRoot}/${name}/domain-types.test.ts`,
    `import { describe, it, expect } from "bun:test";
import { type ${pascal}Entity } from "${
      ctx.layout.mode === "single"
        ? `@/server/modules/${name}/domain/types`
        : `../../src/${name}/domain/types`
    }";

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
