import { describe, expect, test } from "bun:test";
import {
  postgresAdminAdapterFiles,
  postgresAdminAdapterIntegrationGuide,
} from "../../../src/templates/adapters/identity/postgres-admin.js";
import { adapterSource, countMatches, syntaxFailures } from "./adapter-harness.js";

function adminSource(mode: "monorepo" | "single" = "monorepo"): string {
  return adapterSource(postgresAdminAdapterFiles(mode));
}

describe("Postgres atomic admin adapter", () => {
  test("renders the replacement composition for both project modes", () => {
    const monorepo = postgresAdminAdapterFiles("monorepo");
    const single = postgresAdminAdapterFiles("single");

    expect(monorepo.map((entry) => entry.path)).toEqual([
      "packages/services/src/application/composition/admin.ts",
    ]);
    expect(single.map((entry) => entry.path)).toEqual([
      "src/server/services/application/composition/admin.ts",
    ]);
    expect(syntaxFailures([...monorepo, ...single])).toEqual([]);
    expect(adminSource("monorepo")).toContain('from "@repo/database"');
    expect(adminSource("single")).toContain('from "@/server/db/schema/auth"');
  });

  test("publishes exact composer guidance without depending on composer integration", () => {
    for (const mode of ["monorepo", "single"] as const) {
      const guide = postgresAdminAdapterIntegrationGuide(mode);
      const expectedPath =
        mode === "monorepo"
          ? "packages/services/src/application/composition/admin.ts"
          : "src/server/services/application/composition/admin.ts";

      expect(guide.emissionCondition).toContain('database === "postgres"');
      expect(guide.compositionPath).toBe(expectedPath);
      expect(guide.rendererImport).toContain("postgresAdminAdapterFiles");
      expect(guide.rendererCall).toContain(`"${mode}"`);
      expect(guide.replacesPlaceholder).toBe(true);
      expect(guide.instructions.join(" ")).toContain("expired temporary ban");
      expect(guide.instructions.join(" ")).toContain("ADMIN_LAST_ADMIN");
      expect(guide.instructions.join(" ")).toContain("ADMIN_CONCURRENT_MODIFICATION");
    }
  });

  test("reloads and locks the actor, target, and administrator set inside serializable retries", () => {
    const source = adminSource();

    expect(source).toContain("runSerializableAdminTransaction");
    expect(source).toContain('isolationLevel: "serializable"');
    expect(source).toMatch(/new Set\(\[\s*"40001",\s*"40P01"\s*\]\)/);
    expect(source).toContain("lockActiveAdmins(transaction, occurredAt)");
    expect(source).toContain("lockActorAndTarget(transaction, actor.id, targetId, occurredAt)");
    expect(source).toContain("[actorId, targetId].sort()");
    expect(countMatches(source, /\.for\("update"\)/)).toBeGreaterThanOrEqual(2);
    expect(source).toMatch(/!row \|\| !isStoredAdminRole\(row\.role\)/);
    expect(source).toContain("isEffectivelyBanned(row, observedAt)");
    expect(source).toContain("lte(users.banExpires, observedAt)");
  });

  test("protects the final admin and uses conditional role writes", () => {
    const source = adminSource();

    expect(source).toContain("targetIsActiveAdmin");
    expect(source).toMatch(/targetIsActiveAdmin && role !== "admin" && activeAdmins\.length <= 1/);
    expect(source).toContain("ADMIN_LAST_ADMIN");
    expect(source).toContain("sameStoredRole(principals.target)");
    expect(source).toContain("ADMIN_CONCURRENT_MODIFICATION");
    expect(source).toMatch(/currentRole === role[\s\S]*audit: null/);
  });

  test("atomically suspends users, revokes live sessions, and rejects stale ban writes", () => {
    const source = adminSource();

    expect(source).toMatch(/banned && targetIsActiveAdmin && activeAdmins\.length <= 1/);
    expect(source).toContain("sameStoredBan(principals.target)");
    expect(source).toMatch(
      /update\(sessions\)[\s\S]*expiresAt: occurredAt[\s\S]*revokedAt: occurredAt/,
    );
    expect(source).toMatch(/eq\(sessions\.userId,\s*principals\.target\.id\)/);
    expect(source).toContain("isNull(sessions.revokedAt)");
    expect(source).toContain("gt(sessions.expiresAt, occurredAt)");
  });

  test("keeps mandatory audit writes in-transaction and logging after commit", () => {
    const source = adminSource();

    expect(countMatches(source, /persistAdminAudit\(transaction, audit\)/)).toBe(3);
    expect(source).toMatch(
      /createAdminUserAtomically[\s\S]*insert\(users\)[\s\S]*insert\(accounts\)[\s\S]*persistAdminAudit\(transaction, audit\)[\s\S]*logCommittedAdminAudit\(committed\.audit\)/,
    );
    expect(source).toMatch(
      /changeAdminRoleAtomically[\s\S]*persistAdminAudit\(transaction, audit\)[\s\S]*if \(committed\.audit\) logCommittedAdminAudit/,
    );
    expect(source).toMatch(
      /setAdminBannedAtomically[\s\S]*persistAdminAudit\(transaction, audit\)[\s\S]*if \(committed\.audit\) logCommittedAdminAudit/,
    );
    expect(countMatches(source, /logger\.info\(/)).toBe(1);
  });

  test("uses Better Auth hashing and ids without its out-of-transaction create endpoint", () => {
    const source = adminSource();

    expect(source).toContain("createBetterAuthAdminIdentityPort(auth, headers)");
    expect(source).toContain("const authContext = await auth.$context");
    expect(source).toContain("authContext.password.hash(input.password)");
    expect(source).toContain('authContext.generateId({ model: "user" })');
    expect(source).toContain('authContext.generateId({ model: "account" })');
    expect(source).toContain("userCreation: {");
    expect(source).toContain("createUserWithAudit(command: admin.CreateAdminUserCommand)");
    expect(source).toContain("const { actor, input, occurredAt } = command");
    expect(source).toContain("lockAdminActor(transaction, actor.id, occurredAt)");
    expect(source).toMatch(
      /return \{[\s\S]*\.\.\.base,[\s\S]*changeRole: changeAdminRoleAtomically/,
    );
    expect(source).toContain("setBanned: setAdminBannedAtomically");
    expect(source).toContain("createAdminServiceForRequest(headers: Headers): admin.AdminService");
    expect(source).not.toContain('ApiContext["user"]');
    expect(source).toContain("actor: admin.AdminActor");
    expect(source).not.toContain("auth.api.setRole");
    expect(source).not.toContain("auth.api.banUser");
    expect(source).not.toContain("auth.api.unbanUser");
    expect(source).not.toContain("auth.api.createUser");
  });
});
