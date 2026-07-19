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
      `import { auth } from "@repo/auth";

export interface ApiContext {
  user?: {
    id: string;
    email: string;
    name?: string | null;
  };
}

export async function createContext(headers: Headers): Promise<ApiContext> {
  const session = await auth.api.getSession({ headers });
  if (!session?.user) {
    return {};
  }
  return {
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
    },
  };
}
`,
    ),
    file(
      "packages/api/src/procedures/health.ts",
      `import { oc } from "@orpc/contract";
import { implement } from "@orpc/server";
import { z } from "zod";
import type { ApiContext } from "../context.js";

// Pure oRPC only - oc.route per Context7 /dinwwwh/orpc
const contract = {
  health: oc
    .route({ method: "GET", path: "/health" })
    .output(z.object({ status: z.literal("ok"), time: z.string().datetime() })),
};

export const healthContract = contract.health;

const implementer = implement<typeof contract, ApiContext>(contract);

export const health = implementer.health.handler(async () => ({
  status: "ok" as const,
  time: new Date().toISOString(),
}));
`,
    ),
    file(
      "packages/api/src/procedures/me.ts",
      `import { oc } from "@orpc/contract";
import { implement } from "@orpc/server";
import { z } from "zod";
import type { ApiContext } from "../context.js";

// Pure oRPC only - oc.route + implement + authenticated context auth.api.getSession

const contract = {
  me: oc
    .route({ method: "GET", path: "/me" })
    .output(
      z.object({
        user: z
          .object({
            id: z.string(),
            email: z.string(),
            name: z.string().nullable(),
          })
          .nullable(),
      }),
    ),
};

export const meContract = contract.me;

const implementer = implement<typeof contract, ApiContext>(contract);

export const me = implementer.me.handler(async ({ context }) => {
  const user = context.user;
  return {
    user: user ? { id: user.id, email: user.email, name: user.name ?? null } : null,
  };
});
`,
    ),
    file(
      "packages/api/src/contract.ts",
      `import { healthContract } from "./procedures/health";
import { meContract } from "./procedures/me";

export const appContract = {
  health: healthContract,
  me: meContract,
};
`,
    ),
    file(
      "packages/api/src/router.ts",
      `import { implement, os } from "@orpc/server";
import { appContract } from "./contract";
import { health } from "./procedures/health";
import { me } from "./procedures/me";
import type { ApiContext } from "./context";

const implementer = implement<typeof appContract, ApiContext>(appContract);

export const appRouter = os.prefix("/api").router(
  implementer.router({
    health,
    me,
  }),
);
`,
    ),
    file(
      "packages/api/src/index.ts",
      `export { appRouter } from "./router.js";
export { appContract } from "./contract.js";
export { createContext, type ApiContext } from "./context.js";
`,
    ),
    file(
      "packages/api/src/openapi.ts",
      `import { OpenAPIGenerator } from "@orpc/openapi";
import { ZodToJsonSchemaConverter } from "@orpc/zod";
import { appRouter } from "./router.js";

// Context7 verified: /dinwwwh/orpc OpenAPIGenerator with converters [ZodToJsonSchemaConverter] generates spec from router
// oRPC contract-first, os.prefix("/api") + oc.route
// Source: https://context7.com/dinwwwh/orpc - OpenAPIGenerator converters pattern

export async function generateOpenAPISpec(): Promise<unknown> {
  const generator = new OpenAPIGenerator({
    converters: [new ZodToJsonSchemaConverter()],
  });
  return generator.generate(appRouter, {
    info: { title: "GhostInit API", version: "0.1.0" },
    servers: [{ url: "http://localhost:3000/api" }],
  });
}
`,
    ),
  ];
}
