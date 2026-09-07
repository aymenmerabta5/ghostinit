import { describe, expect, test } from "bun:test";
import { resolveCreateConfig } from "../../src/commands/create/resolution.js";
import {
  CAPABILITY_OPERATION_EVIDENCE,
  SUPPORT_CATALOG,
} from "../../src/domain/capabilities/index.js";
import { GenerationPlanError } from "../../src/domain/generation/plan-validation.js";
import { assertClientSurfaceCoverage } from "../../src/domain/generation/surface-validation.js";
import { buildProjectGenerationPlan } from "../../src/templates/default.js";
import { collectCapabilityEvidenceFailures } from "../../scripts/check-capability-evidence.js";

describe("capability operation behavioral evidence", () => {
  test("maps every advertised operation to a resolvable named Bun test", () => {
    const advertised = SUPPORT_CATALOG.capabilities.flatMap((definition) =>
      definition.acceptanceOperationIds.map((operationId) => ({
        capability: definition.id,
        operationId,
      })),
    );
    expect(
      CAPABILITY_OPERATION_EVIDENCE.map(({ capability, operationId }) => ({
        capability,
        operationId,
      })),
    ).toEqual(advertised);
    expect(collectCapabilityEvidenceFailures()).toEqual([]);
  });

  test("rejects route labels as behavioral evidence artifacts", () => {
    const [first, ...rest] = CAPABILITY_OPERATION_EVIDENCE;
    if (!first) throw new Error("Expected operation evidence");
    const failures = collectCapabilityEvidenceFailures(undefined, [
      {
        ...first,
        artifacts: [
          {
            kind: "bun-test",
            path: "apps/web/src/app/api/health/route.ts",
            testName: "transport.health.v1",
          },
        ],
      },
      ...rest,
    ]);
    expect(failures).toContain(
      "ineligible evidence artifact for transport.health.v1: apps/web/src/app/api/health/route.ts",
    );
  });

  test("fails generation coverage even when a route claims an operation with no behavioral proof", () => {
    const resolution = resolveCreateConfig({
      name: "evidence-fail-closed",
      runtime: "bun",
      mode: "monorepo",
      framework: "nextjs",
      billing: [],
      features: [],
      database: "none",
      databaseWasExplicit: true,
      apps: ["web"],
      preset: "custom",
      cache: "none",
      deploy: "none",
      withAnalytics: true,
    });
    if (!resolution.ok) throw new Error(resolution.message);
    const plan = buildProjectGenerationPlan(resolution.resolvedConfig, {
      desiredConfig: resolution.desiredConfig,
    });
    expect(
      plan.files.some((file) => file.provenance.acceptance.includes("analytics.capture.v1")),
    ).toBe(true);

    const withoutAnalyticsEvidence = CAPABILITY_OPERATION_EVIDENCE.filter(
      ({ operationId }) => operationId !== "analytics.capture.v1",
    );
    expect(() =>
      assertClientSurfaceCoverage(resolution.resolvedConfig, plan, withoutAnalyticsEvidence),
    ).toThrow(GenerationPlanError);
    try {
      assertClientSurfaceCoverage(resolution.resolvedConfig, plan, withoutAnalyticsEvidence);
    } catch (error) {
      expect(error).toMatchObject({
        code: "missing-capability-operation-evidence",
        details: {
          capability: "analytics",
          missingOperations: "analytics.capture.v1",
        },
      });
    }
  });
});
