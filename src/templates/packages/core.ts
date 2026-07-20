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
      `export const SECRET_SUBSTRINGS = ["secret","password","token","auth","bearer","cookie","credential","key","otp","session","signature","private"] as const;\nexport const SECRET_PATTERN = /\\b(apikey|api_key|jwt|private_key|database_url|db_url|webhook_secret|client_secret|access_token)\\b/i;\nexport const URL_SECRET_PARAM_PATTERN = /token|key|secret|password|auth|api|signature/i;\nexport function looksLikeSecret(key: string): boolean { const lower = key.toLowerCase(); for (const needle of SECRET_SUBSTRINGS) { if (lower.includes(needle)) return true; } return SECRET_PATTERN.test(lower); }\n`,
    ),
    file(
      "packages/observability/src/logger.ts",
      `import { looksLikeSecret as looksLikeSecretFromConstants, URL_SECRET_PARAM_PATTERN } from "./constants.js";\nimport { SECRET_SUBSTRINGS, SECRET_PATTERN } from "./constants.js";\n\nexport const SECRET_REGEX = SECRET_PATTERN;\nexport { SECRET_SUBSTRINGS };\nexport function looksLikeSecret(key: string): boolean { return looksLikeSecretFromConstants(key); }\n\nfunction redactUrlToken(value: string): string {\n  try {\n    const url = new URL(value);\n    const needsRedaction = url.password || (url.searchParams.toString() && URL_SECRET_PARAM_PATTERN.test(url.search));\n    if (!needsRedaction) return value;\n    for (const param of Array.from(url.searchParams.keys())) {\n      if (looksLikeSecretFromConstants(param)) {\n        url.searchParams.set(param, "***");\n      }\n    }\n    if (url.password) {\n      url.password = "***";\n    }\n    return url.toString();\n  } catch {\n    return value;\n  }\n}\n\nexport function redact(value: unknown, key = ""): unknown {\n  if (typeof value === "string") {\n    if (looksLikeSecret(key)) {\n      return "***";\n    }\n    return redactUrlToken(value);\n  }\n  if (Array.isArray(value)) {\n    return value.map((v, i) => redact(v, String(i)));\n  }\n  if (value && typeof value === "object" && !(value instanceof Date)) {\n    const out: Record<string, unknown> = {};\n    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {\n      out[k] = redact(v, k);\n    }\n    return out;\n  }\n  return value;\n}\n\nexport type LogLevel = "debug"|"info"|"warn"|"error";\n\nexport interface Logger {\n  debug: (msg: string, meta?: Record<string, unknown>) => void;\n  info: (msg: string, meta?: Record<string, unknown>) => void;\n  warn: (msg: string, meta?: Record<string, unknown>) => void;\n  error: (msg: string, meta?: Record<string, unknown>) => void;\n}\n\nfunction defaultLog(level: LogLevel, message: string, meta?: Record<string, unknown>): void {\n  const safeMeta = meta ? redact(meta) : undefined;\n  const line = JSON.stringify({ level, message, time: new Date().toISOString(), ...(safeMeta ? { meta: safeMeta } : {}) });\n  if (level === "error") process.stderr.write(\`\${line}\\n\`); else process.stdout.write(\`\${line}\\n\`);\n}\n\nexport const logger: Logger = {\n  debug: (msg, meta) => defaultLog("debug", msg, meta),\n  info: (msg, meta) => defaultLog("info", msg, meta),\n  warn: (msg, meta) => defaultLog("warn", msg, meta),\n  error: (msg, meta) => defaultLog("error", msg, meta),\n};\n`,
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
