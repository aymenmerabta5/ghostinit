import { codeScripts, file, packageJson, tsconfig, type TemplateFile } from "./shared.js";
import * as v from "./versions.js";

export function apiPackage(): TemplateFile[] {
  return [
    file(
      "packages/api/package.json",
      packageJson({
        name: "@repo/api",
        scripts: codeScripts(),
        exports: {
          ".": "./src/index.ts",
          "./openapi": "./src/openapi.ts",
        },
        dependencies: {
          "@orpc/server": `^${v.orpc["@orpc/server"]}`,
          "@orpc/contract": `^${v.orpc["@orpc/contract"]}`,
          "@orpc/client": `^${v.orpc["@orpc/client"]}`,
          "@orpc/openapi": `^${v.orpc["@orpc/openapi"]}`,
          "@orpc/zod": `^${v.orpc["@orpc/zod"]}`,
          "@repo/auth": "workspace:*",
          "@repo/config": "workspace:*",
          "@repo/contracts": "workspace:*",
          "@repo/database": "workspace:*",
          "@repo/modules": "workspace:*",
          zod: `^${v.validation.zod}`,
        },
        devDependencies: {
          typescript: `^${v.typescript.typescript}`,
        },
      }),
    ),
    file("packages/api/tsconfig.json", tsconfig({ include: ["src/**/*"] })),
    file(
      "packages/api/src/context.ts",
      `import { auth } from "@repo/auth";\n\nexport interface ApiContext {\n  user?: {\n    id: string;\n    email: string;\n    name?: string | null;\n  };\n}\n\nexport async function createContext(headers: Headers): Promise<ApiContext> {\n  const session = await auth.api.getSession({ headers });\n  if (!session?.user) {\n    return {};\n  }\n  return {\n    user: {\n      id: session.user.id,\n      email: session.user.email,\n      name: session.user.name,\n    },\n  };\n}\n`,
    ),
    file(
      "packages/api/src/procedures/health.ts",
      `import { oc } from "@orpc/contract";\nimport { implement } from "@orpc/server";\nimport { z } from "zod";\nimport type { ApiContext } from "../context.js";\n\nconst contract = {\n  health: oc\n    .route({ method: "GET", path: "/health" })\n    .output(z.object({ status: z.literal("ok"), time: z.string().datetime() })),\n};\n\nexport const healthContract = contract.health;\n\nconst implementer = implement<typeof contract, ApiContext>(contract);\n\nexport const health = implementer.health.handler(async () => ({\n  status: "ok" as const,\n  time: new Date().toISOString(),\n}));\n`,
    ),
    file(
      "packages/api/src/procedures/me.ts",
      `import { oc } from "@orpc/contract";\nimport { implement } from "@orpc/server";\nimport { z } from "zod";\nimport type { ApiContext } from "../context.js";\n\nconst contract = {\n  me: oc\n    .route({ method: "GET", path: "/me" })\n    .output(\n      z.object({\n        user: z\n          .object({\n            id: z.string(),\n            email: z.string(),\n            name: z.string().nullable(),\n          })\n          .nullable(),\n      }),\n    ),\n};\n\nexport const meContract = contract.me;\n\nconst implementer = implement<typeof contract, ApiContext>(contract);\n\nexport const me = implementer.me.handler(async ({ context }) => {\n  const user = context.user;\n  return {\n    user: user ? { id: user.id, email: user.email, name: user.name ?? null } : null,\n  };\n});\n`,
    ),
    file(
      "packages/api/src/contract.ts",
      `import { healthContract } from "./procedures/health.js";\nimport { meContract } from "./procedures/me.js";\n\nexport const appContract = {\n  health: healthContract,\n  me: meContract,\n};\n`,
    ),
    file(
      "packages/api/src/router.ts",
      `import { implement, os } from "@orpc/server";\nimport { appContract } from "./contract";\nimport { health } from "./procedures/health";\nimport { me } from "./procedures/me";\nimport type { ApiContext } from "./context";\n\nconst implementer = implement<typeof appContract, ApiContext>(appContract);\n\nexport const appRouter = os.prefix("/api").router(
  implementer.router({
    health,
    me,
  }),
);\n`,
    ),
    file(
      "packages/api/src/index.ts",
      `export { appRouter } from "./router.js";\nexport { appContract } from "./contract.js";\nexport { createContext, type ApiContext } from "./context.js";\n`,
    ),
    file(
      "packages/api/src/openapi.ts",
      `import { OpenAPIGenerator } from "@orpc/openapi";\nimport { ZodToJsonSchemaConverter } from "@orpc/zod";\nimport { appRouter } from "./router.js";\n\nexport async function generateOpenAPISpec(): Promise<unknown> {\n  const generator = new OpenAPIGenerator({\n    schemaConverters: [new ZodToJsonSchemaConverter()],\n  });\n  return generator.generate(appRouter, {\n    info: { title: "GhostInit API", version: "0.1.0" },\n    servers: [{ url: "http://localhost:3000/api" }],\n  });\n}\n`,
    ),
  ];
}
