import { afterEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, relative } from "node:path";
import { resolveCreateConfig } from "../../src/commands/create/resolution.js";
import { runSupervisedCommand } from "../../src/commands/create/installer.js";
import { FsTransaction } from "../../src/lib/fs.js";
import { buildProjectGenerationPlan, generateProjectFiles } from "../../src/templates/default.js";
import type { TemplateFile } from "../../src/templates/shared.js";
import { frontendOwnershipLintFiles } from "../../src/templates/tooling/frontend-lint.js";
import { createTemporaryWorkspace } from "../helpers/temporary-workspace.js";

type Target = "mobile" | "desktop";
type Runtime = "bun" | "node";
interface Manifest {
  scripts: Record<string, string>;
  [field: string]: unknown;
}
const roots: string[] = [];
const generated = new Map<string, TemplateFile[]>();

afterEach(async () => {
  for (const root of roots.splice(0)) {
    const child = relative(tmpdir(), root);
    if (
      !child ||
      child.startsWith("..") ||
      isAbsolute(child) ||
      !basename(root).startsWith("ghostinit-single-native-ownership-")
    )
      throw new Error("Refusing to remove an unverified lint fixture");
    await rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
});

function files(target: Target, runtime: Runtime): TemplateFile[] {
  const key = `${target}/${runtime}`;
  const cached = generated.get(key);
  if (cached) return cached;
  const resolution = resolveCreateConfig({
    name: "single-native-lint",
    mode: "single",
    runtime,
    framework: "nextjs",
    database: "none",
    databaseWasExplicit: true,
    preset: "frontend",
    apps: [target],
    billing: [],
    features: [],
    cache: "none",
    deploy: "none",
    withAuth: false,
    withApi: false,
  });
  if (!resolution.ok) throw new Error(resolution.message);
  const output = generateProjectFiles(resolution.config, { dryRun: true });
  generated.set(key, output);
  return output;
}

function manifest(output: readonly TemplateFile[]): Manifest {
  const root = output.find((file) => file.path === "package.json");
  if (!root) throw new Error("Missing emitted single/native manifest");
  return JSON.parse(root.content) as Manifest;
}

function assertCanonicalRuntime(output: readonly TemplateFile[]): void {
  for (const expected of frontendOwnershipLintFiles()) {
    const emitted = output.find((file) => file.path === expected.path);
    expect(
      emitted,
      `Missing canonical frontend runtime dependency: ${expected.path}`,
    ).toBeDefined();
    expect(
      emitted?.content === expected.content,
      `Canonical frontend runtime bytes changed: ${expected.path}`,
    ).toBe(true);
  }
}

async function fixture(target: Target, runtime: Runtime) {
  const view =
    target === "mobile"
      ? "src/features/payments/components/receipt-view.tsx"
      : "src/renderer/features/payments/components/receipt-view.tsx";
  return fixtureFiles(files(target, runtime), [view]);
}

async function fixtureFiles(output: readonly TemplateFile[], views: readonly string[]) {
  const root = createTemporaryWorkspace("ghostinit-single-native-ownership-");
  roots.push(root);
  const packageJson = manifest(output);
  const scripts = { ...packageJson.scripts };
  // Exercise the emitted CI script graph without an unrelated framework install.
  // The architecture command and every checker file remain exactly generated.
  scripts.lint = "bun scripts/controlled-quality-leaf.cjs";
  scripts.typecheck = "bun scripts/controlled-quality-leaf.cjs";
  const transaction = new FsTransaction(root);
  await transaction.write("package.json", JSON.stringify({ ...packageJson, scripts }));
  for (const file of output.filter(
    (file) =>
      file.path.startsWith("scripts/") ||
      /^apps\/[^/]+\/package\.json$/.test(file.path) ||
      file.path === "tooling/frontend-ownership-policy.json" ||
      file.path === "bunfig.toml",
  ))
    await transaction.write(file.path, file.content);
  await transaction.write(
    "scripts/controlled-quality-leaf.cjs",
    'console.log("Controlled non-architecture leaf executed");\n',
  );
  for (const view of views)
    await transaction.write(
      view,
      "export function ReceiptView({ label }: { label: string }) { return label; }\n",
    );
  await transaction.commit();
  return { root, view: views[0]!, scripts, output };
}

async function lintAll(root: string, script: "lint:all" | "lint:architecture" = "lint:all") {
  let stdout = "";
  let stderr = "";
  const result = await runSupervisedCommand({
    command: process.execPath,
    argv: ["run", script],
    cwd: root,
    env: { ...process.env, CI: "1", NODE_PATH: join(process.cwd(), "node_modules") },
    label: `generated ${script} dispatch`,
    timeoutMs: 30_000,
    onStdout: (chunk) => {
      stdout += chunk.toString();
    },
    onStderr: (chunk) => {
      stderr += chunk.toString();
    },
  });
  expect(result.cleanupVerified).toBe(true);
  expect(result.timedOut).toBe(false);
  expect(result.signal).toBeNull();
  return { ...result, stdout, stderr };
}

describe("single/frontend native lint ownership wiring", () => {
  for (const framework of ["nextjs", "tanstack-start"] as const) {
    test(`auth-off single ${framework} preserves canonical frontend runtime files and bytes`, () => {
      const result = resolveCreateConfig({
        name: "single-web-lint",
        mode: "single",
        runtime: "bun",
        framework,
        database: "none",
        databaseWasExplicit: true,
        preset: "frontend",
        apps: ["web"],
        billing: [],
        features: [],
        cache: "none",
        deploy: "none",
        withAuth: false,
        withApi: false,
      });
      if (!result.ok) throw new Error(result.message);
      assertCanonicalRuntime(generateProjectFiles(result.config, { dryRun: true }));
    });
  }
  for (const target of ["mobile", "desktop"] as const) {
    for (const runtime of ["bun", "node"] as const) {
      test(`${target}/${runtime} declares a fail-closed size and ownership chain reachable from lint:all`, () => {
        const output = files(target, runtime);
        const scripts = manifest(output).scripts;
        expect(output.some((file) => file.path === "scripts/check-feature-folder.cjs")).toBe(true);
        expect(output.some((file) => file.path === "scripts/check-frontend-ownership.cjs")).toBe(
          true,
        );
        assertCanonicalRuntime(output);
        expect(scripts["lint:architecture"]).toBe(
          "bun scripts/check-feature-folder.cjs && bun scripts/check-frontend-ownership.cjs",
        );
        expect(scripts["lint:all"]).toMatch(/(?:^|&&)\s*bun run lint:architecture\s*(?:&&|$)/);
      });

      test(`${target}/${runtime} CI's lint:all rejects a planted bad view and recovers after restoration`, async () => {
        const { root, view, scripts, output } = await fixture(target, runtime);
        expect(scripts["lint:all"]).toBe(manifest(output).scripts["lint:all"]);
        expect(scripts["lint:architecture"]).toBe(manifest(output).scripts["lint:architecture"]);
        const valid = await lintAll(root);
        expect(valid.exitCode, valid.stdout + valid.stderr).toBe(0);
        const transaction = new FsTransaction(root);
        await transaction.write(
          view,
          'import { useEffect } from "react"; export function ReceiptView() { useEffect(() => { void fetch("/api/private-receipt"); }, []); return null; }\n',
        );
        await transaction.commit();
        const invalid = await lintAll(root);
        expect(invalid.exitCode, invalid.stdout + invalid.stderr).not.toBe(0);
        expect(invalid.stderr).toContain("frontend-remote-owner");
        expect(invalid.stderr).toContain(view);
        const restore = new FsTransaction(root);
        await restore.write(
          view,
          "export function ReceiptView({ label }: { label: string }) { return label; }\n",
        );
        await restore.commit();
        const restored = await lintAll(root);
        expect(restored.exitCode, restored.stdout + restored.stderr).toBe(0);
        expect(restored.stdout).toContain("Frontend ownership check passed");
      }, 100_000);
    }
  }
});

describe("monorepo frontend tooling survives capability filtering", () => {
  for (const framework of ["nextjs", "tanstack-start"] as const) {
    test(`all-off ${framework} preserves canonical runtime and checks every app audience`, async () => {
      const result = resolveCreateConfig({
        name: "monorepo-tooling-proof",
        mode: "monorepo",
        runtime: "bun",
        framework,
        database: "none",
        databaseWasExplicit: true,
        preset: "custom",
        apps: ["web", "mobile", "desktop"],
        billing: [],
        features: [],
        cache: "none",
        deploy: "none",
        withAuth: false,
        withApi: false,
        withEmail: false,
        withAnalytics: false,
        withEve: false,
        withI18n: false,
        withPdf: false,
        withMessaging: false,
        withStorage: false,
        withNotifications: false,
        featureFlags: "none",
        withJobs: false,
      });
      if (!result.ok) throw new Error(result.message);
      expect(result.resolvedConfig.enabledCapabilities).toEqual([]);
      const output = buildProjectGenerationPlan(result.resolvedConfig, {
        desiredConfig: result.desiredConfig,
      }).files.map((file) => ({ path: file.physicalPath, content: file.content }));
      assertCanonicalRuntime(output);
      const views = [
        "apps/web/src/features/payments/components/receipt-view.tsx",
        "apps/mobile/src/features/payments/components/receipt-view.tsx",
        "apps/desktop/src/renderer/features/payments/components/receipt-view.tsx",
      ];
      const { root, scripts } = await fixtureFiles(output, views);
      expect(scripts["lint:architecture"]).toBe(
        "bun scripts/check-feature-folder.cjs && bun scripts/check-frontend-ownership.cjs",
      );
      const valid = await lintAll(root, "lint:architecture");
      expect(valid.exitCode, valid.stdout + valid.stderr).toBe(0);
      for (const view of views) {
        const transaction = new FsTransaction(root);
        await transaction.write(
          view,
          'import { useEffect } from "react"; export function ReceiptView() { useEffect(() => { void fetch("/api/private-receipt"); }, []); return null; }\n',
        );
        await transaction.commit();
        const invalid = await lintAll(root, "lint:architecture");
        expect(invalid.exitCode, invalid.stdout + invalid.stderr).not.toBe(0);
        expect(invalid.stderr).toContain("frontend-remote-owner");
        expect(invalid.stderr).toContain(view);
        const restore = new FsTransaction(root);
        await restore.write(
          view,
          "export function ReceiptView({ label }: { label: string }) { return label; }\n",
        );
        await restore.commit();
        const restored = await lintAll(root, "lint:architecture");
        expect(restored.exitCode, restored.stdout + restored.stderr).toBe(0);
      }
    }, 100_000);
  }
});
