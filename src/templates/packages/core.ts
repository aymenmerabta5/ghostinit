import { codeScripts, file, packageJson, tsconfig, type TemplateFile } from "../shared.js";
import * as v from "../versions.js";

function tsconfigFile(pkg: string): TemplateFile {
  return file(
    `${pkg}/tsconfig.json`,
    tsconfig({
      include: ["src/**/*"],
      compilerOptions: {
        composite: true,
        incremental: true,
        declaration: true,
        declarationMap: true,
        sourceMap: true,
        outDir: "./dist",
        rootDir: "./src",
        baseUrl: ".",
        paths: { "@/*": ["./src/*"], "@repo/*": ["../../packages/*/src", "../../tooling/*/src"] },
      },
    }),
  );
}

export function corePackagesFiles(runtime: "node" | "bun" = "bun"): TemplateFile[] {
  return [
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
      tsconfig({
        include: ["src/**/*"],
        compilerOptions: {
          types: ["node"],
          composite: true,
          incremental: true,
          declaration: true,
          declarationMap: true,
          sourceMap: true,
          outDir: "./dist",
          rootDir: "./src",
        },
      }),
    ),
    file(
      "packages/observability/src/constants.ts",
      `export const SECRET_SUBSTRINGS = ["secret","password","token","auth","bearer","cookie"] as const; export function looksLikeSecret(key: string): boolean { return SECRET_SUBSTRINGS.some((s) => key.toLowerCase().includes(s)); }`,
    ),
    file(
      "packages/observability/src/logger.ts",
      `import { looksLikeSecret } from "./constants.js"; export type LogLevel = "debug"|"info"|"warn"|"error"; export interface Logger { debug: (msg: string, meta?: Record<string, unknown>) => void; info: (msg: string, meta?: Record<string, unknown>) => void; warn: (msg: string, meta?: Record<string, unknown>) => void; error: (msg: string, meta?: Record<string, unknown>) => void; } function defaultLog(level: LogLevel, message: string, meta?: Record<string, unknown>): void { const line = JSON.stringify({ level, message, time: new Date().toISOString(), ...(meta ? { meta } : {}) }); if (level === "error") process.stderr.write(\`\${line}\\n\`); else process.stdout.write(\`\${line}\\n\`); } export const logger: Logger = { debug: (msg, meta) => defaultLog("debug", msg, meta), info: (msg, meta) => defaultLog("info", msg, meta), warn: (msg, meta) => defaultLog("warn", msg, meta), error: (msg, meta) => defaultLog("error", msg, meta), };`,
    ),
    file(
      "packages/observability/src/request-id.ts",
      `import { randomUUID } from "node:crypto"; export function createRequestId(): string { return randomUUID(); } export const REQUEST_ID_HEADER = "x-request-id";`,
    ),
    file(
      "packages/observability/src/index.ts",
      `export { logger, type Logger } from "./logger.js"; export { createRequestId, REQUEST_ID_HEADER } from "./request-id.js";`,
    ),
    file(
      "packages/kernel/package.json",
      packageJson({ name: "@repo/kernel", scripts: codeScripts() }),
    ),
    tsconfigFile("packages/kernel"),
    file(
      "packages/kernel/src/result.ts",
      `export type Result<T, E = Error> = | { ok: true; value: T } | { ok: false; error: E }; export function ok<T>(value: T): Result<T> { return { ok: true, value }; } export function err<E = Error>(error: E): Result<never, E> { return { ok: false, error }; }`,
    ),
    file("packages/kernel/src/index.ts", `export * from "./result.js";\n`),
    file(
      "packages/testing/package.json",
      packageJson({
        name: "@repo/testing",
        scripts: codeScripts({ test: runtime === "bun" ? "bun test" : "npm run test:unit" }),
        devDependencies: { typescript: `^${v.typescript.typescript}` },
      }),
    ),
    file(
      "packages/testing/tsconfig.json",
      tsconfig({
        include: ["src/**/*"],
        compilerOptions: {
          types: runtime === "bun" ? ["bun-types"] : ["node"],
          composite: true,
          incremental: true,
          declaration: true,
          outDir: "./dist",
          rootDir: "./src",
        },
      }),
    ),
    file(
      "packages/testing/src/index.ts",
      `export function mockAsync<T>(value: T): () => Promise<T> { return async () => value; }\n`,
    ),
    file(
      "packages/workflows/package.json",
      packageJson({ name: "@repo/workflows", scripts: codeScripts() }),
    ),
    tsconfigFile("packages/workflows"),
    file(
      "packages/workflows/src/index.ts",
      `export interface WorkflowStep<T> { name: string; run(ctx: T): Promise<T>; } export async function runWorkflow<T>(initial: T, steps: WorkflowStep<T>[]): Promise<T> { let ctx = initial; for (const step of steps) { ctx = await step.run(ctx); } return ctx; }\n`,
    ),
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
      `export const ErrorCode = { UNAUTHORIZED: "UNAUTHORIZED", FORBIDDEN: "FORBIDDEN", NOT_FOUND: "NOT_FOUND", VALIDATION_ERROR: "VALIDATION_ERROR", INTERNAL_ERROR: "INTERNAL_ERROR", } as const; export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];\n`,
    ),
  ];
}
