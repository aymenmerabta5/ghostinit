import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { tanstackCoreFiles } from "../../src/templates/apps/tanstack-core.js";
import { singleRouterTanstackContent } from "../../src/templates/modes/single/tanstack/core.js";

const roots: string[] = [];

const moduleDeclarations = `declare module "@tanstack/react-query" {
  export interface QueryClient {}
  export interface DehydratedState {
    mutations: Array<{ mutationKey?: readonly unknown[] }>;
    queries: Array<{ queryKey: readonly unknown[] }>;
  }
  export function dehydrate(
    client: QueryClient,
    options: { shouldDehydrateMutation: () => boolean },
  ): DehydratedState;
  export function hydrate(client: QueryClient, state: DehydratedState): void;
}

declare module "@tanstack/react-router" {
  type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
  export function createRouter<TDehydrated extends Record<string, Json>>(options: {
    routeTree: unknown;
    context: { queryClient: import("@tanstack/react-query").QueryClient };
    dehydrate: () => TDehydrated;
    hydrate: (dehydrated: TDehydrated) => void;
    scrollRestoration: boolean;
    defaultPreload: string;
  }): { readonly options: unknown };
  export interface Register {}
}
`;

function routerSource(mode: "monorepo" | "single"): string {
  if (mode === "single") return singleRouterTanstackContent();
  return tanstackCoreFiles().find(({ path }) => path === "apps/web/src/router.tsx")?.content ?? "";
}

function typecheckRouter(source: string): { exitCode: number; output: string } {
  const root = mkdtempSync(join(tmpdir(), "ghostinit-tanstack-router-types-"));
  roots.push(root);
  mkdirSync(join(root, "lib"), { recursive: true });
  writeFileSync(join(root, "router.tsx"), source, "utf8");
  writeFileSync(
    join(root, "lib", "query-client.ts"),
    `import type { QueryClient } from "@tanstack/react-query";
export function getQueryClient(): QueryClient { return {}; }
`,
    "utf8",
  );
  writeFileSync(join(root, "routeTree.gen.ts"), "export const routeTree = {};\n", "utf8");
  writeFileSync(join(root, "modules.d.ts"), moduleDeclarations, "utf8");
  writeFileSync(
    join(root, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        lib: ["ES2024", "DOM"],
        module: "ESNext",
        moduleResolution: "Bundler",
        noEmit: true,
        skipLibCheck: true,
        strict: true,
        target: "ES2024",
      },
      include: ["**/*"],
    }),
    "utf8",
  );
  const result = Bun.spawnSync(
    [process.execPath, "x", "--no-install", "tsc", "-p", resolve(root, "tsconfig.json")],
    { cwd: resolve(import.meta.dir, "../.."), stderr: "pipe", stdout: "pipe" },
  );
  return {
    exitCode: result.exitCode,
    output: new TextDecoder().decode(result.stdout) + new TextDecoder().decode(result.stderr),
  };
}

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

describe("generated TanStack router serialization types", () => {
  for (const mode of ["monorepo", "single"] as const) {
    test(`${mode} serializes query-only dehydration behind a string boundary`, () => {
      const source = routerSource(mode);
      expect(source).toContain("shouldDehydrateMutation: () => false");
      expect(source).toContain("queryClientState: serializeQueryState(queryClient)");
      const result = typecheckRouter(source);
      expect(result.exitCode, result.output).toBe(0);
    });
  }

  test("rejects exposing raw DehydratedState to the Router serializer", () => {
    const unsafe = routerSource("single").replace(
      "queryClientState: serializeQueryState(queryClient)",
      "queryClientState: dehydrate(queryClient, { shouldDehydrateMutation: () => false })",
    );
    const result = typecheckRouter(unsafe);
    expect(result.exitCode).not.toBe(0);
    expect(result.output).toContain("DehydratedState");
  });
});
