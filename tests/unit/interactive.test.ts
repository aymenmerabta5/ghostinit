import { describe, it, expect } from "bun:test";
import {
  isInteractiveMode,
  parseCreateArgs,
  normalizeBillingSelection,
  normalizeFeaturesSelection,
  validateProjectName,
  PROJECT_NAME_RE,
} from "../../src/lib/interactive";

describe("isInteractiveMode", () => {
  it("returns false when json flag set even with TTY", () => {
    expect(isInteractiveMode({ json: true, yes: false, ci: false, isTTY: true })).toBe(false);
  });

  it("returns false when yes flag set", () => {
    expect(isInteractiveMode({ json: false, yes: true, ci: false, isTTY: true })).toBe(false);
  });

  it("returns false when ci flag set", () => {
    expect(isInteractiveMode({ json: false, yes: false, ci: true, isTTY: true })).toBe(false);
  });

  it("returns false when not TTY", () => {
    expect(isInteractiveMode({ json: false, yes: false, ci: false, isTTY: false })).toBe(false);
    expect(isInteractiveMode({ json: false, yes: false, ci: false, isTTY: undefined })).toBe(false);
  });

  it("returns true only when TTY and no json/yes/ci", () => {
    expect(isInteractiveMode({ json: false, yes: false, ci: false, isTTY: true })).toBe(true);
  });

  it("returns false when all falsey except isTTY false", () => {
    expect(isInteractiveMode({ isTTY: false })).toBe(false);
  });

  it("returns false when empty options", () => {
    expect(isInteractiveMode({})).toBe(false);
  });
});

describe("parseCreateArgs mode", () => {
  it("defaults to monorepo", () => {
    const result = parseCreateArgs({});
    expect(result.mode).toBe("monorepo");
  });

  it("parses single mode", () => {
    const result = parseCreateArgs({ mode: "single" });
    expect(result.mode).toBe("single");
  });

  it("parses monorepo explicit", () => {
    const result = parseCreateArgs({ mode: "monorepo" });
    expect(result.mode).toBe("monorepo");
  });

  it("handles repeat flags array last wins", () => {
    const result = parseCreateArgs({ mode: ["monorepo", "single"] as unknown as string });
    expect(result.mode).toBe("single");
  });

  it("throws for invalid mode", () => {
    expect(() => parseCreateArgs({ mode: "invalid" })).toThrow();
  });
});

describe("parseCreateArgs billing", () => {
  it("parses single billing provider", () => {
    const result = parseCreateArgs({ billing: "stripe" });
    expect(result.billing).toEqual(["stripe"]);
  });

  it("parses both legacy -> stripe+chargily", () => {
    const result = parseCreateArgs({ billing: "both" });
    expect(result.billing.sort()).toEqual(["chargily", "stripe"]);
  });

  it("rejects all and comma-separated global conflicts", () => {
    expect(() => parseCreateArgs({ billing: "all" })).toThrow("at most one global");
    expect(() => parseCreateArgs({ billing: "stripe,polar" })).toThrow("at most one global");
  });

  it("parses none -> empty", () => {
    expect(parseCreateArgs({ billing: "none" }).billing).toEqual([]);
    expect(parseCreateArgs({ billing: "" }).billing).toEqual([]);
    expect(parseCreateArgs({}).billing).toEqual([]);
  });

  it("handles repeat flags combined", () => {
    const result = parseCreateArgs({
      billing: ["stripe", "chargily"] as unknown as string,
    });
    expect(result.billing.sort()).toEqual(["chargily", "stripe"]);
  });

  it("deduplicates and trims case-insensitive", () => {
    const result = parseCreateArgs({ billing: "stripe, stripe , Stripe" });
    expect(result.billing).toEqual(["stripe"]);
  });

  it("handles repeat plus comma", () => {
    const result = parseCreateArgs({
      billing: ["stripe,manual", "chargily"] as unknown as string,
    });
    expect(result.billing.sort()).toEqual(["chargily", "manual", "stripe"]);
  });
});

describe("parseCreateArgs features", () => {
  it("parses comma-separated features", () => {
    const result = parseCreateArgs({ features: "eve,i18n" });
    expect(result.features.sort()).toEqual(["eve", "i18n"]);
  });

  it("parses single feature", () => {
    expect(parseCreateArgs({ features: "eve" }).features).toEqual(["eve"]);
  });

  it("parses none and empty as empty", () => {
    expect(parseCreateArgs({ features: "none" }).features).toEqual([]);
    expect(parseCreateArgs({ features: "" }).features).toEqual([]);
    expect(parseCreateArgs({}).features).toEqual([]);
  });

  it("handles repeat flags combined", () => {
    const result = parseCreateArgs({
      features: ["eve", "i18n"] as unknown as string,
    });
    expect(result.features.sort()).toEqual(["eve", "i18n"]);
  });
});

describe("parseCreateArgs database", () => {
  it("defaults to postgres", () => {
    expect(parseCreateArgs({}).database).toBe("postgres");
  });

  it("parses postgres explicit", () => {
    expect(parseCreateArgs({ database: "postgres" }).database).toBe("postgres");
  });

  it("parses convex", () => {
    expect(parseCreateArgs({ database: "convex" }).database).toBe("convex");
  });

  it("throws for both (single database only)", () => {
    expect(() => parseCreateArgs({ database: "both" })).toThrow();
  });

  it("parses none", () => {
    expect(parseCreateArgs({ database: "none" }).database).toBe("none");
  });

  it("handles repeat last wins", () => {
    const result = parseCreateArgs({ database: ["postgres", "none"] as unknown as string });
    expect(result.database).toBe("none");
  });
});

describe("parseCreateArgs capability switches", () => {
  it("preserves an explicit storage selection", () => {
    expect(parseCreateArgs({ "with-storage": true }).withStorage).toBe(true);
    expect(parseCreateArgs({}).withStorage).toBeUndefined();
  });
});

describe("normalizeBillingSelection (multiselect checkbox result)", () => {
  it("rejects conflicting global choices even with none selected", () => {
    expect(() => normalizeBillingSelection(["stripe", "polar"])).toThrow("at most one global");
    expect(() => normalizeBillingSelection(["stripe", "polar", "none"])).toThrow(
      "at most one global",
    );
    expect(() => normalizeBillingSelection(["none", "all"])).toThrow("at most one global");
    expect(() => parseCreateArgs({ billing: ["stripe", "polar"] })).toThrow("at most one global");
  });

  it("returns [] for empty", () => {
    expect(normalizeBillingSelection([])).toEqual([]);
  });

  it("returns [] when none selected even alongside others (none takes precedence)", () => {
    expect(normalizeBillingSelection(["none"])).toEqual([]);
    expect(normalizeBillingSelection(["stripe", "none"])).toEqual([]);
  });

  it("parses single provider", () => {
    expect(normalizeBillingSelection(["stripe"])).toEqual(["stripe"]);
  });

  it("parses multiple providers as array", () => {
    const result = normalizeBillingSelection(["manual", "polar", "chargily"]);
    expect(result.sort()).toEqual(["chargily", "manual", "polar"]);
  });
});

describe("normalizeFeaturesSelection", () => {
  it("returns [] for empty", () => {
    expect(normalizeFeaturesSelection([])).toEqual([]);
  });

  it("parses eve", () => {
    expect(normalizeFeaturesSelection(["eve"])).toEqual(["eve"]);
  });

  it("parses multiple", () => {
    expect(normalizeFeaturesSelection(["eve", "i18n"]).sort()).toEqual(["eve", "i18n"]);
  });
});

describe("validateProjectName", () => {
  it("accepts valid names matching regex", () => {
    expect(validateProjectName("my-app").valid).toBe(true);
    expect(validateProjectName("my-app-123").valid).toBe(true);
  });

  it("rejects empty", () => {
    const result = validateProjectName("");
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toContain("required");
  });

  it("rejects invalid pattern", () => {
    const result = validateProjectName("MyApp");
    expect(result.valid).toBe(false);
  });

  it("rejects names reserved for generated application workspaces", () => {
    for (const name of ["mobile", "desktop"]) {
      const result = validateProjectName(name);
      expect(result.valid, name).toBe(false);
      if (!result.valid) expect(result.reason).toContain("reserved name");
    }
  });

  it("PROJECT_NAME_RE matches spec regex", () => {
    expect(PROJECT_NAME_RE.source).toBe("^[a-z](?:[a-z0-9]|-[a-z0-9])*$");
    expect(PROJECT_NAME_RE.test("my-app")).toBe(true);
    expect(PROJECT_NAME_RE.test("My-App")).toBe(false);
    expect(PROJECT_NAME_RE.test("1bad")).toBe(false);
  });
});
