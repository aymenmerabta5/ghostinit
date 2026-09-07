import { describe, expect, test } from "bun:test";
import {
  identityWorkspaceAccessContent,
  identityWorkspacePermissionQueriesContent,
  identityWorkspacePermissionsContent,
} from "../../src/templates/apps/fragments/identity-workspace/web-access.js";
import { webIdentityWorkspaceDataFiles } from "../../src/templates/apps/fragments/identity-workspace/web-data.js";

type Role = "owner" | "admin" | "member";
interface Member {
  id: string;
  organizationId: string;
  userId: string;
  role: Role;
}
interface AccessInput {
  organizationId: string | null;
  teamId: string | null;
  currentUser: { id: string; name: string | null; email: string } | null;
  members: Member[];
  membersReady: boolean;
  teamMembers: Array<{ teamId: string; userId: string }>;
  teamMembersReady: boolean;
  canWriteMembers: boolean;
  canWriteTeams: boolean;
  canWriteInvitations: boolean;
  isOwner: boolean;
}
interface Access {
  canManageMember(member: Member): boolean;
  rolesForMember(member: Member): Role[];
  canWriteTeams: boolean;
  canWriteInvitations: boolean;
  canActivateTeam: boolean;
  availableTeamMembers: Member[];
}

function javascript(source: string): string {
  return new Bun.Transpiler({ loader: "ts" }).transformSync(
    source.replace(/^import .*;\n/gm, "").replace(/^export /gm, ""),
  );
}

const access = new Function(
  `${javascript(identityWorkspaceAccessContent())}; return workspaceAccess;`,
)() as (input: AccessInput) => Access;
const owner: Member = { id: "owner-row", organizationId: "org", userId: "owner", role: "owner" };
const member: Member = {
  id: "member-row",
  organizationId: "org",
  userId: "app-user",
  role: "member",
};

function fixture(changes: Partial<AccessInput> = {}): AccessInput {
  return {
    organizationId: "org",
    teamId: "team",
    currentUser: { id: "app-user", name: "Workspace Member", email: "member@example.test" },
    members: [owner, member],
    membersReady: true,
    teamMembers: [{ teamId: "team", userId: "app-user" }],
    teamMembersReady: true,
    canWriteMembers: false,
    canWriteTeams: false,
    canWriteInvitations: false,
    isOwner: false,
    ...changes,
  };
}

describe("workspace controls follow selected-organization permissions", () => {
  test("ordinary members can activate their team but cannot administer it", () => {
    const state = access(fixture());
    expect(state.canManageMember(owner)).toBe(false);
    expect(state.canManageMember(member)).toBe(false);
    expect(state.canWriteTeams).toBe(false);
    expect(state.canWriteInvitations).toBe(false);
    expect(state.canActivateTeam).toBe(true);
  });

  test("administrators cannot edit owners or promote another owner", () => {
    const state = access(fixture({ canWriteMembers: true, canWriteTeams: true }));
    expect(state.canManageMember(owner)).toBe(false);
    expect(state.canManageMember(member)).toBe(true);
    expect(state.rolesForMember(member)).toEqual(["admin", "member"]);
    expect(state.canWriteTeams).toBe(true);
  });

  test("owners retain the final-owner protection and can promote other members", () => {
    const state = access(fixture({ canWriteMembers: true, isOwner: true }));
    expect(state.canManageMember(owner)).toBe(false);
    expect(state.rolesForMember(owner)).toEqual(["owner"]);
    expect(state.rolesForMember(member)).toEqual(["owner", "admin", "member"]);
    const secondOwner = { ...member, role: "owner" as const };
    expect(
      access(
        fixture({ canWriteMembers: true, isOwner: true, members: [owner, secondOwner] }),
      ).canManageMember(owner),
    ).toBe(true);
  });

  test("unknown identity, failed membership reads, and foreign records cannot grant controls", () => {
    expect(
      access(fixture({ canWriteMembers: true, currentUser: null })).canManageMember(member),
    ).toBe(false);
    expect(
      access(fixture({ canWriteMembers: true, membersReady: false })).canManageMember(member),
    ).toBe(false);
    expect(
      access(fixture({ canWriteMembers: true })).canManageMember({
        ...member,
        organizationId: "other",
      }),
    ).toBe(false);
    expect(access(fixture({ teamMembersReady: false })).canActivateTeam).toBe(false);
  });

  test("team activation and candidate selection use application IDs and the selected team", () => {
    expect(
      access(
        fixture({ currentUser: { id: "provider-id", name: null, email: "member@example.test" } }),
      ).canActivateTeam,
    ).toBe(false);
    expect(access(fixture({ teamId: "other-team" })).canActivateTeam).toBe(false);
    expect(access(fixture()).availableTeamMembers).toEqual([owner]);
    expect(access(fixture({ membersReady: false })).availableTeamMembers).toEqual([]);
  });
});

interface QueryOptions {
  queryKey: readonly string[];
  input?: { organizationId: string; permission: string };
  enabled?: boolean;
}
interface PermissionState {
  currentUser: { id: string } | null;
  canWriteMembers: boolean;
  canWriteTeams: boolean;
  canReadInvitations: boolean;
  canWriteInvitations: boolean;
  isOwner: boolean;
  hasError: boolean;
}

function permissions(
  state: "success" | "pending" | "error",
  authenticated = true,
  failedPermission?: string,
) {
  const captured: QueryOptions[] = [];
  const scope = authenticated ? { userId: "provider-id" } : null;
  const orpc = {
    me: { queryOptions: () => ({ queryKey: ["me"] }) },
    identity: {
      organizations: {
        hasPermission: {
          queryOptions: ({ input }: QueryOptions) => ({
            input,
            queryKey: ["permission", input!.organizationId, input!.permission],
          }),
        },
      },
    },
  };
  const readQuery = (options: QueryOptions) => {
    captured.push(options);
    const status =
      failedPermission && options.input?.permission === failedPermission ? "error" : state;
    return {
      isSuccess: status === "success",
      isPending: status === "pending",
      isError: status === "error",
      data: options.input ? { allowed: true } : { user: { id: "app-user" } },
      refetch: async () => {},
    };
  };
  const run = new Function(
    "useQuery",
    "useQueries",
    "useQueryClient",
    "orpc",
    "authScopedQueryKey",
    "currentQueryAuthScope",
    `${javascript(identityWorkspacePermissionsContent())}\n${javascript(identityWorkspacePermissionQueriesContent())}; return useWorkspacePermissions;`,
  )(
    readQuery,
    ({ queries }: { queries: QueryOptions[] }) => queries.map(readQuery),
    () => ({}),
    orpc,
    (value: { userId: string }, key: string[]) => [value.userId, ...key],
    () => scope,
  ) as (organizationId: string) => PermissionState;
  return { state: run("selected-org"), captured };
}

describe("workspace permission reads fail closed", () => {
  test("a partial permission failure cannot retain a successful write grant", () => {
    const result = permissions("success", true, "organization:write").state;
    expect(result.currentUser?.id).toBe("app-user");
    expect(result.hasError).toBe(true);
    expect(result.canWriteMembers).toBe(false);
    expect(result.canWriteTeams).toBe(false);
    expect(result.canWriteInvitations).toBe(false);
  });
  for (const state of ["pending", "error"] as const) {
    test(`${state} rejects retained grants`, () => {
      const result = permissions(state).state;
      expect(result.currentUser).toBeNull();
      expect(result.canWriteMembers).toBe(false);
      expect(result.canWriteTeams).toBe(false);
      expect(result.canReadInvitations).toBe(false);
      expect(result.canWriteInvitations).toBe(false);
      expect(result.isOwner).toBe(false);
      expect(result.hasError).toBe(state === "error");
    });
  }

  test("binds every permission to current scope and selected organization", () => {
    const result = permissions("success");
    expect(result.state.currentUser?.id).toBe("app-user");
    expect(result.state.canWriteMembers).toBe(true);
    expect(result.captured.filter((query) => query.input)).toHaveLength(5);
    for (const query of result.captured.filter((query) => query.input)) {
      expect(query.input?.organizationId).toBe("selected-org");
      expect(query.queryKey).toContain("provider-id");
      expect(query.queryKey).toContain("selected-org");
    }
    expect(permissions("success", false).state.currentUser).toBeNull();
    expect(permissions("success", false).state.canWriteMembers).toBe(false);
  });

  test("both framework refetch paths gate invitations through the same permission result", () => {
    for (const router of ["next", "tanstack"] as const) {
      const source = webIdentityWorkspaceDataFiles("single", router).find((file) =>
        file.path.endsWith("/queries.ts"),
      )!.content;
      expect(source).toContain("useWorkspacePermissions(organizationId)");
      expect(source).toContain("&& permissions.canReadInvitations");
    }
  });
});
