import { describe, expect, test } from "bun:test";
import { resolveCreateConfig } from "../../src/commands/create/resolution.js";
import { buildGenerationPlan } from "../../src/domain/generation/plan-builder.js";
import { GenerationPlanError } from "../../src/domain/generation/plan-validation.js";
import { assertClientSurfaceCoverage } from "../../src/domain/generation/surface-validation.js";
import { buildProjectGenerationPlan } from "../../src/templates/default.js";

function supportedFixture() {
  const result = resolveCreateConfig({
    name: "surface-plan",
    runtime: "bun",
    mode: "monorepo",
    framework: "nextjs",
    billing: [],
    features: [],
    database: "postgres",
    databaseWasExplicit: true,
    apps: ["web", "mobile"],
    preset: "saas",
    cache: "none",
    deploy: "none",
  });
  if (!result.ok) throw new Error(result.message);
  return result;
}

describe("GenerationPlan client surface evidence", () => {
  test("attributes supported app routes, adapters, manifests, and acceptance operations", () => {
    const fixture = supportedFixture();
    const plan = buildProjectGenerationPlan(fixture.resolvedConfig, {
      desiredConfig: fixture.desiredConfig,
    });

    const webManifest = plan.files.find(
      ({ physicalPath }) => physicalPath === "apps/web/package.json",
    );
    expect(webManifest?.provenance).toMatchObject({
      appId: "web",
      target: "nextjs",
      artifacts: ["manifest"],
    });

    const webAuth = plan.files.find(
      ({ physicalPath }) => physicalPath === "apps/web/src/app/sign-in/page.tsx",
    );
    expect(webAuth?.provenance).toMatchObject({
      capability: "auth",
      appId: "web",
      target: "nextjs",
      artifacts: ["acceptance", "route"],
    });
    expect(webAuth?.provenance.acceptance).toEqual(
      expect.arrayContaining(["auth.session.v1", "auth.sign-in.v1"]),
    );

    const mobileAnalytics = plan.files.find(
      ({ physicalPath }) => physicalPath === "apps/mobile/src/lib/analytics.tsx",
    );
    expect(mobileAnalytics?.provenance).toMatchObject({
      capability: "analytics",
      appId: "mobile",
      target: "expo",
      artifacts: ["acceptance", "adapter", "route"],
    });

    expect(
      plan.files.find(({ physicalPath }) => physicalPath === "packages/auth/src/server.ts")
        ?.provenance.capability,
    ).toBe("auth");
  });

  test("fails closed when a supported binding lacks declared render evidence", () => {
    const fixture = supportedFixture();
    const empty = buildGenerationPlan({
      projectConfigHash: fixture.resolvedConfig.configHash,
      files: [],
    });
    try {
      assertClientSurfaceCoverage(fixture.resolvedConfig, empty);
      throw new Error("Expected missing client surface evidence to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(GenerationPlanError);
      expect((error as GenerationPlanError).code).toBe("missing-client-surface-artifact");
      expect((error as GenerationPlanError).details).toMatchObject({
        capability: "analytics",
        appId: "mobile",
        target: "expo",
      });
    }
  });

  for (const framework of ["nextjs", "tanstack-start"] as const) {
    test(`proves analytics and i18n artifacts for every ${framework} app target`, () => {
      const resolution = resolveCreateConfig({
        name: "platform-surfaces",
        runtime: "bun",
        mode: "monorepo",
        framework,
        billing: [],
        features: [],
        database: "none",
        databaseWasExplicit: true,
        apps: ["web", "mobile", "desktop"],
        preset: "custom",
        cache: "none",
        deploy: "none",
        withAnalytics: true,
        withI18n: true,
      });
      expect(resolution.ok).toBe(true);
      if (!resolution.ok) throw new Error(resolution.message);
      const plan = buildProjectGenerationPlan(resolution.resolvedConfig, {
        desiredConfig: resolution.desiredConfig,
      });
      for (const capability of ["analytics", "i18n"] as const) {
        for (const app of resolution.resolvedConfig.apps) {
          const files = plan.files.filter(
            ({ provenance }) => provenance.capability === capability && provenance.appId === app.id,
          );
          const artifacts = new Set(files.flatMap(({ provenance }) => provenance.artifacts));
          expect(artifacts, `${framework}/${capability}/${app.id}`).toEqual(
            new Set(["acceptance", "adapter", "route"]),
          );
        }
      }
    });
  }

  for (const database of ["postgres", "convex"] as const) {
    test(`proves billing artifacts for every selected ${database} app`, () => {
      const resolution = resolveCreateConfig({
        name: "billing-surfaces",
        runtime: "bun",
        mode: "monorepo",
        framework: "nextjs",
        billing: ["stripe"],
        features: [],
        database,
        databaseWasExplicit: true,
        apps: ["web", "mobile", "desktop"],
        preset: "custom",
        cache: "none",
        deploy: "none",
        withAuth: true,
        withApi: true,
      });
      expect(resolution.ok).toBe(true);
      if (!resolution.ok) throw new Error(resolution.message);
      const plan = buildProjectGenerationPlan(resolution.resolvedConfig, {
        desiredConfig: resolution.desiredConfig,
      });
      for (const app of resolution.resolvedConfig.apps) {
        const files = plan.files.filter(
          ({ provenance }) => provenance.capability === "billing" && provenance.appId === app.id,
        );
        const artifacts = new Set(files.flatMap(({ provenance }) => provenance.artifacts));
        expect(artifacts, `${database}/${app.id}`).toEqual(
          new Set(["acceptance", "adapter", "route"]),
        );
        expect(files.flatMap(({ provenance }) => provenance.acceptance)).toContain(
          "billing.portal.v1",
        );
      }
    });
  }

  test("proves single TanStack Convex Polar billing artifacts", () => {
    const resolution = resolveCreateConfig({
      name: "single-convex",
      runtime: "bun",
      mode: "single",
      framework: "tanstack-start",
      billing: ["polar"],
      features: [],
      database: "convex",
      databaseWasExplicit: true,
      apps: ["web"],
      preset: undefined,
      cache: "none",
      deploy: "none",
    });
    expect(resolution.ok).toBe(true);
    if (!resolution.ok) throw new Error(resolution.message);

    const plan = buildProjectGenerationPlan(resolution.resolvedConfig, {
      desiredConfig: resolution.desiredConfig,
    });
    const route = plan.files.find(({ physicalPath }) => physicalPath === "src/routes/billing.tsx");
    const adapter = plan.files.find(
      ({ physicalPath }) => physicalPath === "src/features/billing/use-billing.ts",
    );

    for (const file of [route, adapter]) {
      expect(file?.provenance).toMatchObject({
        capability: "billing",
        appId: "web",
        target: "tanstack-start",
      });
    }
    expect(route?.provenance.artifacts).toEqual(expect.arrayContaining(["acceptance", "route"]));
    expect(route?.provenance.acceptance).toEqual(
      expect.arrayContaining(["billing.payment-link.v1", "billing.portal.v1"]),
    );
    expect(adapter?.provenance.artifacts).toContain("adapter");
  });

  for (const database of ["postgres", "convex"] as const) {
    test(`proves messaging artifacts for every selected ${database} app`, () => {
      const resolution = resolveCreateConfig({
        name: "messaging-surfaces",
        runtime: "bun",
        mode: "monorepo",
        framework: "nextjs",
        billing: [],
        features: [],
        database,
        databaseWasExplicit: true,
        apps: ["web", "mobile", "desktop"],
        preset: "custom",
        cache: "none",
        deploy: "none",
        withMessaging: true,
        withAuth: true,
        withApi: true,
      });
      expect(resolution.ok).toBe(true);
      if (!resolution.ok) throw new Error(resolution.message);
      const plan = buildProjectGenerationPlan(resolution.resolvedConfig, {
        desiredConfig: resolution.desiredConfig,
      });
      for (const app of resolution.resolvedConfig.apps) {
        const files = plan.files.filter(
          ({ provenance }) => provenance.capability === "messaging" && provenance.appId === app.id,
        );
        const artifacts = new Set(files.flatMap(({ provenance }) => provenance.artifacts));
        expect(artifacts, `${database}/${app.id}`).toEqual(
          new Set(["acceptance", "adapter", "route"]),
        );
      }
    });
  }

  for (const database of ["postgres", "convex"] as const) {
    test(`proves family C artifacts for every selected ${database} app`, () => {
      const resolution = resolveCreateConfig({
        name: "family-c-surfaces",
        runtime: "bun",
        mode: "monorepo",
        framework: "nextjs",
        billing: [],
        features: [],
        database,
        databaseWasExplicit: true,
        apps: ["web", "mobile", "desktop"],
        preset: "custom",
        cache: "none",
        deploy: "none",
        withNotifications: true,
        withStorage: true,
        featureFlags: "posthog",
        withJobs: true,
      });
      expect(resolution.ok).toBe(true);
      if (!resolution.ok) throw new Error(resolution.message);
      expect(resolution.resolvedConfig.capabilities.jobs.userFacingApi).toBe(true);
      const plan = buildProjectGenerationPlan(resolution.resolvedConfig, {
        desiredConfig: resolution.desiredConfig,
      });
      for (const capability of ["notifications", "storage", "featureFlags", "jobs"] as const) {
        for (const app of resolution.resolvedConfig.apps) {
          const files = plan.files.filter(
            ({ provenance }) => provenance.capability === capability && provenance.appId === app.id,
          );
          const artifacts = new Set(files.flatMap(({ provenance }) => provenance.artifacts));
          expect(artifacts, `${database}/${capability}/${app.id}`).toEqual(
            new Set(["acceptance", "adapter", "route"]),
          );
        }
      }
    });
  }

  test("proves PDF and Eve artifacts across a Next-hosted multi-app project", () => {
    const resolution = resolveCreateConfig({
      name: "pdf-eve-surfaces",
      runtime: "bun",
      mode: "monorepo",
      framework: "nextjs",
      billing: [],
      features: [],
      database: "postgres",
      databaseWasExplicit: true,
      apps: ["web", "mobile", "desktop"],
      preset: "custom",
      cache: "none",
      deploy: "none",
      withPdf: true,
      withEve: true,
    });
    expect(resolution.ok).toBe(true);
    if (!resolution.ok) throw new Error(resolution.message);
    const plan = buildProjectGenerationPlan(resolution.resolvedConfig, {
      desiredConfig: resolution.desiredConfig,
    });
    for (const capability of ["pdf", "eve"] as const) {
      for (const app of resolution.resolvedConfig.apps) {
        const files = plan.files.filter(
          ({ provenance }) => provenance.capability === capability && provenance.appId === app.id,
        );
        const artifacts = new Set(files.flatMap(({ provenance }) => provenance.artifacts));
        expect(artifacts, `${capability}/${app.id}`).toEqual(
          new Set(["acceptance", "adapter", "route"]),
        );
      }
    }
  });
});
