import { describe, expect, test } from "bun:test";
import {
  identityApiFiles,
  identityApiIntegrationGuide,
} from "../../../src/templates/api/identity/index.js";
import {
  identityServiceFiles,
  identityServiceIntegrationGuide,
} from "../../../src/templates/services/identity/index.js";

function byPath(files: ReadonlyArray<{ path: string; content: string }>): Map<string, string> {
  return new Map(files.map((entry) => [entry.path, entry.content]));
}

describe("identity vertical-slice templates", () => {
  test("renders the same application service surface for monorepo and single mode", () => {
    const monorepo = identityServiceFiles("monorepo");
    const single = identityServiceFiles("single");

    expect(monorepo).toHaveLength(12);
    expect(single).toHaveLength(12);
    expect(
      monorepo.every((entry) => entry.path.startsWith("packages/services/src/identity/")),
    ).toBe(true);
    expect(single.every((entry) => entry.path.startsWith("src/server/services/identity/"))).toBe(
      true,
    );
    expect(monorepo.map((entry) => entry.path.split("/").at(-1))).toEqual(
      single.map((entry) => entry.path.split("/").at(-1)),
    );
  });

  test("keeps application contracts independent of auth vendors and persistence SDKs", () => {
    const content = identityServiceFiles("monorepo")
      .map((entry) => entry.content)
      .join("\n");

    expect(content).not.toContain("better-auth");
    expect(content).not.toContain("drizzle-orm");
    expect(content).not.toContain("@repo/database");
    expect(content).not.toContain("convex/server");
    expect(content).toContain("interface PostgresIdentityAdapter");
    expect(content).toContain("interface ConvexIdentityAdapter");
    expect(content).toContain("IdentityAdapterParity");
  });

  test("defines atomic audit semantics and complete identity use cases", () => {
    const files = byPath(identityServiceFiles("monorepo"));
    const ports = files.get("packages/services/src/identity/ports.ts") ?? "";
    const sessions = files.get("packages/services/src/identity/sessions.ts") ?? "";
    const organizations = files.get("packages/services/src/identity/organizations.ts") ?? "";
    const invitations = files.get("packages/services/src/identity/invitations.ts") ?? "";
    const teams = files.get("packages/services/src/identity/teams.ts") ?? "";
    const policy = files.get("packages/services/src/identity/policy.ts") ?? "";

    expect(ports).toContain("commit persistence and audit writes atomically");
    expect(ports).toContain("interface IdentityUnitOfWorkPort");
    expect(sessions).toContain("revokeOthers(actor: IdentityActor)");
    expect(sessions).toContain("assertFreshSession");
    expect(policy).toContain("IDENTITY_LAST_OWNER");
    expect(organizations).toContain("hasPermission(actor: IdentityActor");
    expect(invitations).toContain("IDENTITY_INVITATION_EMAIL_MISMATCH");
    expect(invitations).toContain("IDENTITY_INVITATION_EXPIRED");
    expect(teams).toContain("addMember(actor: IdentityActor");
    expect(teams).toContain("removeMember(actor: IdentityActor");
    expect(teams).toContain("setActive(actor: IdentityActor");
    expect(ports).toContain("setActiveTeam(input:");
    expect(teams).toContain("userId: string");
    expect(teams).not.toContain("input.membershipId");
  });

  test("renders typed oRPC contracts as thin request-facade adapters", () => {
    const files = byPath(identityApiFiles("monorepo"));
    const contract = files.get("packages/api/src/identity/contract.ts") ?? "";
    const procedures = files.get("packages/api/src/identity/procedures.ts") ?? "";
    const actions = files.get("packages/api/src/identity/actions.ts") ?? "";

    expect(files.size).toBe(11);
    expect(contract).toContain("sessions: identitySessionContracts");
    expect(contract).toContain("organizations: identityOrganizationContracts");
    expect(contract).toContain("invitations: identityInvitationContracts");
    expect(contract).toContain("teams: identityTeamContracts");
    expect(procedures).toContain("implement<typeof identityContract, TContext>");
    expect(procedures).toContain("createIdentityProcedures");
    expect(actions).toContain("context.application.identity.organizations.list()");
    expect(actions).not.toContain("ResolveIdentityService<TContext>");
    expect(files.get("packages/api/src/identity/session-contracts.ts") ?? "").toContain(
      ".errors(identityContractErrors)",
    );
    expect(actions).not.toContain("@repo/database");
    expect(actions).not.toContain("better-auth");
  });

  test("all rendered TypeScript parses", () => {
    const transpiler = new Bun.Transpiler({ loader: "ts" });
    for (const entry of [...identityServiceFiles("monorepo"), ...identityApiFiles("monorepo")]) {
      expect(() => transpiler.transformSync(entry.content), entry.path).not.toThrow();
    }
  });

  test("exposes exact integration edits without changing shared composers", () => {
    const serviceGuide = identityServiceIntegrationGuide("monorepo");
    const apiGuide = identityApiIntegrationGuide("monorepo");

    expect(serviceGuide.serviceBarrelLine).toBe('export * as identity from "./identity/index.js";');
    expect(serviceGuide.packageExport).toEqual({ "./identity": "./src/identity/index.ts" });
    expect(apiGuide.contractEntry).toBe("identity: identityContract,");
    expect(apiGuide.contextField).toContain("IdentityActor");
    expect(apiGuide.routerEntry).toContain("createIdentityProcedures<ApiContext>");
  });
});
