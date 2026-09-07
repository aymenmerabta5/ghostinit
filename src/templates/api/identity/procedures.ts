export function identityProceduresContent(): string {
  return `import { implement } from "@orpc/server";
import { createIdentityActions } from "./actions.js";
import { identityContract } from "./contract.js";
import type { IdentityTransportContext } from "./context.js";

export function createIdentityProcedures<TContext extends IdentityTransportContext>() {
  const implementer = implement<typeof identityContract, TContext>(identityContract);
  const actions = createIdentityActions<TContext>();
  return {
    sessions: {
      list: implementer.sessions.list.handler(actions.sessions.list),
      revoke: implementer.sessions.revoke.handler(actions.sessions.revoke),
      revokeOthers: implementer.sessions.revokeOthers.handler(actions.sessions.revokeOthers),
    },
    organizations: {
      list: implementer.organizations.list.handler(actions.organizations.list),
      create: implementer.organizations.create.handler(actions.organizations.create),
      setActive: implementer.organizations.setActive.handler(actions.organizations.setActive),
      listMembers: implementer.organizations.listMembers.handler(actions.organizations.listMembers),
      changeMemberRole: implementer.organizations.changeMemberRole.handler(
        actions.organizations.changeMemberRole,
      ),
      removeMember: implementer.organizations.removeMember.handler(actions.organizations.removeMember),
      hasPermission: implementer.organizations.hasPermission.handler(
        actions.organizations.hasPermission,
      ),
    },
    invitations: {
      list: implementer.invitations.list.handler(actions.invitations.list),
      create: implementer.invitations.create.handler(actions.invitations.create),
      cancel: implementer.invitations.cancel.handler(actions.invitations.cancel),
      accept: implementer.invitations.accept.handler(actions.invitations.accept),
    },
    teams: {
      list: implementer.teams.list.handler(actions.teams.list),
      create: implementer.teams.create.handler(actions.teams.create),
      setActive: implementer.teams.setActive.handler(actions.teams.setActive),
      listMembers: implementer.teams.listMembers.handler(actions.teams.listMembers),
      addMember: implementer.teams.addMember.handler(actions.teams.addMember),
      removeMember: implementer.teams.removeMember.handler(actions.teams.removeMember),
    },
  };
}

export type IdentityProcedures<TContext extends IdentityTransportContext> = ReturnType<
  typeof createIdentityProcedures<TContext>
>;
`;
}
