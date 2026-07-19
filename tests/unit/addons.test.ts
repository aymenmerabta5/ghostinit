import { describe, it, expect } from "bun:test";
import {
  parseBillingInput,
  parseFeaturesInput,
  parseDatabaseInput,
  isValidAddonCombo,
  buildAddonInstallerMap,
  billingProviders,
  availableModes,
  availableFeatures,
  availableDatabases,
  defaultAddons,
} from "../../src/lib/addons";

describe("addon registry - billing parsing", () => {
  it("parses single billing provider", () => {
    expect(parseBillingInput("stripe")).toEqual(["stripe"]);
  });

  it("parses both legacy -> stripe+chargily", () => {
    expect(parseBillingInput("both").sort()).toEqual(["chargily", "stripe"]);
  });

  it("parses all -> all 4 providers", () => {
    expect(parseBillingInput("all").sort()).toEqual(["chargily", "paddle", "polar", "stripe"]);
  });

  it("parses comma-separated", () => {
    expect(parseBillingInput("stripe,polar").sort()).toEqual(["polar", "stripe"]);
  });

  it("parses none -> empty", () => {
    expect(parseBillingInput("none")).toEqual([]);
    expect(parseBillingInput("")).toEqual([]);
  });

  it("deduplicates and trims lowercases", () => {
    expect(parseBillingInput("stripe, stripe , Stripe").sort()).toEqual(["stripe"]);
  });

  it("handles comma-separated with spaces and mixed case", () => {
    expect(parseBillingInput(" Stripe ,  PADDLE , polar ").sort()).toEqual([
      "paddle",
      "polar",
      "stripe",
    ]);
  });

  it("handles both inside comma-separated list", () => {
    const result = parseBillingInput("polar,both");
    expect(result.sort()).toEqual(["chargily", "polar", "stripe"]);
  });

  it("returns [] for undefined and empty whitespace", () => {
    expect(parseBillingInput(undefined)).toEqual([]);
    expect(parseBillingInput("   ")).toEqual([]);
  });

  it("ignores unknown providers", () => {
    expect(parseBillingInput("stripe,unknown,chargily").sort()).toEqual(["chargily", "stripe"]);
  });
});

describe("addon registry - constants", () => {
  it("has expected billing providers", () => {
    expect(billingProviders).toContain("stripe");
    expect(billingProviders).toContain("chargily");
    expect(billingProviders).toContain("paddle");
    expect(billingProviders).toContain("polar");
    expect(billingProviders.length).toBe(4);
  });

  it("has expected modes", () => {
    expect(availableModes).toContain("monorepo");
    expect(availableModes).toContain("single");
  });

  it("has expected default addons", () => {
    expect(defaultAddons).toContain("auth");
    expect(defaultAddons).toContain("ui");
    expect(defaultAddons).toContain("database");
    expect(defaultAddons).toContain("services");
    expect(defaultAddons).toContain("email");
    expect(defaultAddons).toContain("analytics");
    // full list per spec (12 items)
    expect([...defaultAddons].sort() as string[]).toEqual(
      [
        "analytics",
        "api",
        "auth",
        "database",
        "email",
        "format",
        "lint",
        "services",
        "t3env",
        "tanstack",
        "ui",
        "zod",
      ].sort() as string[],
    );
  });

  it("has expected features", () => {
    expect(availableFeatures).toContain("eve");
    expect(availableFeatures).toContain("i18n");
  });

  it("has expected databases", () => {
    expect(availableDatabases).toContain("postgres");
    expect(availableDatabases).toContain("convex");
    expect(availableDatabases).toContain("none");
    expect(availableDatabases).not.toContain("both");
    expect([...availableDatabases].sort() as string[]).toEqual(
      ["convex", "none", "postgres"].sort() as string[],
    );
  });
});

describe("addon registry - features parsing", () => {
  it("parses single feature", () => {
    expect(parseFeaturesInput("eve")).toEqual(["eve"]);
  });

  it("parses comma-separated features dedup trim lower", () => {
    expect(parseFeaturesInput("eve,i18n").sort()).toEqual(["eve", "i18n"]);
    expect(parseFeaturesInput("eve, eve , EVE").sort()).toEqual(["eve"]);
  });

  it("parses none/empty -> []", () => {
    expect(parseFeaturesInput("none")).toEqual([]);
    expect(parseFeaturesInput("")).toEqual([]);
    expect(parseFeaturesInput(undefined)).toEqual([]);
  });
});

describe("addon registry - database parsing", () => {
  it("defaults to postgres", () => {
    expect(parseDatabaseInput(undefined)).toBe("postgres");
    expect(parseDatabaseInput("")).toBe("postgres");
  });

  it("parses valid database values", () => {
    expect(parseDatabaseInput("postgres")).toBe("postgres");
    expect(parseDatabaseInput("convex")).toBe("convex");
    expect(parseDatabaseInput("none")).toBe("none");
    // case-insensitive
    expect(parseDatabaseInput("Postgres")).toBe("postgres");
  });

  it("throws for invalid database", () => {
    expect(() => parseDatabaseInput("invalid")).toThrow();
    expect(() => parseDatabaseInput("both")).toThrow();
  });
});

describe("addon registry - isValidAddonCombo", () => {
  it("invalid when billing present but database none", () => {
    const result = isValidAddonCombo({ billing: ["stripe"], database: "none", mode: "monorepo" });
    expect(result.valid).toBe(false);
    expect(result.message).toContain("Billing requires");
  });

  it("valid when billing none even with database none", () => {
    const result = isValidAddonCombo({ billing: [], database: "none", mode: "monorepo" });
    expect(result.valid).toBe(true);
  });

  it("valid when billing present and database postgres", () => {
    const result = isValidAddonCombo({ billing: ["polar"], database: "postgres", mode: "single" });
    expect(result.valid).toBe(true);
  });
});

describe("addon registry - buildAddonInstallerMap", () => {
  it("marks default addons as inUse", () => {
    const map = buildAddonInstallerMap({
      billing: [],
      features: [],
      database: "postgres",
      mode: "monorepo",
    });
    for (const addon of defaultAddons) {
      expect(map[addon]?.inUse).toBe(true);
    }
  });

  it("marks selected billing providers as inUse", () => {
    const map = buildAddonInstallerMap({
      billing: ["stripe", "polar"],
      features: [],
      database: "postgres",
      mode: "monorepo",
    });
    expect(map["stripe"]?.inUse).toBe(true);
    expect(map["polar"]?.inUse).toBe(true);
    expect(map["chargily"]?.inUse).toBe(false);
    expect(map["paddle"]?.inUse).toBe(false);
  });

  it("marks selected features as inUse", () => {
    const map = buildAddonInstallerMap({
      billing: [],
      features: ["eve"],
      database: "postgres",
      mode: "single",
    });
    expect(map["eve"]?.inUse).toBe(true);
    expect(map["i18n"]?.inUse).toBe(false);
  });

  it("marks selected mode as inUse", () => {
    const mono = buildAddonInstallerMap({
      billing: [],
      features: [],
      database: "postgres",
      mode: "monorepo",
    });
    expect(mono["monorepo"]?.inUse).toBe(true);
    expect(mono["single"]?.inUse).toBe(false);

    const single = buildAddonInstallerMap({
      billing: [],
      features: [],
      database: "postgres",
      mode: "single",
    });
    expect(single["single"]?.inUse).toBe(true);
    expect(single["monorepo"]?.inUse).toBe(false);
  });

  it("marks database selection as inUse", () => {
    const map = buildAddonInstallerMap({
      billing: [],
      features: [],
      database: "convex",
      mode: "monorepo",
    });
    expect(map["convex"]?.inUse).toBe(true);
    expect(map["postgres"]?.inUse).toBe(false);
  });

  it("handles billing both legacy via parseBillingInput compatibility", () => {
    const billing = parseBillingInput("both");
    const map = buildAddonInstallerMap({
      billing,
      features: [],
      database: "postgres",
      mode: "monorepo",
    });
    expect(map["stripe"]?.inUse).toBe(true);
    expect(map["chargily"]?.inUse).toBe(true);
  });
});
