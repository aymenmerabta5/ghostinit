import { describe, expect, test } from "bun:test";
import { postgresIdentityAdapterFiles } from "../../../src/templates/adapters/identity/postgres.js";
import { adapterSource, countMatches } from "./adapter-harness.js";

function postgresSource(): string {
  return adapterSource(postgresIdentityAdapterFiles("monorepo"));
}

describe("Postgres identity adapter", () => {
  test("binds persistence and audit to one retried serializable transaction", () => {
    const source = postgresSource();

    expect(source).toContain("runSerializable");
    expect(source).toContain('isolationLevel: "serializable"');
    expect(source).toMatch(/new Set\(\[\s*"40001",\s*"40P01",\s*"23505"\s*\]\)/);
    expect(source).toContain("createPersistence(transaction, true)");
    expect(source).toContain("createAudit(transaction)");
    expect(source).toMatch(/database\.insert\(identityAuditEvents\)\.values/);
    expect(source).not.toMatch(/db\.insert\(identityAuditEvents\)/);
  });

  test("serializes organization owner decisions before count and mutation", () => {
    const source = postgresSource();

    expect(source).toContain("lockOrganization");
    expect(source).toContain('.for("update")');
    expect(source).toContain("countOwners");
    expect(source).toContain("updateMembershipRole");
    expect(source).toContain("removeMembership");
    expect(countMatches(source, /lockOrganization\(/)).toBeGreaterThanOrEqual(3);
  });

  test("uses compare-and-set predicates for sessions and tenant-scoped invitations", () => {
    const source = postgresSource();

    expect(source).toContain("isNull(sessions.revokedAt)");
    expect(source).toMatch(
      /revokeSession[\s\S]*?expiresAt: input\.revokedAt[\s\S]*?revokedAt: input\.revokedAt/,
    );
    expect(source).toMatch(/eq\(sessions\.userId,\s*input\.userId\)/);
    expect(source).toMatch(/eq\([^,]*invitations\.organizationId,\s*invitation\.organizationId\)/);
    expect(source).toMatch(/eq\([^,]*invitations\.status,\s*"pending"\)/);
    expect(source).toMatch(/(?:gt|lte)\([^,]*invitations\.expiresAt,/);
    expect(source).toContain("acceptedByUserId");
    expect(source).toContain("acceptedMemberId");
    expect(source).toContain("Invitation acceptance conditional update failed");
  });

  test("keeps active organization and team changes tied to the verified live session", () => {
    const source = postgresSource();

    expect(source).toContain("setActiveOrganization");
    expect(source).toContain("setActiveTeam");
    expect(source).toMatch(/eq\(sessions\.id,\s*input\.sessionId\)/);
    expect(source).toMatch(/eq\(sessions\.userId,\s*input\.userId\)/);
    expect(source).toContain("isNull(sessions.revokedAt)");
    expect(source).toMatch(/gt\(sessions\.expiresAt,/);
    expect(source).toContain("activeOrganizationId");
    expect(source).toContain("activeTeamId");
    expect(source).toMatch(
      /setActiveTeam[\s\S]*?eq\(teamMembers\.teamId,\s*input\.teamId\)[\s\S]*?eq\(teamMembers\.userId,\s*input\.userId\)/,
    );
  });

  test("scopes membership, invitation, and team operations to their tenant", () => {
    const source = postgresSource();

    expect(source).toMatch(/getMembership[\s\S]*organizationId[\s\S]*userId/);
    expect(source).toMatch(/findPendingInvitation[\s\S]*organizationId[\s\S]*normalizedEmail/);
    expect(source).toMatch(/findTeamByName[\s\S]*organizationId[\s\S]*normalizedName/);
    expect(source).toMatch(
      /addTeamMembership[\s\S]*eq\(members\.organizationId,\s*organizationId\)[\s\S]*eq\(members\.userId,\s*input\.userId\)/,
    );
    expect(source).toMatch(/removeTeamMembership[\s\S]*activeTeamId/);
  });

  test("makes replay-prone operations idempotent or stale-write rejecting", () => {
    const source = postgresSource();

    expect(source).toContain("onConflictDoNothing");
    expect(source).toMatch(/revokeSession[\s\S]*?Session revoke precondition failed/);
    expect(source).toMatch(
      /cancelInvitation[\s\S]*?Invitation cancellation conditional update failed/,
    );
    expect(source).toMatch(
      /acceptInvitation[\s\S]*?Invitation acceptance conditional update failed/,
    );
    expect(source).toMatch(/addTeamMembership[\s\S]*?onConflictDoNothing[\s\S]*?replay/);
  });

  test("keeps service composition actor-free and resolves principals from authoritative sessions", () => {
    const source = postgresSource();

    expect(source).toContain("createIdentityServiceForRequest()");
    expect(source).not.toMatch(
      /createIdentityServiceForRequest\([^)]*(?:actorId|userId|sessionId)/,
    );
    expect(source).not.toMatch(/createPostgresIdentityAdapter\([^)]*(?:actorId|userId|sessionId)/);
    expect(source).toContain("resolveIdentityActorForRequest(input:");
    expect(source).toContain("eq(sessions.id, input.sessionId)");
    expect(source).toContain("eq(sessions.userId, input.userId)");
  });
});
