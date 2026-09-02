import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { analyzeProjectReport } from "../../src/lib/architecture/index.js";
import { projectConfigSchema, type ProjectConfig } from "../../src/lib/config.js";
import { FsTransaction } from "../../src/lib/fs.js";
import { generateProjectFiles } from "../../src/templates/default.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function config(input: Partial<ProjectConfig>): ProjectConfig {
  return projectConfigSchema.parse({ name: "demo", ...input });
}

const CASES: Array<{ name: string; config: ProjectConfig }> = [
  {
    name: "default monorepo with Expo, desktop, and Eve",
    config: config({
      mode: "monorepo",
      preset: "saas",
      framework: "nextjs",
      database: "postgres",
      billing: ["stripe", "chargily"],
      features: ["eve", "i18n"],
      apps: ["web", "mobile", "desktop"],
    }),
  },
  {
    name: "default single Next",
    config: config({
      mode: "single",
      preset: "saas",
      framework: "nextjs",
      database: "postgres",
      billing: ["stripe"],
      features: ["i18n"],
      apps: ["web"],
    }),
  },
  {
    name: "all billing providers preserve verified acknowledgement ordering",
    config: config({
      mode: "monorepo",
      preset: "saas",
      framework: "nextjs",
      database: "postgres",
      billing: ["stripe", "chargily", "paddle", "polar"],
      apps: ["web"],
    }),
  },
  {
    name: "TanStack monorepo provider webhooks remain server transport",
    config: config({
      mode: "monorepo",
      preset: "saas",
      framework: "tanstack-start",
      database: "postgres",
      billing: ["stripe", "chargily", "paddle", "polar"],
      apps: ["web"],
    }),
  },
  {
    name: "TanStack single provider webhooks remain server transport",
    config: config({
      mode: "single",
      preset: "saas",
      framework: "tanstack-start",
      database: "postgres",
      billing: ["stripe", "chargily", "paddle", "polar"],
      apps: ["web"],
    }),
  },
  {
    name: "capability-off Next with analytics",
    config: config({
      mode: "monorepo",
      preset: "frontend",
      framework: "nextjs",
      database: "none",
      auth: false,
      api: false,
      email: false,
      analytics: true,
      billing: [],
      features: [],
      apps: ["web"],
    }),
  },
  {
    name: "capability-off TanStack with analytics",
    config: config({
      mode: "monorepo",
      preset: "frontend",
      framework: "tanstack-start",
      database: "none",
      auth: false,
      api: false,
      email: false,
      analytics: true,
      billing: [],
      features: [],
      apps: ["web"],
    }),
  },
  {
    name: "Convex desktop admin and messaging stay behind typed client boundaries",
    config: config({
      mode: "monorepo",
      preset: "saas",
      framework: "tanstack-start",
      database: "convex",
      billing: [],
      apps: ["web", "desktop"],
      messaging: true,
    }),
  },
  {
    name: "Convex Next auth client reads only public configuration",
    config: config({
      mode: "monorepo",
      preset: "saas",
      framework: "nextjs",
      database: "convex",
      billing: [],
      apps: ["web"],
    }),
  },
  {
    name: "Next monorepo WebSocket auth remains in Transport",
    config: config({
      mode: "monorepo",
      preset: "saas",
      framework: "nextjs",
      database: "postgres",
      billing: [],
      apps: ["web"],
      messaging: true,
    }),
  },
  {
    name: "TanStack single WebSocket auth remains in Transport",
    config: config({
      mode: "single",
      preset: "saas",
      framework: "tanstack-start",
      database: "postgres",
      billing: [],
      apps: ["web"],
      messaging: true,
    }),
  },
  {
    name: "family C app clients stay behind transport adapters",
    config: config({
      mode: "monorepo",
      preset: "custom",
      framework: "nextjs",
      database: "postgres",
      billing: [],
      apps: ["web", "mobile", "desktop"],
      auth: true,
      api: true,
      notifications: true,
      storage: true,
      featureFlags: "posthog",
      jobs: true,
      jobsUserFacingApi: true,
    }),
  },
  {
    name: "maximal Postgres native clients use only typed transport boundaries",
    config: config({
      mode: "monorepo",
      preset: "custom",
      framework: "nextjs",
      database: "postgres",
      billing: ["stripe", "chargily", "paddle", "polar"],
      apps: ["web", "mobile", "desktop"],
      auth: true,
      api: true,
      email: true,
      analytics: true,
      eve: true,
      i18n: true,
      pdf: true,
      messaging: true,
      storage: true,
      notifications: true,
      featureFlags: "posthog",
      jobs: true,
      jobsUserFacingApi: true,
      cache: "redis",
    }),
  },
];

describe("generated architecture checker", () => {
  for (const generatedCase of CASES) {
    test(generatedCase.name, async () => {
      const root = mkdtempSync(join(tmpdir(), "ghostinit-generated-architecture-"));
      roots.push(root);
      const transaction = new FsTransaction(root);
      for (const generated of generateProjectFiles(generatedCase.config, { dryRun: false })) {
        await transaction.write(generated.path, generated.content);
      }
      await transaction.commit();

      const report = await analyzeProjectReport(root);
      const blocking = report.findings.filter(
        ({ severity }) => severity === "BLOCKER" || severity === "HIGH",
      );
      expect(report.complete, JSON.stringify(report.findings, null, 2)).toBe(true);
      expect(blocking).toEqual([]);
      expect(
        report.findings.filter(({ rule }) => rule === "dependency-declaration"),
        JSON.stringify(report.findings, null, 2),
      ).toEqual([]);
    });
  }

  test("single PDF keeps its web client outside the server capability tree", async () => {
    const generated = generateProjectFiles(
      config({
        mode: "single",
        preset: "saas",
        framework: "nextjs",
        database: "postgres",
        billing: [],
        apps: ["web"],
        pdf: true,
      }),
      { dryRun: false },
    );
    const paths = new Set(generated.map(({ path }) => path));
    expect(paths.has("src/hooks/usePdf.ts")).toBe(true);
    expect(paths.has("src/server/pdf/src/client/usePdf.ts")).toBe(false);

    const root = mkdtempSync(join(tmpdir(), "ghostinit-generated-pdf-architecture-"));
    roots.push(root);
    const transaction = new FsTransaction(root);
    for (const file of generated) await transaction.write(file.path, file.content);
    await transaction.commit();

    const report = await analyzeProjectReport(root);
    const taint = report.findings.filter(
      ({ id, file }) => id === "client-transitive-server-import" && file === "src/hooks/usePdf.ts",
    );
    expect(report.complete, JSON.stringify(report.findings, null, 2)).toBe(true);
    expect(taint).toEqual([]);
  });
});
