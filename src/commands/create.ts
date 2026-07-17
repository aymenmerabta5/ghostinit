/**
 * ghostinit create <name> implementation.
 */

import { join } from "node:path";
import { existsSync } from "node:fs";
import { rmdir, readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { ExitCode, ValidationError, ConflictError } from "../lib/errors.js";
import { projectConfigSchema } from "../lib/config.js";
import { FsTransaction } from "../lib/fs.js";
import { acquireLock } from "../lib/lock.js";
import { checkGitStatus, assertCleanGit } from "../lib/git.js";
import { saveState, validateStateCompatibility, loadState } from "../lib/state.js";
import { relativeChecksum } from "../lib/checksum.js";
import { generateProjectFiles } from "../templates/default.js";
import { envelope, printJson } from "../lib/json.js";
import { validateArtifactName } from "../lib/reserved.js";
import type { GlobalOptions } from "./types.js";

function validateProjectName(name: string): void {
  if (!name || name.length === 0) {
    throw new ValidationError("Project name is required");
  }
  const result = validateArtifactName(name, "project name");
  if (!result.valid) {
    throw new ValidationError(result.reason);
  }
}

function runFormat(cwd: string, runtime: "node" | "bun"): Promise<void> {
  return new Promise((resolve, reject) => {
    const cmd = runtime === "bun" ? "bunx" : "npx";
    const child = spawn(cmd, ["oxfmt", "--write", "."], { cwd, stdio: "ignore" });
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} oxfmt exited with code ${code}`));
    });
  });
}

function buildInstallEnv(): NodeJS.ProcessEnv {
  // Only pass through variables required for the package manager to function.
  // Never forward ambient secrets (tokens, auth keys, database URLs) to
  // post-install scripts.
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
  ]);

  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!allowed.has(key)) continue;
    if (value !== undefined) {
      env[key] = value;
    }
  }

  // Ensure NODE_ENV defaults to development so package scripts behave predictably.
  env.NODE_ENV = env.NODE_ENV ?? "development";
  return env;
}

function runInstall(cwd: string, runtime: "node" | "bun"): Promise<void> {
  const cmd = runtime === "bun" ? "bun" : "npm";
  const args = runtime === "bun" ? ["install"] : ["install"];
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: "inherit", env: buildInstallEnv() });
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} install exited with code ${code}`));
    });
  });
}

export async function createCommand(args: string[], options: GlobalOptions): Promise<number> {
  const start = Date.now();
  const name = args[0];
  validateProjectName(name ?? "");

  const projectName = name as string;
  const projectRoot = join(options.cwd, projectName);

  const config = projectConfigSchema.parse({
    name: projectName,
    runtime: options.runtime,
    version: "0.1.0",
    generatedAt: new Date().toISOString(),
  });

  if (existsSync(projectRoot) && !options.force) {
    throw new ConflictError(`Target directory already exists: ${projectRoot}`);
  }

  const gitStatus = await checkGitStatus(projectRoot, options.logger);
  assertCleanGit(gitStatus, options.force, options.logger);

  const { release } = await acquireLock(projectRoot, options.logger, { force: options.force });
  const tx = new FsTransaction(projectRoot);

  let filesWritten = 0;
  let installFailed = false;

  try {
    const files = generateProjectFiles(config, { dryRun: options.dryRun });
    const checksums = [];

    for (const file of files) {
      await tx.write(file.path, file.content);
    }

    if (options.dryRun) {
      // Ensure no real secrets leak through checksums even during dry-run.
      // Dry-run content already uses placeholder values; no extra action required.
      await tx.rollback();
      filesWritten = tx.stagedPaths.length;
      // Release lock before rmdir so the directory can be removed if empty.
      await release();
      try {
        await rmdir(projectRoot);
      } catch {
        // Directory not empty or already removed; leave it.
      }
    } else {
      const { written } = await tx.commit();
      filesWritten = written.length;

      for (const relPath of written) {
        const content = await readFile(join(projectRoot, relPath), "utf-8");
        checksums.push(relativeChecksum(projectRoot, relPath, content));
      }

      const modules: string[] = ["identity"];
      validateStateCompatibility(await loadState(projectRoot), config);
      await saveState(projectRoot, config, checksums, modules, []);
    }

    if (!options.dryRun) {
      options.logger.warn(
        ".env.local was generated with local development secrets and must not be committed. It is already gitignored.",
      );
    }

    if (!options.dryRun && !options.noInstall) {
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
    } else if (!options.dryRun && options.noInstall) {
      // Skip formatting when dependency installation was skipped; the tools
      // may not be available until the user runs install.
      options.logger.info("Skipping format because --no-install was used");
    }

    // Refresh checksums after formatting so the generated state matches the
    // files on disk and future mutation commands do not report false drift.
    if (!options.dryRun && !installFailed) {
      const finalState = await loadState(projectRoot);
      if (finalState) {
        const refreshed = [];
        for (const relPath of Object.keys(finalState.checksums)) {
          try {
            const content = await readFile(join(projectRoot, relPath), "utf-8");
            refreshed.push(relativeChecksum(projectRoot, relPath, content));
          } catch {
            // File removed after generation; keep the existing checksum.
          }
        }
        await saveState(projectRoot, config, refreshed, finalState.modules, finalState.procedures);
      }
    }

    if (options.json) {
      printJson(
        envelope({
          success: !installFailed,
          exitCode: installFailed ? ExitCode.GENERATION_ERROR : ExitCode.OK,
          data: { projectName, projectRoot, filesWritten, installFailed },
          command: "create",
          durationMs: Date.now() - start,
        }),
      );
    }

    return installFailed ? ExitCode.GENERATION_ERROR : ExitCode.OK;
  } catch (error) {
    try {
      await tx.rollback();
    } catch {
      // Best-effort rollback.
    }
    throw error;
  } finally {
    await release();
  }
}
