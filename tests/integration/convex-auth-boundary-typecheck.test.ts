// @allow-long 460: exact installed-type fixture keeps generated declarations and cleanup in one auditable boundary
import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { spawn } from "node:child_process";
import {
  auth as authVersions,
  convex as convexVersions,
  nextStack,
  runtime,
  typescript as typescriptVersions,
  validation,
} from "../../packages/versions/src/index.js";
import { projectConfigSchema } from "../../src/lib/config.js";
import { FsTransaction } from "../../src/lib/fs.js";
import { generateProjectFiles } from "../../src/templates/default.js";
import { minimumReleaseAgeBunfigContent } from "../helpers/bunfig.js";
import { terminateProcessTree } from "../helpers/process-tree.js";

const REQUIRED_BUN_VERSION = runtime.bun;

async function runCommand(root: string, args: string[], timeoutMs: number): Promise<void> {
  const child = spawn(process.execPath, args, {
    cwd: root,
    windowsHide: true,
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => (stdout += chunk));
  child.stderr.on("data", (chunk: string) => (stderr += chunk));
  let timer: ReturnType<typeof setTimeout> | undefined;
  const result = await Promise.race([
    new Promise<{ code: number | null; error?: Error }>((resolveResult) => {
      child.once("exit", (code) => resolveResult({ code }));
      child.once("error", (error) => resolveResult({ code: null, error }));
    }),
    new Promise<"timeout">((resolveTimeout) => {
      timer = setTimeout(() => resolveTimeout("timeout"), timeoutMs);
    }),
  ]);
  if (timer !== undefined) clearTimeout(timer);
  if (result === "timeout") {
    await terminateProcessTree(child);
    throw new Error(`Timed out running bun ${args.join(" ")}\n${stderr.slice(-12_000)}`);
  }
  if (result.error) throw result.error;
  if (result.code !== 0) {
    throw new Error(
      `bun ${args.join(" ")} failed (${result.code})\n${stdout.slice(-12_000)}\n${stderr.slice(-12_000)}`,
    );
  }
}

function verifyTempRoot(root: string): void {
  const absoluteRoot = resolve(root);
  const relativeToTemp = relative(resolve(tmpdir()), absoluteRoot);
  if (
    relativeToTemp === "" ||
    relativeToTemp.startsWith("..") ||
    isAbsolute(relativeToTemp) ||
    !basename(absoluteRoot).startsWith("ghostinit-convex-auth-boundary-")
  ) {
    throw new Error(`Refusing to remove unverified temp root: ${absoluteRoot}`);
  }
}

const dataModelDeclaration = `import type {
  DataModelFromSchemaDefinition,
  DocumentByName,
  SystemTableNames,
  TableNamesInDataModel,
} from "convex/server";
import type { GenericId } from "convex/values";
import schema from "../schema.js";
export type TableNames = TableNamesInDataModel<DataModel>;
export type Doc<TableName extends TableNames> = DocumentByName<DataModel, TableName>;
export type Id<TableName extends TableNames | SystemTableNames> = GenericId<TableName>;
export type DataModel = DataModelFromSchemaDefinition<typeof schema>;
`;

const serverDeclaration = `import type {
  ActionBuilder,
  GenericActionCtx,
  GenericMutationCtx,
  GenericQueryCtx,
  HttpActionBuilder,
  MutationBuilder,
  QueryBuilder,
} from "convex/server";
import type { DataModel } from "./dataModel.js";
export declare const query: QueryBuilder<DataModel, "public">;
export declare const internalQuery: QueryBuilder<DataModel, "internal">;
export declare const mutation: MutationBuilder<DataModel, "public">;
export declare const internalMutation: MutationBuilder<DataModel, "internal">;
export declare const action: ActionBuilder<DataModel, "public">;
export declare const internalAction: ActionBuilder<DataModel, "internal">;
export declare const httpAction: HttpActionBuilder;
export type QueryCtx = GenericQueryCtx<DataModel>;
export type MutationCtx = GenericMutationCtx<DataModel>;
export type ActionCtx = GenericActionCtx<DataModel>;
`;

const apiDeclaration = `import type * as auth from "../auth.js";
import type * as authEmail from "../authEmail.js";
import type * as users from "../users.js";
import type { ApiFromModules, FilterApi, FunctionReference } from "convex/server";
type EmptyArgs = Record<string, never>;
type InternalQuery = FunctionReference<"query", "internal", EmptyArgs, unknown>;
type InternalMutation = FunctionReference<"mutation", "internal", EmptyArgs, unknown>;
type DeleteSessionMutation = FunctionReference<
  "mutation",
  "internal",
  {
    input: {
      model: "session";
      where?: Array<{
        connector?: "AND" | "OR";
        field: "_id";
        mode?: "sensitive" | "insensitive";
        operator?: "eq";
        value: string;
      }>;
    };
    onDeleteHandle?: string;
  },
  unknown
>;
type AuthAdapter = {
  create: InternalMutation;
  findOne: InternalQuery;
  findMany: InternalQuery;
  updateOne: InternalMutation;
  updateMany: InternalMutation;
  deleteOne: DeleteSessionMutation;
  deleteMany: InternalMutation;
};
type AppApi = ApiFromModules<{
  auth: typeof auth;
  authEmail: typeof authEmail;
  users: typeof users;
}>;
export declare const api: FilterApi<AppApi, FunctionReference<any, "public">>;
export declare const internal: FilterApi<AppApi, FunctionReference<any, "internal">>;
export declare const components: {
  betterAuth: {
    adapter: AuthAdapter;
  };
};
`;

const requestUserContract = `import type { FunctionArgs, FunctionReference, FunctionReturnType } from "convex/server";
import type { Doc } from "./convex/_generated/dataModel.js";
import { api, internal } from "./convex/_generated/api.js";
type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends
  (<Value>() => Value extends Right ? 1 : 2) ? true : false;
type Assert<Condition extends true> = Condition;
export type ApiUserIsAppUser = Assert<
  Equal<FunctionReturnType<typeof api.users.me>, Doc<"users"> | null>
>;
export type ListedAdminUserIsAppUser = Assert<
  Equal<FunctionReturnType<typeof api.users.list>["page"][number], Doc<"users">>
>;
export type SetRoleUsesClosedLocalAuthority = Assert<
  Equal<
    FunctionArgs<typeof api.users.setRoleByAuthId>,
    { authId: string; role: "user" | "admin" }
  >
>;
export type SetBannedUsesLocalAuthority = Assert<
  Equal<
    FunctionArgs<typeof api.users.setBannedByAuthId>,
    { authId: string; banned: boolean; reason?: string }
  >
>;
export type BootstrapIsNotPublic = Assert<
  Equal<Extract<"seedFirstAdmin", keyof typeof api.users>, never>
>;
export type BootstrapIsInternal = Assert<
  Equal<
    typeof internal.users.seedFirstAdmin extends FunctionReference<"mutation", "internal"> ? true : false,
    true
  >
>;
`;

const frameworkDeclarations = `declare module "@tanstack/react-start" {
  export function createServerFn(options: { method: "GET" }): {
    handler<T>(fn: () => Promise<T>): () => Promise<T>;
  };
}
declare module "@tanstack/react-start/server" {
  export function getRequestHeaders(): Headers;
}
declare module "@tanstack/react-router" {
  export function createFileRoute(path: string): (options: {
    beforeLoad?: (context: {
      context: { queryClient: unknown };
      location: { pathname: string };
    }) => Promise<unknown>;
    component: () => React.JSX.Element;
  }) => unknown;
  export function redirect(options: { to: string }): never;
  export function Outlet(): React.JSX.Element;
  export function Link(props: {
    to: string;
    className?: string;
    children?: React.ReactNode;
  }): React.JSX.Element;
}
declare module "@/lib/protected-route" {
  export function requireProtectedRoute(queryClient: unknown): Promise<{
    protectedSession: {
      user: { role: string | null } | null;
    };
  }>;
}
`;

describe("generated Convex request-user boundary", () => {
  test("installed Convex auth owners, admin guards, and Next helper declarations typecheck", async () => {
    expect(Bun.version).toBe(REQUIRED_BUN_VERSION);
    const root = mkdtempSync(join(tmpdir(), "ghostinit-convex-auth-boundary-"));
    try {
      const transaction = new FsTransaction(root);
      const variants = [
        {
          mode: "monorepo" as const,
          authPath: "packages/auth/src/server.ts",
          adminPath: "apps/web/src/routes/admin.tsx",
          fixtureRoot: "monorepo",
        },
        {
          mode: "single" as const,
          authPath: "src/server/auth/index.ts",
          adminPath: "src/routes/admin.tsx",
          fixtureRoot: "single",
        },
      ];
      for (const variant of variants) {
        const files = generateProjectFiles(
          projectConfigSchema.parse({
            name: "convex-auth-boundary",
            runtime: "bun",
            version: "0.1.0",
            mode: variant.mode,
            preset: "saas",
            billing: [],
            features: [],
            database: "convex",
            framework: "tanstack-start",
            apps: ["web"],
          }),
        );
        const auth = files.find(({ path }) => path === variant.authPath)?.content ?? "";
        const admin = files.find(({ path }) => path === variant.adminPath)?.content ?? "";
        const schema = files.find(({ path }) => path === "convex/schema.ts")?.content ?? "";
        const convexAuth = files.find(({ path }) => path === "convex/auth.ts")?.content ?? "";
        const convexAuthEmail =
          files.find(({ path }) => path === "convex/authEmail.ts")?.content ?? "";
        const users = files.find(({ path }) => path === "convex/users.ts")?.content ?? "";
        const actorBoundary =
          files.find(({ path }) => path === "convex/lib/auth.ts")?.content ?? "";
        const posts = files.find(({ path }) => path === "convex/posts.ts")?.content ?? "";
        const authConfig =
          files.find(({ path }) => path === "convex/auth.config.ts")?.content ?? "";
        const identitySchema =
          files.find(({ path }) => path === "convex/schema/identity.ts")?.content ?? "";
        const identitySessions =
          files.find(({ path }) => path === "convex/identity/sessions.ts")?.content ?? "";
        const identityShared =
          files.find(({ path }) => path === "convex/identity/shared.ts")?.content ?? "";
        const configServerPath =
          variant.mode === "monorepo" ? "packages/config/src/server.ts" : "src/lib/env/server.ts";
        const configSchemaPath =
          variant.mode === "monorepo"
            ? "packages/config/src/server-schema.ts"
            : "src/lib/env/server-schema.ts";
        const configServer = files.find(({ path }) => path === configServerPath)?.content ?? "";
        const configSchema = files.find(({ path }) => path === configSchemaPath)?.content ?? "";
        expect(auth, variant.mode).toContain("fetchAuthQuery(api.users.me, {})");
        expect(admin, variant.mode).toContain('from "@/lib/protected-route"');
        expect(admin, variant.mode).toContain("requireProtectedRoute(context.queryClient)");
        expect(admin, variant.mode).toContain("isAdminRole(result.protectedSession.user.role)");
        expect(admin, variant.mode).not.toContain("getRequestUser");
        expect(admin, variant.mode).not.toMatch(/@\/server\/api|createRouterClient|\borpc\b/);
        expect(schema, variant.mode).toContain("authId: v.string()");
        expect(schema, variant.mode).toContain('.index("by_authId", ["authId"])');
        expect(convexAuth, variant.mode).toContain(
          "const authFunctions: AuthFunctions = internal.auth",
        );
        expect(convexAuth, variant.mode).toContain("triggers: {");
        expect(convexAuth, variant.mode).toContain(
          "export const { onCreate, onUpdate, onDelete } = authComponent.triggersApi()",
        );
        expect(convexAuthEmail, variant.mode).toContain("export const send = internalAction({");
        expect(actorBoundary, variant.mode).toContain('.withIndex("by_authId"');
        expect(users, variant.mode).toContain("export const setRoleByAuthId = mutation({");
        expect(users, variant.mode).toContain("export const setBannedByAuthId = mutation({");
        expect(users, variant.mode).toContain("await requireAdminActor(ctx)");
        expect(users, variant.mode).toContain("export const seedFirstAdmin = internalMutation({");
        expect(users, variant.mode).not.toContain("as unknown as");
        expect(actorBoundary, variant.mode).toContain("authComponent.safeGetAuthUser(ctx)");
        expect(configServer, variant.mode).toContain("export const env = createEnv");
        expect(configSchema, variant.mode).toContain("export const serverSchema");
        expect(actorBoundary, variant.mode).toContain("USER_BANNED");
        expect(posts, variant.mode).toContain("await requireActor(ctx)");
        expect(posts, variant.mode).not.toContain("as unknown as");
        await transaction.write(`${variant.fixtureRoot}/${variant.authPath}`, auth);
        await transaction.write(`${variant.fixtureRoot}/${variant.adminPath}`, admin);
        await transaction.write(`${variant.fixtureRoot}/convex/schema.ts`, schema);
        await transaction.write(`${variant.fixtureRoot}/convex/auth.ts`, convexAuth);
        await transaction.write(`${variant.fixtureRoot}/convex/authEmail.ts`, convexAuthEmail);
        await transaction.write(`${variant.fixtureRoot}/convex/users.ts`, users);
        await transaction.write(`${variant.fixtureRoot}/convex/lib/auth.ts`, actorBoundary);
        await transaction.write(`${variant.fixtureRoot}/convex/posts.ts`, posts);
        await transaction.write(`${variant.fixtureRoot}/convex/auth.config.ts`, authConfig);
        await transaction.write(`${variant.fixtureRoot}/convex/schema/identity.ts`, identitySchema);
        await transaction.write(
          `${variant.fixtureRoot}/convex/identity/sessions.ts`,
          identitySessions,
        );
        await transaction.write(`${variant.fixtureRoot}/convex/identity/shared.ts`, identityShared);
        await transaction.write(`${variant.fixtureRoot}/${configServerPath}`, configServer);
        await transaction.write(`${variant.fixtureRoot}/${configSchemaPath}`, configSchema);
        await transaction.write(
          `${variant.fixtureRoot}/convex/_generated/api.d.ts`,
          apiDeclaration,
        );
        await transaction.write(
          `${variant.fixtureRoot}/convex/_generated/dataModel.d.ts`,
          dataModelDeclaration,
        );
        await transaction.write(
          `${variant.fixtureRoot}/convex/_generated/server.d.ts`,
          serverDeclaration,
        );
        await transaction.write(
          `${variant.fixtureRoot}/request-user-contract.ts`,
          requestUserContract,
        );
        if (variant.mode === "monorepo") {
          const access =
            files.find(({ path }) => path === "packages/auth/src/access.ts")?.content ?? "";
          await transaction.write(`${variant.fixtureRoot}/packages/auth/src/access.ts`, access);
        } else {
          const access = files.find(({ path }) => path === "src/lib/access.ts")?.content ?? "";
          expect(access).not.toBe("");
          await transaction.write(`${variant.fixtureRoot}/src/lib/access.ts`, access);
        }
      }
      for (const mode of ["monorepo", "single"] as const) {
        const files = generateProjectFiles(
          projectConfigSchema.parse({
            name: "convex-next-auth-portability",
            runtime: "bun",
            version: "0.1.0",
            mode,
            preset: "saas",
            billing: [],
            features: [],
            database: "convex",
            framework: "nextjs",
            apps: ["web"],
          }),
        );
        const authPath =
          mode === "monorepo" ? "packages/auth/src/server.ts" : "src/server/auth/index.ts";
        const auth = files.find(({ path }) => path === authPath)?.content ?? "";
        const apiBootstrap =
          files.find(({ path }) => path === "convex/_generated/api.d.ts")?.content ?? "";
        const configServerPath =
          mode === "monorepo" ? "packages/config/src/server.ts" : "src/lib/env/server.ts";
        const configSchemaPath =
          mode === "monorepo"
            ? "packages/config/src/server-schema.ts"
            : "src/lib/env/server-schema.ts";
        const configServer = files.find(({ path }) => path === configServerPath)?.content ?? "";
        const configSchema = files.find(({ path }) => path === configSchemaPath)?.content ?? "";
        const fixtureRoot = `next-${mode}`;
        expect(auth, mode).toContain(
          'import type { FunctionReference, FunctionReturnType, OptionalRestArgs } from "convex/server"',
        );
        expect(auth, mode).toContain(
          "export const preloadAuthQuery: PreloadAuthQuery = convexAuth.preloadAuthQuery",
        );
        expect(auth, mode).toContain(
          "export const fetchAuthQuery: FetchAuthQuery = convexAuth.fetchAuthQuery",
        );
        expect(auth, mode).toContain(
          "export const fetchAuthMutation: FetchAuthMutation = convexAuth.fetchAuthMutation",
        );
        expect(auth, mode).toContain(
          "export const fetchAuthAction: FetchAuthAction = convexAuth.fetchAuthAction",
        );
        expect(auth, mode).not.toContain('from "convex-helpers"');
        expect(apiBootstrap, mode).not.toBe("");
        await transaction.write(`${fixtureRoot}/${authPath}`, auth);
        await transaction.write(`${fixtureRoot}/convex/_generated/api.d.ts`, apiBootstrap);
        await transaction.write(`${fixtureRoot}/${configServerPath}`, configServer);
        await transaction.write(`${fixtureRoot}/${configSchemaPath}`, configSchema);
      }
      await transaction.write("framework.d.ts", frameworkDeclarations);
      await transaction.write(
        "package.json",
        JSON.stringify(
          {
            name: "ghostinit-convex-auth-boundary",
            private: true,
            dependencies: {
              "@convex-dev/better-auth": convexVersions["@convex-dev/better-auth"],
              "@types/node": runtime["@types/node"],
              "@types/react": nextStack["@types/react"],
              "better-auth": authVersions["better-auth"],
              convex: convexVersions.convex,
              react: nextStack.react,
              typescript: typescriptVersions.typescript,
              "@t3-oss/env-core": validation["@t3-oss/env-core"],
              zod: validation.zod,
            },
          },
          null,
          2,
        ),
      );
      await transaction.write("bunfig.toml", minimumReleaseAgeBunfigContent());
      await transaction.write(
        "tsconfig.json",
        JSON.stringify(
          {
            compilerOptions: {
              target: "ES2024",
              module: "ESNext",
              moduleResolution: "Bundler",
              jsx: "react-jsx",
              strict: true,
              declaration: true,
              skipLibCheck: true,
              types: ["node", "react"],
              paths: {
                "@repo/auth": ["./monorepo/packages/auth/src/server.ts"],
                "@repo/auth/access": ["./monorepo/packages/auth/src/access.ts"],
                "@repo/kernel": ["./monorepo/packages/kernel/src/admin.ts"],
                "@repo/config/server": ["./monorepo/packages/config/src/server.ts"],
                "@/server/auth": ["./single/src/server/auth/index.ts"],
                "@/lib/access": ["./single/src/lib/access.ts"],
                "@/lib/kernel": ["./single/src/lib/kernel.ts"],
                "@/lib/env/server": ["./single/src/lib/env/server.ts"],
              },
            },
            include: [
              "monorepo/**/*.ts",
              "monorepo/**/*.tsx",
              "single/**/*.ts",
              "single/**/*.tsx",
              "next-*/**/*.ts",
              "framework.d.ts",
            ],
          },
          null,
          2,
        ),
      );
      await transaction.write(
        "tsconfig.declarations.json",
        JSON.stringify(
          {
            compilerOptions: {
              target: "ES2024",
              module: "ESNext",
              moduleResolution: "Bundler",
              strict: true,
              skipLibCheck: true,
              types: ["node", "react"],
              declaration: true,
              emitDeclarationOnly: true,
              rootDir: ".",
              outDir: "declarations",
              paths: {
                "@repo/config/server": ["./next-monorepo/packages/config/src/server.ts"],
                "@/lib/env/server": ["./next-single/src/lib/env/server.ts"],
              },
            },
            include: ["next-*/**/*.ts"],
          },
          null,
          2,
        ),
      );
      expect(transaction.getStagedFiles().map(({ path }) => path)).toContain(
        "single/src/server/auth/index.ts",
      );
      await transaction.commit();
      await runCommand(root, ["install", "--ignore-scripts"], 300_000);
      await runCommand(
        root,
        ["node_modules/typescript/bin/tsc", "--noEmit", "-p", "tsconfig.json"],
        120_000,
      );
      await runCommand(
        root,
        ["node_modules/typescript/bin/tsc", "-p", "tsconfig.declarations.json"],
        120_000,
      );
      for (const declarationPath of [
        "declarations/next-monorepo/packages/auth/src/server.d.ts",
        "declarations/next-single/src/server/auth/index.d.ts",
      ]) {
        const declaration = await readFile(join(root, declarationPath), "utf8");
        expect(declaration, declarationPath).toContain("OptionalRestArgs");
        expect(declaration, declarationPath).not.toContain("convex-helpers");
        expect(declaration, declarationPath).not.toContain(".bun");
        expect(declaration, declarationPath).not.toContain(root.replaceAll("\\", "/"));
        expect(declaration, declarationPath).not.toContain(root);
      }
    } finally {
      verifyTempRoot(root);
      await rm(root, { recursive: true, force: true });
    }
  }, 480_000);
});
