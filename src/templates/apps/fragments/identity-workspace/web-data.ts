import { file, type TemplateFile } from "../../../shared.js";
import { workspaceMutationsContent } from "./workspace-mutations.js";
import { identityWorkspaceFeatureRoot, type IdentityWorkspaceMode } from "./model.js";
import {
  identityWorkspacePermissionQueriesContent,
  identityWorkspacePermissionsContent,
} from "./web-access.js";

export function identityWorkspaceQueriesContent(): string {
  return `"use client";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { orpc } from "@/lib/orpc";
import { authScopedQueryKey, currentQueryAuthScope } from "@/lib/query-client";
import type { IdentityWorkspaceInitialData } from "./types";
import { WORKSPACE_PERMISSIONS, resolveWorkspacePermissions } from "./permissions";

${identityWorkspacePermissionQueriesContent()}

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

export function identityWorkspaceBrowserQueriesContent(withInitialLoader = false): string {
  return `"use client";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { orpc } from "@/lib/orpc";
import { authScopedQueryKey, currentQueryAuthScope${withInitialLoader ? ", identityWorkspaceInitialQueryKey" : ""} } from "@/lib/query-client";
${withInitialLoader ? 'import { getInitialIdentityWorkspace } from "@/lib/server-functions";' : ""}
import type { IdentityWorkspaceInitialData } from "./types";
import { WORKSPACE_PERMISSIONS, resolveWorkspacePermissions } from "./permissions";

${identityWorkspacePermissionQueriesContent()}

export function useIdentityWorkspaceQueries(
  selectedOrganizationId: string | null,
  selectedTeamId: string | null,
  initialData?: IdentityWorkspaceInitialData,
) {
  const queryClient = useQueryClient();
  const scope = currentQueryAuthScope(queryClient);
  ${
    withInitialLoader
      ? `const initialQuery = useQuery({
    queryKey: scope
      ? identityWorkspaceInitialQueryKey(scope)
      : ["auth", "anonymous", "identity-workspace", "initial"],
    queryFn: async () => {
      if (!scope) throw new Error("Authentication is required");
      return await getInitialIdentityWorkspace();
    },
    enabled: Boolean(scope) && typeof window !== "undefined",
    staleTime: 30_000,
  });
  const effectiveInitialData = initialData ?? initialQuery.data;`
      : "const effectiveInitialData = initialData;"
  }
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
  return workspaceMutationsContent("browser");
}

export function identityWorkspaceNextMutationsContent(): string {
  return workspaceMutationsContent("next");
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
    file(
      `${root}/queries.ts`,
      router === "next"
        ? identityWorkspaceQueriesContent()
        : identityWorkspaceBrowserQueriesContent(true),
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
