import { codeScripts, file, packageJson, tsconfig, type TemplateFile } from "../shared.js";
import * as v from "../versions.js";
import {
  observabilityConstantsContent,
  observabilityLoggerContent,
} from "./observability-logger.js";

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
        // Without an exports map (or main) the package has no entry point, so
        // `import { logger } from "@repo/observability"` fails to resolve — TS2307.
        exports: { ".": "./src/index.ts" },
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
    file("packages/observability/src/constants.ts", observabilityConstantsContent()),
    file("packages/observability/src/logger.ts", observabilityLoggerContent()),
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
      packageJson({
        name: "@repo/kernel",
        exports: { ".": "./src/index.ts" },
        scripts: codeScripts(),
      }),
    ),
    tsconfigFile("packages/kernel"),
    file(
      "packages/kernel/src/result.ts",
      `export type Result<T, E = Error> = | { ok: true; value: T } | { ok: false; error: E }; export function ok<T>(value: T): Result<T> { return { ok: true, value }; } export function err<E = Error>(error: E): Result<never, E> { return { ok: false, error }; }`,
    ),
    file(
      "packages/kernel/src/billing.ts",
      `export interface BillingSubscription { id: string; provider: string; status: string; currentPeriodEnd?: string | null; priceId?: string | null; customerId?: string | null; }\nexport interface UseBillingReturn { subscriptions: BillingSubscription[]; loading: boolean; error: string | null; refresh: () => Promise<void>; hasActiveSubscription: boolean; isLoading: boolean; }\n`,
    ),
    file(
      "packages/kernel/src/admin.ts",
      `export const USER_ROLES = ["user", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];
  export interface AdminUser { id: string; authId?: string | null; name: string | null; email: string; role: UserRole; banned: boolean; }
  export interface UseAdminUsersReturn { data: { users: AdminUser[]; total: number } | null; error: string | null; loading: boolean; refresh: () => Promise<void>; toggleBan: (authId: string, banned: boolean) => Promise<void>; setRole: (authId: string, currentRole: UserRole) => Promise<void>; }
export function isUserRole(value: unknown): value is UserRole { return value === "user" || value === "admin"; }
`,
    ),
    file(
      "packages/kernel/src/hooks.ts",
      `export interface UseCopyReturn { copy: (text: string) => Promise<boolean>; copied: boolean; error: string | null; }\n`,
    ),
    file(
      "packages/kernel/src/index.ts",
      `export * from "./result.js";\nexport type { BillingSubscription, UseBillingReturn } from "./billing.js";\nexport { USER_ROLES, isUserRole } from "./admin.js";\nexport type { AdminUser, UserRole, UseAdminUsersReturn } from "./admin.js";\nexport type { UseCopyReturn } from "./hooks.js";\n`,
    ),
    file(
      "packages/testing/package.json",
      packageJson({
        name: "@repo/testing",
        exports: { ".": "./src/index.ts" },
        scripts: codeScripts({ test: "bun test" }),
        devDependencies: {
          // Must match the tsconfig `types` below, or TS2688.
          ...(runtime === "bun"
            ? { "bun-types": `^${v.runtime.bun}` }
            : { "@types/node": `^${v.runtime["@types/node"]}` }),
          typescript: `^${v.typescript.typescript}`,
        },
      }),
    ),
    // A real assertion, not a placeholder: this package declared a `test` script
    // with zero test files, so `bun test` exited 1 ("No tests found!") and
    // `turbo run test` was red on every freshly generated project. Importing the
    // barrel also catches the broken re-export class of bug.
    file(
      "packages/testing/tests/barrel.test.ts",
      `import { describe, it, expect } from "bun:test";
import * as mod from "../src/index.js";

describe("@repo/testing barrel", () => {
  it("loads and exposes its public API", () => {
    expect(typeof mod.mockAsync).toBe("function");
  });
});
`,
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
      packageJson({
        name: "@repo/workflows",
        exports: { ".": "./src/index.ts" },
        scripts: codeScripts(),
      }),
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
