import { describe, expect, test } from "bun:test";
import { resolveCreateConfig } from "../../src/commands/create/resolution.js";
import { buildProjectGenerationPlan } from "../../src/templates/default.js";

type Mode = "monorepo" | "single";
type Database = "postgres" | "convex";
type IdRecord = { id: string };
interface Snapshot {
  organizations: IdRecord[];
  organizationId: string | null;
  teams: IdRecord[];
  teamId: string | null;
  members: IdRecord[];
  invitations: IdRecord[];
  teamMembers: IdRecord[];
}

function generated(mode: Mode, database: Database): Map<string, string> {
  const result = resolveCreateConfig({
    name: "next-workspace-read",
    runtime: "bun",
    mode,
    framework: "nextjs",
    database,
    databaseWasExplicit: true,
    apps: ["web"],
    preset: "custom",
    cache: "none",
    deploy: "none",
    billing: [],
    features: [],
    withAuth: true,
    withApi: true,
  });
  if (!result.ok) throw new Error(result.message);
  return new Map(
    buildProjectGenerationPlan(result.resolvedConfig).files.map((file) => [
      file.physicalPath,
      file.content,
    ]),
  );
}

function source(files: Map<string, string>, path: string): string {
  const value = files.get(path);
  if (!value) throw new Error(`Missing generated file ${path}`);
  return value;
}

function javascript(value: string): string {
  return new Bun.Transpiler({
    loader: "tsx",
    tsconfig: { compilerOptions: { jsx: "react" } },
  }).transformSync(value.replace(/^import\s+[\s\S]*?;\r?\n/gm, "").replace(/^export\s+/gm, ""));
}

function application(facade: string, canReadInvitations: boolean) {
  const calls: string[] = [];
  const now = new Date("2026-09-05T12:00:00Z");
  const dated = (id: string) => ({ id, createdAt: now, updatedAt: now });
  const createApplication = new Function(
    "RequestApplicationError",
    `${javascript(facade)}; return createRequestApplication;`,
  )(Error) as (dependencies: Record<string, unknown>) => object;
  const instance = createApplication({
    principal: {
      userId: "application-actor",
      identityUserId: "actor",
      sessionId: "session",
      email: "actor@example.test",
      emailVerified: true,
      authenticatedAt: now,
      activeOrganizationId: "org-active",
      activeTeamId: "team-active",
      role: canReadInvitations ? "admin" : "user",
      banned: false,
    },
    rateLimit: async () => {},
    identity: {
      organizations: {
        list: async () => [dated("org-first"), dated("org-active")],
        hasPermission: async () => canReadInvitations,
        listMembers: async () => [dated("member")],
      },
      teams: {
        list: async () => [dated("team-first"), dated("team-active")],
        listMembers: async () => [],
      },
      invitations: {
        list: async () => {
          calls.push("invitations.list");
          if (!canReadInvitations) throw new Error("IDENTITY_ORGANIZATION_FORBIDDEN");
          return [{ ...dated("invitation"), expiresAt: now }];
        },
      },
    },
  });
  return { instance, calls };
}

async function renderWorkspace(page: string, instance: object): Promise<Snapshot> {
  // Execute the emitted loader and retain its JSX ownership envelope. Only the
  // element factory is substituted; request reads and scope delivery stay real.
  interface Element {
    type: string;
    props: Record<string, unknown>;
    children: Element[];
  }
  const loader = page.slice(
    page.indexOf("async function WorkspaceData"),
    page.indexOf("export default function"),
  );
  const read = new Function(
    "React",
    "RequestOwnedSnapshot",
    "IdentityWorkspace",
    "headers",
    "createRequestApplicationForRequest",
    "redirect",
    `${javascript(loader)}; return WorkspaceData;`,
  )(
    {
      createElement: (type: string, props: Record<string, unknown>, ...children: Element[]) => ({
        type,
        props,
        children,
      }),
    },
    "RequestOwnedSnapshot",
    "IdentityWorkspace",
    async () => new Headers(),
    async () => instance,
    (path: string) => {
      throw new Error(`Unexpected redirect ${path}`);
    },
  ) as () => Promise<Element>;
  const rendered = await read();
  expect(rendered.type).toBe("RequestOwnedSnapshot");
  expect(rendered.props.scope).toEqual({
    userId: "actor",
    sessionId: "session",
    tenantId: "org-active",
    teamId: "team-active",
  });
  expect(rendered.children).toHaveLength(1);
  const workspace = rendered.children[0]!;
  expect(workspace.type).toBe("IdentityWorkspace");
  return workspace.props.initialData as Snapshot;
}

interface QueryOptions {
  operation: string;
  input?: { organizationId?: string; teamId?: string };
  enabled?: boolean;
  initialData?: unknown;
}

function readClientQueries(
  querySource: string,
  snapshot: Snapshot,
  canReadInvitations: boolean,
  selectedOrganizationId: string | null = null,
) {
  const queries: QueryOptions[] = [];
  const procedure = (operation: string) => ({
    queryOptions: (options: Omit<QueryOptions, "operation">) => ({ ...options, operation }),
  });
  const useQuery = (options: QueryOptions) => {
    queries.push(options);
    if (options.operation === "permission") return { data: { allowed: canReadInvitations } };
    return { data: options.initialData };
  };
  const orpc = {
    identity: {
      organizations: {
        list: procedure("organizations"),
        hasPermission: procedure("permission"),
        listMembers: procedure("members"),
      },
      teams: { list: procedure("teams"), listMembers: procedure("teamMembers") },
      invitations: { list: procedure("invitations") },
    },
  };
  const read = new Function(
    "useQuery",
    "orpc",
    `${javascript(querySource)}; return useIdentityWorkspaceQueries;`,
  )(useQuery, orpc) as (
    organizationId: string | null,
    teamId: string | null,
    initialData: Snapshot,
  ) => { organizationId: string | null; teamId: string | null };
  const selection = read(selectedOrganizationId, null, snapshot);
  return {
    selection: { organizationId: selection.organizationId, teamId: selection.teamId },
    queries,
  };
}

describe("Next workspace server read and hydration", () => {
  for (const mode of ["monorepo", "single"] as const) {
    for (const database of ["postgres", "convex"] as const) {
      test(`${mode}/${database} renders members without forbidden invitation reads`, async () => {
        const files = generated(mode, database);
        const root = mode === "monorepo" ? "apps/web/src" : "src";
        const services = mode === "monorepo" ? "packages/services/src" : "src/server/services";
        const { instance, calls } = application(
          source(files, `${services}/application/facade.ts`),
          false,
        );
        const snapshot = await renderWorkspace(
          source(files, `${root}/app/settings/workspace/page.tsx`),
          instance,
        );
        expect(snapshot.invitations).toEqual([]);
        expect(snapshot.members).toHaveLength(1);
        expect(calls).toEqual([]);
        const client = readClientQueries(
          source(files, `${root}/features/identity-workspace/queries.ts`),
          snapshot,
          false,
        );
        expect(client.queries.find((query) => query.operation === "invitations")?.enabled).toBe(
          false,
        );
      });

      test(`${mode}/${database} preserves active organization and team through hydration`, async () => {
        const files = generated(mode, database);
        const root = mode === "monorepo" ? "apps/web/src" : "src";
        const services = mode === "monorepo" ? "packages/services/src" : "src/server/services";
        const { instance, calls } = application(
          source(files, `${services}/application/facade.ts`),
          true,
        );
        const snapshot = await renderWorkspace(
          source(files, `${root}/app/settings/workspace/page.tsx`),
          instance,
        );
        expect(snapshot.organizationId).toBe("org-active");
        expect(snapshot.teamId).toBe("team-active");
        expect(snapshot.invitations).toHaveLength(1);
        expect(calls).toEqual(["invitations.list"]);
        const querySource = source(files, `${root}/features/identity-workspace/queries.ts`);
        const client = readClientQueries(querySource, snapshot, true);
        expect(client.selection).toEqual({
          organizationId: "org-active",
          teamId: "team-active",
        });
        expect(client.queries.find((query) => query.operation === "invitations")?.enabled).toBe(
          true,
        );
        const changed = readClientQueries(querySource, snapshot, false, "org-first");
        expect(changed.selection.organizationId).toBe("org-first");
        expect(changed.selection.teamId).toBeNull();
        expect(
          changed.queries.find((query) => query.operation === "teamMembers")?.initialData,
        ).toBeUndefined();
      });
    }
  }
});
