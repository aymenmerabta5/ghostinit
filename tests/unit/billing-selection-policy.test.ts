import { describe, expect, test } from "bun:test";
import Ajv2020 from "ajv/dist/2020.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runtime } from "../../packages/versions/src/index.js";
import { projectConfigSchema, projectDesiredConfigSchema } from "../../src/lib/config.js";
import { desiredToProjectConfig, projectConfigToDesired } from "../../src/lib/project-config.js";
import { resolveProjectConfig } from "../../src/domain/project/resolve.js";
import { BILLING_PROVIDERS, type BillingProvider } from "../../src/domain/project/choices.js";
import {
  PROJECT_CONFIG_SCHEMA_URI,
  type DesiredProjectConfig,
} from "../../src/domain/project/config.js";
import {
  SUPPORT_CATALOG,
  getEffectiveCapabilityClientBinding,
} from "../../src/domain/capabilities/support-catalog.js";

function desired(providers: readonly BillingProvider[]): DesiredProjectConfig {
  return {
    $schema: PROJECT_CONFIG_SCHEMA_URI,
    schemaVersion: 2,
    name: "billing-selection",
    mode: "single",
    packageManager: { name: "bun", version: runtime.bun },
    apps: [{ id: "web", target: "nextjs", deploy: "none" }],
    backend: { hostApp: "web", database: "postgres", executionRuntime: "bun" },
    capabilities: { billing: { providers } },
  };
}

describe("billing selection public contract", () => {
  test("legacy manual configuration round trips with inferred receipt dependencies", () => {
    const legacy = projectConfigSchema.parse({
      name: "legacy-manual",
      preset: "custom",
      billing: ["manual"],
    });
    const config = projectConfigToDesired(legacy);
    expect(config.capabilities.storage).toBe(true);
    expect(config.capabilities.auth).toBe(true);
    expect(config.capabilities.transport).toBe(true);
    expect(resolveProjectConfig(config).ok).toBe(true);
    const projected = desiredToProjectConfig(desired(["manual"]));
    expect(projected.storage).toBe(true);
    expect(projected.auth).toBe(true);
    expect(projected.api).toBe(true);
    expect(() => projectConfigToDesired({ ...legacy, storage: false })).toThrow(
      "manual billing requires storage",
    );
    expect(() =>
      desiredToProjectConfig({
        ...config,
        capabilities: { ...config.capabilities, storage: false },
      }),
    ).toThrow("manual billing requires storage");
  });
  test("desired and packaged schemas enforce the same global exclusivity for every subset", () => {
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    const validate = ajv.compile(
      JSON.parse(
        readFileSync(resolve(import.meta.dir, "../../schemas/project-config.schema.json"), "utf8"),
      ),
    );
    for (let mask = 1; mask < 1 << BILLING_PROVIDERS.length; mask++) {
      const providers = BILLING_PROVIDERS.filter((_, index) => (mask & (1 << index)) !== 0);
      const expected =
        providers.filter((provider) => provider !== "chargily" && provider !== "manual").length <=
        1;
      const config = desired(providers);
      expect(projectDesiredConfigSchema.safeParse(config).success, providers.join(",")).toBe(
        expected,
      );
      expect(validate(config), providers.join(",")).toBe(expected);
      expect(resolveProjectConfig(config).ok, providers.join(",")).toBe(expected);
    }
  });

  test("manual billing closes storage and applies its deployment and explicit-disable limits", () => {
    const config = desired(["manual"]);
    const result = resolveProjectConfig(config);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.config.capabilities.storage).toBe(true);
    const disabled = { ...config, capabilities: { ...config.capabilities, storage: false } };
    expect(projectDesiredConfigSchema.safeParse(disabled).success).toBe(false);
    expect(resolveProjectConfig(disabled).ok).toBe(false);
    expect(
      resolveProjectConfig({ ...config, apps: [{ id: "web", target: "nextjs", deploy: "vercel" }] })
        .ok,
    ).toBe(false);
    const online = resolveProjectConfig(desired(["stripe"]));
    expect(online.ok).toBe(true);
    if (online.ok) expect(online.config.capabilities.storage).toBe(false);
  });

  test("packaged resolved schema rejects global conflicts and disabled manual receipt storage", () => {
    const result = resolveProjectConfig(desired(["manual", "chargily", "stripe"]));
    if (!result.ok) throw new Error("valid manual selection failed resolution");
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    const validate = ajv.compile(
      JSON.parse(
        readFileSync(
          resolve(import.meta.dir, "../../schemas/resolved-project-config.schema.json"),
          "utf8",
        ),
      ),
    );
    expect(validate(result.config), JSON.stringify(validate.errors)).toBe(true);
    expect(
      validate({
        ...result.config,
        capabilities: {
          ...result.config.capabilities,
          billing: { enabled: true, providers: ["manual", "chargily", "stripe", "polar"] },
        },
      }),
    ).toBe(false);
    expect(
      validate({
        ...result.config,
        capabilities: { ...result.config.capabilities, storage: false },
      }),
    ).toBe(false);
  });

  test("catalog advertises manual workflow operations without online provider operations", () => {
    expect(SUPPORT_CATALOG.billingProviderSelection).toEqual({
      globalProviders: ["stripe", "paddle", "polar"],
      maximumGlobalProviders: 1,
      independentProviders: ["chargily", "manual"],
    });
    for (const target of ["nextjs", "tanstack-start", "expo", "electron"] as const) {
      const binding = getEffectiveCapabilityClientBinding({
        capability: "billing",
        target,
        database: "postgres",
        billingProviders: ["manual"],
      });
      expect(binding.requiredOperationIds).toEqual([
        "billing.balance.v1",
        "billing.manual.list.v1",
        "billing.manual.receipt.v1",
        "billing.manual.review.v1",
        "billing.manual.submit.v1",
      ]);
    }
  });
});
