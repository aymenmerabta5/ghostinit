import { file, type TemplateFile } from "../../../shared.js";

export function workspaceSelectionContent(): string {
  return `"use client";
import { useLayoutEffect, useRef, useState } from "react";
import { useIdentityWorkspaceQueries } from "./queries";
import { workspaceAccess } from "./access";
import type { IdentityWorkspaceInitialData } from "./types";

export function useWorkspaceSelection(initialData?: IdentityWorkspaceInitialData) {
  const [selection, setSelection] = useState<{ organizationId: string | null; teamId: string | null }>({ organizationId: null, teamId: null });
  const queries = useIdentityWorkspaceQueries(selection.organizationId, selection.teamId, initialData);
  const revision = useRef(0);
  useLayoutEffect(() => { revision.current += 1; }, [queries.organizationId, queries.teamId]);
  const access = workspaceAccess({
    ...queries.permissions,
    organizationId: queries.organizationId,
    teamId: queries.teamId,
    members: queries.members.data ?? [],
    membersReady: queries.members.isSuccess,
    teamMembers: queries.teamMembers.data ?? [],
    teamMembersReady: queries.teamMembers.isSuccess,
  });
  const selectOrganization = (organizationId: string) => { revision.current += 1; setSelection({ organizationId, teamId: null }); };
  const selectTeam = (teamId: string) => { revision.current += 1; setSelection({ organizationId: queries.organizationId, teamId }); };
  const captureSelection = () => { const initial = revision.current; return () => revision.current === initial; };
  return { queries, access, selectOrganization, selectTeam, captureSelection };
}
export type WorkspaceSelection = ReturnType<typeof useWorkspaceSelection>;
`;
}

function formImport(native: boolean): string {
  return native
    ? 'import { useForm } from "@tanstack/react-form";'
    : 'import { useAppForm as useForm } from "@/components/ui/form";';
}

export function workspaceOrganizationsContent(native = false): string {
  return `"use client";
${formImport(native)}
import { organizationSchema } from "./schema";
import { useActivateOrganizationMutation, useCreateOrganizationMutation } from "./mutations";
import type { WorkspaceSelection } from "./use-workspace-selection";

export function useWorkspaceOrganizations(selection: WorkspaceSelection) {
  const create = useCreateOrganizationMutation();
  const activate = useActivateOrganizationMutation();
  const organizations = selection.queries.organizations;
  const mutationError = create.error ?? activate.error;
  const form = useForm({
    defaultValues: { name: "", slug: "" },
    validators: { onSubmit: organizationSchema },
    onSubmit: async ({ value }) => {
      const ownsSelection = selection.captureSelection();
      const outcome = await create.run({ name: value.name.trim(), slug: value.slug.trim() });
      if (outcome.status !== "success" || !outcome.isCurrent() || !ownsSelection()) return;
      form.reset(); selection.selectOrganization(outcome.data.organization.id);
    },
  });
  return {
    form,
    organizations: selection.queries.organizations.data ?? [],
    loading: selection.queries.organizations.isPending,
    ready: selection.queries.organizations.isSuccess,
    organizationId: selection.queries.organizationId,
    select: selection.selectOrganization,
    activate: () => { const organizationId = selection.queries.organizationId; if (organizationId) void activate.run({ organizationId }); },
    pending: create.isPending || activate.isPending,
    error: mutationError ?? organizations.error,
    readRecovery: !mutationError && organizations.error ? {
      pending: organizations.isFetching,
      retry: () => { if (!organizations.isFetching) void organizations.refetch({ cancelRefetch: false }); },
    } : null,
  };
}
export type WorkspaceOrganizations = ReturnType<typeof useWorkspaceOrganizations>;
`;
}

export function workspaceMembersContent(): string {
  return `"use client";
import { useChangeMemberRoleMutation, useRemoveMemberMutation } from "./mutations";
import type { IdentityOrganizationMembership, OrganizationRole } from "./types";
import type { WorkspaceSelection } from "./use-workspace-selection";

export function useWorkspaceMembers(selection: WorkspaceSelection) {
  const change = useChangeMemberRoleMutation();
  const remove = useRemoveMemberMutation();
  const { organizationId, members, permissions } = selection.queries;
  return {
    members: members.data ?? [],
    currentUser: permissions.currentUser,
    access: selection.access,
    pending: change.isPending || remove.isPending,
    error: change.error ?? remove.error ?? members.error,
    changeRole: (membership: IdentityOrganizationMembership, role: OrganizationRole) => {
      if (organizationId && selection.access.rolesForMember(membership).includes(role)) void change.run({ organizationId, membershipId: membership.id, role });
    },
    remove: (membership: IdentityOrganizationMembership) => {
      if (organizationId && selection.access.canManageMember(membership)) void remove.run({ organizationId, membershipId: membership.id });
    },
  };
}
export type WorkspaceMembers = ReturnType<typeof useWorkspaceMembers>;
`;
}

export function workspaceTeamsContent(native = false): string {
  return `"use client";
${formImport(native)}
import { teamSchema, teamMemberSchema } from "./schema";
import { useActivateTeamMutation, useAddTeamMemberMutation, useCreateTeamMutation, useRemoveTeamMemberMutation } from "./mutations";
import type { WorkspaceSelection } from "./use-workspace-selection";

export function useWorkspaceTeams(selection: WorkspaceSelection) {
  const create = useCreateTeamMutation();
  const activate = useActivateTeamMutation();
  const add = useAddTeamMemberMutation();
  const remove = useRemoveTeamMemberMutation();
  const { organizationId, teamId, teams, teamMembers, members, permissions } = selection.queries;
  const form = useForm({
    defaultValues: { name: "" }, validators: { onSubmit: teamSchema },
    onSubmit: async ({ value }) => {
      if (!organizationId || !selection.access.canWriteTeams) return;
      const ownsSelection = selection.captureSelection();
      const outcome = await create.run({ organizationId, name: value.name.trim() });
      if (outcome.status !== "success" || !outcome.isCurrent() || !ownsSelection()) return;
      form.reset(); selection.selectTeam(outcome.data.team.id);
    },
  });
  const memberForm = useForm({
    defaultValues: { userId: "" }, validators: { onSubmit: teamMemberSchema },
    onSubmit: async ({ value }) => {
      if (!organizationId || !teamId || !selection.access.canWriteTeams || !selection.access.availableTeamMembers.some((member) => member.userId === value.userId)) return;
      const ownsSelection = selection.captureSelection();
      const outcome = await add.run({ organizationId, teamId, userId: value.userId });
      if (outcome.status === "success" && outcome.isCurrent() && ownsSelection()) memberForm.reset();
    },
  });
  return {
    form, memberForm, teamId, teams: teams.data ?? [], teamMembers: teamMembers.data ?? [],
    currentUser: permissions.currentUser, access: selection.access,
    membersReady: members.isSuccess && teamMembers.isSuccess,
    pending: create.isPending || activate.isPending || add.isPending || remove.isPending,
    error: create.error ?? activate.error ?? add.error ?? remove.error ?? teams.error ?? teamMembers.error,
    select: selection.selectTeam,
    activate: () => { if (organizationId && teamId && selection.access.canActivateTeam) void activate.run({ organizationId, teamId }); },
    removeMember: (userId: string) => { if (organizationId && teamId && selection.access.canWriteTeams) void remove.run({ organizationId, teamId, userId }); },
  };
}
export type WorkspaceTeams = ReturnType<typeof useWorkspaceTeams>;
`;
}

export function workspaceInvitationsContent(native = false): string {
  return `"use client";
${formImport(native)}
import { invitationSchema } from "./schema";
import { useAcceptInvitationMutation, useCancelInvitationMutation, useInviteMemberMutation } from "./mutations";
import type { IdentityInvitation, OrganizationRole } from "./types";
import type { WorkspaceSelection } from "./use-workspace-selection";

export function useWorkspaceInvitations(selection: WorkspaceSelection) {
  const invite = useInviteMemberMutation();
  const accept = useAcceptInvitationMutation();
  const cancel = useCancelInvitationMutation();
  const { organizationId, invitations, permissions } = selection.queries;
  const form = useForm({
    defaultValues: { email: "", role: "member" as OrganizationRole },
    validators: { onSubmit: invitationSchema },
    onSubmit: async ({ value }) => {
      if (!organizationId || !selection.access.canWriteInvitations) return;
      const ownsSelection = selection.captureSelection();
      const outcome = await invite.run({ organizationId, email: value.email.trim(), role: value.role });
      if (outcome.status === "success" && outcome.isCurrent() && ownsSelection()) form.reset();
    },
  });
  const canAccept = (invitation: IdentityInvitation) => invitations.isSuccess && invitation.email.trim().toLocaleLowerCase("en-US") === permissions.currentUser?.email.trim().toLocaleLowerCase("en-US");
  return {
    form, permissions, canAccept, invitations: invitations.data ?? [],
    canWrite: selection.access.canWriteInvitations,
    canCancel: selection.access.canWriteInvitations && invitations.isSuccess,
    pending: invite.isPending || accept.isPending || cancel.isPending,
    error: invite.error ?? accept.error ?? cancel.error ?? invitations.error,
    accept: (invitation: IdentityInvitation) => { if (canAccept(invitation)) void accept.run({ invitationId: invitation.id }); },
    cancel: (invitation: IdentityInvitation) => { if (selection.access.canWriteInvitations && invitations.isSuccess) void cancel.run({ invitationId: invitation.id }); },
  };
}
export type WorkspaceInvitations = ReturnType<typeof useWorkspaceInvitations>;
`;
}

export function portableWorkspaceWorkflowFiles(root: string, native = false): TemplateFile[] {
  return [
    file(`${root}/use-workspace-selection.ts`, workspaceSelectionContent()),
    file(`${root}/use-workspace-organizations.ts`, workspaceOrganizationsContent(native)),
    file(`${root}/use-workspace-members.ts`, workspaceMembersContent()),
    file(`${root}/use-workspace-teams.ts`, workspaceTeamsContent(native)),
    file(`${root}/use-workspace-invitations.ts`, workspaceInvitationsContent(native)),
    file(
      `${root}/schema.ts`,
      `import { z } from "zod";
export const organizationSchema = z.object({ name: z.string().trim().min(1).max(120), slug: z.string().trim().min(2).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/i) });
export const teamSchema = z.object({ name: z.string().trim().min(1).max(100) });
export const teamMemberSchema = z.object({ userId: z.string().min(1) });
export const invitationSchema = z.object({ email: z.string().trim().email(), role: z.enum(["owner", "admin", "member"]) });
`,
    ),
  ];
}
