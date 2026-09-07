import { describe, it, expect } from "bun:test";
import {
  parseAppsInput,
  parseBillingInput,
  parseFeaturesInput,
  parseDatabaseInput,
  parseFeatureFlagsInput,
  isValidAddonCombo,
  buildAddonInstallerMap,
  billingProviders,
  availableModes,
  availableFeatures,
  availableDatabases,
  defaultAddons,
  optionalAddons,
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

describe("remote feature flag parsing", () => {
  it("accepts posthog and explicit none", () => {
    expect(parseFeatureFlagsInput("PostHog")).toBe("posthog");
    expect(parseFeatureFlagsInput("none")).toBe("none");
    expect(parseFeatureFlagsInput()).toBe("none");
  });

  it("rejects unknown or static pseudo-providers", () => {
    expect(() => parseFeatureFlagsInput("launchdarkly")).toThrow();
    expect(() => parseFeatureFlagsInput("static")).toThrow();
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

  it("exposes storage as an explicit optional addon", () => {
    expect(optionalAddons).toContain("storage");
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

  it("requires auth, typed API, persistence, and web for storage", () => {
    const base = {
      billing: [],
      database: "postgres" as const,
      mode: "monorepo" as const,
      apps: ["web" as const],
      preset: "custom" as const,
      hasAuth: true,
      hasApi: true,
      hasStorage: true,
    };

    expect(isValidAddonCombo(base).valid).toBe(true);
    expect(isValidAddonCombo({ ...base, database: "none" }).valid).toBe(false);
    expect(isValidAddonCombo({ ...base, hasAuth: false }).message).toContain("auth");
    expect(isValidAddonCombo({ ...base, hasApi: false }).message).toContain("API transport");
    expect(isValidAddonCombo({ ...base, apps: ["mobile"] }).message).toContain("web app");
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

  it("marks Cloudflare as the selected deployment adapter", () => {
    const map = buildAddonInstallerMap({
      billing: [],
      features: [],
      database: "convex",
      mode: "monorepo",
      deploy: "cloudflare",
    });
    expect(map.cloudflare?.inUse).toBe(true);
    expect(map.vercel?.inUse).toBe(false);
    expect(map.convex?.inUse).toBe(true);
    expect(map.none?.inUse).toBe(false);
  });

  it("preserves database=none when another deploy target is selected", () => {
    const map = buildAddonInstallerMap({
      billing: [],
      features: [],
      database: "none",
      mode: "single",
      cache: "redis",
      deploy: "cloudflare",
    });
    expect(map.none?.inUse).toBe(true);
    expect(map.cloudflare?.inUse).toBe(true);
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

  it("marks explicit storage and messaging-implied storage as inUse", () => {
    const explicit = buildAddonInstallerMap({
      billing: [],
      features: [],
      database: "postgres",
      mode: "monorepo",
      storage: true,
    });
    const implied = buildAddonInstallerMap({
      billing: [],
      features: [],
      database: "postgres",
      mode: "monorepo",
      messaging: true,
    });
    expect(explicit["storage"]?.inUse).toBe(true);
    expect(implied["storage"]?.inUse).toBe(true);
  });
});

describe("parseAppsInput — no silent fallback (AGENTS.md: only billing/features allow partial unknown)", () => {
  it("accepts the known app names", () => {
    expect(parseAppsInput("web")).toEqual(["web"]);
    expect(parseAppsInput("web,mobile").sort()).toEqual(["mobile", "web"]);
    expect(parseAppsInput("desktop").sort()).toEqual(["desktop"]);
    expect(parseAppsInput("all").sort()).toEqual(["desktop", "mobile", "web"]);
    expect(parseAppsInput("both").sort()).toEqual(["mobile", "web"]);
    expect(parseAppsInput("web,desktop").sort()).toEqual(["desktop", "web"]);
  });

  it("throws on a fully unknown value", () => {
    expect(() => parseAppsInput("bogus")).toThrow(/Invalid --apps value/);
  });

  it("throws when an unknown token rides along with a valid one", () => {
    // Regression: this used to drop the unknown token silently, so
    // `create --yes --apps web,totally-not-real` exited 0 and quietly built
    // a web-only project instead of failing.
    expect(() => parseAppsInput("web,totally-not-real")).toThrow(/totally-not-real/);
    expect(() => parseAppsInput("mobile web nope")).toThrow(/Invalid --apps value/);
  });

  it("still honours none and empty input", () => {
    expect(parseAppsInput("none")).toEqual([]);
    expect(parseAppsInput("")).toEqual(["web"]);
    expect(parseAppsInput()).toEqual(["web"]);
  });
});
