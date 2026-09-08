import { describe, expect, test } from "bun:test";
import { oc } from "@orpc/contract";
import { z } from "zod";
import { desktopApiContractContent } from "../../src/templates/apps/desktop/api-contract.js";
import { apiPackage } from "../../src/templates/api.js";
import { singleApiMeProcedureContent } from "../../src/templates/modes/single/api/routes.js";
import { requestOwnedSnapshotContent } from "../../src/templates/apps/fragments/request-owned-snapshot.js";
import { queryAuthCacheBoundaryContent } from "../../src/templates/apps/fragments/query-auth.js";
import { providersFileContent } from "../../src/templates/apps/fragments/theme.js";
import { singleProvidersTanstackContent } from "../../src/templates/modes/single/components/providers.js";

interface Scope {
  userId: string;
  sessionId: string;
  tenantId: string | null;
  teamId: string | null;
}
interface Node {
  type: unknown;
  props: Record<string, unknown>;
  children: unknown[];
}
const accountA: Scope = {
  userId: "provider-a",
  sessionId: "session-a",
  tenantId: "organization-a",
  teamId: "team-a",
};

function snapshotHarness() {
  let hydrated = false;
  let generation = 1;
  let refreshes = 0;
  const client = {};
  const effects: Array<() => void> = [];
  const auth = {
    scope: accountA as Scope | null,
    isPending: false,
    error: null as Error | null,
    retry() {},
  };
  const React = {
    Fragment: "fragment",
    createElement: (type: unknown, props: Record<string, unknown>, ...children: unknown[]) => ({
      type,
      props,
      children,
    }),
    useSyncExternalStore: () => hydrated,
    useState: () => [false, () => undefined],
    useCallback: (callback: unknown) => callback,
    useEffect: (effect: () => void) => effects.push(effect),
  };
  const source = new Bun.Transpiler({
    loader: "tsx",
    tsconfig: { compilerOptions: { jsx: "react" } },
  }).transformSync(
    requestOwnedSnapshotContent()
      .replace(/^import[^;]+;\s*/gm, "")
      .replace(/^export /gm, ""),
  );
  const render = new Function(
    "React",
    "useQueryClient",
    "useRouter",
    "useQueryAuthSession",
    "QueryAuthStatus",
    "currentQueryAuthGeneration",
    "queryAuthScopeSignature",
    `${source}; return RequestOwnedSnapshot;`,
  )(
    React,
    () => client,
    () => ({
      refresh() {
        refreshes += 1;
      },
    }),
    () => auth,
    "auth-status",
    () => generation,
    (scope: Scope | null) => JSON.stringify(scope),
  ) as (props: { scope: Scope; children: string }) => Node;
  return {
    auth,
    render: (scope = accountA) => render({ scope, children: "private request data" }),
    hydrate() {
      hydrated = true;
    },
    transition(scope: Scope | null) {
      generation += 1;
      auth.scope = scope;
    },
    flushEffects() {
      for (const effect of effects.splice(0)) effect();
    },
    refreshes: () => refreshes,
  };
}

describe("request-owned server snapshots", () => {
  test("web, single, and desktop me validation share canonical session and application scope fields", () => {
    const source = desktopApiContractContent(false, true)
      .replace(/^import[^;]+;\s*/gm, "")
      .replace(/^export /gm, "");
    const load = new Function("oc", "z", `${source}; return desktopApiContract.me;`) as (
      contract: typeof oc,
      schemas: typeof z,
    ) => { "~orpc": { outputSchema: z.ZodType } };
    const schema = load(oc, z)["~orpc"].outputSchema;
    const current = {
      user: {
        id: "domain-a",
        email: "operator@example.test",
        name: "Operator",
        role: "admin",
        banned: false,
      },
      sessionId: "session-a",
      activeOrganizationId: "organization-a",
      activeTeamId: "team-a",
    };
    expect(schema.parse(current)).toEqual(current);
    expect(schema.safeParse({ user: current.user }).success).toBe(false);
    const serverSources = [
      apiPackage().find(({ path }) => path === "packages/api/src/procedures/me.ts")!.content,
      singleApiMeProcedureContent(),
    ];
    for (const serverSource of serverSources) {
      const contract = serverSource
        .replace(/^import[^;]+;\s*/gm, "")
        .replace(/^export /gm, "")
        .split("const implementer")[0];
      const server = new Function("oc", "z", `${contract}; return meContract;`)(oc, z) as {
        "~orpc": { outputSchema: z.ZodType };
      };
      for (const value of [
        current,
        { user: null, sessionId: null, activeOrganizationId: null, activeTeamId: null },
      ]) {
        expect(schema.parse(value)).toEqual(server["~orpc"].outputSchema.parse(value));
      }
      expect(server["~orpc"].outputSchema.safeParse({ user: current.user }).success).toBe(false);
    }
  });

  test("preserves server HTML, suppresses mismatched props before effects, and refreshes once per generation", () => {
    const harness = snapshotHarness();
    expect(harness.render().children).toContain("private request data");
    harness.hydrate();
    expect(harness.render().children).toContain("private request data");
    harness.transition({ ...accountA, userId: "provider-b", sessionId: "session-b" });
    expect(harness.render().type).toBe("auth-status");
    expect(harness.refreshes()).toBe(0);
    harness.flushEffects();
    expect(harness.refreshes()).toBe(1);
    expect(harness.render().type).toBe("auth-status");
    harness.flushEffects();
    expect(harness.refreshes()).toBe(1);
    expect(harness.render(harness.auth.scope!).children).toContain("private request data");
  });

  test("does not reinterpret anonymous, pending, failed, or different-tenant sessions as the original owner", () => {
    const harness = snapshotHarness();
    harness.hydrate();
    harness.auth.isPending = true;
    expect(harness.render().type).toBe("auth-status");
    harness.auth.isPending = false;
    harness.transition({ ...accountA, tenantId: "organization-b" });
    expect(harness.render().type).toBe("auth-status");
    harness.transition(null);
    expect(harness.render().type).toBe("auth-status");
    harness.auth.error = new Error("temporary failure");
    expect(harness.render().props.error).toBe(true);
  });

  test("API-off boundaries contain no application RPC import", () => {
    const content = queryAuthCacheBoundaryContent(undefined, undefined, { hasApi: false });
    expect(content).not.toContain("orpcClient");
    expect(content).not.toContain("@/lib/query-auth-scope");
    expect(content).toContain("observeQueryAuthIdentity");
    expect(content).toContain("<QueryAuthStatus");
  });

  test("localized pending feedback remains inside TanStack translation and theme providers", () => {
    for (const providers of [
      providersFileContent("tanstack", false, false, true, true),
      singleProvidersTanstackContent(false, true, true),
    ]) {
      expect(providers.indexOf("<I18nProvider")).toBeLessThan(
        providers.indexOf("<QueryAuthCacheBoundary"),
      );
      expect(providers.indexOf("<ThemeProvider")).toBeLessThan(
        providers.indexOf("<QueryAuthCacheBoundary"),
      );
      expect(providers.indexOf("<QueryAuthCacheBoundary")).toBeGreaterThan(0);
    }
  });
});
