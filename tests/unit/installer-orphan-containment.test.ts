import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  InstallerContainmentUnavailableError,
  runInstallerCommand,
  runProjectInstall,
  type InstallerDependencies,
} from "../../src/commands/create/installer.js";
import { resolveCreateConfig } from "../../src/commands/create/resolution.js";
import type { GlobalOptions } from "../../src/commands/types.js";
import type { FsTransaction } from "../../src/lib/fs.js";
import { Logger } from "../../src/lib/logger.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
    throw error;
  }
}

function forceKill(pid: number): void {
  if (!Number.isSafeInteger(pid) || pid <= 0) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
    return;
  }
  try {
    process.kill(pid, "SIGKILL");
  } catch {}
}

async function waitForFile(path: string): Promise<void> {
  const deadline = Date.now() + 15_000;
  while (!existsSync(path)) {
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${path}`);
    await Bun.sleep(20);
  }
}

function orphaningCommand(
  marker: string,
  pidFile: string,
  dropScopeEnv: boolean,
  detached = true,
): string {
  const writer = `const fs = require("node:fs"); setInterval(() => fs.writeFileSync(${JSON.stringify(marker)}, String(Date.now())), 30);`;
  const intermediate = `const fs = require("node:fs"); const { spawn } = require("node:child_process"); const env = { ...process.env }; ${dropScopeEnv ? "delete env.GHOSTINIT_INSTALLER_SCOPE_ID;" : ""} const child = spawn(process.execPath, ["-e", ${JSON.stringify(writer)}], { detached: ${String(detached)}, env, stdio: "ignore", windowsHide: true }); child.unref(); fs.writeFileSync(${JSON.stringify(pidFile)}, String(child.pid));`;
  return `const { spawn } = require("node:child_process"); const child = spawn(process.execPath, ["-e", ${JSON.stringify(intermediate)}], { stdio: "ignore", windowsHide: true }); child.once("exit", () => setTimeout(() => process.exit(0), 100));`;
}

async function assertOrphanContained(
  dropScopeEnv: boolean,
  options: { readonly forcePortableFallback?: boolean; readonly detached?: boolean } = {},
): Promise<string[]> {
  const root = mkdtempSync(join(tmpdir(), "ghostinit-installer-orphan-"));
  roots.push(root);
  const marker = join(root, "survivor-write.txt");
  const pidFile = join(root, "survivor.pid");
  const node = Bun.which("node");
  if (!node) throw new Error("node executable was not found");
  let pid = 0;
  const warnings: string[] = [];
  try {
    await runInstallerCommand({
      command: node,
      argv: ["-e", orphaningCommand(marker, pidFile, dropScopeEnv, options.detached ?? true)],
      cwd: root,
      label: "orphan containment probe",
      timeoutMs: 30_000,
      onContainmentFallback: (message) => warnings.push(message),
      ...(options.forcePortableFallback ? { linuxNamespaceResolver: () => undefined } : {}),
    });

    await waitForFile(pidFile);
    pid = Number.parseInt(readFileSync(pidFile, "utf8"), 10);
    rmSync(marker, { force: true });
    await Bun.sleep(350);
    expect(existsSync(marker)).toBe(false);
    expect(processAlive(pid)).toBe(false);
    return warnings;
  } finally {
    forceKill(pid);
  }
}

describe("installer orphan containment", () => {
  test("Windows contains a grandchild after its intermediate ancestry exits", async () => {
    if (process.platform !== "win32") return;
    expect(await assertOrphanContained(true)).toEqual([]);
  }, 60_000);

  test("Linux PID namespaces contain a detached child that drops its scope marker", async () => {
    if (process.platform === "win32") return;
    const warnings: string[] = [];
    const root = mkdtempSync(join(tmpdir(), "ghostinit-installer-namespace-probe-"));
    roots.push(root);
    const node = Bun.which("node");
    if (!node) throw new Error("node executable was not found");
    await runInstallerCommand({
      command: node,
      argv: ["-e", "process.exit(0)"],
      cwd: root,
      label: "namespace availability probe",
      timeoutMs: 30_000,
      onContainmentFallback: (message) => warnings.push(message),
    });
    if (warnings.length > 0) {
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain("starts a new session and removes its scope marker");
      return;
    }
    expect(await assertOrphanContained(true)).toEqual([]);
  }, 60_000);

  test("portable POSIX fallback runs commands and reports its explicit limitation", async () => {
    if (process.platform === "win32") return;
    const warnings = await assertOrphanContained(false, { forcePortableFallback: true });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("process-group and scoped descendant cleanup");
    expect(warnings[0]).toContain("starts a new session and removes its scope marker");
  }, 60_000);

  test("portable POSIX fallback contains a scope-scrubbing child that stays in its group", async () => {
    if (process.platform === "win32") return;
    const warnings = await assertOrphanContained(true, {
      forcePortableFallback: true,
      detached: false,
    });
    expect(warnings).toHaveLength(1);
  }, 60_000);

  test("strict POSIX containment refuses before starting when PID namespaces are unavailable", async () => {
    if (process.platform === "win32") return;
    const root = mkdtempSync(join(tmpdir(), "ghostinit-installer-strict-containment-"));
    roots.push(root);
    const marker = join(root, "command-started.txt");
    const node = Bun.which("node");
    if (!node) throw new Error("node executable was not found");
    await expect(
      runInstallerCommand({
        command: node,
        argv: ["-e", `require("node:fs").writeFileSync(${JSON.stringify(marker)}, "yes")`],
        cwd: root,
        label: "strict containment probe",
        timeoutMs: 30_000,
        requireKernelContainment: true,
        linuxNamespaceResolver: () => undefined,
      }),
    ).rejects.toBeInstanceOf(InstallerContainmentUnavailableError);
    expect(existsSync(marker)).toBe(false);
  });

  test("containment refusal precedes secret materialization and safely discards the candidate", async () => {
    const parent = mkdtempSync(join(tmpdir(), "ghostinit-containment-refusal-"));
    roots.push(parent);
    const projectRoot = join(parent, "project");
    const resolved = resolveCreateConfig({
      name: "containment-refusal",
      runtime: "bun",
      mode: "monorepo",
      framework: "nextjs",
      billing: [],
      features: [],
      database: "postgres",
      databaseWasExplicit: true,
      apps: ["web"],
      preset: "saas",
      cache: "none",
      deploy: "none",
    });
    if (!resolved.ok) throw new Error(resolved.message);
    let candidateRoot = "";
    let materialized = false;
    let released = false;
    const transaction = {
      write: async () => undefined,
      commit: async () => ({ written: ["package.json"] }),
      rollback: async () => ({ success: true, restored: [], removed: [], failures: [] }),
    } as unknown as FsTransaction;
    const options: GlobalOptions = {
      cwd: parent,
      json: false,
      yes: true,
      force: true,
      dryRun: false,
      noInstall: false,
      runtime: "bun",
      check: false,
      logger: new Logger({ quiet: true }),
    };

    await expect(
      runProjectInstall(
        {
          projectName: resolved.config.name,
          projectRoot,
          config: resolved.config,
          desiredConfig: resolved.desiredConfig,
          resolvedConfig: resolved.resolvedConfig,
          options,
          noInstall: false,
          requireAbsentTarget: true,
        },
        {
          checkGitStatus: async () => ({
            isRepo: false,
            dirty: false,
            untracked: [],
            modified: [],
          }),
          assertCleanGit: () => undefined,
          acquireLock: async () => ({
            owner: { pid: process.pid, startTime: new Date().toISOString() },
            release: async () => {
              released = true;
            },
          }),
          createTransaction: (root) => {
            candidateRoot = root;
            return transaction;
          },
          createSecretMaterializer: () => ({
            materialize: async () => {
              materialized = true;
              return { references: [] };
            },
          }),
          runInstall: async () => {
            throw new InstallerContainmentUnavailableError(
              "Windows Job Object setup failed in the injected fixture",
            );
          },
        } as Partial<InstallerDependencies>,
      ),
    ).rejects.toBeInstanceOf(InstallerContainmentUnavailableError);

    expect(materialized).toBe(false);
    expect(candidateRoot).not.toBe("");
    expect(existsSync(candidateRoot)).toBe(false);
    expect(existsSync(projectRoot)).toBe(false);
    expect(released).toBe(true);
  });
});
