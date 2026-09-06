// @allow-long 741: desired-state and mode-aware registry reconciliation share transactional drift handling
/**
 * ghostinit sync [--check] implementation.
 *
 * Rebuilds deterministic registries (module index, API contract/router, and
 * database schema registry):
 * - monorepo: packages/{modules,api,database}/src/**
 * - single: src/server/{modules,api,db}/**
 *
 * Disabled capabilities are never materialized merely because sync ran.
 */

import { join } from "node:path";
import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { ExitCode, GhostinitError, exitCodeName } from "../lib/errors.js";
import { createManagedFileState, stageState } from "../lib/state.js";
import {
  relativeChecksum,
  hashContent,
  isDriftTracked,
  type ChecksumEntry,
} from "../lib/checksum.js";
import { acquireLock } from "../lib/lock.js";
import { envelope, printJson } from "../lib/json.js";
import { checkGitStatus, assertCleanGit } from "../lib/git.js";
import { validateProjectForMutation } from "../lib/validate-project.js";
import { loadState } from "../lib/state.js";
import { FsTransaction } from "../lib/fs.js";
import { listEnvironmentLifecyclePaths } from "../lib/environment-lifecycle.js";
import {
  buildApiRegistry,
  buildModuleRegistry,
  mergeModuleSchemaRegistry,
} from "../lib/registry-content.js";
import type { State } from "../lib/config.js";
import { applyReconcilePlan, buildReconcilePlan, publicReconcilePlan } from "../lib/reconcile.js";
import type { GlobalOptions } from "./types.js";

async function readFileSafe(
  filePath: string,
  overlay?: { tx: FsTransaction; relativePath: string },
): Promise<string> {
  try {
    if (overlay) return (await overlay.tx.readText(overlay.relativePath)) ?? "";
    return await readFile(filePath, "utf-8");
  } catch (err: unknown) {
    const maybeErr = err as { code?: string };
    if (maybeErr?.code === "ENOENT") {
      return "";
    }
    throw new GhostinitError(
      `Failed to read ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
      ExitCode.GENERAL_ERROR,
      {
        path: filePath,
        code: (err as { code?: string })?.code ?? "UNKNOWN",
        cause: err instanceof Error ? err.message : String(err),
      },
    );
  }
}

async function registryPathExists(
  root: string,
  relativePath: string,
  tx?: FsTransaction,
): Promise<boolean> {
  if (tx) return (await tx.readText(relativePath)) !== undefined;
  return existsSync(join(root, ...relativePath.split("/")));
}

function stagedChildren(tx: FsTransaction | undefined, relativeDirectory: string): string[] {
  if (!tx) return [];
  const prefix = `${relativeDirectory.replace(/\/$/, "")}/`;
  return tx
    .getStagedFiles()
    .map(({ path }) => (path.startsWith(prefix) ? path.slice(prefix.length).split("/")[0] : ""))
    .filter(Boolean);
}

async function listDirectories(
  root: string,
  relativeDirectory: string,
  tx?: FsTransaction,
): Promise<string[]> {
  const segments = relativeDirectory.split("/");
  const path = join(root, ...segments);
  const disk = existsSync(path)
    ? (await readdir(path, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
    : [];
  return [...new Set([...disk, ...stagedChildren(tx, relativeDirectory)])].sort();
}

async function listProcedureFiles(
  root: string,
  relativeDirectory: string,
  tx?: FsTransaction,
): Promise<string[]> {
  const dir = join(root, ...relativeDirectory.split("/"));
  const disk = existsSync(dir)
    ? (await readdir(dir, { withFileTypes: true }))
        .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
        .map((entry) => entry.name.replace(/\.ts$/, ""))
    : [];
  const staged = stagedChildren(tx, relativeDirectory)
    .filter((name) => name.endsWith(".ts"))
    .map((name) => name.replace(/\.ts$/, ""));
  return [...new Set([...disk, ...staged])].sort();
}

async function listSchemaFiles(
  root: string,
  relativeDirectory: string,
  tx?: FsTransaction,
): Promise<string[]> {
  const dir = join(root, ...relativeDirectory.split("/"));
  const disk = existsSync(dir)
    ? (await readdir(dir, { withFileTypes: true }))
        .filter(
          (entry) => entry.isFile() && entry.name.endsWith(".ts") && entry.name !== "index.ts",
        )
        .map((entry) => entry.name.replace(/\.ts$/, ""))
    : [];
  const staged = stagedChildren(tx, relativeDirectory)
    .filter((name) => name.endsWith(".ts") && name !== "index.ts")
    .map((name) => name.replace(/\.ts$/, ""));
  return [...new Set([...disk, ...staged])].sort();
}

interface RegistryLayout {
  readonly moduleRoot: string;
  readonly moduleIndex: string;
  readonly moduleTestsRoot: string;
  readonly apiProcedures: string;
  readonly apiContract: string;
  readonly apiRouter: string;
  readonly schemaRoot: string;
  readonly schemaIndex: string;
  readonly modulesEnabled: boolean;
  readonly apiEnabled: boolean;
  readonly schemaEnabled: boolean;
}

function resolveRegistryLayout(
  cwd: string,
  state: State,
  transaction?: FsTransaction,
): RegistryLayout {
  const single = state.project.mode === "single";
  const moduleRoot = single ? "src/server/modules" : "packages/modules/src";
  const apiRoot = single ? "src/server/api" : "packages/api/src";
  const schemaRoot = single ? "src/server/db/schema" : "packages/database/src/schema";
  const configuredApi = state.project.api ?? (state.project.preset === "frontend" ? false : true);
  const existsOrStaged = (path: string) =>
    existsSync(join(cwd, ...path.split("/"))) ||
    transaction?.getStagedFiles().some((file) => file.path.startsWith(`${path}/`)) === true;
  const modulesEnabled = existsOrStaged(moduleRoot);
  return {
    moduleRoot,
    moduleIndex: `${moduleRoot}/index.ts`,
    moduleTestsRoot: single ? "tests/server/modules" : "packages/modules/tests",
    apiProcedures: `${apiRoot}/procedures`,
    apiContract: `${apiRoot}/contract.ts`,
    apiRouter: `${apiRoot}/router.ts`,
    schemaRoot,
    schemaIndex: `${schemaRoot}/index.ts`,
    modulesEnabled,
    apiEnabled: configuredApi && existsOrStaged(apiRoot),
    schemaEnabled:
      state.project.database === "postgres" && modulesEnabled && existsOrStaged(schemaRoot),
  };
}

async function detectFileDrift(
  cwd: string,
  tracked: Record<string, ChecksumEntry>,
): Promise<string[]> {
  const entries = Object.entries(tracked).filter(([relPath]) => isDriftTracked(relPath));
  // Run in parallel to avoid O(n) sequential awaits + duplicate existsSync IO.
  // Only ENOENT is treated as missing; other errors are reported as unreadable.
  const results = await Promise.all(
    entries.map(async ([relPath, entry]): Promise<string | null> => {
      const absPath = join(cwd, ...relPath.split("/"));
      try {
        const content = await readFile(absPath, "utf-8");
        if (hashContent(content) !== entry.hash) {
          return `${relPath}: modified externally`;
        }
        return null;
      } catch (err: unknown) {
        const maybeErr = err as { code?: string };
        if (maybeErr?.code === "ENOENT") {
          return `${relPath}: missing`;
        }
        return `${relPath}: unreadable (${err instanceof Error ? err.message : String(err)})`;
      }
    }),
  );
  return results.filter((v): v is string => v !== null);
}

/**
 * Core registry rebuild — mutating callers must already hold the project lock;
 * check/dry-run callers intentionally execute without one.
 *
 * Extracted so both `syncCommand` and `addCommand` can use one lock.
 * Previously `add` (add.ts:182) released its lock in a finally and then
 * called `syncCommand`, which re-acquired at sync.ts:174 — a window where the
 * module file existed but the 4 deterministic barrels that wire it did not.
 * Any process listing schemas or invoking ghostinit check in that gap would see
 * an incomplete project.
 */
export interface RegistryRebuildContext {
  /** Prevalidated state and shared transaction used by `ghostinit add`. */
  state?: State;
  transaction?: FsTransaction;
  deferCommit?: boolean;
}

export async function rebuildRegistries(
  options: GlobalOptions,
  start: number,
  context: RegistryRebuildContext = {},
): Promise<{ exitCode: number; modules: string[]; procedures: string[] }> {
  let state: State;
  let reconciledDesiredState = false;
  if (context.state) {
    state = context.state;
  } else if (options.check) {
    const loaded = await loadState(options.cwd);
    if (!loaded) {
      throw new GhostinitError("No GhostInit project state found.", ExitCode.INVALID_STATE, {
        cwd: options.cwd,
      });
    }
    state = loaded;
  } else {
    const validation = await validateProjectForMutation(options.cwd, {
      allowDesiredDrift: true,
      allowPendingOperation: true,
    });
    state = await (async () => {
      if (validation.valid) return validation.state;
      if (
        options.force &&
        validation.exitCodeSuggestion === ExitCode.INVALID_STATE &&
        validation.details?.drift
      ) {
        options.logger.warn(
          "Drift detected; --force will regenerate registries and overwrite tracked files.",
        );
        const forced = await loadState(options.cwd);
        if (!forced) {
          throw new GhostinitError("No GhostInit project state found.", ExitCode.INVALID_STATE);
        }
        return forced;
      }
      throw new GhostinitError(validation.message, ExitCode.INVALID_STATE, {
        ...validation.details,
        cause: validation.error?.message,
      });
    })();
  }

  const auditsCloudflareEnvironment =
    state.sourceVersion === 2 &&
    (state.resolvedConfig.apps.some(({ deploy }) => deploy === "cloudflare") ||
      listEnvironmentLifecyclePaths(options.cwd).length > 0);
  if (
    state.sourceVersion === 2 &&
    (state.configChanged || state.pendingOperation || auditsCloudflareEnvironment)
  ) {
    const desiredPlan = await buildReconcilePlan(options.cwd, state, { operation: "sync" });
    const hasDesiredDrift =
      state.configChanged ||
      desiredPlan.creates.length > 0 ||
      desiredPlan.moves.length > 0 ||
      desiredPlan.rewrites.length > 0 ||
      desiredPlan.deletions.length > 0 ||
      desiredPlan.retired.length > 0 ||
      desiredPlan.environmentMerges.length > 0 ||
      desiredPlan.secretOperations.length > 0 ||
      desiredPlan.conflicts.length > 0;
    if (options.check && hasDesiredDrift) {
      const message = "Desired configuration has not been reconciled";
      if (options.json) {
        printJson(
          envelope({
            success: false,
            exitCode: ExitCode.DRIFT,
            error: {
              message,
              code: exitCodeName(ExitCode.DRIFT),
              details: { plan: publicReconcilePlan(desiredPlan) },
            },
            command: "sync",
            durationMs: Date.now() - start,
          }),
        );
      } else {
        options.logger.error(message);
      }
      return { exitCode: ExitCode.DRIFT, modules: state.modules, procedures: state.procedures };
    }
    if (options.dryRun && hasDesiredDrift) {
      const hasConflicts = desiredPlan.conflicts.length > 0;
      const exitCode = hasConflicts ? ExitCode.CONFLICT_ERROR : ExitCode.OK;
      if (options.json) {
        printJson(
          envelope({
            success: !hasConflicts,
            exitCode,
            data: { dryRun: true, plan: publicReconcilePlan(desiredPlan) },
            error: hasConflicts
              ? {
                  message: "Managed-file conflicts prevent desired-state reconciliation",
                  code: exitCodeName(exitCode),
                  details: { conflicts: desiredPlan.conflicts },
                }
              : undefined,
            command: "sync",
            durationMs: Date.now() - start,
          }),
        );
      } else {
        options.logger.info(
          `[dry-run] Desired-state preview: ${desiredPlan.creates.length} create, ${desiredPlan.moves.length} move, ${desiredPlan.rewrites.length} rewrite, ${desiredPlan.deletions.length} delete, ${desiredPlan.retired.length} preserve-and-retire, ${desiredPlan.secretOperations.length} self-issued secret materialization, ${desiredPlan.conflicts.length} conflict`,
        );
        for (const change of desiredPlan.deletions) {
          options.logger.info(`[dry-run] Would delete unchanged managed file ${change.path}`);
        }
        for (const path of desiredPlan.retired) {
          options.logger.info(
            `[dry-run] Would preserve user-owned seed and retire tracking: ${path}`,
          );
        }
        for (const conflict of desiredPlan.conflicts) {
          options.logger.warn(`[dry-run] Conflict ${conflict.reason}: ${conflict.path}`);
          if (conflict.suggestion) options.logger.warn(`[dry-run] ${conflict.suggestion}`);
        }
      }
      return { exitCode, modules: state.modules, procedures: state.procedures };
    }
    if (hasDesiredDrift) {
      if (context.transaction || context.deferCommit) {
        throw new GhostinitError(
          "Desired-state reconciliation is required before adding artifacts. Run ghostinit sync first; the add transaction has not been committed.",
          desiredPlan.conflicts.length > 0 ? ExitCode.CONFLICT_ERROR : ExitCode.DRIFT,
          { plan: publicReconcilePlan(desiredPlan) },
        );
      }
      await applyReconcilePlan(options.cwd, state, desiredPlan, "sync");
      reconciledDesiredState = true;
      const reconciled = await loadState(options.cwd);
      if (!reconciled) throw new GhostinitError("State disappeared after reconciliation");
      state = reconciled;
    }
  }

  // Read-only checks and previews must not spawn Git or demand a clean tree.
  if (!options.force && !options.check && !options.dryRun && !reconciledDesiredState) {
    const gitStatus = await checkGitStatus(options.cwd, options.logger);
    assertCleanGit(gitStatus, options.force, options.logger);
  }

  const layout = resolveRegistryLayout(options.cwd, state, context.transaction);
  const modules = layout.modulesEnabled
    ? await listDirectories(options.cwd, layout.moduleRoot, context.transaction)
    : state.modules;
  const procedures = layout.apiEnabled
    ? await listProcedureFiles(options.cwd, layout.apiProcedures, context.transaction)
    : state.procedures;
  const schemas = layout.schemaEnabled
    ? await listSchemaFiles(options.cwd, layout.schemaRoot, context.transaction)
    : [];

  const [modulesContent, contractContent, routerContent, schemaIndexContent] = await Promise.all([
    layout.modulesEnabled
      ? readFileSafe(
          join(options.cwd, ...layout.moduleIndex.split("/")),
          context.transaction
            ? { tx: context.transaction, relativePath: layout.moduleIndex }
            : undefined,
        )
      : Promise.resolve(""),
    layout.apiEnabled
      ? readFileSafe(
          join(options.cwd, ...layout.apiContract.split("/")),
          context.transaction
            ? { tx: context.transaction, relativePath: layout.apiContract }
            : undefined,
        )
      : Promise.resolve(""),
    layout.apiEnabled
      ? readFileSafe(
          join(options.cwd, ...layout.apiRouter.split("/")),
          context.transaction
            ? { tx: context.transaction, relativePath: layout.apiRouter }
            : undefined,
        )
      : Promise.resolve(""),
    layout.schemaEnabled
      ? readFileSafe(
          join(options.cwd, ...layout.schemaIndex.split("/")),
          context.transaction
            ? { tx: context.transaction, relativePath: layout.schemaIndex }
            : undefined,
        )
      : Promise.resolve(""),
  ]);
  const apiRegistry = layout.apiEnabled
    ? buildApiRegistry(procedures, contractContent, routerContent)
    : { contract: contractContent, router: routerContent };
  const desired = {
    modules: layout.modulesEnabled ? buildModuleRegistry(modules) : modulesContent,
    contract: apiRegistry.contract,
    router: apiRegistry.router,
    schemaIndex: layout.schemaEnabled
      ? mergeModuleSchemaRegistry(schemaIndexContent, schemas, modules)
      : schemaIndexContent,
  };
  const [moduleIndexExists, contractExists, routerExists, schemaIndexExists] = await Promise.all([
    registryPathExists(options.cwd, layout.moduleIndex, context.transaction),
    registryPathExists(options.cwd, layout.apiContract, context.transaction),
    registryPathExists(options.cwd, layout.apiRouter, context.transaction),
    registryPathExists(options.cwd, layout.schemaIndex, context.transaction),
  ]);
  const registryFiles = [
    {
      enabled: layout.modulesEnabled,
      path: layout.moduleIndex,
      before: modulesContent,
      beforeExists: moduleIndexExists,
      after: desired.modules,
      owner: "domain",
      capability: null,
      contribution: "registry.modules.v2",
    },
    {
      enabled: layout.apiEnabled,
      path: layout.apiContract,
      before: contractContent,
      beforeExists: contractExists,
      after: desired.contract,
      owner: "transport",
      capability: "transport",
      contribution: "registry.api-contract.v2",
    },
    {
      enabled: layout.apiEnabled,
      path: layout.apiRouter,
      before: routerContent,
      beforeExists: routerExists,
      after: desired.router,
      owner: "transport",
      capability: "transport",
      contribution: "registry.api-router.v2",
    },
    {
      enabled: layout.schemaEnabled,
      path: layout.schemaIndex,
      before: schemaIndexContent,
      beforeExists: schemaIndexExists,
      after: desired.schemaIndex,
      owner: "adapter",
      capability: null,
      contribution: "registry.database-schema.v2",
    },
  ] as const;
  const changedFiles = registryFiles.filter(
    (entry) => entry.enabled && entry.before !== entry.after,
  );
  const changed = changedFiles.length > 0;

  if (options.check) {
    const drift = await detectFileDrift(options.cwd, state.checksums);
    if (drift.length > 0 || changed) {
      const message =
        drift.length > 0
          ? `Generated files are out of sync. Drift: ${drift.join("; ")}`
          : "Generated registries are out of sync. Run `ghostinit sync` to fix.";
      options.logger.error(message);
      if (options.json) {
        printJson(
          envelope({
            success: false,
            exitCode: ExitCode.DRIFT,
            error: { message, code: exitCodeName(ExitCode.DRIFT), details: { drift, changed } },
            command: "sync",
            durationMs: Date.now() - start,
          }),
        );
      }
      return { exitCode: ExitCode.DRIFT, modules, procedures };
    }
    options.logger.info("Generated registries are in sync");
    if (options.json) {
      printJson(
        envelope({
          success: true,
          exitCode: ExitCode.OK,
          data: { modules, procedures, inSync: true },
          command: "sync",
          durationMs: Date.now() - start,
        }),
      );
    }
    return { exitCode: ExitCode.OK, modules, procedures };
  }

  if (!changed) {
    options.logger.info("Generated registries are already up to date");
    if (options.json) {
      printJson(
        envelope({
          success: true,
          exitCode: ExitCode.OK,
          data: { modules, procedures, inSync: true },
          command: "sync",
          durationMs: Date.now() - start,
        }),
      );
    }
    return { exitCode: ExitCode.OK, modules, procedures };
  }

  if (options.dryRun) {
    const wouldChange = changedFiles.map((entry) => entry.path);
    options.logger.info(
      `[dry-run] Would update ${wouldChange.length} file(s): ${wouldChange.join(", ")}`,
    );
    for (const f of wouldChange) options.logger.info(`[dry-run] Would write ${f}`);
    options.logger.info("[dry-run] No lock, write, cleanup, or state update performed");
    if (options.json) {
      printJson(
        envelope({
          success: true,
          exitCode: ExitCode.OK,
          data: { modules, procedures, wouldChange, dryRun: true },
          command: "sync",
          durationMs: Date.now() - start,
        }),
      );
    }
    return { exitCode: ExitCode.OK, modules, procedures };
  }

  const tx = context.transaction ?? new FsTransaction(options.cwd);
  for (const entry of changedFiles) {
    await tx.writeIfUnchanged(entry.path, entry.after, entry.beforeExists ? entry.before : null);
  }
  if (context.deferCommit) {
    if (!context.transaction) {
      throw new GhostinitError(
        "Deferred registry rebuild requires a caller-owned transaction",
        ExitCode.GENERAL_ERROR,
      );
    }
    return { exitCode: ExitCode.OK, modules, procedures };
  }
  const staged = tx.getStagedFiles();
  const checksums = staged.map(({ path, content }) => relativeChecksum(options.cwd, path, content));
  const registryPolicy = new Map(registryFiles.map((entry) => [entry.path, entry]));
  await stageState(tx, options.cwd, state.project, checksums, modules, procedures, {
    managedFiles: staged.map(({ path, content }) => {
      const prior = state.files[path];
      const policy = registryPolicy.get(path);
      if (!prior && !policy) {
        throw new GhostinitError(
          `Sync staged an unplanned managed file without provenance: ${path}`,
          ExitCode.GENERAL_ERROR,
        );
      }
      return createManagedFileState(
        path,
        content,
        prior
          ? {
              owner: prior.owner,
              lifecycle: prior.lifecycle,
              provenance: prior.provenance,
            }
          : {
              owner: policy!.owner,
              lifecycle: "generator-owned",
              provenance: {
                renderer: "ghostinit.registry-sync.v2",
                source: "src/commands/sync",
                capability: policy!.capability,
                appId: null,
                target: null,
                artifacts: [],
                acceptance: ["project.sync.registry.v2"],
                contribution: [policy!.contribution],
              },
            },
      );
    }),
    existingState: state,
  });
  await tx.commit();

  if (options.json) {
    printJson(
      envelope({
        success: true,
        exitCode: ExitCode.OK,
        data: { modules, procedures },
        command: "sync",
        durationMs: Date.now() - start,
      }),
    );
  }
  return { exitCode: ExitCode.OK, modules, procedures };
}

export async function syncCommand(_args: string[], options: GlobalOptions): Promise<number> {
  const start = Date.now();
  if (options.check || options.dryRun) {
    const result = await rebuildRegistries(options, start);
    return result.exitCode;
  }
  const { release } = await acquireLock(options.cwd, options.logger, { force: options.force });
  try {
    const result = await rebuildRegistries(options, start);
    return result.exitCode;
  } finally {
    await release();
  }
}
