import { describe, it, expect } from "bun:test";
import { databasePackage } from "../../src/templates/database";

describe("database package template", () => {
  it("configures pool max and idleTimeoutMillis", () => {
    const files = databasePackage();
    const index = files.find((f) => f.path === "packages/database/src/index.ts")?.content ?? "";
    expect(index).toContain("max: env.DATABASE_POOL_SIZE ?? 20");
    expect(index).toContain("idleTimeoutMillis: 30000");
  });

  it("enables ssl when DATABASE_SSL is true", () => {
    const files = databasePackage();
    const index = files.find((f) => f.path === "packages/database/src/index.ts")?.content ?? "";
    expect(index).toContain('env.DATABASE_SSL === "true"');
  });
});
