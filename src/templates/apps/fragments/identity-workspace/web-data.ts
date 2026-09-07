import { file, type TemplateFile } from "../../../shared.js";
import { identityWorkspaceFeatureRoot, type IdentityWorkspaceMode } from "./model.js";
import { identityWorkspacePermissionsContent } from "./web-access.js";

export function identityWorkspaceQueriesContent(): string {
  return `"use client";
import { useQuery } from "@tanstack/react-query";
import { orpc } from "@/lib/orpc";
import type { IdentityWorkspaceInitialData } from "./types";
import { useWorkspacePermissions } from "./permissions";

export function useIdentityWorkspaceQueries(
  selectedOrganizationId: string | null,
  selectedTeamId: string | null,
  initialData?: IdentityWorkspaceInitialData,
) {
  const organizations = useQuery(orpc.identity.organizations.list.queryOptions({ input: {}, initialData: initialData?.organizations }));
  const organizationId = selectedOrganizationId ?? initialData?.organizationId ?? organizations.data?.[0]?.id ?? null;
  const isInitialOrganization = organizationId !== null && organizationId === initialData?.organizationId;
  const teams = useQuery(orpc.identity.teams.list.queryOptions({ input: { organizationId: organizationId ?? "" }, enabled: Boolean(organizationId), initialData: isInitialOrganization ? initialData?.teams : undefined }));
  const teamId = selectedTeamId ?? (isInitialOrganization ? initialData?.teamId : null) ?? teams.data?.[0]?.id ?? null;
  const members = useQuery(orpc.identity.organizations.listMembers.queryOptions({ input: { organizationId: organizationId ?? "" }, enabled: Boolean(organizationId), initialData: isInitialOrganization ? initialData?.members : undefined }));
  const permissions = useWorkspacePermissions(organizationId);
  const invitations = useQuery(orpc.identity.invitations.list.queryOptions({ input: { organizationId: organizationId ?? "" }, enabled: Boolean(organizationId) && permissions.canReadInvitations, initialData: isInitialOrganization && permissions.canReadInvitations ? initialData?.invitations : undefined }));
  const teamMembers = useQuery(orpc.identity.teams.listMembers.queryOptions({ input: { organizationId: organizationId ?? "", teamId: teamId ?? "" }, enabled: Boolean(organizationId && teamId), initialData: isInitialOrganization && teamId === initialData?.teamId ? initialData.teamMembers : undefined }));
  return { invitations, members, organizationId, organizations, permissions, teamId, teamMembers, teams };
}
`;
}

function identityWorkspaceInitialLoaderContent(): string {
  return `import { orpcClient } from "@/lib/orpc";
import type { QueryAuthScope } from "@/lib/query-client";
import type { IdentityWorkspaceInitialData } from "./types";

export async function fetchInitialIdentityWorkspace(scope: QueryAuthScope): Promise<IdentityWorkspaceInitialData> {
  const organizations = await orpcClient.identity.organizations.list({});
  const organizationId = organizations.some((organization) => organization.id === scope.tenantId)
    ? scope.tenantId
    : organizations[0]?.id ?? null;
  if (!organizationId) return { organizations, organizationId: null, teams: [], members: [], invitations: [], teamId: null, teamMembers: [] };
  const permission = await orpcClient.identity.organizations.hasPermission({ organizationId, permission: "invitation:read" });
  const [teams, members, invitations] = await Promise.all([
    orpcClient.identity.teams.list({ organizationId }),
    orpcClient.identity.organizations.listMembers({ organizationId }),
    permission.allowed ? orpcClient.identity.invitations.list({ organizationId }) : Promise.resolve([]),
  ]);
  const teamId = teams.some((team) => team.id === scope.teamId) ? scope.teamId : teams[0]?.id ?? null;
  const teamMembers = teamId ? await orpcClient.identity.teams.listMembers({ organizationId, teamId }) : [];
  return { organizations, organizationId, teams, members, invitations, teamId, teamMembers };
}
`;
}

function identityWorkspaceTanstackQueriesContent(): string {
  return `"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { orpc } from "@/lib/orpc";
import { authScopedQueryKey, currentQueryAuthScope, identityWorkspaceInitialQueryKey } from "@/lib/query-client";
import type { IdentityWorkspaceInitialData } from "./types";
import { fetchInitialIdentityWorkspace } from "./load-initial-workspace";
import { useWorkspacePermissions } from "./permissions";

export function useIdentityWorkspaceQueries(
  selectedOrganizationId: string | null,
  selectedTeamId: string | null,
  initialData?: IdentityWorkspaceInitialData,
) {
  const queryClient = useQueryClient();
  const scope = currentQueryAuthScope(queryClient);
  const initialQuery = useQuery({
    queryKey: scope
      ? identityWorkspaceInitialQueryKey(scope)
      : ["auth", "anonymous", "identity-workspace", "initial"],
    queryFn: async () => {
      if (!scope) throw new Error("Authentication is required");
      return await fetchInitialIdentityWorkspace(scope);
    },
    enabled: Boolean(scope) && typeof window !== "undefined",
    staleTime: 30_000,
  });
  const effectiveInitialData = initialData ?? initialQuery.data;
  const organizationsOptions = orpc.identity.organizations.list.queryOptions({ input: {}, initialData: effectiveInitialData?.organizations });
  const organizations = useQuery({
    ...organizationsOptions,
    queryKey: scope ? authScopedQueryKey(scope, organizationsOptions.queryKey) : ["auth", "anonymous", "organizations"],
    enabled: Boolean(scope),
  });
  const organizationId = selectedOrganizationId ?? effectiveInitialData?.organizationId ?? organizations.data?.[0]?.id ?? null;
  const isInitialOrganization = organizationId !== null && organizationId === effectiveInitialData?.organizationId;
  const teamsOptions = orpc.identity.teams.list.queryOptions({ input: { organizationId: organizationId ?? "" }, initialData: isInitialOrganization ? effectiveInitialData?.teams : undefined });
  const teams = useQuery({ ...teamsOptions, queryKey: scope ? authScopedQueryKey(scope, teamsOptions.queryKey) : ["auth", "anonymous", "teams"], enabled: Boolean(scope && organizationId) });
  const teamId = selectedTeamId ?? (isInitialOrganization ? effectiveInitialData?.teamId : null) ?? teams.data?.[0]?.id ?? null;
  const membersOptions = orpc.identity.organizations.listMembers.queryOptions({ input: { organizationId: organizationId ?? "" }, initialData: isInitialOrganization ? effectiveInitialData?.members : undefined });
  const members = useQuery({ ...membersOptions, queryKey: scope ? authScopedQueryKey(scope, membersOptions.queryKey) : ["auth", "anonymous", "members"], enabled: Boolean(scope && organizationId) });
  const permissions = useWorkspacePermissions(organizationId);
  const invitationsOptions = orpc.identity.invitations.list.queryOptions({ input: { organizationId: organizationId ?? "" }, initialData: isInitialOrganization ? effectiveInitialData?.invitations : undefined });
  const invitations = useQuery({ ...invitationsOptions, queryKey: scope ? authScopedQueryKey(scope, invitationsOptions.queryKey) : ["auth", "anonymous", "invitations"], enabled: Boolean(scope && organizationId) && permissions.canReadInvitations });
  const teamMembersOptions = orpc.identity.teams.listMembers.queryOptions({ input: { organizationId: organizationId ?? "", teamId: teamId ?? "" }, initialData: isInitialOrganization && teamId === effectiveInitialData?.teamId ? effectiveInitialData.teamMembers : undefined });
  const teamMembers = useQuery({ ...teamMembersOptions, queryKey: scope ? authScopedQueryKey(scope, teamMembersOptions.queryKey) : ["auth", "anonymous", "team-members"], enabled: Boolean(scope && organizationId && teamId) });
  return { invitations, members, organizationId, organizations, permissions, teamId, teamMembers, teams };
}
`;
}

export function identityWorkspaceBrowserMutationsContent(): string {
  return `"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { orpc } from "@/lib/orpc";
import { authScopedQueryKey, currentQueryAuthScope, identityWorkspaceInitialQueryKey, requestQueryAuthScopeRefresh } from "@/lib/query-client";

interface WorkspaceMutationCallbacks {
  organizationCreated(id: string): void;
  teamCreated(id: string, organizationId: string): void;
  invitationCreated(): void;
  teamMemberAdded(): void;
}

export function useIdentityWorkspaceMutations(callbacks: WorkspaceMutationCallbacks) {
  const queryClient = useQueryClient();
  async function invalidateWorkspace(): Promise<void> {
    const scope = currentQueryAuthScope(queryClient);
    if (!scope) return;
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: authScopedQueryKey(scope, orpc.identity.organizations.list.key({ type: "query" })) }),
      queryClient.invalidateQueries({ queryKey: authScopedQueryKey(scope, orpc.identity.organizations.listMembers.key({ type: "query" })) }),
      queryClient.invalidateQueries({ queryKey: authScopedQueryKey(scope, orpc.identity.organizations.hasPermission.key({ type: "query" })) }),
      queryClient.invalidateQueries({ queryKey: authScopedQueryKey(scope, orpc.identity.teams.list.key({ type: "query" })) }),
      queryClient.invalidateQueries({ queryKey: authScopedQueryKey(scope, orpc.identity.teams.listMembers.key({ type: "query" })) }),
      queryClient.invalidateQueries({ queryKey: authScopedQueryKey(scope, orpc.identity.invitations.list.key({ type: "query" })) }),
      queryClient.invalidateQueries({ queryKey: identityWorkspaceInitialQueryKey(scope) }),
    ]);
  }
  const createOrganization = useMutation(orpc.identity.organizations.create.mutationOptions({ onSuccess: async ({ organization }) => { callbacks.organizationCreated(organization.id); await invalidateWorkspace(); } }));
  const setActiveOrganization = useMutation(orpc.identity.organizations.setActive.mutationOptions({ onSuccess: () => requestQueryAuthScopeRefresh(queryClient) }));
  const createTeam = useMutation(orpc.identity.teams.create.mutationOptions({ onSuccess: async ({ team }) => { callbacks.teamCreated(team.id, team.organizationId); await invalidateWorkspace(); } }));
  const setActiveTeam = useMutation(orpc.identity.teams.setActive.mutationOptions({ onSuccess: () => requestQueryAuthScopeRefresh(queryClient) }));
  const inviteMember = useMutation(orpc.identity.invitations.create.mutationOptions({ onSuccess: async () => { callbacks.invitationCreated(); await invalidateWorkspace(); } }));
  const cancelInvitation = useMutation(orpc.identity.invitations.cancel.mutationOptions({ onSuccess: invalidateWorkspace }));
  const acceptInvitation = useMutation(orpc.identity.invitations.accept.mutationOptions({ onSuccess: invalidateWorkspace }));
  const changeMemberRole = useMutation(orpc.identity.organizations.changeMemberRole.mutationOptions({ onSuccess: invalidateWorkspace }));
  const removeMember = useMutation(orpc.identity.organizations.removeMember.mutationOptions({ onSuccess: () => requestQueryAuthScopeRefresh(queryClient) }));
  const addTeamMember = useMutation(orpc.identity.teams.addMember.mutationOptions({ onSuccess: async () => { callbacks.teamMemberAdded(); await invalidateWorkspace(); } }));
  const removeTeamMember = useMutation(orpc.identity.teams.removeMember.mutationOptions({ onSuccess: () => requestQueryAuthScopeRefresh(queryClient) }));
  const all = [createOrganization, setActiveOrganization, createTeam, setActiveTeam, inviteMember, cancelInvitation, acceptInvitation, changeMemberRole, removeMember, addTeamMember, removeTeamMember];
  return { acceptInvitation, addTeamMember, cancelInvitation, changeMemberRole, createOrganization, createTeam, inviteMember, pending: all.some((mutation) => mutation.isPending), removeMember, removeTeamMember, setActiveOrganization, setActiveTeam };
}
`;
}

export function identityWorkspaceNextMutationsContent(): string {
  return `"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { orpc } from "@/lib/orpc";
import { authScopedQueryKey, currentQueryAuthScope, requestQueryAuthScopeRefresh } from "@/lib/query-client";
import {
  acceptInvitationAction,
  addTeamMemberAction,
  cancelInvitationAction,
  changeMemberRoleAction,
  createInvitationAction,
  createOrganizationAction,
  createTeamAction,
  removeMemberAction,
  removeTeamMemberAction,
  setActiveOrganizationAction,
  setActiveTeamAction,
} from "@/app/settings/workspace/actions";

interface WorkspaceMutationCallbacks {
  organizationCreated(id: string): void;
  teamCreated(id: string, organizationId: string): void;
  invitationCreated(): void;
  teamMemberAdded(): void;
}

export function useIdentityWorkspaceMutations(callbacks: WorkspaceMutationCallbacks) {
  const queryClient = useQueryClient();
  async function invalidateWorkspace(): Promise<void> {
    const scope = currentQueryAuthScope(queryClient);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: orpc.identity.organizations.list.key({ type: "query" }) }),
      queryClient.invalidateQueries({ queryKey: orpc.identity.organizations.listMembers.key({ type: "query" }) }),
      ...(scope ? [queryClient.invalidateQueries({ queryKey: authScopedQueryKey(scope, orpc.identity.organizations.hasPermission.key({ type: "query" })) })] : []),
      queryClient.invalidateQueries({ queryKey: orpc.identity.teams.list.key({ type: "query" }) }),
      queryClient.invalidateQueries({ queryKey: orpc.identity.teams.listMembers.key({ type: "query" }) }),
      queryClient.invalidateQueries({ queryKey: orpc.identity.invitations.list.key({ type: "query" }) }),
    ]);
  }
  const createOrganization = useMutation({ mutationFn: createOrganizationAction, onSuccess: async ({ organization }) => { callbacks.organizationCreated(organization.id); await invalidateWorkspace(); } });
  const setActiveOrganization = useMutation({ mutationFn: setActiveOrganizationAction, onSuccess: () => requestQueryAuthScopeRefresh(queryClient) });
  const createTeam = useMutation({ mutationFn: createTeamAction, onSuccess: async ({ team }) => { callbacks.teamCreated(team.id, team.organizationId); await invalidateWorkspace(); } });
  const setActiveTeam = useMutation({ mutationFn: setActiveTeamAction, onSuccess: () => requestQueryAuthScopeRefresh(queryClient) });
  const inviteMember = useMutation({ mutationFn: createInvitationAction, onSuccess: async () => { callbacks.invitationCreated(); await invalidateWorkspace(); } });
  const cancelInvitation = useMutation({ mutationFn: cancelInvitationAction, onSuccess: invalidateWorkspace });
  const acceptInvitation = useMutation({ mutationFn: acceptInvitationAction, onSuccess: invalidateWorkspace });
  const changeMemberRole = useMutation({ mutationFn: changeMemberRoleAction, onSuccess: invalidateWorkspace });
  const removeMember = useMutation({ mutationFn: removeMemberAction, onSuccess: () => requestQueryAuthScopeRefresh(queryClient) });
  const addTeamMember = useMutation({ mutationFn: addTeamMemberAction, onSuccess: async () => { callbacks.teamMemberAdded(); await invalidateWorkspace(); } });
  const removeTeamMember = useMutation({ mutationFn: removeTeamMemberAction, onSuccess: () => requestQueryAuthScopeRefresh(queryClient) });
  const all = [createOrganization, setActiveOrganization, createTeam, setActiveTeam, inviteMember, cancelInvitation, acceptInvitation, changeMemberRole, removeMember, addTeamMember, removeTeamMember];
  return { acceptInvitation, addTeamMember, cancelInvitation, changeMemberRole, createOrganization, createTeam, inviteMember, pending: all.some((mutation) => mutation.isPending), removeMember, removeTeamMember, setActiveOrganization, setActiveTeam };
}
`;
}

export function identityWorkspaceNextActionsContent(mode: IdentityWorkspaceMode): string {
  const applicationModule =
    mode === "monorepo" ? "@repo/services/application" : "@/server/services/application";
  return `"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createRequestApplicationForRequest } from "${applicationModule}";

const id = z.string().min(1);
const role = z.enum(["owner", "admin", "member"]);
const organization = z.object({ organizationId: id });
const team = z.object({ organizationId: id, teamId: id });
const membership = z.object({ organizationId: id, membershipId: id });
const teamMembership = z.object({ organizationId: id, teamId: id, userId: id });

async function application() { return createRequestApplicationForRequest(new Headers(await headers())); }
function changed(): void { revalidatePath("/settings/workspace"); }
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new Error("Invalid workspace operation input");
  return result.data;
}

export async function createOrganizationAction(input: unknown) {
  const value = parse(z.object({ name: z.string().trim().min(1).max(120), slug: z.string().trim().min(2).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/i) }), input);
  const result = await (await application()).identity.organizations.create(value); changed(); return result;
}
export async function setActiveOrganizationAction(input: unknown) { const result = await (await application()).identity.organizations.setActive(parse(organization, input)); changed(); return result; }
export async function createTeamAction(input: unknown) { const result = await (await application()).identity.teams.create(parse(z.object({ organizationId: id, name: z.string().trim().min(1).max(100) }), input)); changed(); return result; }
export async function setActiveTeamAction(input: unknown) { const result = await (await application()).identity.teams.setActive(parse(team, input)); changed(); return result; }
export async function createInvitationAction(input: unknown) { const result = await (await application()).identity.invitations.create(parse(z.object({ organizationId: id, email: z.string().email(), role }), input)); changed(); return result; }
export async function cancelInvitationAction(input: unknown) { const result = await (await application()).identity.invitations.cancel(parse(z.object({ invitationId: id }), input)); changed(); return result; }
export async function acceptInvitationAction(input: unknown) { const result = await (await application()).identity.invitations.accept(parse(z.object({ invitationId: id }), input)); changed(); return result; }
export async function changeMemberRoleAction(input: unknown) { const result = await (await application()).identity.organizations.changeMemberRole(parse(membership.extend({ role }), input)); changed(); return result; }
export async function removeMemberAction(input: unknown) { const result = await (await application()).identity.organizations.removeMember(parse(membership, input)); changed(); return result; }
export async function addTeamMemberAction(input: unknown) { const result = await (await application()).identity.teams.addMember(parse(teamMembership, input)); changed(); return result; }
export async function removeTeamMemberAction(input: unknown) { const result = await (await application()).identity.teams.removeMember(parse(teamMembership, input)); changed(); return result; }
`;
}

export function webIdentityWorkspaceDataFiles(
  mode: IdentityWorkspaceMode,
  router: "next" | "tanstack",
): TemplateFile[] {
  const root = identityWorkspaceFeatureRoot(mode);
  const sourceRoot = mode === "monorepo" ? "apps/web/src" : "src";
  return [
    file(`${root}/permissions.ts`, identityWorkspacePermissionsContent()),
    ...(router === "tanstack"
      ? [file(`${root}/load-initial-workspace.ts`, identityWorkspaceInitialLoaderContent())]
      : []),
    file(
      `${root}/queries.ts`,
      router === "next"
        ? identityWorkspaceQueriesContent()
        : identityWorkspaceTanstackQueriesContent(),
    ),
    file(
      `${root}/mutations.ts`,
      router === "next"
        ? identityWorkspaceNextMutationsContent()
        : identityWorkspaceBrowserMutationsContent(),
    ),
    ...(router === "next"
      ? [
          file(
            `${sourceRoot}/app/settings/workspace/actions.ts`,
            identityWorkspaceNextActionsContent(mode),
          ),
        ]
      : []),
  ];
}
