export function identityWorkspacePermissionsContent(): string {
  return `"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { orpc } from "@/lib/orpc";
import { authScopedQueryKey, currentQueryAuthScope } from "@/lib/query-client";

type Permission = "member:write" | "team:write" | "invitation:read" | "invitation:write" | "organization:write";

function useOrganizationPermission(organizationId: string | null, permission: Permission) {
  const queryClient = useQueryClient();
  const scope = currentQueryAuthScope(queryClient);
  const options = orpc.identity.organizations.hasPermission.queryOptions({ input: { organizationId: organizationId ?? "", permission } });
  return useQuery({ ...options, queryKey: scope ? authScopedQueryKey(scope, options.queryKey) : ["auth", "anonymous", "workspace-permission", permission], enabled: Boolean(scope && organizationId) });
}

export function useWorkspacePermissions(organizationId: string | null) {
  const queryClient = useQueryClient();
  const scope = currentQueryAuthScope(queryClient);
  const meOptions = orpc.me.queryOptions();
  const me = useQuery({ ...meOptions, queryKey: scope ? authScopedQueryKey(scope, meOptions.queryKey) : ["auth", "anonymous", "workspace-user"], enabled: Boolean(scope) });
  const memberWrite = useOrganizationPermission(organizationId, "member:write");
  const teamWrite = useOrganizationPermission(organizationId, "team:write");
  const invitationRead = useOrganizationPermission(organizationId, "invitation:read");
  const invitationWrite = useOrganizationPermission(organizationId, "invitation:write");
  const organizationWrite = useOrganizationPermission(organizationId, "organization:write");
  const queries = [me, memberWrite, teamWrite, invitationRead, invitationWrite, organizationWrite];
  const ready = Boolean(scope && organizationId && me.isSuccess && me.data?.user) && queries.every((query) => query.isSuccess);
  const allowed = (query: { data?: { allowed: boolean } }) => ready && query.data?.allowed === true;
  return {
    currentUser: scope && me.isSuccess ? me.data?.user ?? null : null,
    canWriteMembers: allowed(memberWrite),
    canWriteTeams: allowed(teamWrite),
    canReadInvitations: allowed(invitationRead),
    canWriteInvitations: allowed(invitationWrite),
    isOwner: allowed(organizationWrite),
    isPending: Boolean(organizationId) && queries.some((query) => query.isPending),
    hasError: Boolean(organizationId) && queries.some((query) => query.isError),
    retry: async () => { await Promise.all(queries.map((query) => query.refetch())); },
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
