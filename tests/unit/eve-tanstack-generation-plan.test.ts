import { describe, expect, test } from "bun:test";
import { resolveCreateConfig } from "../../src/commands/create/resolution.js";
import { buildProjectGenerationPlan } from "../../src/templates/default.js";

function eveTanStackPlan(mode: "monorepo" | "single", apps: Array<"web" | "mobile" | "desktop">) {
  const resolution = resolveCreateConfig({
    name: `eve-tanstack-${mode}`,
    runtime: "bun",
    mode,
    framework: "tanstack-start",
    billing: [],
    features: [],
    database: "postgres",
    databaseWasExplicit: true,
    apps,
    preset: "custom",
    cache: "none",
    deploy: "none",
    withEve: true,
  });
  if (!resolution.ok) throw new Error(resolution.message);
  return {
    plan: buildProjectGenerationPlan(resolution.resolvedConfig, {
      desiredConfig: resolution.desiredConfig,
    }),
    resolved: resolution.resolvedConfig,
  };
}

describe("TanStack Eve client-surface evidence", () => {
  test("attributes authenticated web and hosted native bindings in monorepo mode", () => {
    const { plan, resolved } = eveTanStackPlan("monorepo", ["web", "mobile", "desktop"]);
    for (const app of resolved.apps) {
      const files = plan.files.filter(
        ({ provenance }) => provenance.capability === "eve" && provenance.appId === app.id,
      );
      expect(new Set(files.flatMap(({ provenance }) => provenance.artifacts)), app.id).toEqual(
        new Set(["acceptance", "adapter", "route"]),
      );
      expect(
        files.flatMap(({ provenance }) => provenance.acceptance),
        app.id,
      ).toContain("eve.invoke.v1");
    }

    expect(
      plan.files.some(({ physicalPath }) => physicalPath === "apps/web/src/routes/agent.tsx"),
    ).toBe(true);
    expect(
      plan.files.some(({ physicalPath }) => physicalPath === "apps/mobile/src/lib/eve-protocol.ts"),
    ).toBe(true);
    expect(
      plan.files.some(
        ({ physicalPath }) => physicalPath === "apps/desktop/src/renderer/lib/eve-protocol.ts",
      ),
    ).toBe(true);
  });

  test("attributes the single TanStack web binding through the same facade contract", () => {
    const { plan, resolved } = eveTanStackPlan("single", ["web"]);
    const web = resolved.apps[0];
    if (!web) throw new Error("Missing resolved web application");
    const files = plan.files.filter(
      ({ provenance }) => provenance.capability === "eve" && provenance.appId === web.id,
    );

    expect(new Set(files.flatMap(({ provenance }) => provenance.artifacts))).toEqual(
      new Set(["acceptance", "adapter", "route"]),
    );
    expect(files.flatMap(({ provenance }) => provenance.acceptance)).toContain("eve.invoke.v1");
    expect(plan.files.some(({ physicalPath }) => physicalPath === "src/routes/agent.tsx")).toBe(
      true,
    );
  });
});
