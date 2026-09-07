import { describe, expect, test } from "bun:test";
import { queryAuthStateContent } from "../../src/templates/apps/fragments/lib/query-auth-state.js";
import {
  identityWorkspaceBrowserMutationsContent,
  identityWorkspaceNextMutationsContent,
} from "../../src/templates/apps/fragments/identity-workspace/web-data.js";
import { desktopWorkspaceRouteContent } from "../../src/templates/apps/fragments/identity-workspace/desktop.js";
import { expoWorkspaceContent } from "../../src/templates/apps/fragments/identity-workspace/expo.js";

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
