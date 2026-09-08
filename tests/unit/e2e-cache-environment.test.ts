import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { projectConfigSchema } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";
import { serverSchemaContent } from "../../src/templates/packages/config-content.js";

type SchemaField = { safeParse(value: unknown): { success: boolean; data?: unknown } };

function loadUpstashSchemas(hasCache: boolean): {
  UPSTASH_REDIS_REST_URL: SchemaField;
  UPSTASH_REDIS_REST_TOKEN: SchemaField;
} {
  const source = serverSchemaContent({
    database: "none",
    hasEmail: false,
    hasCache,
    hasNotifications: false,
    hasEve: false,
  })
    .replace(/^import .*;\r?\n/gm, "")
    .replace(/^export /gm, "");
  const javascript = new Bun.Transpiler({ loader: "ts" }).transformSync(source);
  return new Function("z", `${javascript}; return serverSchema;`)(z) as {
    UPSTASH_REDIS_REST_URL: SchemaField;
    UPSTASH_REDIS_REST_TOKEN: SchemaField;
  };
}

describe("cache-enabled production E2E configuration", () => {
  test("keeps vendor placeholders and strict generated runtime configuration", () => {
    const files = generateProjectFiles(
      projectConfigSchema.parse({
        name: "cache-e2e-regression",
        runtime: "bun",
        mode: "monorepo",
        framework: "nextjs",
        database: "postgres",
        apps: ["web"],
        preset: "custom",
        cache: "redis",
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
        messaging: false,
        storage: false,
        notifications: false,
        featureFlags: "none",
        jobs: false,
      }),
      { dryRun: true },
    );
    const local = files.find(({ path }) => path === ".env.local")?.content ?? "";
    const example = files.find(({ path }) => path === ".env.example")?.content ?? "";
    const serverSchema =
      files.find(({ path }) => path === "packages/config/src/server-schema.ts")?.content ?? "";

    expect(local).toContain("UPSTASH_REDIS_REST_URL=REPLACE_WITH_UPSTASH_REDIS_REST_URL");
    expect(local).toContain("UPSTASH_REDIS_REST_TOKEN=REPLACE_WITH_UPSTASH_REDIS_REST_TOKEN");
    expect(example).toContain("UPSTASH_REDIS_REST_URL=REPLACE_WITH_UPSTASH_REDIS_REST_URL");
    expect(serverSchema).toContain("UPSTASH_REDIS_REST_URL: z.string().max(2_048).url()");
    expect(serverSchema).toContain("UPSTASH_REDIS_REST_TOKEN: z.string().min(1).max(4_096)");
    expect(serverSchema).toContain('!value.startsWith("REPLACE_WITH")');

    expect(z.string().url().safeParse("REPLACE_WITH_UPSTASH_REDIS_REST_URL").success).toBe(false);
  });

  test("treats placeholders as absent only when the cache package is not selected", () => {
    const optional = loadUpstashSchemas(false);
    const placeholderUrl = optional.UPSTASH_REDIS_REST_URL.safeParse(
      "REPLACE_WITH_UPSTASH_REDIS_REST_URL",
    );
    const placeholderToken = optional.UPSTASH_REDIS_REST_TOKEN.safeParse(
      "REPLACE_WITH_UPSTASH_REDIS_REST_TOKEN",
    );
    expect(placeholderUrl).toMatchObject({ success: true, data: undefined });
    expect(placeholderToken).toMatchObject({ success: true, data: undefined });
    expect(optional.UPSTASH_REDIS_REST_URL.safeParse("https://redis.example.test")).toMatchObject({
      success: true,
      data: "https://redis.example.test",
    });
    expect(optional.UPSTASH_REDIS_REST_TOKEN.safeParse("configured-token")).toMatchObject({
      success: true,
      data: "configured-token",
    });

    const required = loadUpstashSchemas(true);
    expect(
      required.UPSTASH_REDIS_REST_URL.safeParse("REPLACE_WITH_UPSTASH_REDIS_REST_URL").success,
    ).toBe(false);
    expect(
      required.UPSTASH_REDIS_REST_TOKEN.safeParse("REPLACE_WITH_UPSTASH_REDIS_REST_TOKEN").success,
    ).toBe(false);
    expect(required.UPSTASH_REDIS_REST_TOKEN.safeParse(" token-with-spaces ").success).toBe(false);
  });

  test("raw monorepo and single schemas inline placeholder normalization", () => {
    for (const mode of ["monorepo", "single"] as const) {
      const files = generateProjectFiles(
        projectConfigSchema.parse({
          name: `frontend-${mode}`,
          runtime: "bun",
          mode,
          framework: "nextjs",
          database: "none",
          apps: ["web"],
          preset: "frontend",
          cache: "none",
          deploy: "none",
          auth: false,
          api: false,
          email: false,
          analytics: false,
          eve: false,
          i18n: false,
          pdf: false,
          billing: [],
          features: [],
          messaging: false,
          storage: false,
          notifications: false,
          featureFlags: "none",
          jobs: false,
        }),
        { dryRun: true },
      );
      const path =
        mode === "monorepo"
          ? "packages/config/src/server-schema.ts"
          : "src/lib/env/server-schema.ts";
      const schema = files.find((file) => file.path === path)?.content;
      expect(schema, mode).toBeDefined();
      expect(schema, mode).toContain("UPSTASH_REDIS_REST_URL: z.preprocess(");
      expect(schema, mode).not.toContain("unconfiguredUpstashValue");
    }
  });

  test("injects inert cache values and isolated PostgreSQL only into custom-heavy", () => {
    const harness = readFileSync(
      resolve(import.meta.dir, "../integration/e2e-build.test.ts"),
      "utf8",
    );
    const url = harness.match(/UPSTASH_REDIS_REST_URL: "([^"]+)"/)?.[1] ?? "";
    const token = harness.match(/UPSTASH_REDIS_REST_TOKEN: "([^"]+)"/)?.[1] ?? "";
    const scenario = (name: string): string => {
      const start = harness.indexOf(`createProject("${name}"`);
      expect(start).toBeGreaterThanOrEqual(0);
      const end = harness.indexOf("\n  it(", start);
      return harness.slice(start, end < 0 ? harness.length : end);
    };
    const customHeavy = scenario("custom-heavy");

    expect(z.string().url().safeParse(url).success).toBe(true);
    expect(new URL(url).hostname.endsWith(".invalid")).toBe(true);
    expect(token).toContain("NON_CREDENTIAL");
    expect(customHeavy).toContain("environmentOverrides: E2E_REDIS_ENVIRONMENT");
    expect(customHeavy).toContain("isolatedPostgres: true");
    expect(harness.match(/isolatedPostgres: true/g)).toHaveLength(1);
    expect(customHeavy).not.toContain(".env.local");
    expect(harness).toContain("await startIsolatedE2EPostgres()");
    expect(harness).toContain("await pushGeneratedPostgresSchema");
    expect(harness).toContain("await expectPostgresAuthenticationFailureIsFatal");
    expect(harness).toContain("await isolatedPostgres?.close()");
    expect(harness).toContain("...options.environmentOverrides");
    for (const name of ["smoke", "billall", "multi-app"]) {
      expect(scenario(name)).toContain("stockNextLoopback: true");
    }
    expect(harness.match(/stockNextLoopback: true/g)).toHaveLength(3);
    expect(customHeavy).toContain("messagingBoundary: true");
    expect(customHeavy).not.toContain("stockNextLoopback: true");
    const bindIndex = harness.indexOf("await configureNextLoopbackStart(projectRoot)");
    const installIndex = harness.indexOf("const install = await runCommand(");
    expect(bindIndex).toBeGreaterThanOrEqual(0);
    expect(installIndex).toBeGreaterThanOrEqual(0);
    expect(bindIndex).toBeLessThan(installIndex);
    expect(harness).toMatch(/BUILD_TIMEOUT_MS,\s*production\.environment/);
    expect(harness).toContain("probeProductionOutput(projectRoot, label, production, options)");
    expect(harness).toMatch(
      /const running = spawnTracked\(\s*BUN_EXECUTABLE,\s*\["run", "start"\],\s*projectRoot,\s*production\.environment,\s*\);/,
    );
    expect(harness).toMatch(
      /const build = await runCommand\(\s*BUN_EXECUTABLE,\s*\["run", "build"\],\s*projectRoot,\s*BUILD_TIMEOUT_MS,\s*production\.environment,\s*\);/,
    );
    expect(harness).toMatch(
      /const rejectedBuild = await runCommand\(\s*BUN_EXECUTABLE,\s*\["run", "build"\],\s*projectRoot,\s*BUILD_TIMEOUT_MS,\s*production\.environment,\s*\);/,
    );
  });
});
