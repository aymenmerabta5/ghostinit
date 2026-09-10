import { describe, expect, test } from "bun:test";
import { resolveCreateConfig } from "../../src/commands/create/resolution.js";
import type { BillingProviderName, DatabaseProvider, DeployTarget } from "../../src/lib/addons.js";
import { buildProjectGenerationPlan } from "../../src/templates/default.js";

interface ReadmeCase {
  name: string;
  database: DatabaseProvider;
  deploy: DeployTarget;
  billing: BillingProviderName[];
  auth: boolean;
  email: boolean;
  eve?: boolean;
}

const CASES: ReadmeCase[] = [
  {
    name: "postgres-manual",
    database: "postgres",
    deploy: "none",
    billing: ["manual"],
    auth: true,
    email: true,
  },
  {
    name: "convex-manual",
    database: "convex",
    deploy: "none",
    billing: ["manual"],
    auth: true,
    email: false,
  },
  { name: "no-backend", database: "none", deploy: "none", billing: [], auth: false, email: false },
  {
    name: "cloudflare-convex",
    database: "convex",
    deploy: "cloudflare",
    billing: [],
    auth: true,
    email: false,
  },
  {
    name: "cloudflare-no-backend",
    database: "none",
    deploy: "cloudflare",
    billing: [],
    auth: false,
    email: false,
  },
  {
    name: "postgres-online",
    database: "postgres",
    deploy: "none",
    billing: ["stripe"],
    auth: true,
    email: true,
  },
  {
    name: "postgres-eve",
    database: "postgres",
    deploy: "none",
    billing: [],
    auth: true,
    email: true,
    eve: true,
  },
];

describe("single web README describes the compiled selection", () => {
  for (const app of ["mobile", "desktop"] as const) {
    test(`${app} output has no PostgreSQL Compose setup`, () => {
      const resolution = resolveCreateConfig({
        name: "native-readme",
        runtime: "bun",
        mode: "single",
        framework: "nextjs",
        database: "none",
        databaseWasExplicit: true,
        apps: [app],
        billing: [],
        features: [],
        preset: "frontend",
        cache: "none",
        deploy: "none",
        withAuth: false,
        withApi: false,
        withEmail: false,
        withAnalytics: false,
      });
      if (!resolution.ok) throw new Error(resolution.message);
      const plan = buildProjectGenerationPlan(resolution.resolvedConfig, {
        desiredConfig: resolution.desiredConfig,
      });
      expect(plan.files.some((entry) => entry.physicalPath === "docker-compose.yml")).toBe(false);
      const readme = plan.files.find((entry) => entry.physicalPath === "README.md")?.content;
      expect(readme).toBeString();
      expect(readme).not.toContain("docker compose");
      expect(readme).not.toContain("db:migrate");
    });
  }

  for (const framework of ["nextjs", "tanstack-start"] as const) {
    for (const selected of CASES) {
      test(`${framework}/${selected.name} documents only emitted commands and setup paths`, () => {
        const resolution = resolveCreateConfig({
          name: "readme-selection",
          runtime: "bun",
          mode: "single",
          framework,
          database: selected.database,
          databaseWasExplicit: true,
          apps: ["web"],
          billing: selected.billing,
          features: [],
          preset: "custom",
          cache: "none",
          deploy: selected.deploy,
          withAuth: selected.auth,
          withApi: selected.auth,
          withEmail: selected.email,
          withAnalytics: false,
          withEve: selected.eve ?? false,
          withI18n: false,
          withPdf: false,
          withMessaging: false,
          withStorage: selected.billing.includes("manual"),
          withNotifications: false,
          featureFlags: "none",
          withJobs: false,
        });
        if (!resolution.ok) throw new Error(resolution.message);
        const plan = buildProjectGenerationPlan(resolution.resolvedConfig, {
          desiredConfig: resolution.desiredConfig,
        });
        const files = new Map(
          plan.files.map(({ physicalPath, content }) => [physicalPath, content]),
        );
        const readme = files.get("README.md");
        expect(readme).toBeString();
        if (!readme) throw new Error("Missing compiled README");
        const manifest = JSON.parse(files.get("package.json") ?? "{}") as {
          scripts: Record<string, string>;
        };
        const documentedCommands = [...readme.matchAll(/\bbun run ([\w:.-]+)/g)].map(
          (match) => match[1]!,
        );
        expect(documentedCommands.length).toBeGreaterThan(0);
        for (const command of new Set(documentedCommands)) {
          expect(manifest.scripts[command], `README command ${command}`).toBeString();
        }
        for (const command of [
          "install:verified",
          "install:bootstrap",
          "dev",
          "typecheck",
          "lint:all",
          "format:check",
          "test",
          "build",
        ]) {
          expect(documentedCommands).toContain(command);
        }

        const environmentFile = selected.deploy === "cloudflare" ? ".dev.vars" : ".env.local";
        expect(files.has(environmentFile)).toBe(true);
        expect(readme).toContain(environmentFile);
        if (selected.deploy === "cloudflare") expect(readme).not.toContain(".env.local");

        if (selected.database === "postgres") {
          expect(files.has("docker-compose.yml")).toBe(true);
          expect(
            plan.files.find((entry) => entry.physicalPath === "docker-compose.yml")?.owner,
          ).toBe("tooling");
          expect(readme).toContain("docker compose --env-file .env.local up -d");
          expect(documentedCommands).toContain("db:generate");
          expect(documentedCommands).toContain("db:migrate");
          expect(readme).not.toContain("convex:dev");
        } else {
          expect(files.has("docker-compose.yml")).toBe(false);
          expect(readme).not.toContain("docker compose");
          expect(readme).not.toContain("db:generate");
          expect(readme).not.toContain("db:migrate");
          if (selected.database === "convex") {
            expect(documentedCommands).toContain("convex:dev");
            expect(readme).toContain("Terminal 2: start the web app after Convex is ready");
            expect(readme.indexOf("bun run convex:dev")).toBeLessThan(
              readme.indexOf("bun run dev"),
            );
            if (selected.deploy === "cloudflare") {
              expect(documentedCommands).toContain("convex:bootstrap");
              expect(readme.indexOf("bun run convex:bootstrap")).toBeLessThan(
                readme.indexOf("bun run convex:dev"),
              );
            } else {
              expect(readme).not.toContain("convex:bootstrap");
            }
          } else {
            expect(readme).not.toContain("convex:");
          }
        }

        if (selected.auth && !selected.email) {
          expect(readme).toContain("Configure Google or GitHub OAuth credentials");
        } else {
          expect(readme).not.toContain("OAuth credentials");
          expect(readme).not.toContain("Email/password signup");
        }

        if (selected.billing.length) {
          expect(readme).toContain("## Billing");
          expect(readme).toContain(`Selected billing: ${selected.billing.join(", ")}.`);
        } else {
          expect(readme).not.toContain("## Billing");
        }
        const manualPaths = [
          "src/server/billing/manual-payment-config.ts",
          "convex/manualPaymentConfig.ts",
        ];
        if (selected.billing.includes("manual")) {
          const configPath = selected.database === "convex" ? manualPaths[1]! : manualPaths[0]!;
          expect(files.has(configPath)).toBe(true);
          expect(files.has("docs/manual-payments.md")).toBe(true);
          expect(
            plan.files.find((entry) => entry.physicalPath === "docs/manual-payments.md"),
          ).toMatchObject({ owner: "documentation", provenance: { capability: "billing" } });
          expect(readme).toContain(configPath);
          expect(readme).toContain("docs/manual-payments.md");
          expect(readme).toContain("administrator approval");
          expect(readme).not.toContain(manualPaths.find((path) => path !== configPath)!);
        } else {
          expect(files.has("docs/manual-payments.md")).toBe(false);
          for (const path of manualPaths) expect(readme).not.toContain(path);
          expect(readme).not.toContain("docs/manual-payments.md");
          expect(readme).not.toContain("Manual DZD top-ups");
        }
      });
    }
  }
});
