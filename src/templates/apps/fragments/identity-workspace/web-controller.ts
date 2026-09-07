export function identityWorkspaceTypesContent(): string {
  return `export type OrganizationRole = "owner" | "admin" | "member";

export interface IdentityOrganization { id: string; name: string; slug: string; createdAt: string; updatedAt: string; }
export interface IdentityOrganizationMembership { id: string; organizationId: string; userId: string; role: OrganizationRole; createdAt: string; updatedAt: string; }
export interface IdentityInvitation { id: string; organizationId: string; email: string; role: OrganizationRole; status: "pending" | "accepted" | "cancelled" | "expired"; inviterUserId: string; expiresAt: string; acceptedByUserId: string | null; acceptedMemberId: string | null; createdAt: string; updatedAt: string; }
export interface IdentityTeam { id: string; organizationId: string; name: string; createdAt: string; updatedAt: string; }
export interface IdentityTeamMembership { teamId: string; userId: string; createdAt: string; }
export interface IdentityWorkspaceInitialData {
  organizations: IdentityOrganization[];
  organizationId: string | null;
  teams: IdentityTeam[];
  members: IdentityOrganizationMembership[];
  invitations: IdentityInvitation[];
  teamId: string | null;
  teamMembers: IdentityTeamMembership[];
}

export function organizationRole(value: string): OrganizationRole {
  return value === "owner" || value === "admin" ? value : "member";
}
`;
}

export function identityWorkspaceControllerContent(): string {
  return `"use client";
import * as React from "react";
import { useIdentityWorkspaceMutations } from "./mutations";
import { useIdentityWorkspaceQueries } from "./queries";
import { workspaceAccess } from "./access";
import type { IdentityWorkspaceInitialData, OrganizationRole } from "./types";

export function useIdentityWorkspaceController(operationError: string, initialData?: IdentityWorkspaceInitialData) {
  const [selectedOrganizationId, selectOrganization] = React.useState<string | null>(null);
  const [organizationName, setOrganizationName] = React.useState("");
  const [organizationSlug, setOrganizationSlug] = React.useState("");
  const [teamName, setTeamName] = React.useState("");
  const [teamMemberId, setTeamMemberId] = React.useState("");
  const [inviteEmail, setInviteEmail] = React.useState("");
  const [inviteRole, setInviteRole] = React.useState<OrganizationRole>("member");
  const [selectedTeamId, selectTeam] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const queries = useIdentityWorkspaceQueries(selectedOrganizationId, selectedTeamId, initialData);
  const organizationSelection = React.useRef(queries.organizationId);
  React.useLayoutEffect(() => { organizationSelection.current = queries.organizationId; }, [queries.organizationId]);
  const access = workspaceAccess({
    ...queries.permissions,
    organizationId: queries.organizationId,
    teamId: queries.teamId,
    members: queries.members.data ?? [],
    membersReady: queries.members.isSuccess,
    teamMembers: queries.teamMembers.data ?? [],
    teamMembersReady: queries.teamMembers.isSuccess,
  });
  function setSelectedOrganizationId(id: string): void {
    organizationSelection.current = id;
    selectOrganization(id); selectTeam(null); setTeamMemberId(""); setError(null);
  }
  function setSelectedTeamId(id: string): void {
    selectTeam(id); setTeamMemberId(""); setError(null);
  }
  const mutations = useIdentityWorkspaceMutations({
    organizationCreated(id) { setOrganizationName(""); setOrganizationSlug(""); setSelectedOrganizationId(id); },
    teamCreated(id, organizationId) {
      if (organizationSelection.current !== organizationId) return;
      setTeamName(""); setSelectedTeamId(id);
    },
    invitationCreated() { setInviteEmail(""); },
    teamMemberAdded() { setTeamMemberId(""); },
  });

  async function run(action: () => Promise<unknown>): Promise<void> {
    setError(null);
    try { await action(); } catch { setError(operationError); }
  }

  return {
    ...queries,
    ...mutations,
    access,
    error,
    inviteEmail,
    inviteRole,
    organizationName,
    organizationSlug,
    run,
    setInviteEmail,
    setInviteRole,
    setOrganizationName,
    setOrganizationSlug,
    setSelectedOrganizationId,
    setSelectedTeamId,
    setTeamMemberId,
    setTeamName,
    teamMemberId,
    teamName,
  };
}

export type IdentityWorkspaceController = ReturnType<typeof useIdentityWorkspaceController>;
`;
}
