import { describe, expect, test } from "bun:test";
import { queryClientContent } from "../../src/templates/apps/fragments/lib/query-client.js";
import {
  tanstackProtectedRouteDefinition,
  tanstackServerFoundationFiles,
} from "../../src/templates/apps/fragments/tanstack-server.js";
import { routeFile } from "../../src/templates/apps/capability-clients/shared.js";
import { singleTanstackBillingFeatureFiles } from "../../src/templates/modes/single/tanstack/pages/dashboard.js";
import { pdfWebPageContent } from "../../src/templates/pdf/surfaces.js";
import { tanstackEveAgentPageFile } from "../../src/templates/eve/security/page.js";
import {
  messagingNextFiles,
  messagingTanstackFiles,
} from "../../src/templates/apps/fragments/messaging/index.js";
import { messagingConvexTanstackWebFiles } from "../../src/templates/apps/fragments/messaging/convex-tanstack.js";
import { providersFileContent } from "../../src/templates/apps/fragments/theme.js";
import { singleProvidersTanstackContent } from "../../src/templates/modes/single/components/providers.js";
import { adminDataFiles } from "../../src/templates/apps/fragments/admin/feature-data.js";
import { webIdentityWorkspaceDataFiles } from "../../src/templates/apps/fragments/identity-workspace/web-data.js";
import { tanstackSettingsDataFeatureFiles } from "../../src/templates/apps/fragments/settings/tanstack-feature.js";
import { headerUserMenuContent } from "../../src/templates/apps/fragments/header/user-menu.js";
import { tanstackUseBillingHookContent } from "../../src/templates/apps/fragments/core/hooks.js";
import { resolveCreateConfig } from "../../src/commands/create/resolution.js";
import { buildProjectGenerationPlan } from "../../src/templates/default.js";

interface Scope {
  userId: string;
  sessionId: string;
  tenantId: string | null;
  teamId: string | null;
}

interface RuntimeQueryClient {
  clearCount: number;
  clear(): void;
  getQueryData<T>(key: readonly unknown[]): T | undefined;
  setQueryData(key: readonly unknown[], value: unknown): void;
}

interface QueryScopeRuntime {
  QueryClient: new () => RuntimeQueryClient;
  authScopedQueryKey(scope: Scope, key: readonly unknown[]): readonly unknown[];
  currentQueryAuthScope(client: RuntimeQueryClient): Scope | null;
  queryAuthIdentityFromSession(value: unknown): Pick<Scope, "userId" | "sessionId"> | null;
  transitionQueryAuthScope(client: RuntimeQueryClient, scope: Scope | null): void;
  createQueryAuthSessionResolver<T extends { queryScope: Scope | null }>(
    readSession: () => Promise<T>,
    onCommit: (client: RuntimeQueryClient, session: T) => void,
  ): (client: RuntimeQueryClient) => Promise<{ protectedSession: T; queryScope: Scope | null }>;
}

function loadQueryScopeRuntime(): QueryScopeRuntime {
  const stub = `class QueryClient {
  data = new Map<string, unknown>();
  clearCount = 0;
  constructor(_options?: unknown) {}
  clear(): void { this.clearCount += 1; this.data.clear(); }
  getQueryData<T>(key: readonly unknown[]): T | undefined {
    return this.data.get(JSON.stringify(key)) as T | undefined;
  }
  setQueryData(key: readonly unknown[], value: unknown): void {
    this.data.set(JSON.stringify(key), value);
  }
}`;
  const source = queryClientContent()
    .replace('import { QueryClient } from "@tanstack/react-query";', stub)
    .replaceAll("export ", "");
  const javascript = new Bun.Transpiler({ loader: "ts" }).transformSync(source);
  const load = new Function(
    `${javascript}\nreturn { QueryClient, authScopedQueryKey, currentQueryAuthScope, queryAuthIdentityFromSession, transitionQueryAuthScope, createQueryAuthSessionResolver };`,
  ) as () => QueryScopeRuntime;
  return load();
}

describe("generated TanStack authenticated Query boundary", () => {
  test("the emitted route seeds only the session accepted by the generation guard", async () => {
    type Session = { queryScope: Scope | null; marker: string };
    const runtime = loadQueryScopeRuntime();
    const client = new runtime.QueryClient();
    const accountA: Scope = { userId: "a", sessionId: "a", tenantId: null, teamId: null };
    const accountB: Scope = { userId: "b", sessionId: "b", tenantId: null, teamId: null };
    runtime.transitionQueryAuthScope(client, accountA);
    let finishOld!: (session: Session) => void;
    const old = new Promise<Session>((resolve) => {
      finishOld = resolve;
    });
    let reads = 0;
    const source = tanstackServerFoundationFiles("single", true, true)
      .find(({ path }) => path.endsWith("/lib/protected-route.ts"))!
      .content.replace(/^import[\s\S]*?;\r?\n/gm, "")
      .replaceAll("export ", "");
    const load = new Function(
      "runtime",
      "getProtectedRouteSession",
      `
      const { authScopedQueryKey, createQueryAuthSessionResolver } = runtime;
      const queryOptions = (options) => options;
      const redirect = (options) => options;
      ${new Bun.Transpiler({ loader: "ts" }).transformSync(source)}
      return resolveRouteAuth;
    `,
    ) as (
      scopeRuntime: QueryScopeRuntime,
      readSession: () => Promise<Session>,
    ) => (
      queryClient: RuntimeQueryClient,
    ) => Promise<{ protectedSession: Session; queryScope: Scope | null }>;
    const resolveAuth = load(runtime, () =>
      ++reads === 1 ? old : Promise.resolve({ queryScope: accountB, marker: "current" }),
    );
    const pending = resolveAuth(client);
    await Promise.resolve();
    runtime.transitionQueryAuthScope(client, accountB);
    client.setQueryData(["new-owner-data"], "preserved");
    finishOld({ queryScope: accountA, marker: "obsolete" });
    const result = await pending;
    expect(result.protectedSession.marker).toBe("current");
    expect(runtime.currentQueryAuthScope(client)).toEqual(accountB);
    expect(client.getQueryData(["new-owner-data"])).toBe("preserved");
    expect(
      client.getQueryData(runtime.authScopedQueryKey(accountA, ["protected-route", "session"])),
    ).toBeUndefined();
    expect(
      client.getQueryData(runtime.authScopedQueryKey(accountB, ["protected-route", "session"])),
    ).toEqual({ queryScope: accountB, marker: "current" });
    expect(reads).toBe(2);
  });

  test("clears private data across users and tenant transitions while scoping keys", () => {
    const runtime = loadQueryScopeRuntime();
    const client = new runtime.QueryClient();
    const accountA: Scope = {
      userId: "user-a",
      sessionId: "session-a",
      tenantId: "tenant-a",
      teamId: null,
    };
    const accountB: Scope = {
      userId: "user-b",
      sessionId: "session-b",
      tenantId: "tenant-b",
      teamId: null,
    };

    runtime.transitionQueryAuthScope(client, accountA);
    const accountAKey = runtime.authScopedQueryKey(accountA, ["billing", "subscriptions"]);
    client.setQueryData(accountAKey, [{ id: "subscription-a" }]);
    const clearCountAfterA = client.clearCount;

    runtime.transitionQueryAuthScope(client, accountA);
    expect(client.clearCount).toBe(clearCountAfterA);
    expect(client.getQueryData(accountAKey)).toEqual([{ id: "subscription-a" }]);

    runtime.transitionQueryAuthScope(client, accountB);
    const accountBKey = runtime.authScopedQueryKey(accountB, ["billing", "subscriptions"]);
    expect(accountBKey).not.toEqual(accountAKey);
    expect(client.clearCount).toBe(clearCountAfterA + 1);
    expect(client.getQueryData(accountAKey)).toBeUndefined();
    expect(runtime.currentQueryAuthScope(client)).toEqual(accountB);

    runtime.transitionQueryAuthScope(client, { ...accountB, tenantId: "tenant-c" });
    expect(client.clearCount).toBe(clearCountAfterA + 2);
  });

  test("provider sessions contribute only immediate user and session identity", () => {
    const runtime = loadQueryScopeRuntime();
    expect(
      runtime.queryAuthIdentityFromSession({
        user: { id: "user-a" },
        session: {
          id: "session-a",
          activeOrganizationId: "organization-a",
          activeTeamId: "team-a",
        },
      }),
    ).toEqual({
      userId: "user-a",
      sessionId: "session-a",
    });
    expect(runtime.queryAuthIdentityFromSession({ user: { id: "user-a" } })).toBeNull();
  });

  test("emits an application-backed server function and hydrated loader", () => {
    for (const mode of ["monorepo", "single"] as const) {
      const files = tanstackServerFoundationFiles(mode, true, true);
      const combined = files.map(({ content }) => content).join("\n");
      const applicationImport =
        mode === "monorepo" ? "@repo/services/application" : "@/server/services/application";
      expect(combined).toContain('createServerFn({ method: "GET" })');
      expect(combined).toContain(`import("${applicationImport}")`);
      expect(combined).toContain("createRequestApplicationForRequest(headers)");
      expect(combined).toContain("await application.me()");
      expect(combined).toContain("ensureQueryData(protectedRouteSessionQueryOptions");
      expect(combined).toContain("authScopedQueryKey(scope, PROTECTED_SESSION_KEY)");
      expect(files.some(({ path }) => path.endsWith("orpc-caller.server.ts"))).toBe(false);
      expect(combined).not.toContain("@orpc/");
      expect(combined).not.toContain("createRouterClient");
      expect(combined).not.toContain("RPCLink");
      expect(combined).not.toContain("createRequestApiClient");
      expect(combined).not.toMatch(/\bfetch\s*\(/);
    }
    expect(tanstackServerFoundationFiles("monorepo", false, true)).toEqual([]);
  });

  test("executes the TanStack server function through the application facade", async () => {
    const serverFunctionSource =
      tanstackServerFoundationFiles("monorepo", true, true).find(({ path }) =>
        path.endsWith("/lib/server-functions.ts"),
      )?.content ?? "";
    const executable = serverFunctionSource
      .replace('import { createServerFn } from "@tanstack/react-start";\n', "")
      .replace(
        `await Promise.all([
      import("@tanstack/react-start/server"),
      import("@repo/services/application"),
    ])`,
        "await Promise.all([Promise.resolve(serverRuntime), Promise.resolve(applicationModule)])",
      )
      .replaceAll("export ", "");
    const javascript = new Bun.Transpiler({ loader: "ts" }).transformSync(executable);
    const load = new Function(
      "createServerFn",
      "serverRuntime",
      "applicationModule",
      `${javascript}\nreturn getProtectedRouteSession;`,
    ) as (
      serverFn: () => { handler<T>(callback: () => Promise<T>): () => Promise<T> },
      server: { getRequestHeaders(): Headers },
      application: {
        createRequestApplicationForRequest(headers: Headers): Promise<{
          principal: {
            identityUserId: string;
            sessionId: string;
            activeOrganizationId: string | null;
            activeTeamId: string | null;
          };
          me(): Promise<unknown>;
        }>;
      },
    ) => () => Promise<{ user: unknown; queryScope: Scope | null }>;
    let receivedCookie: string | null = null;
    const getProtectedRouteSession = load(
      () => ({ handler: (callback) => callback }),
      { getRequestHeaders: () => new Headers({ cookie: "session=opaque" }) },
      {
        async createRequestApplicationForRequest(headers) {
          receivedCookie = headers.get("cookie");
          return {
            principal: {
              identityUserId: "user-a",
              sessionId: "session-a",
              activeOrganizationId: "tenant-a",
              activeTeamId: "team-a",
            },
            async me() {
              return {
                user: {
                  id: "user-a",
                  email: "a@example.com",
                  name: null,
                  role: "user",
                  banned: false,
                },
                sessionId: "session-a",
                activeOrganizationId: "tenant-a",
                activeTeamId: "team-a",
              };
            },
          };
        },
      },
    );

    const result = await getProtectedRouteSession();
    expect(receivedCookie).toBe("session=opaque");
    expect(result.queryScope).toEqual({
      userId: "user-a",
      sessionId: "session-a",
      tenantId: "tenant-a",
      teamId: "team-a",
    });
  });

  test("attributes server functions to generator-owned Transport provenance", () => {
    for (const mode of ["monorepo", "single"] as const) {
      const resolution = resolveCreateConfig({
        name: `tanstack-caller-${mode}`,
        runtime: "bun",
        mode,
        framework: "tanstack-start",
        billing: [],
        features: [],
        database: "postgres",
        databaseWasExplicit: true,
        apps: ["web"],
        preset: undefined,
        cache: "none",
        deploy: "none",
      });
      expect(resolution.ok).toBe(true);
      if (!resolution.ok) throw new Error(resolution.message);
      const plan = buildProjectGenerationPlan(resolution.resolvedConfig, {
        desiredConfig: resolution.desiredConfig,
      });
      const path =
        mode === "monorepo"
          ? "apps/web/src/lib/server-functions.ts"
          : "src/lib/server-functions.ts";
      const serverFunctions = plan.files.find(({ physicalPath }) => physicalPath === path);
      expect(serverFunctions).toMatchObject({
        lifecycle: "generator-owned",
        owner: "transport",
        provenance: {
          capability: "transport",
          renderer: "resolved-template-compiler.v2",
        },
      });
    }
  });

  test("keeps all four TanStack corners application-backed while preserving browser RPC", () => {
    for (const mode of ["monorepo", "single"] as const) {
      for (const database of ["postgres", "convex"] as const) {
        const resolution = resolveCreateConfig({
          name: `tanstack-application-${mode}-${database}`,
          runtime: "bun",
          mode,
          framework: "tanstack-start",
          billing: [],
          features: [],
          database,
          databaseWasExplicit: true,
          apps: ["web"],
          preset: undefined,
          cache: "none",
          deploy: "none",
        });
        expect(resolution.ok).toBe(true);
        if (!resolution.ok) throw new Error(resolution.message);
        const plan = buildProjectGenerationPlan(resolution.resolvedConfig, {
          desiredConfig: resolution.desiredConfig,
        });
        const root = mode === "monorepo" ? "apps/web/" : "";
        const serverFunctions =
          plan.files.find(
            ({ physicalPath }) => physicalPath === `${root}src/lib/server-functions.ts`,
          )?.content ?? "";
        const browserRpc =
          plan.files.find(({ physicalPath }) => physicalPath === `${root}src/lib/orpc.ts`)
            ?.content ?? "";
        expect(serverFunctions).toContain("createRequestApplicationForRequest(headers)");
        expect(serverFunctions).not.toContain("@orpc/");
        expect(serverFunctions).not.toContain("createRouterClient");
        expect(
          plan.files.some(({ physicalPath }) => physicalPath.endsWith("orpc-caller.server.ts")),
        ).toBe(false);
        expect(browserRpc).toContain('const RPC_PATH = "/api/rpc"');
        expect(browserRpc).toContain("createORPCClient");
      }
    }
  });

  test("mounts the auth cache owner boundary in authenticated web providers", () => {
    const monorepo = providersFileContent("tanstack", false, false, false, true);
    const single = singleProvidersTanstackContent(false, false, true);
    for (const provider of [monorepo, single]) {
      expect(provider).toContain("QueryAuthCacheBoundary");
      expect(provider).toContain("<QueryAuthCacheBoundary queryClient={client}>");
    }
    expect(providersFileContent("next", false, false, false, true)).toContain(
      "QueryAuthCacheBoundary",
    );
    expect(singleProvidersTanstackContent(false, false, false)).not.toContain(
      "QueryAuthCacheBoundary",
    );

    const tanstackSignOut = headerUserMenuContent("tanstack");
    expect(tanstackSignOut).toContain("transitionQueryAuthScope(getQueryClient(), null)");
    expect(headerUserMenuContent("next")).toContain("transitionQueryAuthScope");
  });

  test("emits Next cache ownership and matching request-scoped session data in both modes", () => {
    for (const mode of ["monorepo", "single"] as const) {
      for (const database of ["postgres", "convex"] as const) {
        const resolution = resolveCreateConfig({
          name: `next-cache-${mode}-${database}`,
          runtime: "bun",
          mode,
          framework: "nextjs",
          billing: [],
          features: [],
          database,
          databaseWasExplicit: true,
          apps: ["web"],
          preset: undefined,
          cache: "none",
          deploy: "none",
        });
        if (!resolution.ok) throw new Error(resolution.message);
        const plan = buildProjectGenerationPlan(resolution.resolvedConfig, {
          desiredConfig: resolution.desiredConfig,
        });
        const root = mode === "monorepo" ? "apps/web/" : "";
        const read = (path: string) =>
          plan.files.find(({ physicalPath }) => physicalPath === `${root}${path}`)?.content ?? "";
        expect(read("src/components/providers.tsx")).toContain(
          "<QueryAuthCacheBoundary queryClient={client}>",
        );
        expect(read("src/components/query-auth-boundary.tsx")).toContain(
          "useCanonicalQueryAuthScope(queryClient, session.data, session.isPending, readCurrentRequest)",
        );
        expect(read("src/components/query-auth-boundary.tsx")).toContain(
          "state.isPending || state.error",
        );
        expect(read("src/components/query-auth-boundary.tsx")).not.toContain(
          "queryAuthScopeFromSession",
        );
        expect(read("src/app/settings/page.tsx")).toContain("initialScope={initialScope}");
        expect(read("src/app/settings/sessions.ts")).toContain(
          "queryInitialDataForScope(scope, initialScope, initialData)",
        );
        expect(read("tests/query-auth.test.ts")).toContain("new QueryObserver(client");
      }
    }
  });

  test("protects auth-required capability routes but leaves feature flags public", () => {
    const options = {
      mode: "monorepo",
      framework: "tanstack-start",
      apps: ["web"],
      notifications: true,
      storage: true,
      featureFlags: true,
      jobs: true,
      i18n: false,
      requestApplication: true,
    } as const;
    for (const route of ["notifications", "storage", "jobs"]) {
      const generated = routeFile(options, "web", route, "Page", route).content;
      expect(generated, route).toContain("requireProtectedRoute(context.queryClient)");
      expect(generated, route).toContain("loader: ({ context }) => loadProtectedRoute(context)");
    }
    const featureFlags = routeFile(
      options,
      "web",
      "feature-flags",
      "FeatureFlagsPage",
      "feature-flags",
    ).content;
    expect(featureFlags).not.toContain("requireProtectedRoute");

    const explicit = tanstackProtectedRouteDefinition(
      "private",
      "PrivatePage",
      "@/features/private/page",
    );
    expect(explicit).toContain('createFileRoute("/private")');

    for (const source of [
      pdfWebPageContent("monorepo", "tanstack-start"),
      tanstackEveAgentPageFile("monorepo").content,
    ]) {
      expect(source).toContain("requireProtectedRoute(context.queryClient)");
      expect(source).toContain("loader: ({ context }) => loadProtectedRoute(context)");
    }
  });

  test("single TanStack billing mounts the real shared feature", () => {
    const files = singleTanstackBillingFeatureFiles(false);
    const paths = files.map(({ path }) => path);
    expect(paths).toContain("src/routes/billing.tsx");
    expect(paths).toContain("src/features/billing/billing-page.tsx");
    expect(paths).toContain("src/features/billing/use-billing.ts");
    const route = files.find(({ path }) => path === "src/routes/billing.tsx")?.content ?? "";
    expect(route).toContain('import { BillingPage } from "@/features/billing/billing-page"');
    expect(route).toContain("requireProtectedRoute(context.queryClient)");
    expect(route).not.toContain("No billing configured");
  });

  test("TanStack messaging is protected and scoped without changing the Next transport", () => {
    const tanstack = messagingTanstackFiles("monorepo");
    const route = tanstack.find(({ path }) => path.endsWith("/routes/messages.tsx"))?.content ?? "";
    const hook = tanstack.find(({ path }) => path.endsWith("/use-messaging.ts"))?.content ?? "";
    expect(route).toContain("requireProtectedRoute(context.queryClient)");
    expect(route).toContain("loadInitialConversations(context)");
    expect(hook).toContain("messagingConversationsQueryKey(scope)");
    expect(hook).toContain('enabled: Boolean(scope) && typeof window !== "undefined"');

    const convexRoute =
      messagingConvexTanstackWebFiles("monorepo").find(({ path }) =>
        path.endsWith("/routes/messages.tsx"),
      )?.content ?? "";
    expect(convexRoute).toContain("requireProtectedRoute(context.queryClient)");

    const next = messagingNextFiles("monorepo")
      .map(({ content }) => content)
      .join("\n");
    expect(next).not.toContain("authScopedQueryKey");
    expect(next).not.toContain("requireProtectedRoute");
  });

  test("scopes every maintained TanStack personalized Query surface", () => {
    const admin = adminDataFiles({
      database: "postgres",
      framework: "tanstack",
      mode: "monorepo",
      sourceRoot: "apps/web/src",
    })
      .map(({ content }) => content)
      .join("\n");
    const identity = webIdentityWorkspaceDataFiles("monorepo", "tanstack")
      .map(({ content }) => content)
      .join("\n");
    const settings = tanstackSettingsDataFeatureFiles(
      "apps/web/src/features/settings",
      true,
      "",
      true,
      true,
    )
      .map(({ content }) => content)
      .join("\n");
    const billing = tanstackUseBillingHookContent();
    for (const source of [admin, identity, settings, billing]) {
      expect(source).toMatch(/authScopedQueryKey|adminUsersQueryKey/);
      expect(source).toContain("currentQueryAuthScope");
      expect(source).not.toContain("queryFn: async () => []");
    }
    expect(admin).toContain("adminUsersQueryKey(scope, input)");

    const nextAdmin = adminDataFiles({
      database: "postgres",
      framework: "next",
      mode: "monorepo",
      sourceRoot: "apps/web/src",
    })
      .map(({ content }) => content)
      .join("\n");
    const nextIdentity = new Map(
      webIdentityWorkspaceDataFiles("monorepo", "next").map(({ path, content }) => [path, content]),
    );
    const nextQueries =
      nextIdentity.get("apps/web/src/features/identity-workspace/queries.ts") ?? "";
    const nextMutations =
      nextIdentity.get("apps/web/src/features/identity-workspace/mutations.ts") ?? "";
    const nextActions = nextIdentity.get("apps/web/src/app/settings/workspace/actions.ts") ?? "";
    expect(nextAdmin).not.toContain("authScopedQueryKey");
    expect(nextQueries).toContain("authScopedQueryKey(scope, meOptions.queryKey)");
    expect(nextQueries).toContain("authScopedQueryKey(scope, options.queryKey)");
    expect(nextMutations).toContain(
      'authScopedQueryKey(scope, orpc.identity.organizations.hasPermission.key({ type: "query" }))',
    );
    expect(nextMutations).toContain('from "@/app/settings/workspace/actions"');
    expect(nextMutations).not.toContain(".mutationOptions(");
    expect(nextActions).toContain('"use server";');
    expect(nextActions).toContain("createRequestApplicationForRequest");
    expect(nextActions).not.toContain("authScopedQueryKey");
  });
});
