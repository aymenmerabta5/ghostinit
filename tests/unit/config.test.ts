import { describe, it, expect } from "bun:test";
import { projectConfigSchema } from "../../src/lib/config";

describe("projectConfigSchema", () => {
  it("accepts a valid Bun project config", () => {
    const result = projectConfigSchema.safeParse({
      name: "my-app",
      runtime: "bun",
      version: "0.1.0",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid runtime", () => {
    const result = projectConfigSchema.safeParse({
      name: "my-app",
      runtime: "deno",
      version: "0.1.0",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty name", () => {
    const result = projectConfigSchema.safeParse({
      name: "",
      runtime: "bun",
    });
    expect(result.success).toBe(false);
  });
});
