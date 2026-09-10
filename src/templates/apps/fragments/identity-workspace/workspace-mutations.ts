export function workspaceMutationsContent(transport: "next" | "browser"): string {
  const operations = [
    ["CreateOrganization", "organizations.create", "createOrganizationAction"],
    ["ActivateOrganization", "organizations.setActive", "setActiveOrganizationAction", true],
    ["CreateTeam", "teams.create", "createTeamAction"],
    ["ActivateTeam", "teams.setActive", "setActiveTeamAction", true],
    ["InviteMember", "invitations.create", "createInvitationAction"],
    ["CancelInvitation", "invitations.cancel", "cancelInvitationAction"],
    ["AcceptInvitation", "invitations.accept", "acceptInvitationAction"],
    ["ChangeMemberRole", "organizations.changeMemberRole", "changeMemberRoleAction"],
    ["RemoveMember", "organizations.removeMember", "removeMemberAction", true],
    ["AddTeamMember", "teams.addMember", "addTeamMemberAction"],
    ["RemoveTeamMember", "teams.removeMember", "removeTeamMemberAction", true],
  ] as const;
  return `"use client";
import { useQueryClient } from "@tanstack/react-query";
import { orpc } from "@/lib/orpc";
import { authScopedQueryKey, currentQueryAuthScope, identityWorkspaceInitialQueryKey, requestQueryAuthScopeRefresh } from "@/lib/query-client";
import { useAuthOwnedMutation } from "@/hooks/use-auth-owned-mutation";
${transport === "next" ? `import { ${operations.map((operation) => operation[2]).join(", ")} } from "@/app/settings/workspace/actions";` : ""}

function useWorkspaceWrite<Input, Output>(operation: (input: Input) => Promise<Output>, refreshIdentity = false) {
  const queryClient = useQueryClient();
  return useAuthOwnedMutation(operation, {
    onSuccess: async (_output, _input, isCurrent) => {
      const scope = currentQueryAuthScope(queryClient);
      if (!scope) return;
      if (refreshIdentity) { requestQueryAuthScopeRefresh(queryClient); return; }
      const keys = [
        orpc.identity.organizations.list.key({ type: "query" }),
        orpc.identity.organizations.listMembers.key({ type: "query" }),
        orpc.identity.organizations.hasPermission.key({ type: "query" }),
        orpc.identity.teams.list.key({ type: "query" }),
        orpc.identity.teams.listMembers.key({ type: "query" }),
        orpc.identity.invitations.list.key({ type: "query" }),
      ];
      await Promise.all([
        ...keys.map((key) => queryClient.invalidateQueries({ queryKey: authScopedQueryKey(scope, key) })),
${transport === "next" ? "        ...keys.map((key) => queryClient.invalidateQueries({ queryKey: key })),\n" : ""}        queryClient.invalidateQueries({ queryKey: identityWorkspaceInitialQueryKey(scope) }),
      ]);
      if (!isCurrent()) return;
    },
  });
}

${operations
  .map(
    ([name, method, action, refresh]) => `export function use${name}Mutation() {
  return useWorkspaceWrite((input: Parameters<typeof orpc.identity.${method}.call>[0]) => ${transport === "next" ? action : `orpc.identity.${method}.call`}(input), ${Boolean(refresh)});
}`,
  )
  .join("\n\n")}
`;
}
