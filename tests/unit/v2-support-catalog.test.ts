import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import { runtime } from "../../packages/versions/src/index.js";
import {
  CAPABILITY_IDS,
  SUPPORT_CATALOG,
  hasCompleteCapabilityCatalog,
} from "../../src/domain/capabilities/index.js";

const root = resolve(import.meta.dir, "../..");

describe("V2 closed support catalog", () => {
  test("defines every audited capability exactly once", () => {
    expect(CAPABILITY_IDS).toEqual([
      "transport",
      "auth",
      "billing",
      "messaging",
      "email",
      "storage",
      "cache",
      "analytics",
      "i18n",
      "pdf",
      "eve",
      "notifications",
      "featureFlags",
      "jobs",
    ]);
    expect(SUPPORT_CATALOG.capabilities.map(({ id }) => id)).toEqual(CAPABILITY_IDS);
    expect(new Set(SUPPORT_CATALOG.capabilities.map(({ id }) => id)).size).toBe(
      CAPABILITY_IDS.length,
    );
    expect(hasCompleteCapabilityCatalog()).toBe(true);
  });

  test("keeps database, cache, and deploy as independent named axes", () => {
    expect(SUPPORT_CATALOG.axes.databases).toEqual(["postgres", "convex", "none"]);
    expect(SUPPORT_CATALOG.axes.cacheProviders).toEqual(["redis", "none"]);
    expect(SUPPORT_CATALOG.axes.deployTargets).toEqual(["vercel", "fly", "docker", "none"]);
    expect(SUPPORT_CATALOG.axes.featureFlagProviders).toEqual(["posthog"]);
    expect(SUPPORT_CATALOG.axes.executionRuntimes).toEqual(["bun", "node"]);
    expect(SUPPORT_CATALOG.axes.packageManagers).toEqual([{ name: "bun", version: runtime.bun }]);
    expect(Object.keys(SUPPORT_CATALOG.axes)).toContain("databases");
    expect(Object.keys(SUPPORT_CATALOG.axes)).toContain("cacheProviders");
    expect(Object.keys(SUPPORT_CATALOG.axes)).toContain("deployTargets");
    expect(SUPPORT_CATALOG.capabilityDeployBindings).toEqual([
      {
        capability: "messaging",
        database: "postgres",
        deployTargets: ["none", "fly", "docker"],
      },
      {
        capability: "jobs",
        database: "postgres",
        deployTargets: ["none", "fly", "docker"],
      },
      {
        capability: "storage",
        database: "postgres",
        deployTargets: ["none", "fly", "docker"],
      },
      {
        capability: "pdf",
        database: "postgres",
        deployTargets: ["none", "fly", "docker"],
      },
      {
        capability: "pdf",
        database: "convex",
        deployTargets: ["none", "fly", "docker"],
      },
    ]);
  });

  test("retains Node runtime with explicit release evidence", () => {
    expect(SUPPORT_CATALOG.compatibilityEvidence).toEqual([
      {
        id: "runtime.node-retained.v1",
        subject: "execution-runtime:node",
        status: "retained-compatibility",
        note: "Node runtime is retained from V1 and remains gated by the generated release matrix.",
        requiredEvidence: ["runtime.node.generated-matrix.v1", "runtime.node.packed-cli.v1"],
      },
    ]);
  });

  test("uses only the four explicit requirement categories", () => {
    const kinds = new Set(
      SUPPORT_CATALOG.capabilities.flatMap(({ requirements }) =>
        requirements.map(({ kind }) => kind),
      ),
    );
    expect([...kinds].sort()).toEqual(["backend", "capability", "persistence", "target-binding"]);
  });

  test("encodes the new capability closure and conditional jobs transport rule", () => {
    const definitions = new Map(
      SUPPORT_CATALOG.capabilities.map((definition) => [definition.id, definition]),
    );
    expect(definitions.get("messaging")?.requirements).toEqual([
      { kind: "capability", capability: "auth" },
      { kind: "capability", capability: "transport" },
      { kind: "capability", capability: "storage" },
      { kind: "backend" },
      { kind: "persistence" },
      { kind: "target-binding", subject: "backend-host", targets: ["nextjs", "tanstack-start"] },
    ]);
    expect(definitions.get("notifications")?.requirements).toEqual([
      { kind: "capability", capability: "auth" },
      { kind: "capability", capability: "transport" },
      { kind: "backend" },
      { kind: "persistence" },
      { kind: "target-binding", subject: "backend-host", targets: ["nextjs", "tanstack-start"] },
    ]);
    expect(definitions.get("storage")?.requirements).toEqual([
      { kind: "capability", capability: "auth" },
      { kind: "capability", capability: "transport" },
      { kind: "backend" },
      { kind: "persistence" },
      { kind: "target-binding", subject: "backend-host", targets: ["nextjs", "tanstack-start"] },
    ]);
    expect(definitions.get("featureFlags")?.requirements).toEqual([
      { kind: "capability", capability: "transport" },
      { kind: "backend" },
      { kind: "target-binding", subject: "backend-host", targets: ["nextjs", "tanstack-start"] },
    ]);
    expect(definitions.get("jobs")?.requirements).toEqual([
      { kind: "capability", capability: "auth", when: "jobs-user-facing-api" },
      { kind: "capability", capability: "transport", when: "jobs-user-facing-api" },
      { kind: "backend" },
      { kind: "persistence" },
      { kind: "target-binding", subject: "backend-host", targets: ["nextjs", "tanstack-start"] },
    ]);
  });

  test("assigns stable versioned acceptance operations to every capability", () => {
    const allOperationIds = SUPPORT_CATALOG.capabilities.flatMap(
      ({ acceptanceOperationIds }) => acceptanceOperationIds,
    );
    for (const definition of SUPPORT_CATALOG.capabilities) {
      expect(definition.acceptanceOperationIds.length).toBeGreaterThan(0);
      expect(definition.acceptanceOperationIds).toEqual(
        [...definition.acceptanceOperationIds].sort(),
      );
      for (const operationId of definition.acceptanceOperationIds) {
        expect(operationId).toMatch(/^[a-z][a-z0-9.-]*\.v[1-9][0-9]*$/);
      }
    }
    expect(new Set(allOperationIds).size).toBe(allOperationIds.length);
  });

  test("publishes a closed per-target client surface contract", () => {
    const targets = ["nextjs", "tanstack-start", "expo", "electron"] as const;
    for (const definition of SUPPORT_CATALOG.capabilities) {
      expect(Object.keys(definition.clientBindings)).toEqual(targets);
      for (const target of targets) {
        const binding = definition.clientBindings[target];
        expect(binding).toBeDefined();
        expect(new Set(binding.requiredOperationIds).size).toBe(
          binding.requiredOperationIds.length,
        );
        expect(new Set(binding.requiredArtifacts).size).toBe(binding.requiredArtifacts.length);
        for (const operation of binding.requiredOperationIds) {
          expect(definition.acceptanceOperationIds).toContain(operation);
        }
        if (definition.clientSurfaceRequired) {
          expect(binding.status).not.toBe("not-required");
          expect(binding.requiredOperationIds.length).toBeGreaterThan(0);
          expect(binding.requiredArtifacts).toEqual(["route", "adapter", "manifest", "acceptance"]);
          if (binding.status === "unsupported") expect(binding.reason?.length).toBeGreaterThan(0);
        } else {
          expect(binding).toEqual({
            status: "not-required",
            requiredOperationIds: [],
            requiredArtifacts: [],
          });
        }
      }
    }

    expect(
      SUPPORT_CATALOG.capabilities.find(({ id }) => id === "analytics")?.clientBindings,
    ).toMatchObject({
      nextjs: { status: "supported" },
      "tanstack-start": { status: "supported" },
      expo: { status: "supported" },
      electron: { status: "supported" },
    });
    expect(
      SUPPORT_CATALOG.capabilities.find(({ id }) => id === "i18n")?.clientBindings,
    ).toMatchObject({
      nextjs: { status: "supported" },
      "tanstack-start": { status: "supported" },
      expo: { status: "supported" },
      electron: { status: "supported" },
    });
    expect(
      SUPPORT_CATALOG.capabilities.find(({ id }) => id === "billing")?.clientBindings,
    ).toMatchObject({
      nextjs: { status: "supported" },
      "tanstack-start": { status: "supported" },
      expo: { status: "supported" },
      electron: { status: "supported" },
    });
  });

  test("is deeply immutable and validates against its packaged schema", () => {
    expect(Object.isFrozen(SUPPORT_CATALOG)).toBe(true);
    expect(Object.isFrozen(SUPPORT_CATALOG.axes)).toBe(true);
    expect(Object.isFrozen(SUPPORT_CATALOG.capabilities[0]?.requirements)).toBe(true);
    expect(Object.isFrozen(SUPPORT_CATALOG.capabilities[0]?.clientBindings)).toBe(true);

    const schema = JSON.parse(
      readFileSync(resolve(root, "schemas/support-catalog.schema.json"), "utf8"),
    );
    const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);
    const serialized = JSON.parse(JSON.stringify(SUPPORT_CATALOG));
    expect(validate(serialized), JSON.stringify(validate.errors)).toBe(true);
    expect(serialized).toEqual(SUPPORT_CATALOG);
  });
});
