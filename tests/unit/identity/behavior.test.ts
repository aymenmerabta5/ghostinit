// @allow-long 330: end-to-end behavioral cases share one dynamically loaded generated identity service fixture
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { identityServiceFiles } from "../../../src/templates/services/identity/index.js";
import {
  createActor,
  createIdentityHarness,
  type TestActor,
  type TestInvitation,
  type TestMembership,
  type TestOrganization,
  type TestSession,
  type TestTeam,
  type TestTeamMembership,
} from "./harness.js";

interface MutationResult<T> {
  value: T;
  changed: boolean;
}
interface GeneratedIdentityService {
  sessions: {
    list(actor: TestActor): Promise<TestSession[]>;
    revoke(actor: TestActor, sessionId: string): Promise<MutationResult<TestSession>>;
    revokeOthers(actor: TestActor): Promise<{ revokedCount: number; changed: boolean }>;
  };
  organizations: {
    list(actor: TestActor): Promise<TestOrganization[]>;
    create(
      actor: TestActor,
      input: { name: string; slug: string },
    ): Promise<{ organization: TestOrganization; created: boolean }>;
    setActive(
      actor: TestActor,
      organizationId: string,
    ): Promise<{ organizationId: string; changed: boolean }>;
    listMembers(actor: TestActor, organizationId: string): Promise<TestMembership[]>;
    changeMemberRole(
      actor: TestActor,
      input: { organizationId: string; membershipId: string; role: "owner" | "admin" | "member" },
    ): Promise<MutationResult<TestMembership>>;
    removeMember(
      actor: TestActor,
      input: { organizationId: string; membershipId: string },
    ): Promise<{ membershipId: string; changed: boolean }>;
    hasPermission(
      actor: TestActor,
      organizationId: string,
      permission:
        | "organization:read"
        | "organization:write"
        | "member:read"
        | "member:write"
        | "invitation:read"
        | "invitation:write"
        | "team:read"
        | "team:write",
    ): Promise<boolean>;
  };
  invitations: {
    list(actor: TestActor, organizationId: string): Promise<TestInvitation[]>;
    create(
      actor: TestActor,
      input: { organizationId: string; email: string; role: "owner" | "admin" | "member" },
    ): Promise<{ invitation: TestInvitation; created: boolean }>;
    cancel(actor: TestActor, invitationId: string): Promise<MutationResult<TestInvitation>>;
    accept(actor: TestActor, invitationId: string): Promise<MutationResult<TestMembership>>;
  };
  teams: {
    list(actor: TestActor, organizationId: string): Promise<TestTeam[]>;
    create(
      actor: TestActor,
      organizationId: string,
      name: string,
    ): Promise<{ team: TestTeam; created: boolean }>;
    setActive(
      actor: TestActor,
      organizationId: string,
      teamId: string,
    ): Promise<{ teamId: string; changed: boolean }>;
    listMembers(
      actor: TestActor,
      organizationId: string,
      teamId: string,
    ): Promise<TestTeamMembership[]>;
    addMember(
      actor: TestActor,
      input: { organizationId: string; teamId: string; userId: string },
    ): Promise<MutationResult<TestTeamMembership>>;
    removeMember(
      actor: TestActor,
      input: { organizationId: string; teamId: string; userId: string },
    ): Promise<{ userId: string; changed: boolean }>;
  };
}

interface GeneratedIdentityModule {
  createIdentityService(dependencies: {
    adapter: ReturnType<typeof createIdentityHarness>["adapter"];
    now: () => Date;
    freshSessionMaximumAgeMs?: number;
  }): GeneratedIdentityService;
}

let generated: GeneratedIdentityModule;
let runtimeRoot = "";
const now = new Date("2026-01-01T12:00:00.000Z");

beforeAll(async () => {
  runtimeRoot = mkdtempSync(join(tmpdir(), "ghostinit-identity-runtime-"));
  const prefix = "src/server/services/identity/";
  for (const entry of identityServiceFiles("single")) {
    const target = join(runtimeRoot, entry.path.slice(prefix.length));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, entry.content, "utf8");
  }
  const serverOnlyRoot = join(runtimeRoot, "node_modules", "server-only");
  mkdirSync(serverOnlyRoot, { recursive: true });
  writeFileSync(join(serverOnlyRoot, "package.json"), '{"type":"module","exports":"./index.js"}\n');
  writeFileSync(join(serverOnlyRoot, "index.js"), "export {};\n");
  generated = (await import(
    pathToFileURL(join(runtimeRoot, "index.ts")).href
  )) as GeneratedIdentityModule;
});

afterAll(() => {
  if (runtimeRoot) rmSync(runtimeRoot, { recursive: true, force: true });
});

async function expectCode(work: Promise<unknown>, code: string): Promise<void> {
  try {
    await work;
    throw new Error(`Expected ${code}`);
  } catch (error) {
    expect((error as { code?: string }).code).toBe(code);
  }
}

function setup() {
  const harness = createIdentityHarness(now);
  const service = generated.createIdentityService({ adapter: harness.adapter, now: () => now });
  return { harness, service };
}

describe("generated identity service behavior", () => {
  test("requires a complete actor and denies cross-tenant access without leaking data", async () => {
    const { service } = setup();
    await expectCode(
      service.sessions.list(createActor(now, { userId: "" })),
      "IDENTITY_UNAUTHENTICATED",
    );

    const member = createActor(now, {
      userId: "member",
      sessionId: "session-member",
      email: "member@example.com",
    });
    await expectCode(
      service.organizations.listMembers(member, "org-b"),
      "IDENTITY_ORGANIZATION_FORBIDDEN",
    );
    await expectCode(
      service.organizations.setActive({ ...member, activeOrganizationId: "org-b" }, "org-b"),
      "IDENTITY_ORGANIZATION_FORBIDDEN",
    );
    await expectCode(
      service.organizations.changeMemberRole(member, {
        organizationId: "org-a",
        membershipId: "membership-member",
        role: "member",
      }),
      "IDENTITY_ORGANIZATION_FORBIDDEN",
    );
    expect(await service.organizations.hasPermission(member, "org-b", "member:read")).toBe(false);
  });

  test("enforces ownership and recent authentication for session revocation", async () => {
    const { harness, service } = setup();
    const stale = createActor(now, { authenticatedAt: new Date(now.getTime() - 10 * 60 * 1000) });

    await expectCode(
      service.sessions.revoke(stale, "session-owner-2"),
      "IDENTITY_SESSION_NOT_FRESH",
    );
    await expectCode(
      service.sessions.revoke(createActor(now), "session-outsider"),
      "IDENTITY_SESSION_FORBIDDEN",
    );

    const current = await service.sessions.revoke(stale, "session-owner");
    expect(current.changed).toBe(true);
    expect(
      harness.state().sessions.find((session) => session.id === "session-owner")?.revokedAt,
    ).toEqual(now);
  });

  test("revoke-others is fresh-session protected and idempotent", async () => {
    const { harness, service } = setup();
    const first = await service.sessions.revokeOthers(createActor(now));
    const second = await service.sessions.revokeOthers(createActor(now));

    expect(first).toEqual({ revokedCount: 1, changed: true });
    expect(second).toEqual({ revokedCount: 0, changed: false });
    expect(
      harness.state().audits.filter((event) => event.action === "identity.session.others_revoked"),
    ).toHaveLength(1);
  });

  test("protects the last owner from demotion and removal", async () => {
    const { harness, service } = setup();
    const actor = createActor(now);

    await expectCode(
      service.organizations.changeMemberRole(actor, {
        organizationId: "org-a",
        membershipId: "membership-owner",
        role: "admin",
      }),
      "IDENTITY_LAST_OWNER",
    );
    await expectCode(
      service.organizations.removeMember(actor, {
        organizationId: "org-a",
        membershipId: "membership-owner",
      }),
      "IDENTITY_LAST_OWNER",
    );
    expect(
      harness.state().memberships.find((membership) => membership.id === "membership-owner")?.role,
    ).toBe("owner");
  });

  test("binds invitation acceptance to the invited verified email and expiry", async () => {
    const { service } = setup();
    const guest = createActor(now, {
      userId: "guest",
      sessionId: "session-guest",
      email: "guest@example.com",
      activeOrganizationId: null,
    });

    await expectCode(
      service.invitations.accept(guest, "invitation-expired"),
      "IDENTITY_INVITATION_EXPIRED",
    );
    await expectCode(
      service.invitations.accept({ ...guest, email: "attacker@example.com" }, "invitation-valid"),
      "IDENTITY_INVITATION_EMAIL_MISMATCH",
    );
    await expectCode(
      service.invitations.accept({ ...guest, emailVerified: false }, "invitation-valid"),
      "IDENTITY_EMAIL_NOT_VERIFIED",
    );
  });

  test("accepting an invitation and adding a team member are replay-safe", async () => {
    const { harness, service } = setup();
    const guest = createActor(now, {
      userId: "guest",
      sessionId: "session-guest",
      email: "GUEST@example.com",
      activeOrganizationId: null,
    });

    const accepted = await service.invitations.accept(guest, "invitation-valid");
    const replay = await service.invitations.accept(guest, "invitation-valid");
    expect(accepted.changed).toBe(true);
    expect(replay.changed).toBe(false);
    expect(
      harness.state().memberships.filter((membership) => membership.userId === "guest"),
    ).toHaveLength(1);

    const teamInput = {
      organizationId: "org-a",
      teamId: "team-a",
      userId: accepted.value.userId,
    };
    const added = await service.teams.addMember(createActor(now), teamInput);
    const addReplay = await service.teams.addMember(createActor(now), teamInput);
    expect(added.changed).toBe(true);
    expect(addReplay.changed).toBe(false);
    expect(
      harness.state().teamMemberships.filter((membership) => membership.userId === "guest"),
    ).toHaveLength(1);
    expect(
      harness.state().audits.filter((event) => event.action === "identity.invitation.accepted"),
    ).toHaveLength(1);
    expect(
      harness.state().audits.filter((event) => event.action === "identity.team.member_added"),
    ).toHaveLength(1);
  });

  test("supports organization creation, activation, RBAC, member roles, and teams", async () => {
    const { harness, service } = setup();
    const actor = createActor(now);
    const first = await service.organizations.create(actor, { name: "Gamma", slug: "gamma" });
    const replay = await service.organizations.create(actor, { name: "Gamma", slug: "GAMMA" });

    expect(first.created).toBe(true);
    expect(replay.created).toBe(false);
    expect(
      await service.organizations.hasPermission(actor, first.organization.id, "organization:write"),
    ).toBe(true);
    expect((await service.organizations.setActive(actor, first.organization.id)).changed).toBe(
      true,
    );
    expect(harness.state().activeOrganizations[actor.sessionId]).toBe(first.organization.id);

    const team = await service.teams.create(actor, "org-a", " Platform ");
    const teamReplay = await service.teams.create(actor, "org-a", "platform");
    expect(team.created).toBe(true);
    expect(teamReplay.created).toBe(false);

    const activated = await service.teams.setActive(actor, "org-a", "team-a");
    const activeReplay = await service.teams.setActive(
      { ...actor, activeOrganizationId: "org-a", activeTeamId: "team-a" },
      "org-a",
      "team-a",
    );
    expect(activated).toEqual({ teamId: "team-a", changed: true });
    expect(activeReplay).toEqual({ teamId: "team-a", changed: false });
    expect(harness.state().activeTeams[actor.sessionId]).toBe("team-a");

    const promoted = await service.organizations.changeMemberRole(actor, {
      organizationId: "org-a",
      membershipId: "membership-member",
      role: "admin",
    });
    expect(promoted.value.role).toBe("admin");
  });

  test("rolls back persistence when the mandatory audit write fails", async () => {
    const { harness, service } = setup();
    harness.setAuditFailure(true);
    const before = structuredClone(harness.state());

    await expectCode(
      service.organizations.create(createActor(now), { name: "No Audit", slug: "no-audit" }),
      "IDENTITY_AUDIT_FAILED",
    );
    expect(harness.state()).toEqual(before);
  });
});
