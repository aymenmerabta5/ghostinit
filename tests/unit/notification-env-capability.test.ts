import { afterAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { ProjectConfig } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";

const roots: string[] = [];
const zodUrl = pathToFileURL(resolve(import.meta.dir, "../../node_modules/zod/index.js")).href;

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function generatedEnv(
  mode: "monorepo" | "single",
  framework: "nextjs" | "tanstack-start",
  notifications: boolean,
): { schema: string; runtime: string } {
  const files = generateProjectFiles(
    {
      name: `notification-env-${mode}-${framework}`,
      runtime: "bun",
      version: "0.1.0",
      mode,
      preset: "custom",
      auth: true,
      api: true,
      email: false,
      analytics: false,
      notifications,
      billing: [],
      features: [],
      database: "postgres",
      framework,
      apps: ["web"],
    } as ProjectConfig,
    { dryRun: true },
  );
  const base = mode === "monorepo" ? "packages/config/src" : "src/lib/env";
  const schemaPath = `${base}/server-schema.ts`;
  const runtimePath = `${base}/server.ts`;
  const schema = files.find((file) => file.path === schemaPath)?.content;
  const runtime = files.find((file) => file.path === runtimePath)?.content;
  if (!schema || !runtime) {
    throw new Error(`Generated environment modules are missing: ${schemaPath}, ${runtimePath}`);
  }
  return { schema, runtime };
}

function runnableEnv(content: { schema: string; runtime: string }): string {
  const schema = content.schema.replace(
    /^import \{ z \} from ["']zod["'];$/m,
    `import { z } from ${JSON.stringify(zodUrl)};`,
  );
  const runtime = content.runtime
    .replace(
      /^import \{ createEnv \} from ["'][^"']+["'];$/m,
      `function createEnv(options) {
  return z.object({ ...(options.server ?? {}), ...(options.client ?? {}) }).parse(options.runtimeEnv);
}`,
    )
    .replace(/^import \{ serverSchema \} from ["'].+server-schema(?:\.js)?["'];$/m, "");
  return `${schema}\n${runtime}`;
}

function executeEnvPair(disabled: string, enabled: string) {
  const root = mkdtempSync(resolve(tmpdir(), "ghostinit-notification-env-"));
  roots.push(root);
  const disabledPath = resolve(root, "disabled.ts");
  const enabledPath = resolve(root, "enabled.ts");
  const runnerPath = resolve(root, "runner.ts");
  writeFileSync(disabledPath, runnableEnv(disabled));
  writeFileSync(enabledPath, runnableEnv(enabled));
  const enabledUrl = pathToFileURL(enabledPath).href;
  writeFileSync(
    runnerPath,
    `delete process.env.NOTIFICATION_TOKEN_ENCRYPTION_KEY;
const disabled = (await import(${JSON.stringify(pathToFileURL(disabledPath).href)})).env;
let missingError = "";
try {
  await import(${JSON.stringify(`${enabledUrl}?missing`)});
} catch (error) {
  missingError = error instanceof Error ? error.message : String(error);
}
process.stdout.write(JSON.stringify({ disabled, missingError }));
`,
  );
  const environment: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    TEMP: process.env.TEMP,
    TMP: process.env.TMP,
    NODE_ENV: "test",
    POSTGRES_PASSWORD: "local-test-password",
    BETTER_AUTH_SECRET: "s".repeat(32),
    BETTER_AUTH_URL: "http://localhost:3000",
  };
  return spawnSync(process.execPath, [runnerPath], {
    cwd: root,
    encoding: "utf8",
    env: environment,
    shell: false,
    timeout: 30_000,
    windowsHide: true,
  });
}

describe("capability-aware notification environment", () => {
  for (const mode of ["monorepo", "single"] as const) {
    for (const framework of ["nextjs", "tanstack-start"] as const) {
      test(`${mode}/${framework} omits the key when disabled and requires it when enabled`, () => {
        const disabled = generatedEnv(mode, framework, false);
        expect(`${disabled.schema}\n${disabled.runtime}`).not.toContain(
          "NOTIFICATION_TOKEN_ENCRYPTION_KEY",
        );
        const enabled = generatedEnv(mode, framework, true);
        expect(enabled.schema).toContain(
          "NOTIFICATION_TOKEN_ENCRYPTION_KEY: z.string().regex(/^[A-Za-z0-9_-]{43}$/)",
        );
        expect(enabled.runtime).toContain(
          "NOTIFICATION_TOKEN_ENCRYPTION_KEY: process.env.NOTIFICATION_TOKEN_ENCRYPTION_KEY",
        );
        const startup = executeEnvPair(disabled, enabled);
        expect(startup.status, `${startup.stdout}\n${startup.stderr}`).toBe(0);
        const parsed = JSON.parse(startup.stdout) as {
          disabled: Record<string, unknown>;
          missingError: string;
        };
        expect(parsed.disabled).not.toHaveProperty("NOTIFICATION_TOKEN_ENCRYPTION_KEY");
        expect(parsed.missingError).toContain("NOTIFICATION_TOKEN_ENCRYPTION_KEY");
      });
    }
  }
});
