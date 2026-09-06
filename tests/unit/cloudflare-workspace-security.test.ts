import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  cloudflarePlan,
  generatedContent,
  testEnvironment,
} from "../helpers/cloudflare-runtime-fixture.js";

const roots: string[] = [];

function write(root: string, path: string, content: string): void {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content, "utf8");
}

function fixture(): { root: string; script: string } {
  const plan = cloudflarePlan({
    database: "none",
    framework: "nextjs",
    mode: "monorepo",
    overrides: { apps: ["web", "mobile", "desktop"], withApi: false },
  });
  const root = mkdtempSync(join(tmpdir(), "ghostinit-cloudflare-workspace-"));
  roots.push(root);
  for (const directory of ["apps/web", "apps/mobile", "apps/desktop"]) {
    mkdirSync(join(root, directory), { recursive: true });
  }
  write(
    root,
    "scripts/cloudflare-workspace.mjs",
    generatedContent(plan, "scripts/cloudflare-workspace.mjs"),
  );
  write(
    root,
    "vendor/dotenv/package.json",
    JSON.stringify({ name: "dotenv", version: "0.0.0", type: "module", exports: "./index.mjs" }),
  );
  write(root, "vendor/dotenv/index.mjs", "export function parse() { return {}; }\n");
  write(
    root,
    "vendor/turbo/package.json",
    JSON.stringify({
      name: "turbo",
      version: "0.0.0",
      type: "module",
      bin: { turbo: "./index.mjs" },
    }),
  );
  write(
    root,
    "vendor/turbo/index.mjs",
    'import { writeFileSync } from "node:fs"; writeFileSync("turbo-ran", "yes\\n");\n',
  );
  write(
    root,
    "package.json",
    JSON.stringify({
      name: "cloudflare-workspace-security-fixture",
      private: true,
      dependencies: { dotenv: "file:vendor/dotenv", turbo: "file:vendor/turbo" },
    }),
  );
  const installed = spawnSync(process.execPath, ["install", "--offline", "--ignore-scripts"], {
    cwd: root,
    encoding: "utf8",
    env: testEnvironment(),
    windowsHide: true,
  });
  if (installed.status !== 0) throw new Error(`${installed.stdout}${installed.stderr}`);
  return { root, script: join(root, "scripts/cloudflare-workspace.mjs") };
}

function run(root: string, script: string): ReturnType<typeof spawnSync> {
  return spawnSync(process.execPath, [script, "build"], {
    cwd: root,
    encoding: "utf8",
    env: testEnvironment({
      DESKTOP_API_URL: "https://desktop.example.test",
      EXPO_PUBLIC_APP_URL: "https://mobile.example.test",
      VITE_APP_URL: "https://desktop.example.test",
    }),
    windowsHide: true,
  });
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("Cloudflare native workspace environment boundary", () => {
  test("rejects root, app-local, case-variant, linked, and non-file runtime dotenv entries", () => {
    const { root, script } = fixture();
    const cases = [
      ".ENV.PRODUCTION.LOCAL",
      "apps/mobile/.env.local",
      "apps/desktop/.env.production",
    ] as const;
    for (const path of cases) {
      const target = join(root, path);
      if (path.endsWith(".env.local"))
        symlinkSync(join(root, "missing-env-source"), target, "file");
      else if (path.endsWith(".env.production")) mkdirSync(target);
      else writeFileSync(target, "PRIVATE_NATIVE_TOKEN=must-not-load\n", "utf8");

      const result = run(root, script);
      expect(result.status, path).not.toBe(0);
      expect(`${result.stdout}${result.stderr}`, path).toContain(path.replaceAll("\\", "/"));
      expect(existsSync(join(root, "turbo-ran")), path).toBe(false);
      rmSync(target, { recursive: true, force: true });
    }
  });

  test("allows documentation-only dotenv variants and reaches the fixed Turbo command", () => {
    const { root, script } = fixture();
    for (const path of [
      ".env.template",
      "apps/mobile/.env.production.example",
      "apps/desktop/.env.staging.secrets.template",
    ]) {
      write(root, path, "DOCUMENTED=REPLACE_WITH_VALUE\n");
    }

    const result = run(root, script);
    expect(result.status, `${result.stdout}${result.stderr}`).toBe(0);
    expect(existsSync(join(root, "turbo-ran"))).toBe(true);
  });
});
