import { describe, it, expect } from "bun:test";
import { packageFiles } from "../../src/templates/packages";

describe("packages template", () => {
  it("includes new database env vars in config", () => {
    const files = packageFiles();
    const env = files.find((f) => f.path === "packages/config/src/env.ts")?.content ?? "";
    expect(env).toContain("POSTGRES_PASSWORD");
    expect(env).toContain("DATABASE_SSL");
    expect(env).toContain("DATABASE_POOL_SIZE");
  });
});
