import { describe, expect, test } from "bun:test";
import { parseSync } from "oxc-parser";
import { projectConfigSchema, type ProjectConfig } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";
import { identityApiFiles } from "../../src/templates/api/identity/index.js";
import { notificationsApiFiles } from "../../src/templates/api/notifications/index.js";
import { featureFlagsApiFiles } from "../../src/templates/api/feature-flags/index.js";
import { jobsApiFiles } from "../../src/templates/api/jobs/index.js";
import { identityServiceFiles } from "../../src/templates/services/identity/index.js";
import { notificationsServiceFiles } from "../../src/templates/services/notifications/index.js";
import { featureFlagsServiceFiles } from "../../src/templates/services/feature-flags/index.js";
import { jobsServiceFiles } from "../../src/templates/services/jobs/index.js";
import type { TemplateFile } from "../../src/templates/shared.js";

type Mode = "monorepo" | "single";
type Framework = "nextjs" | "tanstack-start";
type Database = "postgres" | "convex";

function config(
  mode: Mode,
  framework: Framework,
  database: Database,
  overrides: Partial<ProjectConfig> = {},
): ProjectConfig {
  return projectConfigSchema.parse({
    name: "capability-matrix",
    runtime: "bun",
    version: "0.1.0",
    mode,
    framework,
    database,
    apps: ["web"],
    preset: "custom",
    cache: "none",
    deploy: "none",
    auth: true,
    api: true,
    email: false,
    analytics: false,
    eve: false,
    i18n: false,
    pdf: false,
    billing: [],
    features: [],
    messaging: true,
    notifications: true,
    featureFlags: "posthog",
    jobs: true,
    ...overrides,
  });
}

function render(input: ProjectConfig): TemplateFile[] {
  return generateProjectFiles(input, { dryRun: true });
}

function paths(files: readonly TemplateFile[]): Set<string> {
  return new Set(files.map((entry) => entry.path));
}

function read(files: readonly TemplateFile[], path: string): string {
  const found = files.find((entry) => entry.path === path);
  if (!found) throw new Error(`Missing generated file ${path}`);
  return found.content;
}

function expectRenderer(files: readonly TemplateFile[], expected: readonly TemplateFile[]): void {
  const emitted = paths(files);
  for (const entry of expected) expect(emitted).toContain(entry.path);
}

function importSpecifiers(content: string): string[] {
  return [...content.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map(
    (match) => match[1],
  );
}

function normalize(path: string): string {
  const output: string[] = [];
  for (const part of path.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") output.pop();
    else output.push(part);
  }
  return output.join("/");
}

function assertParseAndRelativeClosure(files: readonly TemplateFile[]): void {
  const byPath = paths(files);
  const broken: string[] = [];
  const unresolved: string[] = [];
  for (const entry of files) {
    if (!/\.tsx?$/.test(entry.path)) continue;
    const result = parseSync(entry.path, entry.content);
    if (result.errors.length > 0) broken.push(`${entry.path}: ${result.errors[0]?.message}`);
    const directory = entry.path.includes("/")
      ? entry.path.slice(0, entry.path.lastIndexOf("/"))
      : "";
    for (const specifier of importSpecifiers(entry.content)) {
      if (!specifier.startsWith(".")) continue;
      const target = normalize(`${directory}/${specifier.split("?")[0]}`);
      if (target.includes("convex/_generated/") || target.endsWith("routeTree.gen")) continue;
      const candidates = [
        target,
        `${target}.ts`,
        `${target}.tsx`,
        `${target}.css`,
        `${target}/index.ts`,
        `${target}/index.tsx`,
        target.replace(/\.js$/, ".ts"),
        target.replace(/\.js$/, ".tsx"),
        `${target.replace(/\.js$/, "")}/index.ts`,
      ];
      if (!candidates.some((candidate) => byPath.has(candidate))) {
        unresolved.push(`${entry.path} -> ${specifier}`);
      }
    }
  }
  expect(broken).toEqual([]);
  expect(unresolved).toEqual([]);
}

describe("generated capability composition matrix", () => {
  for (const mode of ["monorepo", "single"] as const) {
    for (const framework of ["nextjs", "tanstack-start"] as const) {
      for (const database of ["postgres", "convex"] as const) {
        test(`${mode}/${framework}/${database} composes every selected capability`, () => {
          const files = render(config(mode, framework, database));
          const emitted = paths(files);
          const apiRoot = mode === "monorepo" ? "packages/api/src" : "src/server/api";
          const applicationRoot =
            mode === "monorepo"
              ? "packages/services/src/application"
              : "src/server/services/application";
          const serviceManifest = mode === "monorepo" ? "packages/services/package.json" : null;

          expectRenderer(files, identityServiceFiles(mode));
          expectRenderer(files, notificationsServiceFiles(mode));
          expectRenderer(files, featureFlagsServiceFiles(mode));
          expectRenderer(files, jobsServiceFiles(mode));
          expectRenderer(files, identityApiFiles(mode));
          expectRenderer(files, notificationsApiFiles(mode));
          expectRenderer(files, featureFlagsApiFiles(mode));
          expectRenderer(files, jobsApiFiles(mode));

          for (const name of ["feature-flags", "jobs"] as const) {
            expect(emitted).toContain(`${apiRoot}/composition/${name}.ts`);
          }
          for (const name of ["identity", "notifications"] as const) {
            expect(emitted).toContain(`${applicationRoot}/composition/${name}.ts`);
            expect(emitted).not.toContain(`${apiRoot}/composition/${name}.ts`);
          }

          const contract = read(files, `${apiRoot}/contract.ts`);
          const router = read(files, `${apiRoot}/router.ts`);
          expect(contract).toContain("identity: identityContract");
          expect(contract).toContain("notifications: notificationsContract");
          expect(contract).toContain("featureFlags: featureFlagsContract");
          expect(contract).toContain("jobs: jobsContract");
          expect(router).toContain("createIdentityProcedures");
          expect(router).toContain("createNotificationProcedures");
          expect(router).toContain("createFeatureFlagProcedures");
          expect(router).toContain("createJobProcedures");

          const context = read(files, `${apiRoot}/context.ts`);
          expect(context).toContain("identityActor");
          expect(context).toContain("createRequestApplicationForRequest");
          expect(context).not.toContain("resolveIdentityActorForRequest");
          expect(context).not.toContain("verifiedSession.user.email");
          const identityComposition = read(files, `${applicationRoot}/composition/identity.ts`);
          expect(identityComposition).toContain("authenticatedAt");
          expect(identityComposition).toContain("activeTeamId");
          expect(context).toContain("notificationActor");
          expect(context).toContain("featureFlagSubject");
          expect(context).toContain("jobActor");
          expect(context).toContain(mode === "single" ? "suspended ? null" : "user.banned ? null");

          if (database === "postgres") {
            expect(contract).toContain("messaging:");
            expect(router).toContain("messaging:");
            expect(emitted).toContain(`${apiRoot}/procedures/messaging/send-message.ts`);
          } else {
            expect(contract).not.toContain("messaging:");
            expect(emitted).toContain("convex/messaging.ts");
            expect(read(files, "convex/schema.ts")).toContain("conversationParticipants");
          }

          if (serviceManifest) {
            const manifest = JSON.parse(read(files, serviceManifest)) as {
              exports: Record<string, string>;
            };
            for (const name of ["identity", "notifications", "feature-flags", "jobs"] as const) {
              const target = manifest.exports[`./${name}`];
              expect(target).toBe(`./src/${name}/index.ts`);
              expect(emitted).toContain(`packages/services/${target.slice(2)}`);
            }
          }

          assertParseAndRelativeClosure(files);
        });
      }
    }
  }

  test("disabled optional capabilities leave no service, API, contract, or adapter output", () => {
    for (const mode of ["monorepo", "single"] as const) {
      const files = render(
        config(mode, "nextjs", "postgres", {
          messaging: false,
          notifications: false,
          featureFlags: "none",
          jobs: false,
        }),
      );
      const source = files.map((entry) => `${entry.path}\n${entry.content}`).join("\n");
      expect(source).not.toContain("services/notifications");
      expect(source).not.toContain("services/feature-flags");
      expect(source).not.toContain("services/jobs");
      expect(source).not.toContain("api/notifications");
      expect(source).not.toContain("api/feature-flags");
      expect(source).not.toContain("api/jobs");
      expect(source).not.toContain("procedures/messaging");
    }
  });

  test("identity requires both authentication and a persistent database", () => {
    for (const mode of ["monorepo", "single"] as const) {
      const noAuth = render(
        config(mode, "nextjs", "postgres", {
          preset: "custom",
          auth: false,
          api: false,
          messaging: false,
          notifications: false,
          featureFlags: "none",
          jobs: false,
        }),
      );
      const forbiddenRoots =
        mode === "monorepo"
          ? ["packages/services/src/identity/", "packages/api/src/identity/"]
          : ["src/server/services/identity/", "src/server/api/identity/"];
      expect(
        noAuth.some((entry) => forbiddenRoots.some((root) => entry.path.startsWith(root))),
      ).toBe(false);
    }
  });
});
