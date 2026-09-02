import { describe, expect, test } from "bun:test";
import { runtime } from "../../packages/versions/src/index.js";
import {
  CAPABILITY_IDS,
  type CapabilityId,
  type DesiredCapabilities,
} from "../../src/domain/capabilities/index.js";
import {
  PROJECT_CONFIG_SCHEMA_URI,
  resolveProjectConfig,
  type DesiredProjectConfig,
} from "../../src/domain/project/index.js";

const SUPPORTED_TARGETS: Readonly<Record<CapabilityId, readonly string[]>> = {
  transport: ["nextjs", "tanstack-start", "expo", "electron"],
  auth: ["nextjs", "tanstack-start", "expo", "electron"],
  billing: ["nextjs", "tanstack-start", "expo", "electron"],
  messaging: ["nextjs", "tanstack-start", "expo", "electron"],
  email: ["nextjs", "tanstack-start", "expo", "electron"],
  storage: ["nextjs", "tanstack-start", "expo", "electron"],
  cache: ["nextjs", "tanstack-start", "expo", "electron"],
  analytics: ["nextjs", "tanstack-start", "expo", "electron"],
  i18n: ["nextjs", "tanstack-start", "expo", "electron"],
  pdf: ["nextjs", "tanstack-start", "expo", "electron"],
  eve: ["nextjs", "tanstack-start", "expo", "electron"],
  notifications: ["nextjs", "tanstack-start", "expo", "electron"],
  featureFlags: ["nextjs", "tanstack-start", "expo", "electron"],
  jobs: ["nextjs", "tanstack-start", "expo", "electron"],
};

function capabilitySelection(capability: CapabilityId): DesiredCapabilities {
  if (capability === "billing") return { billing: { providers: ["stripe"] } };
  if (capability === "cache") return { cache: "redis" };
  if (capability === "featureFlags") return { featureFlags: { provider: "posthog" } };
  if (capability === "jobs") return { jobs: { userFacingApi: true } };
  return { [capability]: true } as DesiredCapabilities;
}

function desired(
  capability: CapabilityId,
  target: "nextjs" | "tanstack-start" | "expo" | "electron",
) {
  const webTarget = target === "tanstack-start" ? "tanstack-start" : "nextjs";
  const apps: DesiredProjectConfig["apps"] =
    target === "expo"
      ? [
          { id: "web", target: "nextjs", deploy: "none" },
          { id: "mobile", target: "expo", deploy: "none" },
        ]
      : target === "electron"
        ? [
            { id: "web", target: "nextjs", deploy: "none" },
            { id: "desktop", target: "electron", deploy: "none" },
          ]
        : [{ id: "web", target: webTarget, deploy: "none" }];
  return {
    $schema: PROJECT_CONFIG_SCHEMA_URI,
    schemaVersion: 2,
    name: "surface-matrix",
    mode: "monorepo",
    packageManager: { name: "bun", version: runtime.bun },
    apps,
    backend: { hostApp: "web", executionRuntime: "bun", database: "postgres" },
    capabilities: capabilitySelection(capability),
  } satisfies DesiredProjectConfig;
}

describe("closed capability client-target resolution matrix", () => {
  for (const capability of CAPABILITY_IDS) {
    for (const target of ["nextjs", "tanstack-start", "expo", "electron"] as const) {
      test(`${capability}/${target}`, () => {
        const result = resolveProjectConfig(desired(capability, target));
        const supported = SUPPORTED_TARGETS[capability].includes(target);
        expect(result.ok).toBe(supported);
        const targetApp = target === "expo" ? "mobile" : target === "electron" ? "desktop" : "web";
        if (supported) {
          expect(result.issues).not.toContainEqual(
            expect.objectContaining({ code: "capability-client-target-unsupported" }),
          );
        } else {
          expect(result.issues).toContainEqual(
            expect.objectContaining({
              code: "capability-client-target-unsupported",
              capability,
              path: `/apps/${targetApp}/target`,
            }),
          );
        }
      });
    }
  }

  test("internal jobs remain valid because they do not request a client surface", () => {
    const result = resolveProjectConfig({
      ...desired("jobs", "electron"),
      capabilities: { jobs: { userFacingApi: false } },
    });
    expect(result.ok).toBe(true);
  });
});
