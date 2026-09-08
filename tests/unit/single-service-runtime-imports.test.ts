import { describe, expect, test } from "bun:test";
import { resolveCreateConfig } from "../../src/commands/create/resolution.js";
import { buildProjectGenerationPlan } from "../../src/templates/default.js";
import { resultModuleForMode } from "../../src/templates/services/shared.js";

describe("generated service runtime imports", () => {
  for (const framework of ["nextjs", "tanstack-start"] as const) {
    for (const database of ["postgres", "convex"] as const) {
      test(`single ${framework}/${database} uses source-resolvable kernel aliases`, () => {
        const resolution = resolveCreateConfig({
          name: "service-imports",
          mode: "single",
          framework,
          database,
          databaseWasExplicit: true,
          runtime: "bun",
          billing: ["stripe"],
          features: [],
          apps: ["web"],
          preset: "saas",
          withEmail: true,
        });
        if (!resolution.ok) throw new Error(resolution.message);
        const plan = buildProjectGenerationPlan(resolution.resolvedConfig);
        expect(
          plan.files.some(({ physicalPath }) => physicalPath === "src/server/kernel/result.ts"),
        ).toBe(true);
        const services = plan.files.filter(
          ({ physicalPath }) =>
            physicalPath.startsWith("src/server/services/") && /\.tsx?$/.test(physicalPath),
        );
        const runtimeConsumers = services.filter(({ content }) =>
          content.includes('from "@/server/kernel/result"'),
        );
        expect(runtimeConsumers.length).toBeGreaterThanOrEqual(5);
        for (const { physicalPath, content } of services) {
          expect(content, physicalPath).not.toMatch(/from\s+["']@\/[^"']+\.js["']/);
        }
      });
    }
  }

  test("monorepo kernel imports retain their package boundary", () => {
    expect(resultModuleForMode("monorepo")).toBe("@repo/kernel");
    expect(resultModuleForMode("single")).toBe("@/server/kernel/result");
  });
});
