import { join } from "node:path";
import { existsSync } from "node:fs";
import { rmdir, readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { FsTransaction } from "../../lib/fs.js";
import { acquireLock } from "../../lib/lock.js";
import { checkGitStatus, assertCleanGit } from "../../lib/git.js";
import { saveState, validateStateCompatibility, loadState } from "../../lib/state.js";
import { relativeChecksum, isDriftTracked } from "../../lib/checksum.js";
import { generateProjectFiles } from "../../templates/default.js";
import type { GlobalOptions } from "../types.js";

function buildInstallEnv(): NodeJS.ProcessEnv {
  const allowed = new Set([
    "PATH",
    "PATHEXT",
    "HOME",
    "USERPROFILE",
    "SystemRoot",
    "SystemDrive",
    "USER",
    "USERNAME",
    "NODE_ENV",
    "TMP",
    "TEMP",
    "TMPDIR",
    "TMP_DIR",
    "TEMP_DIR",
    "ComSpec",
    "SHELL",
    "PWD",
    "LANG",
    "LC_ALL",
    "BUN_INSTALL",
    "NPM_CONFIG_CACHE",
  ]);
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!allowed.has(key)) continue;
    if (value !== undefined) env[key] = value;
  }
  env.NODE_ENV = env.NODE_ENV ?? "development";
  return env;
}

function runInstall(cwd: string, runtime: "node" | "bun"): Promise<void> {
  const cmd = runtime === "bun" ? "bun" : "npm";
  const args = ["install"];
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd,
      stdio: ["ignore", "inherit", "pipe"],
      env: buildInstallEnv(),
    });
    let stderr = "";
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;

    child.stderr?.on("data", (d) => {
      stderr += String(d);
    });

    const timeout = setTimeout(() => {
      timedOut = true;
      try {
        child.kill("SIGTERM");
      } catch {}
      killTimer = setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch {}
      }, 5_000);
      reject(
        new Error(
          `${cmd} install timed out after 300s${stderr ? `: ${stderr.slice(0, 500)}` : ""}`,
        ),
      );
    }, 300_000);

    child.on("error", (err) => {
      clearTimeout(timeout);
      if (killTimer) clearTimeout(killTimer);
      reject(new Error(`${cmd} install failed to spawn: ${err.message}`));
    });

    child.on("close", (code) => {
      clearTimeout(timeout);
      if (killTimer) clearTimeout(killTimer);
      if (timedOut) return;
      if (code === 0) resolve();
      else
        reject(
          new Error(
            `${cmd} install exited with code ${code}${stderr ? `: ${stderr.slice(0, 500)}` : ""}`,
          ),
        );
    });
  });
}

function runFormat(cwd: string, runtime: "node" | "bun"): Promise<void> {
  return new Promise((resolve, reject) => {
    const cmd = runtime === "bun" ? "bunx" : "npx";
    const child = spawn(cmd, ["oxfmt", "--write", "."], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: buildInstallEnv(),
    });
    let stderr = "";
    child.stderr?.on("data", (d) => {
      stderr += String(d);
    });
    const timeout = setTimeout(() => {
      try {
        child.kill("SIGTERM");
      } catch {}
      reject(
        new Error(`${cmd} oxfmt timed out after 120s${stderr ? `: ${stderr.slice(0, 500)}` : ""}`),
      );
    }, 120_000);
    child.on("error", (err) => {
      clearTimeout(timeout);
      reject(new Error(`${cmd} oxfmt failed to spawn: ${err.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve();
      else
        reject(
          new Error(
            `${cmd} oxfmt exited with code ${code}${stderr ? `: ${stderr.slice(0, 500)}` : ""}`,
          ),
        );
    });
  });
}

export interface InstallInput {
  projectName: string;
  projectRoot: string;
  config: ReturnType<typeof import("../../lib/config.js").projectConfigSchema.parse>;
  options: GlobalOptions;
  noInstall: boolean;
}

export interface DryRunFile {
  path: string;
  size: number;
  bytes: number;
}

export async function runProjectInstall(input: InstallInput): Promise<{
  filesWritten: number;
  installFailed: boolean;
  stagedFiles?: DryRunFile[];
  totalBytes?: number;
  isDryRun?: boolean;
}> {
  const { projectRoot, config, options, noInstall } = input;

  const gitStatus = await checkGitStatus(projectRoot, options.logger);
  assertCleanGit(gitStatus, options.force, options.logger);

  const rootPreExisted = existsSync(projectRoot);
  const { release } = await acquireLock(projectRoot, options.logger, { force: options.force });
  const tx = new FsTransaction(projectRoot);

  let filesWritten = 0;
  let installFailed = false;
  let released = false;
  const safeRelease = async () => {
    if (!released) {
      released = true;
      await release();
    }
  };

  try {
    const files = generateProjectFiles(config, { dryRun: options.dryRun });
    const checksums = [];

    for (const file of files) {
      await tx.write(file.path, file.content);
    }

    if (options.dryRun) {
      const staged = tx.getStagedFiles();
      const stagedFiles: DryRunFile[] = staged.map((f) => ({
        path: f.path,
        size: Buffer.byteLength(f.content, "utf-8"),
        bytes: Buffer.byteLength(f.content, "utf-8"),
      }));
      const totalBytes = stagedFiles.reduce((sum, f) => sum + f.bytes, 0);
      await tx.rollback();
      filesWritten = staged.length;
      await safeRelease();
      if (!rootPreExisted) {
        try {
          await rmdir(projectRoot);
        } catch {}
      }
      return { filesWritten, installFailed: false, stagedFiles, totalBytes, isDryRun: true };
    } else {
      const { written } = await tx.commit();
      filesWritten = written.length;

      // Only the sync-owned registries are drift-tracked. Checksumming every
      // generated file meant editing .env.local (or any page) bricked add/sync.
      for (const relPath of written) {
        if (!isDriftTracked(relPath)) continue;
        const content = await readFile(join(projectRoot, relPath), "utf-8");
        checksums.push(relativeChecksum(projectRoot, relPath, content));
      }

      // Modules are generated on disk; discover them rather than hardcoding a
      // static list. The billing domain demonstration (packages/modules/src/billing)
      // was added after the initial "identity" module, and hardcoding meant every
      // fresh project immediately failed `ghostinit sync --check` with DRIFT because
      // the index barrel included `billing` but the state said only `identity`.
      const { readdirSync } = await import("node:fs");
      const { existsSync: existsSyncForCheck } = await import("node:fs");
      let modules: string[] = ["identity"];
      try {
        const modulesDir = join(projectRoot, "packages", "modules", "src");
        if (existsSyncForCheck(modulesDir)) {
          modules = readdirSync(modulesDir, { withFileTypes: true })
            .filter((e) => e.isDirectory())
            .map((e) => e.name)
            .sort();
        }
      } catch {
        modules = ["identity"];
      }
      validateStateCompatibility(await loadState(projectRoot), config);
      await saveState(projectRoot, config, checksums, modules, []);
    }

    if (!options.dryRun) {
      options.logger.warn(
        ".env.local was generated with local development secrets and must not be committed. It is already gitignored.",
      );
    }

    if (!options.dryRun && !noInstall) {
      options.logger.info("Installing dependencies...", { runtime: options.runtime });
      try {
        await runInstall(projectRoot, options.runtime);
        await runFormat(projectRoot, options.runtime);
        options.logger.info("Installation complete");
      } catch (err) {
        installFailed = true;
        options.logger.error(
          `Installation or format step failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    } else if (!options.dryRun && noInstall) {
      options.logger.info("Skipping format because --no-install was used");
    }

    if (!options.dryRun && !installFailed) {
      const finalState = await loadState(projectRoot);
      if (finalState) {
        const refreshed = [];
        for (const relPath of Object.keys(finalState.checksums)) {
          try {
            const content = await readFile(join(projectRoot, relPath), "utf-8");
            refreshed.push(relativeChecksum(projectRoot, relPath, content));
          } catch {}
        }
        await saveState(projectRoot, config, refreshed, finalState.modules, finalState.procedures);
      }
    }

    return { filesWritten, installFailed, isDryRun: false };
  } catch (error) {
    try {
      await tx.rollback();
    } catch {}
    throw error;
  } finally {
    await safeRelease();
  }
}
