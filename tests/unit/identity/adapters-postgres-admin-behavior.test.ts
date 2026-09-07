import { describe, expect, test } from "bun:test";
import { createAtomicAdminHarness } from "./adapter-harness.js";

async function settled<T>(work: Promise<T>) {
  try {
    return { status: "fulfilled" as const, value: await work };
  } catch (error) {
    return { status: "rejected" as const, error };
  }
}

describe("Postgres atomic admin mutation behavior", () => {
  test("serializes a two-admin cross-demotion race", async () => {
    const harness = createAtomicAdminHarness();
    const results = await Promise.all([
      settled(harness.changeRole("admin-a", "admin-b", "user")),
      settled(harness.changeRole("admin-b", "admin-a", "user")),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(harness.state().users.filter((user) => user.role === "admin")).toHaveLength(1);
    expect(harness.state().audits).toHaveLength(1);
    expect(harness.state().audits[0]?.action).toBe("admin.user.role_changed");
  });

  test("rolls the role update back when its mandatory audit write fails", async () => {
    const harness = createAtomicAdminHarness();
    const before = structuredClone(harness.state());
    harness.setAuditFailure(true);

    const result = await settled(harness.changeRole("admin-a", "admin-b", "user"));

    expect(result.status).toBe("rejected");
    expect(
      result.status === "rejected" ? (result.error as { code?: string }).code : undefined,
    ).toBe("ADMIN_AUDIT_FAILED");
    expect(harness.state()).toEqual(before);
  });
});
