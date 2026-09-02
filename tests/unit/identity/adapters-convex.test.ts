import { describe, expect, test } from "bun:test";
import { convexIdentityAdapterFiles } from "../../../src/templates/adapters/identity/convex.js";
import { adapterFilesByPath, countMatches, type RenderedAdapterFile } from "./adapter-harness.js";

const functionPaths = [
  "convex/identity/sessions.ts",
  "convex/identity/organizations.ts",
  "convex/identity/invitations.ts",
  "convex/identity/teams.ts",
] as const;

function convexFiles(): ReadonlyArray<RenderedAdapterFile> {
  return convexIdentityAdapterFiles("monorepo");
}

function rendered(path: string): string {
  return adapterFilesByPath(convexFiles()).get(path) ?? "";
}

function commandSource(): string {
  return functionPaths.map(rendered).join("\n");
}

type MutationEntry = { name: string; kind: "mutation" | "internalMutation"; command: string };

function mutationEntries(source: string): MutationEntry[] {
  const entries: MutationEntry[] = [];
  const pattern = /export const (\w+) = (mutation|internalMutation)\(\{([\s\S]*?)\n\}\);/g;
  for (const match of source.matchAll(pattern)) {
    const command = match[3]?.match(/return await (\w+Command)\(ctx, actor/)?.[1];
    if (match[1] && match[2] && command) {
      entries.push({
        name: match[1],
        kind: match[2] as MutationEntry["kind"],
        command,
      });
    }
  }
  return entries;
}

describe("Convex identity adapter", () => {
  test("owns its complete schema instead of advertising unsupported Better Auth tables", () => {
    const schema = rendered("convex/schema/identity.ts");

    for (const table of [
      "identitySessions",
      "identityOrganizations",
      "identityMemberships",
      "identityInvitations",
      "identityTeams",
      "identityTeamMemberships",
      "identityAuditEvents",
    ]) {
      expect(schema, table).toContain(`${table}: defineTable({`);
    }
    expect(schema).toContain("App-owned identity data");
    expect(schema).toContain("do not add its");
    expect(schema).toContain("organization plugin");
    expect(schema).toContain('.index("by_organization_user", ["organizationId", "userId"])');
    expect(schema).toContain(
      '.index("by_organization_email_status", ["organizationId", "email", "status"])',
    );
    expect(schema).toContain(
      '.index("by_organization_name", ["organizationId", "normalizedName"])',
    );
  });

  test("derives the actor and active tenant only from authenticated app session state", () => {
    const shared = rendered("convex/identity/shared.ts");
    const sessions = rendered("convex/identity/sessions.ts");

    expect(shared).toContain("const user = await requireActor(ctx)");
    expect(shared).toContain("await ctx.auth.getUserIdentity()");
    expect(shared).toContain("identity?.sessionId");
    expect(shared).toContain('.withIndex("by_auth_session"');
    expect(shared).toMatch(/session\.userId !== user\._id/);
    expect(shared).toMatch(/session\.revokedAt !== undefined/);
    expect(shared).toMatch(/session\.expiresAt <= now/);
    expect(shared).toContain("authenticatedAt: session.authenticatedAt");
    expect(shared).toContain("activeOrganizationId: session.activeOrganizationId ?? null");
    expect(shared).toContain("activeTeamId: session.activeTeamId ?? null");
    expect(sessions).toContain("trusted Better Auth component records");
  });

  test("keeps actor identity out of every public validator", () => {
    const source = commandSource();

    expect(source).not.toMatch(/\bactor(?:Id|UserId)\s*:\s*v\./);
    expect(source).not.toMatch(/\bauthenticatedAt\s*:\s*v\./);
    expect(source).not.toMatch(/\bactive(?:Organization|Team)Id\s*:\s*v\./);
    expect(source).not.toMatch(/\bemailVerified\s*:\s*v\./);
  });

  test("routes public and internal mutations through the same single-transaction commands", () => {
    const source = commandSource();
    let publicCount = 0;
    let internalCount = 0;
    for (const path of functionPaths) {
      const entries = mutationEntries(rendered(path));
      const publicEntries = entries.filter((entry) => entry.kind === "mutation");
      const internalEntries = entries.filter((entry) => entry.kind === "internalMutation");
      publicCount += publicEntries.length;
      internalCount += internalEntries.length;
      for (const entry of publicEntries) {
        const internal = internalEntries.find(
          (candidate) => candidate.name === `${entry.name}Internal`,
        );
        expect(internal, `${path}:${entry.name}`).toBeDefined();
        expect(internal?.command, `${path}:${entry.name}`).toBe(entry.command);
      }
    }
    expect(publicCount).toBe(13);
    expect(internalCount).toBe(13);
    expect(
      countMatches(source, /const actor = await requireIdentityActor\(ctx\)/),
    ).toBeGreaterThanOrEqual(publicCount + internalCount);
    expect(source).toContain("ctx.runMutation(components.betterAuth.adapter.deleteOne");
  });

  test("writes one audit event inside every coarse mutation command", () => {
    const source = commandSource();
    const commandCount = countMatches(source, /async function \w+Command\(/);

    expect(commandCount).toBe(13);
    expect(countMatches(source, /await recordIdentityAudit\(ctx, \{/)).toBe(commandCount);
    expect(source).not.toContain("IdentityUnitOfWorkPort");
    expect(source).not.toContain("unitOfWork");
  });

  test("enforces tenant scope and final-owner checks in the mutation transaction", () => {
    const shared = rendered("convex/identity/shared.ts");
    const organizations = rendered("convex/identity/organizations.ts");
    const teams = rendered("convex/identity/teams.ts");

    expect(shared).toMatch(
      /withIndex\("by_organization_user"[\s\S]*eq\("organizationId", organizationId\)[\s\S]*eq\("userId", userId\)/,
    );
    expect(organizations).toContain("target.organizationId !== input.organizationId");
    expect(organizations).toContain("ownerCount(ctx, input.organizationId)");
    expect(countMatches(organizations, /IDENTITY_LAST_OWNER/)).toBe(2);
    expect(teams).toContain("requireTeam(ctx, input.organizationId, input.teamId)");
    expect(teams).toContain("getMembership(ctx, input.organizationId, input.userId)");
    expect(teams).toContain("existing.organizationId !== input.organizationId");
  });

  test("guards session, invitation, and team replays before their audit write", () => {
    const sessions = rendered("convex/identity/sessions.ts");
    const invitations = rendered("convex/identity/invitations.ts");
    const teams = rendered("convex/identity/teams.ts");

    expect(sessions).toMatch(/target\.userId !== actor\.user\._id/);
    expect(sessions).toMatch(/target\.revokedAt !== undefined[\s\S]*changed: false/);
    expect(sessions).toMatch(/targets\.length === 0[\s\S]*changed: false/);
    expect(sessions).toContain('input: { model: "session", where: [{ field: "_id"');
    expect(sessions).toMatch(
      /revokeCanonicalAuthSession\(ctx, target\.authSessionId\)[\s\S]*ctx\.db\.patch\(target\._id/,
    );
    expect(sessions).toMatch(
      /for \(const target of otherSessions\)[\s\S]*revokeCanonicalAuthSession\(ctx, target\.authSessionId\)/,
    );
    expect(invitations).toMatch(
      /status === "accepted"[\s\S]*acceptedByUserId === actor\.user\._id/,
    );
    expect(invitations).toMatch(/status !== "pending"/);
    expect(invitations).toMatch(/expiresAt <= occurredAt/);
    expect(teams).toMatch(
      /if \(existing\) return \{ value: teamMembershipValue\(existing\), changed: false \}/,
    );
    expect(teams).toMatch(/existing\.organizationId !== input\.organizationId/);
  });

  test("exposes a typed service facade without pretending remote callback atomicity", () => {
    const proxy = rendered(
      "packages/services/src/application/composition/adapters/identity/convex.ts",
    );

    expect(proxy).toContain("Each method is one coarse server command");
    expect(proxy).toContain("intentionally not IdentityAdapterPort");
    expect(proxy).not.toContain("unitOfWork");
    expect(proxy).not.toContain("runMutation");
    expect(proxy).not.toMatch(/input:\s*\{[^}]*\b(?:actorId|actorUserId|authenticatedAt)\s*:/s);
    expect(proxy).toContain("createConvexIdentityService(executor: ConvexIdentityCommandExecutor)");
    expect(proxy).toContain("satisfies IdentityService");
    expect(countMatches(proxy, /_actor: IdentityActor/)).toBe(20);
    expect(proxy).toContain("return createConvexIdentityService(executor)");
    expect(proxy).toContain("createConvexIdentityAuditProxy");
    expect(proxy).toContain("if (!Number.isFinite(value))");
    expect(proxy).toContain("if (Number.isNaN(result.getTime()))");
    expect(proxy).toContain(
      'authenticatedAt: date(value.authenticatedAt, "session.authenticatedAt")',
    );
    expect(proxy).toContain('revokedAt: nullableDate(value.revokedAt, "session.revokedAt")');
  });
});
