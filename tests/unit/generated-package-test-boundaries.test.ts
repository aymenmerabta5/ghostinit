import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import type { AppName } from "../../src/lib/addons.js";
import { projectConfigSchema } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";

function generated(apps: AppName[]) {
  return generateProjectFiles(
    projectConfigSchema.parse({
      name: `package-test-${apps.join("-")}`,
      runtime: "bun",
      mode: "monorepo",
      framework: "nextjs",
      preset: "custom",
      database: "postgres",
      apps,
      auth: true,
      api: true,
      email: true,
      analytics: true,
      billing: ["stripe", "chargily"],
      features: [],
    }),
    { dryRun: true },
  );
}

function content(files: ReturnType<typeof generated>, path: string): string {
  const value = files.find((entry) => entry.path === path)?.content;
  expect(value, `${path} should be generated`).toBeDefined();
  return value ?? "";
}

describe("generated package test and runtime boundaries", () => {
  for (const apps of [["web"], ["web", "mobile", "desktop"]] as AppName[][]) {
    test(`${apps.join("+")} keeps client barrels inert and validates server tests explicitly`, () => {
      const files = generated(apps);
      const testEnvironment = content(files, "scripts/test-env.ts");
      expect(testEnvironment).toContain('NODE_ENV: "test"');
      expect(testEnvironment).toContain('ANALYTICS_DISABLED: "true"');
      expect(testEnvironment).toContain("ghostinit-test-only-auth-secret");
      expect(testEnvironment).toContain("delete process.env[name]");
      expect(testEnvironment).toContain('STRIPE_SECRET_KEY: "sk_test_ghostinit_test_only"');
      expect(testEnvironment).toContain("process.env[name] = value");
      expect(testEnvironment).not.toContain("readFileSync");

      const turbo = JSON.parse(content(files, "turbo.json")) as {
        globalDependencies?: string[];
      };
      expect(turbo.globalDependencies).toContain("scripts/test-env.ts");

      const databaseManifest = JSON.parse(content(files, "packages/database/package.json")) as {
        exports?: Record<string, string>;
      };
      expect(databaseManifest.exports?.["./schema"]).toBe("./src/schema/index.ts");
      const billingSchema = content(files, "packages/billing/src/schema/billing.ts");
      expect(billingSchema).toContain('from "@repo/database/schema"');
      expect(billingSchema).not.toContain('from "@repo/database"');

      const analyticsManifest = JSON.parse(content(files, "packages/analytics/package.json")) as {
        scripts?: Record<string, string>;
        dependencies?: Record<string, string>;
      };
      expect(analyticsManifest.dependencies?.["server-only"]).toBeDefined();
      expect(analyticsManifest.scripts?.test).toContain("--conditions=react-server");
      expect(analyticsManifest.scripts?.test).toContain("--preload ../../scripts/test-env.ts");
      const analyticsRoot = content(files, "packages/analytics/src/index.ts");
      expect(analyticsRoot).not.toContain('from "./config"');
      expect(analyticsRoot).not.toContain('from "./server/');
      expect(analyticsRoot).not.toContain("export * as client");
      const analyticsServer = content(files, "packages/analytics/src/server/index.ts");
      expect(analyticsServer.startsWith('import "server-only";\n')).toBe(true);
      expect(analyticsServer).toContain('from "../config"');
      expect(content(files, "packages/analytics/tests/server-barrel.test.ts")).toContain(
        "isAnalyticsEnabled",
      );

      const emailManifest = JSON.parse(content(files, "packages/email/package.json")) as {
        exports?: Record<string, string>;
        scripts?: Record<string, string>;
      };
      expect(emailManifest.exports?.["./templates"]).toBe("./src/index.ts");
      expect(emailManifest.exports?.["./server"]).toBe("./src/server.ts");
      expect(emailManifest.scripts?.test).toContain("--conditions=react-server");
      expect(emailManifest.scripts?.test).toContain("--preload ../../scripts/test-env.ts");
      const emailRoot = content(files, "packages/email/src/index.ts");
      expect(emailRoot).toContain("EmailLayout");
      expect(emailRoot).not.toContain("sendEmail");
      expect(emailRoot).not.toContain("constants");
      expect(emailRoot).not.toContain("server-only");
      const emailServer = content(files, "packages/email/src/server.ts");
      expect(emailServer.startsWith('import "server-only";\n')).toBe(true);
      expect(emailServer).toContain("sendEmail");
      const authServer = content(files, "packages/auth/src/server.ts");
      expect(authServer).toContain('from "@repo/email/server"');
      expect(authServer).not.toContain('from "@repo/email"');
      expect(content(files, "packages/email/tests/server-barrel.test.ts")).toContain(
        "noreply@example.test",
      );
    });
  }

  test("the server-test preload scrubs inherited production-looking credentials", () => {
    const files = generated(["web"]);
    const directory = mkdtempSync(join(tmpdir(), "ghostinit-test-env-"));
    const preload = join(directory, "test-env.ts");
    const probe = join(directory, "probe.ts");
    const decoder = new TextDecoder();

    try {
      writeFileSync(preload, content(files, "scripts/test-env.ts"));
      writeFileSync(
        probe,
        `console.log(JSON.stringify({
  nodeEnv: process.env.NODE_ENV,
  databaseUrl: process.env.DATABASE_URL,
  authSecret: process.env.BETTER_AUTH_SECRET,
  googleSecret: process.env.GOOGLE_CLIENT_SECRET,
  stripeSecret: process.env.STRIPE_SECRET_KEY,
  s3Secret: process.env.S3_SECRET_ACCESS_KEY,
  publicLeak: process.env.EXPO_PUBLIC_VENDOR_SECRET ?? null,
  bunCache: process.env.BUN_INSTALL_CACHE_DIR,
}));\n`,
      );
      const result = Bun.spawnSync({
        cmd: [process.execPath, "--preload", preload, probe],
        cwd: directory,
        env: {
          ...process.env,
          NODE_ENV: "production",
          DATABASE_URL: "postgresql://production.example.invalid/live",
          BETTER_AUTH_SECRET: "production-auth-secret-that-must-not-survive",
          GOOGLE_CLIENT_SECRET: "production-google-secret",
          STRIPE_SECRET_KEY: "sk_live_production_secret",
          S3_SECRET_ACCESS_KEY: "production-s3-secret",
          EXPO_PUBLIC_VENDOR_SECRET: "production-public-secret",
          BUN_INSTALL_CACHE_DIR: "D:\\test-cache-marker",
        },
        stdout: "pipe",
        stderr: "pipe",
      });
      expect(result.exitCode, decoder.decode(result.stderr)).toBe(0);
      expect(JSON.parse(decoder.decode(result.stdout).trim())).toEqual({
        nodeEnv: "test",
        databaseUrl: "postgresql://ghostinit_test:ghostinit_test@127.0.0.1:1/ghostinit_test",
        authSecret: "ghostinit-test-only-auth-secret-0123456789abcdef",
        googleSecret: "REPLACE_WITH_TEST_GOOGLE_CLIENT_SECRET",
        stripeSecret: "sk_test_ghostinit_test_only",
        s3Secret: "REPLACE_WITH_TEST_S3_SECRET_ACCESS_KEY",
        publicLeak: null,
        bunCache: "D:\\test-cache-marker",
      });

      const serverSchema = content(files, "packages/config/src/server-schema.ts");
      expect(serverSchema).toContain("POSTGRES_PASSWORD: z.string().min(1)");
      expect(serverSchema).toContain("BETTER_AUTH_SECRET: z.string().min(32)");
      expect(serverSchema).toContain("BETTER_AUTH_URL: z.string().url()");
    } finally {
      const tempRoot = resolve(tmpdir());
      const resolvedDirectory = resolve(directory);
      const descendant = relative(tempRoot, resolvedDirectory);
      const safeToRemove =
        descendant.length > 0 &&
        !descendant.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) &&
        descendant !== ".." &&
        !isAbsolute(descendant);
      if (safeToRemove) {
        rmSync(resolvedDirectory, { recursive: true, force: true });
      }
    }
  });
});
