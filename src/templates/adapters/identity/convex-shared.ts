// @allow-long 330: security-critical Convex actor, tenant, and audit helpers stay reviewable together
export function convexIdentitySharedContent(): string {
  return `import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { requireActor } from "../lib/auth";

export type IdentityCtx = QueryCtx | MutationCtx;
export type OrganizationRole = "owner" | "admin" | "member";
export type IdentityPermission =
  | "organization:read"
  | "organization:write"
  | "member:read"
  | "member:write"
  | "invitation:read"
  | "invitation:write"
  | "team:read"
  | "team:write";
export type IdentityActor = {
  user: Doc<"users">;
  session: Doc<"identitySessions">;
  authSessionId: string;
};

type AuditInput = {
  action: Doc<"identityAuditEvents">["action"];
  actorId: Id<"users">;
  organizationId?: Id<"identityOrganizations">;
  targetId?: string;
  metadata: Doc<"identityAuditEvents">["metadata"];
  occurredAt: number;
};

function fail(code: string, message: string): never {
  throw new ConvexError({ code, message });
}

export function normalizeIdentityEmail(email: string): string {
  return email.trim().toLocaleLowerCase("en-US");
}

export function normalizeOrganizationSlug(slug: string): string {
  return slug.trim().toLocaleLowerCase("en-US");
}

export function normalizeTeamName(name: string): string {
  return name.trim().replace(/\\s+/g, " ").toLocaleLowerCase("en-US");
}

export function requireBoundedText(
  value: string,
  field: string,
  minimum: number,
  maximum: number,
): string {
  const normalized = value.trim().replace(/\\s+/g, " ");
  if (normalized.length < minimum || normalized.length > maximum) {
    fail("IDENTITY_VALIDATION_ERROR", field + " has an invalid length");
  }
  return normalized;
}

export function requireOrganizationSlug(value: string): string {
  const slug = normalizeOrganizationSlug(value);
  if (!/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(slug)) {
    fail("IDENTITY_VALIDATION_ERROR", "Organization slug must contain only lowercase letters, numbers, and dashes");
  }
  return slug;
}

export function requireInvitationEmail(value: string): string {
  const email = normalizeIdentityEmail(value);
  if (email.length > 254 || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) {
    fail("IDENTITY_VALIDATION_ERROR", "A valid invitation email is required");
  }
  return email;
}

/**
 * The JWT session id is server-authenticated by the Better Auth Convex plugin.
 * The app-owned session row is the revocation and active-tenant authority.
 */
export async function requireIdentityActor(ctx: IdentityCtx): Promise<IdentityActor> {
  const user = await requireActor(ctx);
  const identity = await ctx.auth.getUserIdentity();
  const authSessionId = identity?.sessionId;
  if (typeof authSessionId !== "string" || authSessionId.length === 0) {
    fail("IDENTITY_SESSION_NOT_FOUND", "The authenticated token has no session binding");
  }
  const session = await ctx.db
    .query("identitySessions")
    .withIndex("by_auth_session", (query) => query.eq("authSessionId", authSessionId))
    .unique();
  const now = Date.now();
  if (!session || session.userId !== user._id || session.revokedAt !== undefined || session.expiresAt <= now) {
    fail("IDENTITY_SESSION_NOT_FOUND", "An active app identity session is required");
  }
  return { user, session, authSessionId };
}

export function requireVerifiedActor(actor: IdentityActor): void {
  if (actor.user.emailVerified !== true) {
    fail("IDENTITY_EMAIL_NOT_VERIFIED", "A verified email address is required");
  }
}

export function requireFreshIdentitySession(
  actor: IdentityActor,
  now: number,
  maximumAgeMs = 5 * 60 * 1000,
): void {
  const age = now - actor.session.authenticatedAt;
  if (!Number.isFinite(age) || age < 0 || age > maximumAgeMs) {
    fail("IDENTITY_SESSION_NOT_FRESH", "Recent authentication is required");
  }
}

export async function getMembership(
  ctx: IdentityCtx,
  organizationId: Id<"identityOrganizations">,
  userId: Id<"users">,
): Promise<Doc<"identityMemberships"> | null> {
  return await ctx.db
    .query("identityMemberships")
    .withIndex("by_organization_user", (query) =>
      query.eq("organizationId", organizationId).eq("userId", userId),
    )
    .unique();
}

export async function requireMembership(
  ctx: IdentityCtx,
  organizationId: Id<"identityOrganizations">,
  userId: Id<"users">,
): Promise<Doc<"identityMemberships">> {
  const membership = await getMembership(ctx, organizationId, userId);
  if (!membership) fail("IDENTITY_ORGANIZATION_FORBIDDEN", "The actor is not an organization member");
  return membership;
}

export function hasPermission(role: OrganizationRole, permission: IdentityPermission): boolean {
  if (role === "owner") return true;
  if (role === "admin") return permission !== "organization:write";
  return permission === "organization:read" || permission === "member:read" || permission === "team:read";
}

export async function requirePermission(
  ctx: IdentityCtx,
  organizationId: Id<"identityOrganizations">,
  userId: Id<"users">,
  permission: IdentityPermission,
): Promise<Doc<"identityMemberships">> {
  const membership = await requireMembership(ctx, organizationId, userId);
  if (!hasPermission(membership.role, permission)) {
    fail("IDENTITY_ORGANIZATION_FORBIDDEN", "The member lacks " + permission);
  }
  return membership;
}

export async function requireTeam(
  ctx: IdentityCtx,
  organizationId: Id<"identityOrganizations">,
  teamId: Id<"identityTeams">,
): Promise<Doc<"identityTeams">> {
  const team = await ctx.db.get(teamId);
  if (!team || team.organizationId !== organizationId) {
    fail("IDENTITY_TEAM_NOT_FOUND", "Organization team not found");
  }
  return team;
}

export async function recordIdentityAudit(ctx: MutationCtx, input: AuditInput): Promise<void> {
  await ctx.db.insert("identityAuditEvents", input);
}

export function identitySessionValue(session: Doc<"identitySessions">) {
  return {
    id: session._id,
    userId: session.userId,
    createdAt: session.createdAt,
    authenticatedAt: session.authenticatedAt,
    expiresAt: session.expiresAt,
    revokedAt: session.revokedAt ?? null,
    ipAddress: session.ipAddress ?? null,
    userAgent: session.userAgent ?? null,
    activeOrganizationId: session.activeOrganizationId ?? null,
    activeTeamId: session.activeTeamId ?? null,
  };
}

export function membershipValue(membership: Doc<"identityMemberships">) {
  return {
    id: membership._id,
    organizationId: membership.organizationId,
    userId: membership.userId,
    role: membership.role,
    createdAt: membership.createdAt,
    updatedAt: membership.updatedAt,
  };
}

export function invitationValue(invitation: Doc<"identityInvitations">) {
  return {
    id: invitation._id,
    organizationId: invitation.organizationId,
    email: invitation.email,
    role: invitation.role,
    status: invitation.status,
    inviterUserId: invitation.inviterUserId,
    expiresAt: invitation.expiresAt,
    acceptedByUserId: invitation.acceptedByUserId ?? null,
    acceptedMemberId: invitation.acceptedMembershipId ?? null,
    createdAt: invitation.createdAt,
    updatedAt: invitation.updatedAt,
  };
}
`;
}
