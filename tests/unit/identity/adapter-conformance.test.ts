// @allow-long 330: both provider labels execute one shared transactional behavior vector
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
  type TestMembership,
  type TestSession,
  type TestTeamMembership,
} from "./harness.js";

type Result<T> = { value: T; changed: boolean };
interface ConformanceService {
  sessions: {
    revoke(actor: TestActor, sessionId: string): Promise<Result<TestSession>>;
  };
  organizations: {
    listMembers(actor: TestActor, organizationId: string): Promise<TestMembership[]>;
    changeMemberRole(
      actor: TestActor,
      input: { organizationId: string; membershipId: string; role: "owner" | "admin" | "member" },
    ): Promise<Result<TestMembership>>;
    removeMember(
      actor: TestActor,
      input: { organizationId: string; membershipId: string },
    ): Promise<{ membershipId: string; changed: boolean }>;
  };
  invitations: {
    accept(actor: TestActor, invitationId: string): Promise<Result<TestMembership>>;
  };
  teams: {
    list(actor: TestActor, organizationId: string): Promise<unknown[]>;
    addMember(
      actor: TestActor,
      input: { organizationId: string; teamId: string; userId: string },
    ): Promise<Result<TestTeamMembership>>;
  };
}
interface GeneratedModule {
  createIdentityService(input: {
    adapter: ReturnType<typeof createIdentityHarness>["adapter"];
    now: () => Date;
  }): ConformanceService;
}

const now = new Date("2026-01-01T12:00:00.000Z");
let generated: GeneratedModule;
let runtimeRoot = "";

beforeAll(async () => {
  runtimeRoot = mkdtempSync(join(tmpdir(), "ghostinit-identity-conformance-"));
  const prefix = "src/server/services/identity/";
  for (const entry of identityServiceFiles("single")) {
    const target = join(runtimeRoot, entry.path.slice(prefix.length));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, entry.content, "utf8");
  }
  const serverOnly = join(runtimeRoot, "node_modules", "server-only");
  mkdirSync(serverOnly, { recursive: true });
  writeFileSync(join(serverOnly, "package.json"), '{"type":"module","exports":"./index.js"}\n');
  writeFileSync(join(serverOnly, "index.js"), "export {};\n");
  generated = (await import(pathToFileURL(join(runtimeRoot, "index.ts")).href)) as GeneratedModule;
});

afterAll(() => {
  if (runtimeRoot) rmSync(runtimeRoot, { recursive: true, force: true });
});

function setup(kind: "postgres" | "convex") {
  const harness = createIdentityHarness(now, { kind });
  const service = generated.createIdentityService({ adapter: harness.adapter, now: () => now });
  return { harness, service };
}

async function errorCode(work: Promise<unknown>): Promise<string | undefined> {
  try {
    await work;
    return undefined;
  } catch (error) {
    return (error as { code?: string }).code;
  }
}

for (const kind of ["postgres", "convex"] as const) {
  describe(`${kind} identity adapter conformance`, () => {
    test("isolates two tenants without disclosing their membership or teams", async () => {
      const { service } = setup(kind);
      const tenantB = createActor(now, {
        userId: "outsider",
        sessionId: "session-outsider",
        email: "outsider@example.com",
        activeOrganizationId: "org-b",
      });

      expect(await errorCode(service.organizations.listMembers(tenantB, "org-a"))).toBe(
        "IDENTITY_ORGANIZATION_FORBIDDEN",
      );
      expect(await errorCode(service.teams.list(createActor(now), "org-b"))).toBe(
        "IDENTITY_ORGANIZATION_FORBIDDEN",
      );
    });

    test("serializes competing owner mutations so one owner always remains", async () => {
      const { harness, service } = setup(kind);
      const secondOwner = harness
        .state()
        .memberships.find((membership) => membership.id === "membership-member");
      if (!secondOwner) throw new Error("second owner fixture missing");
      secondOwner.role = "owner";

      const results = await Promise.allSettled([
        service.organizations.changeMemberRole(createActor(now), {
          organizationId: "org-a",
          membershipId: "membership-owner",
          role: "member",
        }),
        service.organizations.removeMember(createActor(now), {
          organizationId: "org-a",
          membershipId: "membership-member",
        }),
      ]);

      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
      expect(
        harness
          .state()
          .memberships.filter(
            (membership) => membership.organizationId === "org-a" && membership.role === "owner",
          ),
      ).toHaveLength(1);
    });

    test("deduplicates concurrent invitation, team, and session mutations with one audit", async () => {
      const { harness, service } = setup(kind);
      const guest = createActor(now, {
        userId: "guest",
        sessionId: "session-guest",
        email: "guest@example.com",
        activeOrganizationId: null,
      });

      const accepts = await Promise.all([
        service.invitations.accept(guest, "invitation-valid"),
        service.invitations.accept(guest, "invitation-valid"),
      ]);
      expect(accepts.map((result) => result.changed).sort()).toEqual([false, true]);
      expect(
        harness.state().audits.filter((event) => event.action === "identity.invitation.accepted"),
      ).toHaveLength(1);

      const teamInput = { organizationId: "org-a", teamId: "team-a", userId: "member" };
      const additions = await Promise.all([
        service.teams.addMember(createActor(now), teamInput),
        service.teams.addMember(createActor(now), teamInput),
      ]);
      expect(additions.map((result) => result.changed).sort()).toEqual([false, true]);
      expect(
        harness.state().audits.filter((event) => event.action === "identity.team.member_added"),
      ).toHaveLength(1);

      const revocations = await Promise.all([
        service.sessions.revoke(createActor(now), "session-owner-2"),
        service.sessions.revoke(createActor(now), "session-owner-2"),
      ]);
      expect(revocations.map((result) => result.changed).sort()).toEqual([false, true]);
      expect(
        harness.state().audits.filter((event) => event.action === "identity.session.revoked"),
      ).toHaveLength(1);
    });

    test("rolls the state change back when the mandatory audit write fails", async () => {
      const { harness, service } = setup(kind);
      harness.setAuditFailure(true);
      const before = structuredClone(harness.state());

      expect(await errorCode(service.sessions.revoke(createActor(now), "session-owner-2"))).toBe(
        "IDENTITY_AUDIT_FAILED",
      );
      expect(harness.state()).toEqual(before);
    });
  });
}
