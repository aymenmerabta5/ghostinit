#!/usr/bin/env bun
/**
 * Production-grade build pipeline for ghostinit CLI
 *
 * 1. Bun.build bundles src/cli.ts into a verified same-volume staging directory.
 * 2. tsc emits the complete, current declaration graph into that staging directory.
 * 3. The validated stage transactionally replaces dist/ with rollback on failure.
 *
 * Previously: `bun build ... && echo 'export {};' > dist/cli.d.ts` produced a fake stub
 * that breaks Turborepo caching and type-checking. This script uses the proper tsc
 * declaration emitter so dist/cli.d.ts is a real compiler output with source maps.
 */

import { randomUUID } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { embedTemplateSources } from "./embed-template-sources.js";
import { verifyDistClosure } from "./package-contract.js";

const REPO_ROOT = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), ".."));
const DIST_DIR = join(REPO_ROOT, "dist");
const STAGE_PREFIX = ".ghostinit-dist-stage-";
const BACKUP_PREFIX = ".ghostinit-dist-backup-";
const localTsc = [process.execPath, join(REPO_ROOT, "node_modules/typescript/bin/tsc")] as const;
const DEFAULT_RENAME_RETRY_TIMEOUT_MS = 10_000;
const MAX_RENAME_RETRY_DELAY_MS = 1_000;
const TRANSIENT_RENAME_CODES = new Set(["EACCES", "EBUSY", "EPERM"]);
const sleepArray = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));

type ManagedPathKind = "dist" | "stage" | "backup";

function verifyRepoRoot(): void {
  const manifest = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")) as {
    name?: unknown;
  };
  if (manifest.name !== "ghostinit" || !existsSync(join(REPO_ROOT, "src/cli.ts"))) {
    throw new Error(`Refusing to build from unverified repository root: ${REPO_ROOT}`);
  }
  process.chdir(REPO_ROOT);
}

function managedPath(path: string, kind: ManagedPathKind, repositoryRoot = REPO_ROOT): string {
  const root = resolve(repositoryRoot);
  const absolute = resolve(path);
  const name = basename(absolute);
  const validName =
    kind === "dist"
      ? name === "dist"
      : kind === "stage"
        ? name.startsWith(STAGE_PREFIX)
        : name.startsWith(BACKUP_PREFIX);
  if (dirname(absolute) !== root || !validName) {
    throw new Error(`Refusing ${kind} filesystem operation outside the repository: ${absolute}`);
  }
  if (existsSync(absolute) && lstatSync(absolute).isSymbolicLink()) {
    throw new Error(`Refusing ${kind} filesystem operation through a symlink: ${absolute}`);
  }
  return absolute;
}

function removeManagedPath(path: string, kind: ManagedPathKind, repositoryRoot = REPO_ROOT): void {
  const absolute = managedPath(path, kind, repositoryRoot);
  if (existsSync(absolute)) {
    rmSync(absolute, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

export interface RenameRetryOptions {
  readonly timeoutMs?: number;
  readonly now?: () => number;
  readonly sleep?: (delayMs: number) => void;
  readonly rename?: (source: string, target: string) => void;
}

/** Wait out bounded Windows sharing locks without weakening the atomic directory swap. */
export function renameWithRetry(
  source: string,
  target: string,
  options: RenameRetryOptions = {},
): void {
  const timeoutMs = options.timeoutMs ?? DEFAULT_RENAME_RETRY_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs < 0) {
    throw new RangeError(`Invalid rename retry timeout: ${timeoutMs}`);
  }
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((delayMs) => Atomics.wait(sleepArray, 0, 0, delayMs));
  const rename = options.rename ?? renameSync;
  const startedAt = now();
  let delayMs = 50;
  for (;;) {
    try {
      rename(source, target);
      return;
    } catch (error) {
      const code =
        error && typeof error === "object" && "code" in error ? String(error.code) : undefined;
      const remainingMs = timeoutMs - Math.max(0, now() - startedAt);
      if (!code || !TRANSIENT_RENAME_CODES.has(code) || remainingMs <= 0) throw error;
      sleep(Math.min(delayMs, remainingMs));
      delayMs = Math.min(delayMs * 2, MAX_RENAME_RETRY_DELAY_MS);
    }
  }
}

function verifyStagedDist(stageDir: string): { declarationBytes: number } {
  verifyDistClosure(join(REPO_ROOT, "src"), stageDir, "Staged dist");

  const dtsPath = join(stageDir, "cli.d.ts");
  const content = readFileSync(dtsPath, "utf8");
  if (statSync(dtsPath).size < 10) throw new Error(`${dtsPath} is suspiciously tiny`);
  if (!/export\s+\{\s*main\s*\}/.test(content)) {
    throw new Error(`${dtsPath} does not export the public main function`);
  }
  if (!content.includes("sourceMappingURL") || !existsSync(`${dtsPath}.map`)) {
    throw new Error(`${dtsPath} is missing its declaration source map`);
  }
  return { declarationBytes: statSync(dtsPath).size };
}

/** Publish a complete stage or restore the prior dist if the stage rename fails. */
export function replaceDist(
  stageDir: string,
  backupDir: string,
  distDir = DIST_DIR,
  repositoryRoot = REPO_ROOT,
): void {
  const stage = managedPath(stageDir, "stage", repositoryRoot);
  const dist = managedPath(distDir, "dist", repositoryRoot);
  const backup = managedPath(backupDir, "backup", repositoryRoot);
  const hadDist = existsSync(dist);
  if (hadDist) renameWithRetry(dist, backup);
  try {
    renameWithRetry(stage, dist);
  } catch (error) {
    if (hadDist && !existsSync(dist) && existsSync(backup)) renameWithRetry(backup, dist);
    throw error;
  }
  if (hadDist) removeManagedPath(backup, "backup", repositoryRoot);
}

async function main(): Promise<void> {
  verifyRepoRoot();
  const start = performance.now();
  const nonce = `${process.pid}-${randomUUID()}`;
  const stageDir = managedPath(join(REPO_ROOT, `${STAGE_PREFIX}${nonce}`), "stage");
  const backupDir = managedPath(join(REPO_ROOT, `${BACKUP_PREFIX}${nonce}`), "backup");
  const buildInfo = join(stageDir, ".src.tsbuildinfo");
  mkdirSync(stageDir);

  try {
    embedTemplateSources();

    console.log("[build] Step 1/3: Bundling JS with Bun.build()");
    console.log(`        entry: ./src/cli.ts -> ./${basename(stageDir)}/cli.js`);
    const result = await Bun.build({
      entrypoints: [join(REPO_ROOT, "src/cli.ts")],
      outdir: stageDir,
      target: "node",
      external: ["oxc-parser", "oxfmt"],
      minify: false,
      sourcemap: "external",
      naming: "[dir]/[name].[ext]",
    });
    if (!result.success) {
      for (const log of result.logs) {
        console.error(`  ${log.level}: ${log.message}`);
        if (log.position) {
          console.error(`    at ${log.position.file}:${log.position.line}:${log.position.column}`);
        }
      }
      throw new Error("Bun.build() failed");
    }
    const bundleKiB = result.outputs.reduce((total, output) => total + output.size, 0) / 1024;
    console.log(
      `[build]   ✓ JS bundle OK (${result.outputs.length} output(s), ${bundleKiB.toFixed(1)} KiB)`,
    );

    console.log(
      "[build] Step 2/3: Building @repo/versions via tsc -p packages/versions/tsconfig.json",
    );
    const versionsBuild = Bun.spawnSync({
      cmd: [...localTsc, "-p", join(REPO_ROOT, "packages/versions/tsconfig.json")],
      stdout: "inherit",
      stderr: "inherit",
      cwd: REPO_ROOT,
    });
    if (versionsBuild.exitCode !== 0) {
      throw new Error(`@repo/versions build failed (exit ${versionsBuild.exitCode})`);
    }

    console.log("[build] Step 3/3: Emitting declarations via tsc -p src/tsconfig.json");
    const declarationBuild = Bun.spawnSync({
      cmd: [
        ...localTsc,
        "-p",
        join(REPO_ROOT, "src/tsconfig.json"),
        "--outDir",
        stageDir,
        "--tsBuildInfoFile",
        buildInfo,
      ],
      stdout: "inherit",
      stderr: "inherit",
      cwd: REPO_ROOT,
    });
    if (declarationBuild.exitCode !== 0) {
      throw new Error(`tsc declaration emit failed (exit ${declarationBuild.exitCode})`);
    }
    rmSync(buildInfo, { force: true });

    const verified = verifyStagedDist(stageDir);
    replaceDist(stageDir, backupDir);
    const elapsed = ((performance.now() - start) / 1000).toFixed(2);
    console.log(
      `[build] ✓ Declarations OK (${verified.declarationBytes} bytes at ./dist/cli.d.ts)`,
    );
    console.log(`[build] ✓ Published dist closure replaced atomically`);
    console.log(`[build] Done in ${elapsed}s — outputs: dist/cli.js + dist/**/*.d.ts`);
  } finally {
    if (existsSync(stageDir)) removeManagedPath(stageDir, "stage");
  }
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    console.error(`[build] ✗ ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
