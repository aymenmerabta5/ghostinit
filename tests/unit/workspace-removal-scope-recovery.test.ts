import { describe, expect, test } from "bun:test";
import { queryAuthStateContent } from "../../src/templates/apps/fragments/lib/query-auth-state.js";
import {
  identityWorkspaceBrowserMutationsContent,
  identityWorkspaceNextMutationsContent,
} from "../../src/templates/apps/fragments/identity-workspace/web-data.js";
import {
  desktopWorkspaceFeatureFiles,
  expoWorkspaceFeatureFiles,
} from "../../src/templates/apps/fragments/identity-workspace/native-workspace.js";
import {
  workspaceSelectionContent,
  workspaceTeamsContent,
} from "../../src/templates/apps/fragments/identity-workspace/workspace-workflows.js";
import { deferred, generatedFormHarness } from "../helpers/generated-form-harness.js";

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
  const javascript = new Bun.Transpiler({ loader: "ts" }).transformSync(
    source.replace(/^import[^;]+;\s*/gm, "").replace(/^export /gm, ""),
  );
  const options = (_operation: unknown, effects: { onSuccess(): void }) => effects;
  const procedure = { call: async () => ({}) };
  const orpc = {
    identity: { organizations: { removeMember: procedure }, teams: { removeMember: procedure } },
  };
  const mutation = new Function(
    "useAuthOwnedMutation",
    "useQueryClient",
    "orpc",
    "queryClient",
    "requestQueryAuthScopeRefresh",
    "currentQueryAuthScope",
    "removeMemberAction",
    "removeTeamMemberAction",
    `${javascript}; return use${operation === "removeMember" ? "RemoveMember" : "RemoveTeamMember"}Mutation();`,
  )(
    options,
    () => client,
    orpc,
    client,
    runtime.requestQueryAuthScopeRefresh,
    runtime.currentQueryAuthScope,
    () => {},
    () => {},
  ) as {
    onSuccess(): void;
  };
  return mutation.onSuccess;
}

const sources = [
  ["Next", identityWorkspaceNextMutationsContent()],
  ["TanStack", identityWorkspaceBrowserMutationsContent()],
  [
    "Electron",
    desktopWorkspaceFeatureFiles("monorepo", false).find(({ path }) =>
      path.endsWith("/mutations.ts"),
    )!.content,
  ],
  [
    "Expo",
    expoWorkspaceFeatureFiles("monorepo", false).find(({ path }) => path.endsWith("/mutations.ts"))!
      .content,
  ],
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

interface TeamOutcome {
  status: "success";
  data: { team: { id: string; organizationId: string } };
  isCurrent(): boolean;
}
interface TeamView {
  selection: {
    selectOrganization(id: string): void;
    queries: { organizationId: string; teamId: string | null };
  };
  teams: { form: { handleSubmit(): Promise<void> } };
}

function workspaceWorkflow(native = false) {
  const request = deferred<TeamOutcome>();
  let dependencies = "";
  const commitEffects: Array<() => void> = [];
  const source =
    workspaceSelectionContent() +
    "\n" +
    workspaceTeamsContent(native) +
    "\nconst useForm = useAppForm; const useRef = React.useRef;\nexport function Probe() { const selection = useWorkspaceSelection(); return { selection, teams: useWorkspaceTeams(selection) }; }";
  const h = generatedFormHarness(source, ["Probe"], {
    useLayoutEffect: (effect: () => void, next: unknown[]) => {
      const key = JSON.stringify(next);
      if (key !== dependencies) {
        dependencies = key;
        commitEffects.push(effect);
      }
    },
    useIdentityWorkspaceQueries: (organizationId: string | null, teamId: string | null) => ({
      organizationId: organizationId ?? "org-a",
      teamId,
      permissions: {},
      teams: { data: [] },
      members: { data: [], isSuccess: true },
      teamMembers: { data: [], isSuccess: true },
    }),
    workspaceAccess: () => ({
      canWriteTeams: true,
      canActivateTeam: true,
      availableTeamMembers: [],
    }),
    teamSchema: {},
    teamMemberSchema: {},
    useCreateTeamMutation: () => ({ run: () => request.promise, isPending: false, error: null }),
    useActivateTeamMutation: () => ({}),
    useAddTeamMemberMutation: () => ({}),
    useRemoveTeamMemberMutation: () => ({}),
  });
  return {
    ...h,
    request,
    render: () => {
      const view = h.render("Probe") as TeamView;
      for (const effect of commitEffects.splice(0)) effect();
      return view;
    },
  };
}

describe("workspace team creation selection ownership", () => {
  for (const native of [false, true]) {
    test(
      (native ? "Expo" : "Web/Electron") +
        " rejects a late team result after an immediate selection change",
      async () => {
        const h = workspaceWorkflow(native);
        const first = h.render();
        const form = h.forms[0]!;
        form.values.name = "Team for A";
        const completion = form.handleSubmit();
        // Selection changes synchronously, before a keyed child has committed its unmount.
        first.selection.selectOrganization("org-b");
        h.request.resolve({
          status: "success",
          data: { team: { id: "team-a", organizationId: "org-a" } },
          isCurrent: () => true,
        });
        await completion;
        const after = h.render();
        expect(after.selection.queries.organizationId).toBe("org-b");
        expect(after.selection.queries.teamId).toBeNull();
        expect(form.resets).toBe(0);
      },
    );
    test(
      (native ? "Expo" : "Web/Electron") +
        " accepts the current selection's team and resets its form",
      async () => {
        const h = workspaceWorkflow(native);
        h.render();
        const form = h.forms[0]!;
        form.values.name = "Team for A";
        const completion = form.handleSubmit();
        h.request.resolve({
          status: "success",
          data: { team: { id: "team-a", organizationId: "org-a" } },
          isCurrent: () => true,
        });
        await completion;
        expect(h.render().selection.queries.teamId).toBe("team-a");
        expect(form.values.name).toBe("");
        expect(form.resets).toBe(1);
      },
    );
    test(
      (native ? "Expo" : "Web/Electron") +
        " keeps a replacement draft when its old mutation is no longer current",
      async () => {
        const h = workspaceWorkflow(native);
        h.render();
        const form = h.forms[0]!;
        form.values.name = "Old draft";
        const completion = form.handleSubmit();
        form.values.name = "Replacement draft";
        h.request.resolve({
          status: "success",
          data: { team: { id: "team-a", organizationId: "org-a" } },
          isCurrent: () => false,
        });
        await completion;
        expect(form.values.name).toBe("Replacement draft");
        expect(form.resets).toBe(0);
      },
    );
  }
});
