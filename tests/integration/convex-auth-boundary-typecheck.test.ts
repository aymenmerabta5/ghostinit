import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { spawn } from "node:child_process";
import { projectConfigSchema } from "../../src/lib/config.js";
import { FsTransaction } from "../../src/lib/fs.js";
import { generateProjectFiles } from "../../src/templates/default.js";
import { terminateProcessTree } from "../helpers/process-tree.js";

function nativeBunExecutable(resolved: string): string {
  if (process.platform !== "win32" || !/\.(?:cmd|bat)$/i.test(resolved)) return resolved;
  return Bun.which("bun.exe") ?? resolved;
}

async function runCommand(root: string, args: string[], timeoutMs: number): Promise<void> {
  const bun = Bun.which("bun");
  if (bun === null) throw new Error("bun executable was not found");
  const child = spawn(nativeBunExecutable(bun), args, {
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

const apiDeclaration = `import type { FunctionReference } from "convex/server";
export interface RequestUser {
  _id: string;
  name: string;
  email: string;
  role?: string;
}
export declare const api: {
  users: {
    me: FunctionReference<"query", "public", Record<string, never>, RequestUser | null>;
  };
};
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
    beforeLoad: () => Promise<unknown>;
    component: () => React.JSX.Element;
  }) => unknown;
  export function redirect(options: { to: string }): never;
  export function Link(props: {
    to: string;
    className?: string;
    children?: React.ReactNode;
  }): React.JSX.Element;
}
`;

describe("generated Convex request-user boundary", () => {
  test("monorepo and single TanStack Convex auth owners and admin guards typecheck", async () => {
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
        expect(auth, variant.mode).toContain("fetchAuthQuery(api.users.me, {})");
        expect(admin, variant.mode).toContain("getRequestUser()");
        await transaction.write(`${variant.fixtureRoot}/${variant.authPath}`, auth);
        await transaction.write(`${variant.fixtureRoot}/${variant.adminPath}`, admin);
        await transaction.write(
          `${variant.fixtureRoot}/convex/_generated/api.d.ts`,
          apiDeclaration,
        );
      }
      await transaction.write("framework.d.ts", frameworkDeclarations);
      await transaction.write(
        "package.json",
        JSON.stringify(
          {
            name: "ghostinit-convex-auth-boundary",
            private: true,
            dependencies: {
              "@convex-dev/better-auth": "0.12.5",
              "@types/node": "22.20.1",
              "@types/react": "19.2.18",
              "better-auth": "1.6.23",
              convex: "1.42.3",
              react: "19.1.0",
              typescript: "6.0.3",
            },
          },
          null,
          2,
        ),
      );
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
              skipLibCheck: true,
              types: ["node", "react"],
              paths: {
                "@repo/auth": ["./monorepo/packages/auth/src/server.ts"],
                "@/server/auth": ["./single/src/server/auth/index.ts"],
              },
            },
            include: [
              "monorepo/**/*.ts",
              "monorepo/**/*.tsx",
              "single/**/*.ts",
              "single/**/*.tsx",
              "framework.d.ts",
            ],
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
    } finally {
      verifyTempRoot(root);
      await rm(root, { recursive: true, force: true });
    }
  }, 480_000);
});
