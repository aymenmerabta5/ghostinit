export function identityWorkspacePermissionsContent(): string {
  return `export const WORKSPACE_PERMISSIONS = ["member:write", "team:write", "invitation:read", "invitation:write", "organization:write"] as const;

interface QueryState<T> {
  data?: T;
  isSuccess: boolean;
  isPending: boolean;
  isError: boolean;
}

export function resolveWorkspacePermissions(
  authenticated: boolean,
  organizationId: string | null,
  me: QueryState<{ user: { id: string; name: string | null; email: string } | null }>,
  checks: readonly QueryState<{ allowed: boolean }>[],
) {
  const queries = [me, ...checks];
  const ready = Boolean(authenticated && organizationId && me.isSuccess && me.data?.user) && checks.length === WORKSPACE_PERMISSIONS.length && queries.every((query) => query.isSuccess);
  const allowed = (index: number) => ready && checks[index]?.data?.allowed === true;
  return {
    currentUser: authenticated && me.isSuccess ? me.data?.user ?? null : null,
    canWriteMembers: allowed(0),
    canWriteTeams: allowed(1),
    canReadInvitations: allowed(2),
    canWriteInvitations: allowed(3),
    isOwner: allowed(4),
    isPending: Boolean(organizationId) && queries.some((query) => query.isPending),
    hasError: Boolean(organizationId) && queries.some((query) => query.isError),
  };
}
`;
}

export function identityWorkspacePermissionQueriesContent(): string {
  return `function useWorkspacePermissions(organizationId: string | null) {
  const scope = currentQueryAuthScope(useQueryClient());
  const meOptions = orpc.me.queryOptions();
  const me = useQuery({ ...meOptions, queryKey: scope ? authScopedQueryKey(scope, meOptions.queryKey) : ["auth", "anonymous", "workspace-user"], enabled: Boolean(scope) });
  const checks = useQueries({ queries: WORKSPACE_PERMISSIONS.map((permission) => {
    const options = orpc.identity.organizations.hasPermission.queryOptions({ input: { organizationId: organizationId ?? "", permission } });
    return { ...options, queryKey: scope ? authScopedQueryKey(scope, options.queryKey) : ["auth", "anonymous", "workspace-permission", permission], enabled: Boolean(scope && organizationId) };
  }) });
  return {
    ...resolveWorkspacePermissions(Boolean(scope), organizationId, me, checks),
    retry: async () => { await Promise.all([me, ...checks].map((query) => query.refetch())); },
  };
}
`;
}

export function identityWorkspaceAccessContent(): string {
  return `import type { IdentityOrganizationMembership, IdentityTeamMembership, OrganizationRole } from "./types";

export function compactIdentityId(value: string): string {
  return value.length > 16 ? value.slice(0, 8) + "…" + value.slice(-4) : value;
}

export function workspaceAccess(input: {
  organizationId: string | null;
  teamId: string | null;
  currentUser: { id: string; name: string | null; email: string } | null;
  members: readonly IdentityOrganizationMembership[];
  membersReady: boolean;
  teamMembers: readonly IdentityTeamMembership[];
  teamMembersReady: boolean;
  canWriteMembers: boolean;
  canWriteTeams: boolean;
  canWriteInvitations: boolean;
  isOwner: boolean;
}) {
  const members = input.members.filter((member) => member.organizationId === input.organizationId);
  const ownerCount = members.filter((member) => member.role === "owner").length;
  const ready = Boolean(input.organizationId && input.currentUser);
  const canManageMember = (member: IdentityOrganizationMembership) => ready && input.membersReady && input.canWriteMembers && member.organizationId === input.organizationId && (member.role !== "owner" || (input.isOwner && ownerCount > 1));
  return {
    canManageMember,
    rolesForMember(member: IdentityOrganizationMembership): OrganizationRole[] {
      if (!canManageMember(member)) return [member.role];
      return input.isOwner ? ["owner", "admin", "member"] : ["admin", "member"];
    },
    canWriteTeams: ready && input.canWriteTeams,
    canWriteInvitations: ready && input.canWriteInvitations,
    canActivateTeam: ready && input.teamMembersReady && Boolean(input.teamId) && input.teamMembers.some((member) => member.teamId === input.teamId && member.userId === input.currentUser?.id),
    availableTeamMembers: input.membersReady && input.teamMembersReady
      ? members.filter((member) => !input.teamMembers.some((teamMember) => teamMember.teamId === input.teamId && teamMember.userId === member.userId))
      : [],
  };
}
`;
}
