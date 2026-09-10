import { afterEach, describe, expect, test } from "bun:test";
import { lstat, rm } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, relative } from "node:path";
import { runtime } from "../../packages/versions/src/index.js";
import { resolveCreateConfig } from "../../src/commands/create/resolution.js";
import { DEPENDENCY_SECURITY_INTEGRITY_PATH } from "../../src/domain/dependency-security/artifacts.js";
import { FsTransaction } from "../../src/lib/fs.js";
import {
  buildInstallEnv,
  resolveCanonicalBunExecutable,
  runSupervisedCommand,
} from "../../src/lib/process-supervisor.js";
import { buildProjectGenerationPlan } from "../../src/templates/default.js";
import { createTemporaryWorkspace } from "../helpers/temporary-workspace.js";

const bareLint = "oxlint --deny-warnings .";
const integrity = "bun " + DEPENDENCY_SECURITY_INTEGRITY_PATH;
const guardedLint = integrity + " && " + bareLint;
const cases = [
  { name: "single Expo", mode: "single", apps: ["mobile"], packageRoot: "" },
  { name: "single desktop", mode: "single", apps: ["desktop"], packageRoot: "" },
  {
    name: "monorepo desktop",
    mode: "monorepo",
    apps: ["web", "desktop"],
    packageRoot: "apps/desktop",
  },
] as const;

interface SmokeFixture {
  readonly root: string;
  readonly packageRoot: string;
  readonly manifestPath: string;
  readonly originalManifest: string;
  currentManifest: string;
  cleanupVerified: boolean;
}
const fixtures: SmokeFixture[] = [];

afterEach(async () => {
  for (const fixture of fixtures.splice(0)) {
    if (!fixture.cleanupVerified) {
      throw new Error(
        "Preserved native smoke fixture after unverified child cleanup: " + fixture.root,
      );
    }
    const root = fixture.root;
    const child = relative(realpathSync.native(tmpdir()), root);
    const entry = await lstat(root);
    if (
      !child ||
      child === ".." ||
      child.startsWith("../") ||
      child.startsWith("..\\") ||
      isAbsolute(child) ||
      !basename(root).startsWith("ghostinit-native-smoke-") ||
      !entry.isDirectory() ||
      entry.isSymbolicLink() ||
      realpathSync.native(root) !== root
    ) {
      throw new Error("Refusing unsafe native smoke fixture cleanup: " + root);
    }
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

async function fixture(selected: (typeof cases)[number]): Promise<SmokeFixture> {
  const resolution = resolveCreateConfig({
    name: "native-smoke-lint",
    runtime: "bun",
    mode: selected.mode,
    framework: "nextjs",
    apps: [...selected.apps],
    database: "none",
    databaseWasExplicit: true,
    billing: [],
    features: [],
    preset: "frontend",
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
  if (!resolution.ok) throw new Error(resolution.message);
  const plan = buildProjectGenerationPlan(resolution.resolvedConfig, {
    desiredConfig: resolution.desiredConfig,
  });
  const prefix = selected.packageRoot ? selected.packageRoot + "/" : "";
  const manifestPath = prefix + "package.json";
  const smokePath = prefix + "tests/smoke.test.ts";
  const files = new Map(plan.files.map(({ physicalPath, content }) => [physicalPath, content]));
  const originalManifest = files.get(manifestPath);
  const smoke = files.get(smokePath);
  const bunfig = files.get("bunfig.toml");
  if (!originalManifest || !smoke || !bunfig)
    throw new Error("Compiled native smoke fixture is incomplete");
  const expectedLint = selected.mode === "single" ? guardedLint : bareLint;
  expect(JSON.parse(originalManifest).scripts.lint).toBe(expectedLint);

  const root = createTemporaryWorkspace("ghostinit-native-smoke-");
  const result: SmokeFixture = {
    root,
    packageRoot: selected.packageRoot,
    manifestPath,
    originalManifest,
    currentManifest: originalManifest,
    cleanupVerified: true,
  };
  fixtures.push(result);
  const transaction = new FsTransaction(root);
  await transaction.write(manifestPath, originalManifest);
  await transaction.write(smokePath, smoke);
  await transaction.write("bunfig.toml", bunfig);
  expect(
    transaction
      .getStagedFiles()
      .map(({ path }) => path)
      .sort(),
  ).toEqual([manifestPath, smokePath, "bunfig.toml"].sort());
  await transaction.commit();
  return result;
}

async function smoke(fixture: SmokeFixture, expectedExitCode: number): Promise<void> {
  let output = "";
  const collect = (chunk: Buffer) => {
    output = (output + chunk.toString("utf8")).slice(-32_000);
  };
  let result: Awaited<ReturnType<typeof runSupervisedCommand>>;
  try {
    result = await runSupervisedCommand(
      {
        command: resolveCanonicalBunExecutable(runtime.bun),
        argv: ["--smol", "test", "tests/smoke.test.ts", "--timeout", "100000"],
        cwd: join(fixture.root, fixture.packageRoot),
        env: buildInstallEnv(join(fixture.root, fixture.packageRoot)),
        label: "compiled native smoke assertion",
        timeoutMs: 100_000,
        onStdout: collect,
        onStderr: collect,
      },
      runtime.bun,
    );
  } catch (error) {
    fixture.cleanupVerified = false;
    throw error;
  }
  fixture.cleanupVerified &&= result.cleanupVerified;
  expect(result.cleanupVerified, output).toBe(true);
  expect(result.timedOut, output).toBe(false);
  expect(result.signal, output).toBeNull();
  expect(result.exitCode, output).toBe(expectedExitCode);
}

async function writeManifest(fixture: SmokeFixture, content: string): Promise<void> {
  const transaction = new FsTransaction(fixture.root);
  await transaction.writeIfUnchanged(fixture.manifestPath, content, fixture.currentManifest);
  await transaction.commit();
  fixture.currentManifest = content;
}

describe("compiled native smoke lint contracts", () => {
  for (const selected of cases) {
    test(selected.name + " executes the exact root or workspace lint expectation", async () => {
      const created = await fixture(selected);
      await smoke(created, 0);
      const tamperedCommands =
        selected.mode === "single"
          ? [
              bareLint,
              "bun scripts/lib/dependency-security-integrity-copy.cjs && " + bareLint,
              bareLint + " && " + integrity,
              integrity + " || true && " + bareLint,
            ]
          : [guardedLint];
      for (const command of tamperedCommands) {
        const manifest = JSON.parse(created.originalManifest);
        manifest.scripts.lint = command;
        await writeManifest(created, JSON.stringify(manifest, null, 2) + "\n");
        await smoke(created, 1);
      }
      await writeManifest(created, created.originalManifest);
      await smoke(created, 0);
    });
  }
});
