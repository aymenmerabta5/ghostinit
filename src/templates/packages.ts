import { codeScripts, file, packageJson, tsconfig, type TemplateFile } from "./shared.js";
import * as v from "./versions.js";

export function packageFiles(runtime: "node" | "bun" = "bun"): TemplateFile[] {
  return [
    // typescript-config
    file(
      "packages/typescript-config/package.json",
      packageJson({ name: "@repo/typescript-config", scripts: {}, private: true }),
    ),
    file(
      "packages/typescript-config/base.json",
      JSON.stringify(
        {
          compilerOptions: {
            target: "ES2024",
            module: "ESNext",
            moduleResolution: "bundler",
            lib: ["ES2024"],
            strict: true,
            esModuleInterop: true,
            skipLibCheck: true,
            forceConsistentCasingInFileNames: true,
            resolveJsonModule: true,
            declaration: true,
            declarationMap: true,
            sourceMap: true,
          },
        },
        null,
        2,
      ) + "\n",
    ),
    file(
      "packages/typescript-config/nextjs.json",
      JSON.stringify(
        {
          extends: "./base.json",
          compilerOptions: {
            jsx: "preserve",
            incremental: true,
            lib: ["ES2024", "DOM", "DOM.Iterable"],
            types: ["bun-types", "node"],
            noEmit: true,
            paths: { "@/*": ["./src/*"] },
          },
        },
        null,
        2,
      ) + "\n",
    ),

    // config
    file(
      "packages/config/package.json",
      packageJson({
        name: "@repo/config",
        exports: { ".": "./src/index.ts" },
        scripts: codeScripts(),
        dependencies: {
          "@t3-oss/env-nextjs": `^${v.validation["@t3-oss/env-nextjs"]}`,
          zod: `^${v.validation.zod}`,
        },
        devDependencies: {
          "@types/node": `^${v.runtime["@types/node"]}`,
          typescript: `^${v.typescript.typescript}`,
        },
      }),
    ),
    file(
      "packages/config/tsconfig.json",
      tsconfig({ include: ["src/**/*"], compilerOptions: { types: ["node"] } }),
    ),
    file(
      "packages/config/src/env.ts",
      `import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    APP_NAME: z.string().min(1).default("GhostInit App"),
    DATABASE_URL: z.string().min(1).optional(),
    POSTGRES_USER: z.string().min(1).default("postgres"),
    POSTGRES_PASSWORD: z.string().min(1),
    POSTGRES_HOST: z.string().min(1).default("localhost"),
    POSTGRES_PORT: z.string().regex(/^\\d+$/).default("5432"),
    POSTGRES_DB: z.string().min(1).default("ghostinit"),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.string().url(),
    DATABASE_SSL: z.enum(["true", "false"]).default("false"),
    DATABASE_SSL_CA: z.string().optional(),
    DATABASE_POOL_SIZE: z
      .string()
      .regex(/^\\d+$/)
      .default("20")
      .transform((s) => Number.parseInt(s, 10)),
  },
  client: {
    NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  },
  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    APP_NAME: process.env.APP_NAME,
    DATABASE_URL: process.env.DATABASE_URL,
    POSTGRES_USER: process.env.POSTGRES_USER,
    POSTGRES_PASSWORD: process.env.POSTGRES_PASSWORD,
    POSTGRES_HOST: process.env.POSTGRES_HOST,
    POSTGRES_PORT: process.env.POSTGRES_PORT,
    POSTGRES_DB: process.env.POSTGRES_DB,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    DATABASE_SSL: process.env.DATABASE_SSL,
    DATABASE_SSL_CA: process.env.DATABASE_SSL_CA,
    DATABASE_POOL_SIZE: process.env.DATABASE_POOL_SIZE,
  },
});

export type Env = typeof env;
`,
    ),
    file("packages/config/src/index.ts", `export { env, type Env } from "./env";\n`),

    // observability
    file(
      "packages/observability/package.json",
      packageJson({
        name: "@repo/observability",
        scripts: codeScripts(),
        devDependencies: {
          "@types/node": `^${v.runtime["@types/node"]}`,
          typescript: `^${v.typescript.typescript}`,
        },
      }),
    ),
    file(
      "packages/observability/tsconfig.json",
      tsconfig({ include: ["src/**/*"], compilerOptions: { types: ["node"] } }),
    ),
    file(
      "packages/observability/src/logger.ts",
      `export type LogLevel = "debug" | "info" | "warn" | "error";

export interface Logger {
  debug: (msg: string) => void;
  info: (msg: string) => void;
  warn: (msg: string) => void;
  error: (msg: string) => void;
}

function defaultLog(level: LogLevel, message: string): void {
  const line = JSON.stringify({ level, message, time: new Date().toISOString() });
  if (level === "error") {
    process.stderr.write(\`\${line}\\n\`);
  } else {
    process.stdout.write(\`\${line}\\n\`);
  }
}

export const logger: Logger = {
  debug: (msg) => defaultLog("debug", msg),
  info: (msg) => defaultLog("info", msg),
  warn: (msg) => defaultLog("warn", msg),
  error: (msg) => defaultLog("error", msg),
};
`,
    ),
    file(
      "packages/observability/src/request-id.ts",
      `import { randomUUID } from "node:crypto";

export function createRequestId(): string {
  return randomUUID();
}

export const REQUEST_ID_HEADER = "x-request-id";
`,
    ),
    file(
      "packages/observability/src/index.ts",
      `export { logger, type Logger } from "./logger.js";
export { createRequestId, REQUEST_ID_HEADER } from "./request-id.js";
`,
    ),

    // kernel
    file(
      "packages/kernel/package.json",
      packageJson({ name: "@repo/kernel", scripts: codeScripts() }),
    ),
    tsconfigFile("packages/kernel"),
    file(
      "packages/kernel/src/result.ts",
      `export type Result<T, E = Error> =\n  | { ok: true; value: T }\n  | { ok: false; error: E };\n\nexport function ok<T>(value: T): Result<T> {\n  return { ok: true, value };\n}\n\nexport function err<E = Error>(error: E): Result<never, E> {\n  return { ok: false, error };\n}\n`,
    ),
    file("packages/kernel/src/index.ts", `export * from "./result.js";\n`),

    // testing
    file(
      "packages/testing/package.json",
      packageJson({
        name: "@repo/testing",
        scripts: codeScripts({ test: runtime === "bun" ? "bun test" : "npm run test:unit" }),
        devDependencies: {
          ...(runtime === "bun" ? { "bun-types": `^${v.runtime.bun}` } : {}),
          typescript: `^${v.typescript.typescript}`,
        },
      }),
    ),
    file(
      "packages/testing/tsconfig.json",
      tsconfig({
        include: ["src/**/*"],
        compilerOptions: { types: runtime === "bun" ? ["bun-types"] : ["node"] },
      }),
    ),
    file(
      "packages/testing/src/index.ts",
      `export function mockAsync<T>(value: T): () => Promise<T> {\n  return async () => value;\n}\n`,
    ),
    file(
      "packages/testing/src/index.test.ts",
      runtime === "bun"
        ? `import { describe, it, expect } from "bun:test";\nimport { mockAsync } from "./index";\n\ndescribe("mockAsync", () => {\n  it("returns a function that resolves to the given value", async () => {\n    const fn = mockAsync("hello");\n    await expect(fn()).resolves.toBe("hello");\n  });\n});\n`
        : `import { describe, it, expect } from "vitest";\nimport { mockAsync } from "./index";\n\ndescribe("mockAsync", () => {\n  it("returns a function that resolves to the given value", async () => {\n    const fn = mockAsync("hello");\n    await expect(fn()).resolves.toBe("hello");\n  });\n});\n`,
    ),

    // workflows
    file(
      "packages/workflows/package.json",
      packageJson({ name: "@repo/workflows", scripts: codeScripts() }),
    ),
    tsconfigFile("packages/workflows"),
    file(
      "packages/workflows/src/index.ts",
      `export interface WorkflowStep<T> {\n  name: string;\n  run(ctx: T): Promise<T>;\n}\n\nexport async function runWorkflow<T>(initial: T, steps: WorkflowStep<T>[]): Promise<T> {\n  let ctx = initial;\n  for (const step of steps) {\n    ctx = await step.run(ctx);\n  }\n  return ctx;\n}\n`,
    ),

    // contracts
    file(
      "packages/contracts/package.json",
      packageJson({
        name: "@repo/contracts",
        scripts: codeScripts(),
        exports: { ".": "./src/index.ts" },
      }),
    ),
    tsconfigFile("packages/contracts"),
    file(
      "packages/contracts/src/index.ts",
      `// Shared domain contracts and error codes live here.
export const ErrorCode = {
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
`,
    ),
  ];
}

function tsconfigFile(pkg: string): TemplateFile {
  return file(`${pkg}/tsconfig.json`, tsconfig({ include: ["src/**/*"] }));
}
