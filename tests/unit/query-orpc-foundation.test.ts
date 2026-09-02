import { describe, expect, test } from "bun:test";
import { projectConfigSchema } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";
import type { TemplateFile } from "../../src/templates/shared.js";

type Mode = "monorepo" | "single";
type Framework = "nextjs" | "tanstack-start";

function generate(
  mode: Mode,
  framework: Framework,
  overrides: Record<string, unknown> = {},
): TemplateFile[] {
  return generateProjectFiles(
    projectConfigSchema.parse({
      name: "query-foundation",
      runtime: "bun",
      version: "0.1.0",
      mode,
      framework,
      database: "postgres",
      billing: ["stripe"],
      features: [],
      apps: ["web"],
      ...overrides,
    }),
  );
}

function prefix(mode: Mode): string {
  return mode === "monorepo" ? "apps/web/" : "";
}

function read(files: TemplateFile[], path: string): string {
  return files.find((entry) => entry.path === path)?.content ?? "";
}

describe("generated Query and oRPC foundation", () => {
  test("emits raw typed clients and the catalog-pinned oRPC React Query adapter in every web target", () => {
    for (const mode of ["monorepo", "single"] as const) {
      for (const framework of ["nextjs", "tanstack-start"] as const) {
        const files = generate(mode, framework);
        const client = read(files, `${prefix(mode)}src/lib/orpc.ts`);
        expect(client).toContain("createORPCReactQueryUtils");
        expect(client).toContain(
          "export const orpcClient = createORPCClient<RouterClient<typeof appRouter>>(link);",
        );
        expect(client).toContain("export const orpc = createORPCReactQueryUtils(orpcClient);");
        if (framework === "nextjs") {
          expect(client).not.toContain("createRequestApiClient(request: Request)");
          expect(files.some(({ path }) => path === `${prefix(mode)}src/lib/orpc.server.ts`)).toBe(
            false,
          );
          const applicationIndex = read(
            files,
            mode === "monorepo"
              ? "packages/services/src/application/index.ts"
              : "src/server/services/application/index.ts",
          );
          expect(applicationIndex).toContain("createRequestApplicationForRequest");
        } else {
          expect(client).toContain("createRequestApiClient(request: Request)");
        }
        expect(client).not.toContain("localhost:3000");
        expect(client).not.toContain("as unknown as");
      }
    }
  });

  test("shares an intentional cache policy, safe RPC resolver, and one browser singleton", () => {
    for (const mode of ["monorepo", "single"] as const) {
      const files = generate(mode, "nextjs");
      const queryClient = read(files, `${prefix(mode)}src/lib/query-client.ts`);
      expect(queryClient).toContain("export function makeQueryClient(): QueryClient");
      expect(queryClient).toContain("staleTime: 30_000");
      expect(queryClient).toContain("gcTime: 5 * 60_000");
      expect(queryClient).toContain("retry: shouldRetryQuery");
      expect(queryClient).toContain("refetchOnWindowFocus: false");
      expect(queryClient).toContain("refetchOnReconnect: true");
      expect(queryClient).toContain("mutations: {");
      expect(queryClient).toContain("export function resolveRpcError");
      expect(queryClient).toContain('typeof data?.code === "string"');
      expect(queryClient).toContain("let browserQueryClient: QueryClient | undefined");
      expect(queryClient).toContain('if (typeof window === "undefined") return makeQueryClient();');
      expect(queryClient).not.toContain("@orpc/");
    }
  });

  test("separates RPC and correctly addressed OpenAPI operation handlers", () => {
    for (const mode of ["monorepo", "single"] as const) {
      const nextFiles = generate(mode, "nextjs");
      const nextRoute = read(nextFiles, `${prefix(mode)}src/app/api/rpc/[...path]/route.ts`);
      const nextOpenApi = read(nextFiles, `${prefix(mode)}src/app/api/[...path]/route.ts`);
      expect(nextRoute).toContain('prefix: "/api/rpc"');
      expect(nextRoute).not.toContain("OpenAPIHandler");
      expect(nextRoute).not.toContain("as unknown as");
      expect(nextOpenApi).toContain("new OpenAPIHandler(appRouter,");
      expect(nextOpenApi).toContain("openApiHandler.handle(request, { context })");
      expect(nextOpenApi).not.toContain('prefix: "/api/rpc"');

      const tanstackFiles = generate(mode, "tanstack-start");
      const tanstackRoute = read(tanstackFiles, `${prefix(mode)}src/routes/api/rpc/$splat.ts`);
      const tanstackHandler = read(tanstackFiles, `${prefix(mode)}src/server/http/rpc.server.ts`);
      const tanstackOpenApi = read(tanstackFiles, `${prefix(mode)}src/routes/api/$splat.ts`);
      const tanstackOpenApiHandler = read(
        tanstackFiles,
        `${prefix(mode)}src/server/http/openapi-operations.server.ts`,
      );
      expect(tanstackRoute).toContain('import { createServerOnlyFn } from "@tanstack/react-start"');
      expect(tanstackRoute).toMatch(
        /const dispatchRpcRequest = createServerOnlyFn\(async \(request: Request\): Promise<Response> => \{\s*const \{ handleRpcRequest \} = await import\("@\/server\/http\/rpc\.server"\);\s*return await handleRpcRequest\(request\);\s*\}\);/,
      );
      expect(tanstackRoute.match(/dispatchRpcRequest\(request\)/g) ?? []).toHaveLength(5);
      expect(tanstackRoute).not.toContain(
        '(await import("@/server/http/rpc.server")).handleRpcRequest(request)',
      );
      expect(tanstackRoute).not.toContain('from "@/server/http/rpc.server"');
      expect(tanstackRoute).not.toContain("@orpc/server/fetch");
      expect(tanstackHandler).toContain('import "server-only"');
      expect(tanstackHandler).toContain("new RPCHandler(appRouter");
      expect(tanstackHandler).toMatch(/prefix: ["']\/api\/rpc["']/);
      expect(tanstackRoute).not.toContain("OpenAPIHandler");
      expect(tanstackOpenApi).toContain('createFileRoute("/api/$splat")');
      expect(tanstackOpenApiHandler).toContain("new OpenAPIHandler(appRouter,");
      expect(tanstackOpenApiHandler).toContain("openApiHandler.handle(request, { context })");
      expect(`${tanstackRoute}\n${tanstackHandler}`).not.toContain("as unknown as");

      const spec = read(
        nextFiles,
        mode === "monorepo" ? "packages/api/src/openapi.ts" : "src/server/api/openapi.ts",
      );
      expect(spec).toContain('servers: [{ url: "/" }]');
      expect(spec).not.toContain('localhost:3000/api"');
    }
  });

  test("mounts one reachable provider and hydrates the TanStack router client", () => {
    for (const mode of ["monorepo", "single"] as const) {
      const files = generate(mode, "tanstack-start", { database: "convex" });
      const base = prefix(mode);
      const provider = read(files, `${base}src/components/providers.tsx`);
      const root = read(files, `${base}src/routes/__root.tsx`);
      const router = read(files, `${base}src/router.tsx`);
      expect(provider).toContain("export function AppProviders");
      expect(provider).toContain("<QueryClientProvider client={client}>");
      expect(provider).not.toContain("new QueryClient");
      expect(root).toContain("<AppProviders queryClient={queryClient}>");
      expect(root).not.toContain("QueryClientProvider");
      expect(router).toContain("getQueryClient()");
      expect(router).toContain(
        "dehydrate: () => ({ queryClientState: serializeQueryState(queryClient) })",
      );
      expect(router).toContain(
        "hydrate: (dehydrated) => hydrateQueryState(queryClient, dehydrated.queryClientState)",
      );
      expect(router).toContain("shouldDehydrateMutation: () => false");
      expect(router).toContain("const value: unknown = JSON.parse(serialized)");
      expect(router).not.toContain("setupRouterSsrQueryIntegration");
      expect(router).not.toContain("queryStream");
      expect(`${provider}\n${root}`).not.toContain('defaultTheme="light"');
    }
  });

  test("keeps API and billing client files capability-gated", () => {
    for (const mode of ["monorepo", "single"] as const) {
      for (const framework of ["nextjs", "tanstack-start"] as const) {
        const withoutBilling = generate(mode, framework, { billing: [] });
        const withoutBillingPaths = withoutBilling.map((entry) => entry.path);
        expect(withoutBillingPaths).not.toContain(`${prefix(mode)}src/hooks/use-billing.ts`);

        const withoutApi = generate(mode, framework, {
          preset: "custom",
          auth: false,
          api: false,
          email: false,
          analytics: false,
          billing: [],
        });
        const withoutApiPaths = withoutApi.map((entry) => entry.path);
        expect(withoutApiPaths).not.toContain(`${prefix(mode)}src/lib/orpc.ts`);
        expect(withoutApiPaths).toContain(`${prefix(mode)}src/lib/query-client.ts`);
      }
    }
  });

  test("declares the TanStack admin loader service dependency only with auth", () => {
    const enabled = generate("monorepo", "tanstack-start");
    const disabled = generate("monorepo", "tanstack-start", {
      preset: "custom",
      auth: false,
      api: false,
      email: false,
      analytics: false,
      billing: [],
    });
    const enabledManifest = JSON.parse(read(enabled, "apps/web/package.json")) as {
      dependencies?: Record<string, string>;
    };
    const disabledManifest = JSON.parse(read(disabled, "apps/web/package.json")) as {
      dependencies?: Record<string, string>;
    };
    expect(enabledManifest.dependencies?.["@repo/services"]).toBe("workspace:*");
    expect(disabledManifest.dependencies?.["@repo/services"]).toBeUndefined();
  });
});
