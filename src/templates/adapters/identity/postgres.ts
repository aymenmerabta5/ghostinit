// @allow-long 974: the complete transactional identity adapter is colocated so tenant and CAS predicates remain reviewable
import type { ProjectMode } from "../../../lib/addons.js";
import { file, type TemplateFile } from "../../shared.js";

function postgresIdentityCompositionContent(mode: ProjectMode): string {
  const databaseImport =
    mode === "monorepo"
      ? `import {
  db,
  identityAuditEvents,
  invitations,
  members,
  organizations,
  sessions,
  teamMembers,
  teams,
  users,
} from "@repo/database";`
      : `import { db } from "@/server/db";
import {
  identityAuditEvents,
  invitations,
  members,
  organizations,
  sessions,
  teamMembers,
  teams,
  users,
} from "@/server/db/schema/auth";`;
  const serviceImport =
    mode === "monorepo" ? "../../identity/index.js" : "@/server/services/identity";

  return `// @allow-long 940: serializable identity persistence, tenant guards, conditional writes, and atomic audit
import "server-only";
import { randomUUID } from "node:crypto";
import { and, asc, count, desc, eq, gt, inArray, isNull, lte, ne, or } from "drizzle-orm";
${databaseImport}
import {
  createIdentityService,
  definePostgresIdentityAdapter,
  type IdentityAuditEvent,
  type IdentityAuditPort,
  type IdentityPersistencePort,
  type IdentitySession,
  type InvitationStatus,
  type Organization,
  type OrganizationInvitation,
  type OrganizationMembership,
  type OrganizationRole,
  type OrganizationTeam,
  type TeamMembership,
} from "${serviceImport}";

type SessionRow = typeof sessions.$inferSelect;
type OrganizationRow = typeof organizations.$inferSelect;
type MembershipRow = typeof members.$inferSelect;
type InvitationRow = typeof invitations.$inferSelect;
type TeamRow = typeof teams.$inferSelect;
type TeamMembershipRow = typeof teamMembers.$inferSelect;

type IdentityDatabase = Pick<typeof db, "delete" | "insert" | "select" | "update">;

const MAX_TRANSACTION_ATTEMPTS = 3;
const RETRYABLE_POSTGRES_CODES = new Set(["40001", "40P01", "23505"]);

function postgresErrorCode(error: unknown, depth = 0): string | null {
  if (!error || typeof error !== "object" || depth > 3) return null;
  const code = Reflect.get(error, "code");
  if (typeof code === "string") return code;
  return postgresErrorCode(Reflect.get(error, "cause"), depth + 1);
}

async function runSerializable<T>(work: (transaction: IdentityDatabase) => Promise<T>): Promise<T> {
  for (let attempt = 1; attempt <= MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
    try {
      return await db.transaction(async (transaction) => await work(transaction), {
        isolationLevel: "serializable",
      });
    } catch (error) {
      const code = postgresErrorCode(error);
      if (!code || !RETRYABLE_POSTGRES_CODES.has(code) || attempt === MAX_TRANSACTION_ATTEMPTS) {
        throw error;
      }
    }
  }
  throw new Error("Serializable identity transaction exhausted its retry budget");
}

function storedDate(value: Date | null, field: string): Date {
  if (value) return value;
  throw new Error("Identity storage returned a null " + field);
}

function toOrganizationRole(value: string | null): OrganizationRole {
  if (value === "owner" || value === "admin" || value === "member") return value;
  throw new Error("Identity storage returned an invalid organization role");
}

function toInvitationStatus(value: string): InvitationStatus {
  if (value === "pending" || value === "accepted" || value === "cancelled" || value === "expired") {
    return value;
  }
  throw new Error("Identity storage returned an invalid invitation status");
}

function toSession(row: SessionRow): IdentitySession {
  return {
    id: row.id,
    userId: row.userId,
    createdAt: row.createdAt,
    authenticatedAt: row.authenticatedAt,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    activeOrganizationId: row.activeOrganizationId,
    activeTeamId: row.activeTeamId,
    ipAddress: row.ipAddress,
    userAgent: row.userAgent,
  };
}

function toOrganization(row: OrganizationRow): Organization {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toMembership(row: MembershipRow): OrganizationMembership {
  return {
    id: row.id,
    organizationId: row.organizationId,
    userId: row.userId,
    role: toOrganizationRole(row.role),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toInvitation(row: InvitationRow, observedAt = new Date()): OrganizationInvitation {
  const storedStatus = toInvitationStatus(row.status);
  const status =
    storedStatus === "pending" && row.expiresAt.getTime() <= observedAt.getTime()
      ? "expired"
      : storedStatus;
  return {
    id: row.id,
    organizationId: row.organizationId,
    email: row.email,
    role: toOrganizationRole(row.role),
    status,
    inviterUserId: row.inviterId,
    expiresAt: row.expiresAt,
    acceptedByUserId: row.acceptedByUserId,
    acceptedMemberId: row.acceptedMemberId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toTeam(row: TeamRow): OrganizationTeam {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    createdAt: row.createdAt,
    updatedAt: storedDate(row.updatedAt, "team.updatedAt"),
  };
}

function toTeamMembership(row: TeamMembershipRow): TeamMembership {
  return {
    teamId: row.teamId,
    userId: row.userId,
    createdAt: storedDate(row.createdAt, "teamMembership.createdAt"),
  };
}

async function lockOrganization(database: IdentityDatabase, organizationId: string): Promise<void> {
  const locked = await database
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1)
    .for("update");
  if (!locked[0]) throw new Error("Organization not found while acquiring identity mutation lock");
}

async function organizationForTeam(
  database: IdentityDatabase,
  teamId: string,
): Promise<string | null> {
  const rows = await database
    .select({ organizationId: teams.organizationId })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);
  return rows[0]?.organizationId ?? null;
}

function createAudit(database: IdentityDatabase): IdentityAuditPort {
  return {
    async record(event: IdentityAuditEvent) {
      await database.insert(identityAuditEvents).values({
        actorId: event.actorId,
        organizationId: event.organizationId ?? null,
        targetId: event.targetId ?? null,
        action: event.action,
        metadata: { ...event.metadata },
        createdAt: event.occurredAt,
      });
    },
  };
}

function createPersistence(
  database: IdentityDatabase,
  transactional: boolean,
): IdentityPersistencePort {
  const lock = async (organizationId: string): Promise<void> => {
    if (transactional) await lockOrganization(database, organizationId);
  };

  return {
    async listSessions(userId) {
      const rows = await database
        .select()
        .from(sessions)
        .where(and(eq(sessions.userId, userId), gt(sessions.expiresAt, new Date())))
        .orderBy(desc(sessions.createdAt), desc(sessions.id));
      return rows.map(toSession);
    },

    async getSession(sessionId) {
      const rows = await database
        .select()
        .from(sessions)
        .where(eq(sessions.id, sessionId))
        .limit(1);
      return rows[0] ? toSession(rows[0]) : null;
    },

    async revokeSession(input) {
      const changed = await database
        .update(sessions)
        .set({
          expiresAt: input.revokedAt,
          revokedAt: input.revokedAt,
          updatedAt: input.revokedAt,
        })
        .where(
          and(
            eq(sessions.id, input.sessionId),
            eq(sessions.userId, input.userId),
            isNull(sessions.revokedAt),
          ),
        )
        .returning();
      if (changed[0]) return toSession(changed[0]);
      const existing = await database
        .select()
        .from(sessions)
        .where(and(eq(sessions.id, input.sessionId), eq(sessions.userId, input.userId)))
        .limit(1);
      if (existing[0]?.revokedAt) return toSession(existing[0]);
      throw new Error("Session revoke precondition failed");
    },

    async revokeOtherSessions(input) {
      const changed = await database
        .update(sessions)
        .set({
          expiresAt: input.revokedAt,
          revokedAt: input.revokedAt,
          updatedAt: input.revokedAt,
        })
        .where(
          and(
            eq(sessions.userId, input.userId),
            ne(sessions.id, input.exceptSessionId),
            isNull(sessions.revokedAt),
            gt(sessions.expiresAt, input.revokedAt),
          ),
        )
        .returning({ id: sessions.id });
      return changed.length;
    },

    async listOrganizationsForUser(userId) {
      const rows = await database
        .select({ organization: organizations })
        .from(organizations)
        .innerJoin(
          members,
          and(eq(members.organizationId, organizations.id), eq(members.userId, userId)),
        )
        .orderBy(asc(organizations.name), asc(organizations.id));
      return rows.map((row) => toOrganization(row.organization));
    },

    async getOrganization(organizationId) {
      await lock(organizationId);
      const rows = await database
        .select()
        .from(organizations)
        .where(eq(organizations.id, organizationId))
        .limit(1);
      return rows[0] ? toOrganization(rows[0]) : null;
    },

    async findOrganizationBySlug(slug) {
      const rows = await database
        .select()
        .from(organizations)
        .where(eq(organizations.slug, slug))
        .limit(1);
      if (rows[0] && transactional) await lockOrganization(database, rows[0].id);
      return rows[0] ? toOrganization(rows[0]) : null;
    },

    async createOrganization(input) {
      const organizationRows = await database
        .insert(organizations)
        .values({
          id: randomUUID(),
          name: input.name,
          slug: input.slug,
          createdAt: input.createdAt,
          updatedAt: input.createdAt,
        })
        .returning();
      const organization = organizationRows[0];
      if (!organization) throw new Error("Organization insert returned no row");
      const membershipRows = await database
        .insert(members)
        .values({
          id: randomUUID(),
          organizationId: organization.id,
          userId: input.ownerUserId,
          role: "owner",
          createdAt: input.createdAt,
          updatedAt: input.createdAt,
        })
        .returning();
      const ownerMembership = membershipRows[0];
      if (!ownerMembership) throw new Error("Owner membership insert returned no row");
      return {
        organization: toOrganization(organization),
        ownerMembership: toMembership(ownerMembership),
      };
    },

    async setActiveOrganization(input) {
      await lock(input.organizationId);
      const membership = await database
        .select({ id: members.id })
        .from(members)
        .where(
          and(eq(members.organizationId, input.organizationId), eq(members.userId, input.userId)),
        )
        .limit(1);
      if (!membership[0]) throw new Error("Active organization membership no longer exists");
      const changed = await database
        .update(sessions)
        .set({
          activeOrganizationId: input.organizationId,
          activeTeamId: null,
          updatedAt: input.updatedAt,
        })
        .where(
          and(
            eq(sessions.id, input.sessionId),
            eq(sessions.userId, input.userId),
            isNull(sessions.revokedAt),
            gt(sessions.expiresAt, input.updatedAt),
            or(
              isNull(sessions.activeOrganizationId),
              ne(sessions.activeOrganizationId, input.organizationId),
            ),
          ),
        )
        .returning({ id: sessions.id });
      if (changed[0]) return;
      const existing = await database
        .select({ activeOrganizationId: sessions.activeOrganizationId })
        .from(sessions)
        .where(
          and(
            eq(sessions.id, input.sessionId),
            eq(sessions.userId, input.userId),
            isNull(sessions.revokedAt),
            gt(sessions.expiresAt, input.updatedAt),
          ),
        )
        .limit(1);
      if (existing[0]?.activeOrganizationId !== input.organizationId) {
        throw new Error("Active organization session precondition failed");
      }
    },

    async setActiveTeam(input) {
      await lock(input.organizationId);
      const team = await database
        .select({ id: teams.id })
        .from(teams)
        .where(and(eq(teams.id, input.teamId), eq(teams.organizationId, input.organizationId)))
        .limit(1);
      if (!team[0]) throw new Error("Active team is outside the selected organization");
      const membership = await database
        .select({ id: members.id })
        .from(members)
        .where(
          and(eq(members.organizationId, input.organizationId), eq(members.userId, input.userId)),
        )
        .limit(1);
      if (!membership[0]) throw new Error("Active team organization membership no longer exists");
      const teamMembership = await database
        .select({ id: teamMembers.id })
        .from(teamMembers)
        .where(and(eq(teamMembers.teamId, input.teamId), eq(teamMembers.userId, input.userId)))
        .limit(1);
      if (!teamMembership[0]) throw new Error("The actor is not a member of the active team");
      const changed = await database
        .update(sessions)
        .set({
          activeOrganizationId: input.organizationId,
          activeTeamId: input.teamId,
          updatedAt: input.updatedAt,
        })
        .where(
          and(
            eq(sessions.id, input.sessionId),
            eq(sessions.userId, input.userId),
            isNull(sessions.revokedAt),
            gt(sessions.expiresAt, input.updatedAt),
            or(
              ne(sessions.activeOrganizationId, input.organizationId),
              isNull(sessions.activeTeamId),
              ne(sessions.activeTeamId, input.teamId),
            ),
          ),
        )
        .returning({ id: sessions.id });
      if (changed[0]) return;
      const existing = await database
        .select({
          activeOrganizationId: sessions.activeOrganizationId,
          activeTeamId: sessions.activeTeamId,
        })
        .from(sessions)
        .where(
          and(
            eq(sessions.id, input.sessionId),
            eq(sessions.userId, input.userId),
            isNull(sessions.revokedAt),
            gt(sessions.expiresAt, input.updatedAt),
          ),
        )
        .limit(1);
      if (
        existing[0]?.activeOrganizationId !== input.organizationId ||
        existing[0]?.activeTeamId !== input.teamId
      ) {
        throw new Error("Active team session precondition failed");
      }
    },

    async listMemberships(organizationId) {
      const rows = await database
        .select()
        .from(members)
        .where(eq(members.organizationId, organizationId))
        .orderBy(asc(members.createdAt), asc(members.id));
      return rows.map(toMembership);
    },

    async getMembership(organizationId, userId) {
      await lock(organizationId);
      const rows = await database
        .select()
        .from(members)
        .where(and(eq(members.organizationId, organizationId), eq(members.userId, userId)))
        .limit(1);
      return rows[0] ? toMembership(rows[0]) : null;
    },

    async getMembershipById(membershipId) {
      const rows = await database
        .select()
        .from(members)
        .where(eq(members.id, membershipId))
        .limit(1);
      if (rows[0]) await lock(rows[0].organizationId);
      return rows[0] ? toMembership(rows[0]) : null;
    },

    async countOwners(organizationId) {
      await lock(organizationId);
      const rows = await database
        .select({ value: count() })
        .from(members)
        .where(and(eq(members.organizationId, organizationId), eq(members.role, "owner")));
      return rows[0]?.value ?? 0;
    },

    async updateMembershipRole(input) {
      const currentRows = await database
        .select()
        .from(members)
        .where(eq(members.id, input.membershipId))
        .limit(1);
      const current = currentRows[0];
      if (!current) throw new Error("Membership role update target no longer exists");
      await lock(current.organizationId);
      const changed = await database
        .update(members)
        .set({ role: input.role, updatedAt: input.updatedAt })
        .where(
          and(
            eq(members.id, input.membershipId),
            eq(members.organizationId, current.organizationId),
            eq(members.role, current.role),
          ),
        )
        .returning();
      if (changed[0]) return toMembership(changed[0]);
      const replay = await database
        .select()
        .from(members)
        .where(
          and(
            eq(members.id, input.membershipId),
            eq(members.organizationId, current.organizationId),
            eq(members.role, input.role),
          ),
        )
        .limit(1);
      if (replay[0]) return toMembership(replay[0]);
      throw new Error("Membership role conditional update failed");
    },

    async removeMembership(input) {
      const currentRows = await database
        .select()
        .from(members)
        .where(eq(members.id, input.membershipId))
        .limit(1);
      const current = currentRows[0];
      if (!current) return;
      await lock(current.organizationId);
      const organizationTeams = await database
        .select({ id: teams.id })
        .from(teams)
        .where(eq(teams.organizationId, current.organizationId));
      if (organizationTeams.length > 0) {
        await database.delete(teamMembers).where(
          and(
            eq(teamMembers.userId, current.userId),
            inArray(
              teamMembers.teamId,
              organizationTeams.map((team) => team.id),
            ),
          ),
        );
      }
      await database
        .update(sessions)
        .set({ activeOrganizationId: null, activeTeamId: null, updatedAt: input.removedAt })
        .where(
          and(
            eq(sessions.userId, current.userId),
            eq(sessions.activeOrganizationId, current.organizationId),
          ),
        );
      const removed = await database
        .delete(members)
        .where(
          and(
            eq(members.id, input.membershipId),
            eq(members.organizationId, current.organizationId),
            eq(members.userId, current.userId),
            eq(members.role, current.role),
          ),
        )
        .returning({ id: members.id });
      if (!removed[0]) throw new Error("Membership conditional delete failed");
    },

    async listInvitations(organizationId) {
      const observedAt = new Date();
      const rows = await database
        .select()
        .from(invitations)
        .where(eq(invitations.organizationId, organizationId))
        .orderBy(desc(invitations.createdAt), desc(invitations.id));
      return rows.map((row) => toInvitation(row, observedAt));
    },

    async getInvitation(invitationId) {
      const rows = await database
        .select()
        .from(invitations)
        .where(eq(invitations.id, invitationId))
        .limit(1);
      if (rows[0]) await lock(rows[0].organizationId);
      return rows[0] ? toInvitation(rows[0]) : null;
    },

    async findPendingInvitation(organizationId, normalizedEmail) {
      await lock(organizationId);
      const rows = await database
        .select()
        .from(invitations)
        .where(
          and(
            eq(invitations.organizationId, organizationId),
            eq(invitations.email, normalizedEmail),
            eq(invitations.status, "pending"),
          ),
        )
        .orderBy(desc(invitations.createdAt), desc(invitations.id))
        .limit(1);
      return rows[0] ? toInvitation(rows[0]) : null;
    },

    async createInvitation(input) {
      await lock(input.organizationId);
      const rows = await database
        .insert(invitations)
        .values({
          id: randomUUID(),
          organizationId: input.organizationId,
          email: input.email,
          role: input.role,
          status: "pending",
          inviterId: input.inviterUserId,
          expiresAt: input.expiresAt,
          createdAt: input.createdAt,
          updatedAt: input.createdAt,
        })
        .returning();
      if (!rows[0]) throw new Error("Invitation insert returned no row");
      return toInvitation(rows[0], input.createdAt);
    },

    async expireInvitation(input) {
      const currentRows = await database
        .select()
        .from(invitations)
        .where(eq(invitations.id, input.invitationId))
        .limit(1);
      const current = currentRows[0];
      if (!current) throw new Error("Invitation expiry target no longer exists");
      await lock(current.organizationId);
      const changed = await database
        .update(invitations)
        .set({ status: "expired", updatedAt: input.expiredAt })
        .where(
          and(
            eq(invitations.id, input.invitationId),
            eq(invitations.organizationId, current.organizationId),
            eq(invitations.status, "pending"),
            lte(invitations.expiresAt, input.expiredAt),
          ),
        )
        .returning();
      if (changed[0]) return toInvitation(changed[0], input.expiredAt);
      const replay = await database
        .select()
        .from(invitations)
        .where(
          and(
            eq(invitations.id, input.invitationId),
            eq(invitations.organizationId, current.organizationId),
            eq(invitations.status, "expired"),
          ),
        )
        .limit(1);
      if (replay[0]) return toInvitation(replay[0], input.expiredAt);
      throw new Error("Invitation expiry conditional update failed");
    },

    async cancelInvitation(input) {
      const currentRows = await database
        .select()
        .from(invitations)
        .where(eq(invitations.id, input.invitationId))
        .limit(1);
      const current = currentRows[0];
      if (!current) throw new Error("Invitation cancellation target no longer exists");
      await lock(current.organizationId);
      const changed = await database
        .update(invitations)
        .set({ status: "cancelled", updatedAt: input.cancelledAt })
        .where(
          and(
            eq(invitations.id, input.invitationId),
            eq(invitations.organizationId, current.organizationId),
            eq(invitations.status, "pending"),
            gt(invitations.expiresAt, input.cancelledAt),
          ),
        )
        .returning();
      if (changed[0]) return toInvitation(changed[0], input.cancelledAt);
      const replay = await database
        .select()
        .from(invitations)
        .where(
          and(
            eq(invitations.id, input.invitationId),
            eq(invitations.organizationId, current.organizationId),
            eq(invitations.status, "cancelled"),
          ),
        )
        .limit(1);
      if (replay[0]) return toInvitation(replay[0], input.cancelledAt);
      throw new Error("Invitation cancellation conditional update failed");
    },

    async acceptInvitation(input) {
      const discovered = await database
        .select()
        .from(invitations)
        .where(eq(invitations.id, input.invitationId))
        .limit(1);
      const candidate = discovered[0];
      if (!candidate) throw new Error("Invitation acceptance target no longer exists");
      await lock(candidate.organizationId);
      const lockedRows = await database
        .select()
        .from(invitations)
        .where(
          and(
            eq(invitations.id, input.invitationId),
            eq(invitations.organizationId, candidate.organizationId),
          ),
        )
        .limit(1)
        .for("update");
      const invitation = lockedRows[0];
      if (!invitation) throw new Error("Invitation disappeared while accepting it");
      if (
        invitation.status === "accepted" &&
        invitation.acceptedByUserId === input.userId &&
        invitation.acceptedMemberId
      ) {
        const replayMembership = await database
          .select()
          .from(members)
          .where(
            and(
              eq(members.id, invitation.acceptedMemberId),
              eq(members.organizationId, invitation.organizationId),
              eq(members.userId, input.userId),
            ),
          )
          .limit(1);
        if (!replayMembership[0])
          throw new Error("Accepted invitation membership no longer exists");
        return {
          invitation: toInvitation(invitation, input.acceptedAt),
          membership: toMembership(replayMembership[0]),
        };
      }
      if (
        invitation.status !== "pending" ||
        invitation.expiresAt.getTime() <= input.acceptedAt.getTime()
      ) {
        throw new Error("Invitation is not pending and unexpired");
      }
      const existingMembership = await database
        .select()
        .from(members)
        .where(
          and(
            eq(members.organizationId, invitation.organizationId),
            eq(members.userId, input.userId),
          ),
        )
        .limit(1)
        .for("update");
      let membership = existingMembership[0];
      if (!membership) {
        const inserted = await database
          .insert(members)
          .values({
            id: randomUUID(),
            organizationId: invitation.organizationId,
            userId: input.userId,
            role: toOrganizationRole(invitation.role),
            createdAt: input.acceptedAt,
            updatedAt: input.acceptedAt,
          })
          .returning();
        membership = inserted[0];
      }
      if (!membership) throw new Error("Invitation membership insert returned no row");
      const acceptedRows = await database
        .update(invitations)
        .set({
          status: "accepted",
          acceptedByUserId: input.userId,
          acceptedMemberId: membership.id,
          updatedAt: input.acceptedAt,
        })
        .where(
          and(
            eq(invitations.id, input.invitationId),
            eq(invitations.organizationId, invitation.organizationId),
            eq(invitations.status, "pending"),
            gt(invitations.expiresAt, input.acceptedAt),
            isNull(invitations.acceptedByUserId),
            isNull(invitations.acceptedMemberId),
          ),
        )
        .returning();
      if (!acceptedRows[0]) throw new Error("Invitation acceptance conditional update failed");
      return {
        invitation: toInvitation(acceptedRows[0], input.acceptedAt),
        membership: toMembership(membership),
      };
    },

    async listTeams(organizationId) {
      const rows = await database
        .select()
        .from(teams)
        .where(eq(teams.organizationId, organizationId))
        .orderBy(asc(teams.name), asc(teams.id));
      return rows.map(toTeam);
    },

    async getTeam(teamId) {
      const rows = await database.select().from(teams).where(eq(teams.id, teamId)).limit(1);
      if (rows[0]) await lock(rows[0].organizationId);
      return rows[0] ? toTeam(rows[0]) : null;
    },

    async findTeamByName(organizationId, normalizedName) {
      await lock(organizationId);
      const rows = await database
        .select()
        .from(teams)
        .where(eq(teams.organizationId, organizationId))
        .orderBy(asc(teams.id));
      const row = rows.find(
        (candidate) =>
          candidate.name.trim().replace(/\\s+/g, " ").toLocaleLowerCase("en-US") === normalizedName,
      );
      return row ? toTeam(row) : null;
    },

    async createTeam(input) {
      await lock(input.organizationId);
      const rows = await database
        .insert(teams)
        .values({
          id: randomUUID(),
          organizationId: input.organizationId,
          name: input.name,
          createdAt: input.createdAt,
          updatedAt: input.createdAt,
        })
        .returning();
      if (!rows[0]) throw new Error("Team insert returned no row");
      return toTeam(rows[0]);
    },

    async listTeamMemberships(teamId) {
      const rows = await database
        .select()
        .from(teamMembers)
        .where(eq(teamMembers.teamId, teamId))
        .orderBy(asc(teamMembers.createdAt), asc(teamMembers.userId));
      return rows.map(toTeamMembership);
    },

    async getTeamMembership(teamId, userId) {
      const organizationId = transactional ? await organizationForTeam(database, teamId) : null;
      if (organizationId) await lockOrganization(database, organizationId);
      const rows = await database
        .select()
        .from(teamMembers)
        .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)))
        .limit(1);
      return rows[0] ? toTeamMembership(rows[0]) : null;
    },

    async addTeamMembership(input) {
      const organizationId = await organizationForTeam(database, input.teamId);
      if (!organizationId) throw new Error("Team membership target team no longer exists");
      await lock(organizationId);
      const organizationMembership = await database
        .select({ id: members.id })
        .from(members)
        .where(and(eq(members.organizationId, organizationId), eq(members.userId, input.userId)))
        .limit(1);
      if (!organizationMembership[0]) throw new Error("Team member is outside the organization");
      const rows = await database
        .insert(teamMembers)
        .values({
          id: randomUUID(),
          teamId: input.teamId,
          userId: input.userId,
          createdAt: input.createdAt,
        })
        .onConflictDoNothing({ target: [teamMembers.teamId, teamMembers.userId] })
        .returning();
      if (rows[0]) return toTeamMembership(rows[0]);
      const replay = await database
        .select()
        .from(teamMembers)
        .where(and(eq(teamMembers.teamId, input.teamId), eq(teamMembers.userId, input.userId)))
        .limit(1);
      if (replay[0]) return toTeamMembership(replay[0]);
      throw new Error("Team membership insert conflict did not resolve");
    },

    async removeTeamMembership(input) {
      const organizationId = await organizationForTeam(database, input.teamId);
      if (!organizationId) return;
      await lock(organizationId);
      await database
        .update(sessions)
        .set({ activeTeamId: null, updatedAt: input.removedAt })
        .where(
          and(
            eq(sessions.userId, input.userId),
            eq(sessions.activeOrganizationId, organizationId),
            eq(sessions.activeTeamId, input.teamId),
          ),
        );
      await database
        .delete(teamMembers)
        .where(and(eq(teamMembers.teamId, input.teamId), eq(teamMembers.userId, input.userId)));
    },
  };
}

const query = createPersistence(db, false);

const postgresIdentityAdapter = definePostgresIdentityAdapter({
  kind: "postgres" as const,
  query,
  unitOfWork: {
    async run(work) {
      return await runSerializable(async (transaction) => {
        const identity = createPersistence(transaction, true);
        const audit = createAudit(transaction);
        return await work({ identity, audit });
      });
    },
  },
});

export function createIdentityServiceForRequest() {
  return createIdentityService({ adapter: postgresIdentityAdapter });
}

export async function resolveIdentityActorForRequest(input: {
  sessionId: string;
  userId: string;
}) {
  const now = new Date();
  const rows = await db
    .select({
      sessionId: sessions.id,
      userId: users.id,
      email: users.email,
      emailVerified: users.emailVerified,
      name: users.name,
      role: users.role,
      banned: users.banned,
      authenticatedAt: sessions.authenticatedAt,
      activeOrganizationId: sessions.activeOrganizationId,
      activeTeamId: sessions.activeTeamId,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(
        eq(sessions.id, input.sessionId),
        eq(sessions.userId, input.userId),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, now),
      ),
    )
    .limit(1);
  const value = rows[0];
  if (!value) return null;
  return {
    user: {
      id: value.userId,
      identityId: value.userId,
      email: value.email,
      emailVerified: value.emailVerified === true,
      name: value.name ?? null,
      role: value.role ?? "user",
      banned: value.banned ?? false,
    },
    actor: {
      userId: value.userId,
      sessionId: value.sessionId,
      email: value.email,
      emailVerified: value.emailVerified === true,
      authenticatedAt: value.authenticatedAt,
      activeOrganizationId: value.activeOrganizationId ?? null,
      activeTeamId: value.activeTeamId ?? null,
    },
  };
}
`;
}

export function postgresIdentityAdapterFiles(mode: ProjectMode): TemplateFile[] {
  return [
    file(
      mode === "monorepo"
        ? "packages/services/src/application/composition/identity.ts"
        : "src/server/services/application/composition/identity.ts",
      postgresIdentityCompositionContent(mode),
    ),
  ];
}
