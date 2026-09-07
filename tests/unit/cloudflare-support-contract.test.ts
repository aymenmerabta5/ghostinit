import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import {
  CAPABILITY_IDS,
  SUPPORT_CATALOG,
  isCapabilityDeployBindingSupported,
  isDatabaseDeployBindingSupported,
  isDeployBindingSupported,
} from "../../src/domain/capabilities/index.js";
import { resolveCreateConfig } from "../../src/commands/create/resolution.js";
import { availableDeployTargets, parseDeployInput } from "../../src/lib/addons.js";

type CreateInput = Parameters<typeof resolveCreateConfig>[0];

const root = resolve(import.meta.dir, "../..");

const BASE_INPUT = {
  name: "cloudflare-contract",
  runtime: "bun",
  mode: "single",
  framework: "nextjs",
  billing: [],
  features: [],
  database: "none",
  databaseWasExplicit: true,
  apps: ["web"],
  preset: "custom",
  cache: "none",
  deploy: "cloudflare",
  withAuth: false,
  withApi: false,
  withEmail: false,
  withAnalytics: false,
  withEve: false,
  withI18n: false,
  withPdf: false,
  withMessaging: false,
  withStorage: false,
  withNotifications: false,
  featureFlags: "none",
  withJobs: false,
} satisfies CreateInput;

function resolveCloudflare(overrides: Partial<CreateInput> = {}) {
  return resolveCreateConfig({ ...BASE_INPUT, ...overrides });
}

describe("Cloudflare Workers support contract", () => {
  test("publishes Cloudflare as a schema-backed deploy axis", () => {
    expect(availableDeployTargets).toEqual(["vercel", "fly", "docker", "cloudflare", "none"]);
    expect(parseDeployInput(" CLOUDFLARE ")).toBe("cloudflare");
    expect(SUPPORT_CATALOG).toMatchObject({
      schemaVersion: 2,
      catalogVersion: 2,
      axes: { deployTargets: availableDeployTargets },
    });

    for (const target of ["nextjs", "tanstack-start"] as const) {
      for (const mode of ["monorepo", "single"] as const) {
        for (const executionRuntime of ["bun", "node"] as const) {
          expect(
            isDeployBindingSupported({
              target,
              mode,
              executionRuntime,
              deployTarget: "cloudflare",
            }),
            `${mode}/${target}/${executionRuntime}`,
          ).toBe(true);
        }
      }
    }
    expect(
      isDatabaseDeployBindingSupported({ database: "convex", deployTarget: "cloudflare" }),
    ).toBe(true);
    expect(isDatabaseDeployBindingSupported({ database: "none", deployTarget: "cloudflare" })).toBe(
      true,
    );
    expect(
      isDatabaseDeployBindingSupported({ database: "postgres", deployTarget: "cloudflare" }),
    ).toBe(false);
  });

  test("evaluates every Cloudflare capability/database tuple with a closed policy", () => {
    for (const capability of CAPABILITY_IDS) {
      for (const database of SUPPORT_CATALOG.axes.databases) {
        const binding = SUPPORT_CATALOG.capabilityDeployBindings.find(
          (candidate) => candidate.capability === capability && candidate.database === database,
        );
        const explicitlySupported =
          binding?.deployTargets.some((target) => target === "cloudflare") ?? false;

        expect(
          isCapabilityDeployBindingSupported({
            capability,
            database,
            deployTarget: "cloudflare",
          }),
          `${capability}/${database}`,
        ).toBe(explicitlySupported);
      }
    }

    expect(
      isCapabilityDeployBindingSupported({
        capability: "auth",
        database: "none",
        deployTarget: "cloudflare",
      }),
    ).toBe(false);
  });

  test("accepts Convex and database-free Workers projects through both JSON schemas", () => {
    const desiredSchema = JSON.parse(
      readFileSync(resolve(root, "schemas/project-config.schema.json"), "utf8"),
    );
    const resolvedSchema = JSON.parse(
      readFileSync(resolve(root, "schemas/resolved-project-config.schema.json"), "utf8"),
    );
    const validateDesired = new Ajv2020({ allErrors: true, strict: true }).compile(desiredSchema);
    const validateResolved = new Ajv2020({ allErrors: true, strict: true }).compile(resolvedSchema);

    for (const mode of ["monorepo", "single"] as const) {
      for (const framework of ["nextjs", "tanstack-start"] as const) {
        for (const database of ["convex", "none"] as const) {
          const result = resolveCloudflare({ mode, framework, database });
          expect(result.ok, `${mode}/${framework}/${database}`).toBe(true);
          if (!result.ok) continue;
          expect(result.resolvedConfig.catalogVersion).toBe(2);
          expect(result.resolvedConfig.apps).toEqual([
            { id: "web", target: framework, deploy: "cloudflare" },
          ]);
          expect(
            validateDesired(JSON.parse(JSON.stringify(result.desiredConfig))),
            JSON.stringify(validateDesired.errors),
          ).toBe(true);
          expect(
            validateResolved(JSON.parse(JSON.stringify(result.resolvedConfig))),
            JSON.stringify(validateResolved.errors),
          ).toBe(true);
        }
      }
    }
  });

  test("rejects PostgreSQL, Eve, and PDF at the typed resolver boundary", () => {
    const rejected = [
      {
        label: "postgres",
        input: { database: "postgres" } satisfies Partial<CreateInput>,
        reason: "database-deploy-binding-unsupported",
        message: "request-scoped Hyperdrive adapter",
      },
      {
        label: "eve",
        input: { database: "convex", withEve: true } satisfies Partial<CreateInput>,
        reason: "capability-deploy-binding-unsupported",
        message: "persistent Node.js sidecar",
      },
      {
        label: "pdf",
        input: { database: "convex", withPdf: true } satisfies Partial<CreateInput>,
        reason: "capability-deploy-binding-unsupported",
        message: "process-local",
      },
    ] as const;

    for (const framework of ["nextjs", "tanstack-start"] as const) {
      for (const testCase of rejected) {
        const result = resolveCloudflare({ framework, ...testCase.input });
        expect(result.ok, `${framework}/${testCase.label}`).toBe(false);
        if (result.ok) continue;
        expect(result.reason).toBe(testCase.reason);
        expect(result.message).toContain(testCase.message);
        expect("resolvedConfig" in result).toBe(false);
      }
    }
  });
});
