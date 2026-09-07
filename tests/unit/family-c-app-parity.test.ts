import { describe, expect, test } from "bun:test";
import { parseSync } from "oxc-parser";
import { projectConfigSchema, type ProjectConfig } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";
import { resolveCreateConfig } from "../../src/commands/create/resolution.js";

function generate(overrides: Partial<ProjectConfig> = {}) {
  return generateProjectFiles(
    projectConfigSchema.parse({
      name: "family-c",
      runtime: "bun",
      version: "0.1.0",
      mode: "monorepo",
      framework: "nextjs",
      database: "postgres",
      apps: ["web", "mobile", "desktop"],
      preset: "custom",
      auth: true,
      api: true,
      email: false,
      analytics: false,
      billing: [],
      features: [],
      notifications: true,
      storage: true,
      featureFlags: "posthog",
      jobs: true,
      jobsUserFacingApi: true,
      ...overrides,
    }),
    { dryRun: true },
  );
}

function read(files: ReturnType<typeof generate>, path: string): string {
  const entry = files.find((candidate) => candidate.path === path);
  expect(entry, path).toBeDefined();
  return entry?.content ?? "";
}

function assertFamilyFilesParse(files: ReturnType<typeof generate>): void {
  const errors = files.flatMap((entry) => {
    if (!entry.path.includes("features/") || !/\.tsx?$/.test(entry.path)) return [];
    return parseSync(entry.path, entry.content).errors.map(
      (error) => `${entry.path}: ${error.message}`,
    );
  });
  expect(errors).toEqual([]);
}

describe("notification, storage, remote flags, and jobs app parity", () => {
  for (const framework of ["nextjs", "tanstack-start"] as const) {
    for (const database of ["postgres", "convex"] as const) {
      test(`monorepo/${framework}/${database} emits isolated native clients`, () => {
        const files = generate({ framework, database });
        const webRoute =
          framework === "nextjs"
            ? (feature: string) => `apps/web/src/app/${feature}/page.tsx`
            : (feature: string) => `apps/web/src/routes/${feature}.tsx`;
        for (const feature of ["notifications", "storage", "feature-flags", "jobs"]) {
          expect(
            files.some(({ path }) => path === webRoute(feature)),
            feature,
          ).toBe(true);
          expect(
            files.some(({ path }) => path === `apps/mobile/app/${feature}.tsx`),
            feature,
          ).toBe(true);
          expect(
            files.some(({ path }) => path === `apps/desktop/src/renderer/routes/${feature}.tsx`),
            feature,
          ).toBe(true);
        }
        for (const root of [
          "apps/web/src/features",
          "apps/mobile/src/features",
          "apps/desktop/src/renderer/features",
        ]) {
          expect(read(files, `${root}/notifications/queries.ts`)).toContain(
            "notifications.listInbox",
          );
          const notificationMutation =
            framework === "nextjs" && root === "apps/web/src/features"
              ? "createSelfNotificationAction"
              : "notifications.createSelf";
          expect(read(files, `${root}/notifications/mutations.ts`)).toContain(notificationMutation);
          expect(read(files, `${root}/storage/mutations.ts`)).toContain("storage.uploadBase64");
          expect(read(files, `${root}/feature-flags/queries.ts`)).toContain(
            "featureFlags.evaluate",
          );
          expect(read(files, `${root}/jobs/mutations.ts`)).toContain("jobs.enqueue");
        }
        assertFamilyFilesParse(files);
      });
    }
  }

  for (const framework of ["nextjs", "tanstack-start"] as const) {
    test(`single/${framework} keeps presentation behind query and mutation adapters`, () => {
      const files = generate({ mode: "single", framework, apps: ["web"] });
      const route = framework === "nextjs" ? "src/app/jobs/page.tsx" : "src/routes/jobs.tsx";
      expect(files.some(({ path }) => path === route)).toBe(true);
      for (const feature of ["notifications", "storage", "feature-flags", "jobs"]) {
        const page = read(files, `src/features/${feature}/page.tsx`);
        expect(page).not.toContain("@/lib/orpc");
        expect(page).not.toContain("@tanstack/react-query");
      }
      assertFamilyFilesParse(files);
    });
  }

  test("backend contracts support a usable notification producer and native storage transfer", () => {
    const files = generate();
    const notifications = read(files, "packages/api/src/notifications/contract.ts");
    const service = read(files, "packages/services/src/notifications/service.ts");
    const storage = read(files, "packages/api/src/storage/contract.ts");
    expect(notifications).toContain("createSelf:");
    expect(service).toContain("async publish(");
    expect(storage).toContain("uploadBase64:");
    expect(storage).toContain("downloadBase64:");

    const convex = generate({ database: "convex" });
    expect(read(convex, "convex/notifications.ts")).toContain("export const createSelf = mutation");
  });

  test("disabled capabilities emit none of the family client routes or adapters", () => {
    const files = generate({
      notifications: false,
      storage: false,
      featureFlags: "none",
      jobs: false,
      jobsUserFacingApi: false,
    });
    const paths = files.map(({ path }) => path);
    for (const feature of ["notifications", "storage", "feature-flags", "jobs"]) {
      expect(
        paths.some((path) => path.includes(`/features/${feature}/`)),
        feature,
      ).toBe(false);
      expect(
        paths.some((path) => path.endsWith(`/routes/${feature}.tsx`)),
        feature,
      ).toBe(false);
      expect(
        paths.some((path) => path.endsWith(`/app/${feature}.tsx`)),
        feature,
      ).toBe(false);
    }
  });

  test("CLI family selectors close auth and transport and make jobs user-facing", () => {
    const result = resolveCreateConfig({
      name: "family-c-cli",
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
      withNotifications: true,
      withStorage: true,
      featureFlags: "posthog",
      withJobs: true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.message);
    expect(result.config).toMatchObject({
      auth: true,
      api: true,
      notifications: true,
      storage: true,
      featureFlags: "posthog",
      jobs: true,
      jobsUserFacingApi: true,
    });
    expect(result.resolvedConfig.capabilities.jobs).toEqual({
      enabled: true,
      userFacingApi: true,
    });
  });
});
