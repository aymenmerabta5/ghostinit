import type { ProjectMode } from "../../../lib/addons.js";

export function identityActionsContent(_mode: ProjectMode): string {
  return `import { createServiceORPCError } from "../utils/service-error.js";
import type { IdentityTransportContext } from "./context.js";

const identityErrorCodeMap = {
  APPLICATION_UNAUTHENTICATED: "UNAUTHORIZED",
  APPLICATION_ACCOUNT_SUSPENDED: "FORBIDDEN",
  IDENTITY_UNAUTHENTICATED: "UNAUTHORIZED",
  IDENTITY_VALIDATION_ERROR: "BAD_REQUEST",
  IDENTITY_EMAIL_NOT_VERIFIED: "FORBIDDEN",
  IDENTITY_SESSION_NOT_FOUND: "NOT_FOUND",
  IDENTITY_SESSION_FORBIDDEN: "FORBIDDEN",
  IDENTITY_SESSION_NOT_FRESH: "FORBIDDEN",
  IDENTITY_ORGANIZATION_NOT_FOUND: "NOT_FOUND",
  IDENTITY_ORGANIZATION_FORBIDDEN: "FORBIDDEN",
  IDENTITY_ORGANIZATION_SLUG_UNAVAILABLE: "CONFLICT",
  IDENTITY_MEMBER_NOT_FOUND: "NOT_FOUND",
  IDENTITY_MEMBER_FORBIDDEN: "FORBIDDEN",
  IDENTITY_LAST_OWNER: "CONFLICT",
  IDENTITY_INVITATION_NOT_FOUND: "NOT_FOUND",
  IDENTITY_INVITATION_EMAIL_MISMATCH: "FORBIDDEN",
  IDENTITY_INVITATION_EXPIRED: "BAD_REQUEST",
  IDENTITY_INVITATION_NOT_PENDING: "CONFLICT",
  IDENTITY_INVITATION_ALREADY_PENDING: "CONFLICT",
  IDENTITY_TEAM_NOT_FOUND: "NOT_FOUND",
  IDENTITY_TEAM_NAME_UNAVAILABLE: "CONFLICT",
  IDENTITY_AUDIT_FAILED: "INTERNAL_SERVER_ERROR",
  IDENTITY_PERSISTENCE_FAILED: "INTERNAL_SERVER_ERROR",
} as const;

async function invokeIdentity<T>(work: () => Promise<T>): Promise<T> {
  try { return await work(); }
  catch (error) {
    return createServiceORPCError(error, { codeMap: identityErrorCodeMap, fallbackMessage: "The identity operation failed" });
  }
}

type Call<TContext, TInput> = { context: TContext; input: TInput };

export function createIdentityActions<TContext extends IdentityTransportContext>() {
  return {
    sessions: {
      list: async ({ context }: Call<TContext, Record<string, never>>) => await invokeIdentity(() => context.application.identity.sessions.list()),
      revoke: async ({ context, input }: Call<TContext, { sessionId: string }>) => await invokeIdentity(() => context.application.identity.sessions.revoke(input)),
      revokeOthers: async ({ context }: Call<TContext, Record<string, never>>) => await invokeIdentity(() => context.application.identity.sessions.revokeOthers()),
    },
    organizations: {
      list: async ({ context }: Call<TContext, Record<string, never>>) => await invokeIdentity(() => context.application.identity.organizations.list()),
      create: async ({ context, input }: Call<TContext, { name: string; slug: string }>) => await invokeIdentity(() => context.application.identity.organizations.create(input)),
      setActive: async ({ context, input }: Call<TContext, { organizationId: string }>) => await invokeIdentity(() => context.application.identity.organizations.setActive(input)),
      listMembers: async ({ context, input }: Call<TContext, { organizationId: string }>) => await invokeIdentity(() => context.application.identity.organizations.listMembers(input)),
      changeMemberRole: async ({ context, input }: Call<TContext, { organizationId: string; membershipId: string; role: "owner" | "admin" | "member" }>) => await invokeIdentity(() => context.application.identity.organizations.changeMemberRole(input)),
      removeMember: async ({ context, input }: Call<TContext, { organizationId: string; membershipId: string }>) => await invokeIdentity(() => context.application.identity.organizations.removeMember(input)),
      hasPermission: async ({ context, input }: Call<TContext, { organizationId: string; permission: "organization:read" | "organization:write" | "member:read" | "member:write" | "invitation:read" | "invitation:write" | "team:read" | "team:write" }>) => await invokeIdentity(() => context.application.identity.organizations.hasPermission(input)),
    },
    invitations: {
      list: async ({ context, input }: Call<TContext, { organizationId: string }>) => await invokeIdentity(() => context.application.identity.invitations.list(input)),
      create: async ({ context, input }: Call<TContext, { organizationId: string; email: string; role: "owner" | "admin" | "member" }>) => await invokeIdentity(() => context.application.identity.invitations.create(input)),
      cancel: async ({ context, input }: Call<TContext, { invitationId: string }>) => await invokeIdentity(() => context.application.identity.invitations.cancel(input)),
      accept: async ({ context, input }: Call<TContext, { invitationId: string }>) => await invokeIdentity(() => context.application.identity.invitations.accept(input)),
    },
    teams: {
      list: async ({ context, input }: Call<TContext, { organizationId: string }>) => await invokeIdentity(() => context.application.identity.teams.list(input)),
      create: async ({ context, input }: Call<TContext, { organizationId: string; name: string }>) => await invokeIdentity(() => context.application.identity.teams.create(input)),
      setActive: async ({ context, input }: Call<TContext, { organizationId: string; teamId: string }>) => await invokeIdentity(() => context.application.identity.teams.setActive(input)),
      listMembers: async ({ context, input }: Call<TContext, { organizationId: string; teamId: string }>) => await invokeIdentity(() => context.application.identity.teams.listMembers(input)),
      addMember: async ({ context, input }: Call<TContext, { organizationId: string; teamId: string; userId: string }>) => await invokeIdentity(() => context.application.identity.teams.addMember(input)),
      removeMember: async ({ context, input }: Call<TContext, { organizationId: string; teamId: string; userId: string }>) => await invokeIdentity(() => context.application.identity.teams.removeMember(input)),
    },
  };
}
`;
}
