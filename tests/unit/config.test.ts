import { describe, it, expect } from "bun:test";
import { projectConfigSchema, stateSchema } from "../../src/lib/config";
import { availableModes, billingProviders, availableDatabases } from "../../src/lib/addons";

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

  it("defaults to monorepo + [] billing + [] features + postgres", () => {
    const parsed = projectConfigSchema.parse({ name: "my-app" });
    expect(parsed.mode).toBe("monorepo");
    expect(parsed.billing).toEqual([]);
    expect(parsed.features).toEqual([]);
    expect(parsed.database).toBe("postgres");
    expect(parsed.runtime).toBe("bun");
    expect(parsed.version).toBe("0.1.0");
  });

  it("accepts valid mode values", () => {
    for (const mode of availableModes) {
      const parsed = projectConfigSchema.parse({ name: "my-app", mode });
      expect(parsed.mode).toBe(mode);
    }
  });

  it("rejects invalid mode", () => {
    const result = projectConfigSchema.safeParse({
      name: "my-app",
      mode: "invalid",
    });
    expect(result.success).toBe(false);
  });

  it("accepts single billing provider", () => {
    const parsed = projectConfigSchema.parse({ name: "my-app", billing: ["stripe"] });
    expect(parsed.billing).toEqual(["stripe"]);
  });

  it("accepts multiple billing providers", () => {
    const parsed = projectConfigSchema.parse({
      name: "my-app",
      billing: ["stripe", "polar"],
    });
    expect(parsed.billing).toEqual(["stripe", "polar"]);
  });

  it("accepts all billing providers", () => {
    const parsed = projectConfigSchema.parse({
      name: "my-app",
      billing: [...billingProviders],
    });
    expect(parsed.billing.sort()).toEqual([...billingProviders].sort());
  });

  it("rejects invalid billing provider", () => {
    const result = projectConfigSchema.safeParse({
      name: "my-app",
      billing: ["invalid-provider"],
    });
    expect(result.success).toBe(false);
  });

  it("accepts valid features", () => {
    const parsed = projectConfigSchema.parse({ name: "my-app", features: ["eve"] });
    expect(parsed.features).toEqual(["eve"]);
    const parsed2 = projectConfigSchema.parse({ name: "my-app", features: ["eve", "i18n"] });
    expect(parsed2.features.sort() as string[]).toEqual(["eve", "i18n"].sort() as string[]);
  });

  it("rejects invalid feature", () => {
    const result = projectConfigSchema.safeParse({
      name: "my-app",
      features: ["billing"],
    });
    expect(result.success).toBe(false);
  });

  it("accepts valid database values", () => {
    for (const db of availableDatabases) {
      const parsed = projectConfigSchema.parse({ name: "my-app", database: db });
      expect(parsed.database).toBe(db);
    }
  });

  it("rejects invalid database", () => {
    const result = projectConfigSchema.safeParse({
      name: "my-app",
      database: "mysql",
    });
    expect(result.success).toBe(false);
  });

  it("accepts full flexible config", () => {
    const parsed = projectConfigSchema.parse({
      name: "my-app",
      mode: "single",
      billing: ["stripe", "chargily"],
      features: ["eve", "i18n"],
      database: "postgres",
    });
    expect(parsed.mode).toBe("single");
    expect(parsed.billing).toEqual(["stripe", "chargily"]);
    expect(parsed.features).toEqual(["eve", "i18n"]);
    expect(parsed.database).toBe("postgres");
  });

  it("preserves normalized storage, notification, remote flags, and jobs selections", () => {
    const parsed = projectConfigSchema.parse({
      name: "my-app",
      storage: true,
      notifications: true,
      featureFlags: "posthog",
      jobs: true,
    });
    expect(parsed.storage).toBe(true);
    expect(parsed.notifications).toBe(true);
    expect(parsed.featureFlags).toBe("posthog");
    expect(parsed.jobs).toBe(true);
    expect(projectConfigSchema.safeParse({ name: "my-app", featureFlags: "static" }).success).toBe(
      false,
    );
  });

  it("preserves name regex validation with new fields", () => {
    const result = projectConfigSchema.safeParse({
      name: "MyApp",
      mode: "monorepo",
      billing: [],
    });
    expect(result.success).toBe(false);
  });
});

describe("stateSchema backward compat", () => {
  it("parses old state without new fields using defaults", () => {
    const oldState = {
      version: 1,
      project: {
        name: "my-app",
        runtime: "bun",
        version: "0.1.0",
      },
      checksums: {},
      generatedBy: "0.1.0",
      generatedAt: new Date().toISOString(),
    };
    const result = stateSchema.safeParse(oldState);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.project.mode).toBe("monorepo");
      expect(result.data.project.billing).toEqual([]);
      expect(result.data.project.features).toEqual([]);
      expect(result.data.project.database).toBe("postgres");
    }
  });

  it("parses new state with flexible fields", () => {
    const newState = {
      version: 1,
      project: {
        name: "my-app",
        runtime: "bun",
        version: "0.1.0",
        mode: "single",
        billing: ["stripe", "polar"],
        features: ["eve"],
        database: "postgres",
      },
      checksums: {},
      generatedBy: "0.1.0",
      generatedAt: new Date().toISOString(),
    };
    const result = stateSchema.safeParse(newState);
    expect(result.success).toBe(true);
  });
});
