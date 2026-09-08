import { describe, expect, test } from "bun:test";
import { queryAuthStateContent } from "../../src/templates/apps/fragments/lib/query-auth-state.js";
import {
  identityWorkspaceBrowserMutationsContent,
  identityWorkspaceNextMutationsContent,
} from "../../src/templates/apps/fragments/identity-workspace/web-data.js";
import { desktopWorkspaceRouteContent } from "../../src/templates/apps/fragments/identity-workspace/desktop.js";
import { expoWorkspaceContent } from "../../src/templates/apps/fragments/identity-workspace/expo.js";
import { identityWorkspaceControllerContent } from "../../src/templates/apps/fragments/identity-workspace/web-controller.js";

interface Scope {
  userId: string;
  sessionId: string;
  tenantId: string | null;
  teamId: string | null;
}

class QueryCache {
  private values = new Map<string, unknown>();
  clear(): void {
    this.values.clear();
  }
  getQueryData<T>(key: readonly unknown[]): T | undefined {
    return this.values.get(JSON.stringify(key)) as T | undefined;
  }
  setQueryData(key: readonly unknown[], value: unknown): void {
    this.values.set(JSON.stringify(key), value);
  }
}

interface ScopeRuntime {
  currentQueryAuthScope(client: QueryCache): Scope | null;
  transitionQueryAuthScope(client: QueryCache, scope: Scope): void;
  requestQueryAuthScopeRefresh(client: QueryCache): void;
  subscribeQueryAuthScopeRefresh(client: QueryCache, listener: () => void): () => void;
  createQueryAuthSessionResolver(
    read: () => Promise<{ queryScope: Scope }>,
    commit: (client: QueryCache, session: { queryScope: Scope }) => void,
  ): (client: QueryCache) => Promise<{ queryScope: Scope }>;
}

function scopeRuntime(): ScopeRuntime {
  const javascript = new Bun.Transpiler({ loader: "ts" }).transformSync(
    queryAuthStateContent().replace(/^export /gm, ""),
  );
  return new Function(
    `${javascript}; return {
      currentQueryAuthScope, transitionQueryAuthScope, requestQueryAuthScopeRefresh,
      subscribeQueryAuthScopeRefresh, createQueryAuthSessionResolver,
    };`,
  )() as ScopeRuntime;
}

function removalSuccess(
  source: string,
  operation: "removeMember" | "removeTeamMember",
  runtime: ScopeRuntime,
  client: QueryCache,
): () => void {
  const prefix = `const ${operation} = `;
  const declaration = source.split("\n").find((line) => line.trimStart().startsWith(prefix));
  if (!declaration) throw new Error(`Missing emitted mutation ${operation}`);
  const expression = declaration.trim().slice(prefix.length).replace(/;$/, "");
  const options = (value: { onSuccess(): void }) => value;
  const procedure = { mutationOptions: options };
  const orpc = {
    identity: { organizations: { removeMember: procedure }, teams: { removeMember: procedure } },
  };
  const mutation = new Function(
    "useMutation",
    "orpc",
    "queryClient",
    "requestQueryAuthScopeRefresh",
    "removeMemberAction",
    "removeTeamMemberAction",
    "invalidateWorkspace",
    "invalidate",
    `return ${expression};`,
  )(
    options,
    orpc,
    client,
    runtime.requestQueryAuthScopeRefresh,
    () => {},
    () => {},
    async () => {},
    async () => {},
  ) as {
    onSuccess(): void;
  };
  return mutation.onSuccess;
}

const sources = [
  ["Next", identityWorkspaceNextMutationsContent()],
  ["TanStack", identityWorkspaceBrowserMutationsContent()],
  ["Electron", desktopWorkspaceRouteContent()],
  ["Expo", expoWorkspaceContent()],
] as const;

describe("workspace self-removal scope recovery", () => {
  for (const [platform, source] of sources) {
    for (const operation of ["removeMember", "removeTeamMember"] as const) {
      test(`${platform} ${operation} clears the old owner synchronously and rejects its delayed read`, async () => {
        const runtime = scopeRuntime();
        const client = new QueryCache();
        const previous: Scope = {
          userId: "actor",
          sessionId: "session",
          tenantId: "organization",
          teamId: "team",
        };
        const current = {
          ...previous,
          tenantId: operation === "removeMember" ? null : previous.tenantId,
          teamId: null,
        };
        runtime.transitionQueryAuthScope(client, previous);
        client.setQueryData(["private-workspace"], "removed membership data");
        let releasePrevious!: (session: { queryScope: Scope }) => void;
        const previousRead = new Promise<{ queryScope: Scope }>((resolve) => {
          releasePrevious = resolve;
        });
        const committed: Scope[] = [];
        let reads = 0;
        const resolve = runtime.createQueryAuthSessionResolver(
          async () => (++reads === 1 ? previousRead : { queryScope: current }),
          (cache, session) => {
            committed.push(session.queryScope);
            cache.setQueryData(["workspace-owner"], session.queryScope);
          },
        );
        const staleRequest = resolve(client);
        await Promise.resolve();
        let refreshes = 0;
        const unsubscribe = runtime.subscribeQueryAuthScopeRefresh(client, () => {
          refreshes += 1;
          expect(runtime.currentQueryAuthScope(client)).toBeNull();
          expect(client.getQueryData(["private-workspace"])).toBeUndefined();
        });

        removalSuccess(source, operation, runtime, client)();

        expect(refreshes).toBe(1);
        expect(runtime.currentQueryAuthScope(client)).toBeNull();
        const refreshed = await resolve(client);
        expect(refreshed.queryScope).toEqual(current);
        releasePrevious({ queryScope: previous });
        expect((await staleRequest).queryScope).toEqual(current);
        expect(runtime.currentQueryAuthScope(client)).toEqual(current);
        expect(client.getQueryData(["workspace-owner"])).toEqual(current);
        expect(committed.length).toBeGreaterThan(0);
        expect(committed.every((scope) => scope.teamId === null)).toBe(true);
        expect(committed.every((scope) => scope.tenantId === current.tenantId)).toBe(true);
        unsubscribe();
      });
    }
  }
});

interface TeamCallbacks {
  teamCreated(id: string, organizationId: string): void;
}

interface WorkspaceView {
  organizationId: string;
  teamId: string | null;
  teamName: string;
  setSelectedOrganizationId(id: string): void;
  setTeamName(name: string): void;
}

function workspaceController() {
  const cells: unknown[] = [];
  const effects: Array<() => void> = [];
  let cursor = 0;
  let callbacks: TeamCallbacks | undefined;
  const react = {
    useState<T>(initial: T): [T, (value: T) => void] {
      const index = cursor++;
      if (!(index in cells)) cells[index] = initial;
      return [
        cells[index] as T,
        (value) => {
          cells[index] = value;
        },
      ];
    },
    useRef<T>(initial: T): { current: T } {
      const index = cursor++;
      if (!(index in cells)) cells[index] = { current: initial };
      return cells[index] as { current: T };
    },
    useLayoutEffect(effect: () => void): void {
      effects.push(effect);
    },
  };
  const javascript = new Bun.Transpiler({ loader: "ts" }).transformSync(
    identityWorkspaceControllerContent()
      .replace(/^import .*;\n/gm, "")
      .replace(/^export /gm, ""),
  );
  const renderController = new Function(
    "React",
    "useIdentityWorkspaceQueries",
    "useIdentityWorkspaceMutations",
    "workspaceAccess",
    `${javascript}; return useIdentityWorkspaceController;`,
  )(
    react,
    (organizationId: string | null, teamId: string | null) => ({
      organizationId: organizationId ?? "org-a",
      teamId,
      permissions: {},
      members: { data: [], isSuccess: true },
      teamMembers: { data: [], isSuccess: true },
    }),
    (value: TeamCallbacks) => {
      callbacks = value;
      return {};
    },
    () => ({}),
  ) as (error: string) => WorkspaceView;
  return {
    render() {
      cursor = 0;
      const view = renderController("Failed");
      for (const effect of effects.splice(0)) effect();
      return view;
    },
    callbacks: () => {
      if (!callbacks) throw new Error("Render the workspace before starting a mutation");
      return callbacks;
    },
  };
}

function teamCreationSuccess(source: string, callbacks: TeamCallbacks) {
  const prefix = "const createTeam = ";
  const declaration = source.split("\n").find((line) => line.trimStart().startsWith(prefix));
  if (!declaration) throw new Error("Missing emitted createTeam mutation");
  const expression = declaration.trim().slice(prefix.length).replace(/;$/, "");
  const identity = (value: unknown) => value;
  return (
    new Function(
      "useMutation",
      "orpc",
      "callbacks",
      "invalidateWorkspace",
      "createTeamAction",
      `return ${expression};`,
    )(
      identity,
      { identity: { teams: { create: { mutationOptions: identity } } } },
      callbacks,
      async () => {},
      async () => {},
    ) as { onSuccess(value: { team: { id: string; organizationId: string } }): Promise<void> }
  ).onSuccess;
}

describe("workspace team creation selection ownership", () => {
  for (const [platform, source] of sources.slice(0, 2)) {
    test(`${platform} late team creation cannot replace another organization's selection or draft`, async () => {
      const controller = workspaceController();
      const first = controller.render();
      const completeFirst = teamCreationSuccess(source, controller.callbacks());
      first.setSelectedOrganizationId("org-b");
      const second = controller.render();
      second.setTeamName("Draft for B");
      await completeFirst({ team: { id: "team-a", organizationId: "org-a" } });
      const afterLateResponse = controller.render();
      expect(afterLateResponse.organizationId).toBe("org-b");
      expect(afterLateResponse.teamId).toBeNull();
      expect(afterLateResponse.teamName).toBe("Draft for B");

      await teamCreationSuccess(
        source,
        controller.callbacks(),
      )({ team: { id: "team-b", organizationId: "org-b" } });
      const afterCurrentResponse = controller.render();
      expect(afterCurrentResponse.teamId).toBe("team-b");
      expect(afterCurrentResponse.teamName).toBe("");
    });
  }
});
