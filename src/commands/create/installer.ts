// @allow-long 599: candidate process sequencing and transactional state finalization form one install protocol
import { access, mkdtemp, readFile, readdir, rename, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { runtime as toolchainRuntime } from "../../../packages/versions/src/index.js";
import type { SecretMaterializerPort } from "../../application/ports/secret-materializer.js";
import type { GenerationPlan, SelfIssuedSecretOperation } from "../../domain/generation/types.js";
import type { DesiredProjectConfig, ResolvedProjectConfig } from "../../domain/project/config.js";
import { FileSecretMaterializer } from "../../generation/secret-materializer.js";
import { resolvedToLegacyRenderConfig } from "../../generation/resolved-template-compiler.js";
import {
  canonicalizeGenerationPlan,
  isGenerationFormatPath,
} from "../../generation/plan-formatter.js";
import { relativeChecksum, isDriftTracked, type ChecksumEntry } from "../../lib/checksum.js";
import type { ProjectConfig } from "../../lib/config.js";
import { ConflictError } from "../../lib/errors.js";
import { FsRollbackError, FsTransaction } from "../../lib/fs.js";
import { checkGitStatus, assertCleanGit } from "../../lib/git.js";
import { acquireLock, type LockOwner } from "../../lib/lock.js";
import { runDependencySecurity } from "../../lib/dependency-security/runtime.js";
import { loadDesiredProjectConfig } from "../../lib/project-config.js";
import { dependencySecurityPolicy } from "../../templates/tooling/dependency-security-policy.js";
import { recompileInstalledSecurityPlan } from "./security-plan.js";
import {
  createNativeInstallLifecycle,
  InstallerNativeRecoveryError,
} from "./native-install-lifecycle.js";
import type { DependencySecurityCreateLifecycle } from "../../lib/dependency-security/runtime-types.js";
import {
  createGenerationPlanState,
  createManagedFileStateFromPlan,
  loadState,
  saveState,
  validateStateCompatibility,
} from "../../lib/state.js";
import {
  buildProjectGenerationPlan,
  canonicalDesiredProjectConfig,
} from "../../templates/default.js";
import type { GlobalOptions } from "../types.js";
import {
  InstallerProcessTreeError,
  InstallerContainmentUnavailableError,
  InstallerInterruptedError,
  discoverCanonicalBunExecutable as discoverBunExecutable,
  resolveCanonicalBunExecutable as resolveBunExecutable,
  runInstallerCommand as superviseInstallerCommand,
  runSupervisedCommand as superviseCommand,
  type BunDiscoveryDependencies,
  type InstallerCommandInput,
  type SupervisedCommandInput,
  type SupervisedCommandResult,
} from "../../lib/process-supervisor.js";

export {
  buildInstallEnv,
  INSTALL_TIMEOUT_MS,
  InstallerProcessTreeError,
  InstallerContainmentUnavailableError,
  InstallerInterruptedError,
  advanceWindowsJobControllerState,
  type BunDiscoveryDependencies,
  type InstallerSignalSource,
  type InstallerCommandInput,
  type SupervisedCommandInput,
  type SupervisedCommandResult,
  type WindowsJobControllerState,
} from "../../lib/process-supervisor.js";

/** Compatibility entrypoint bound to the host's catalog runtime pin. */
export function discoverCanonicalBunExecutable(
  env: NodeJS.ProcessEnv = process.env,
  overrides: Partial<BunDiscoveryDependencies> = {},
): string | undefined {
  return discoverBunExecutable(toolchainRuntime.bun, env, overrides);
}

export function resolveCanonicalBunExecutable(): string {
  return resolveBunExecutable(toolchainRuntime.bun);
}

export function runSupervisedCommand(
  args: SupervisedCommandInput,
): Promise<SupervisedCommandResult> {
  return superviseCommand(args, toolchainRuntime.bun);
}

export function runInstallerCommand(args: InstallerCommandInput): Promise<void> {
  return superviseInstallerCommand(args, toolchainRuntime.bun);
}

class InstallerRollbackError extends AggregateError {
  readonly originalError: unknown;

  constructor(originalError: unknown, rollbackErrors: readonly unknown[]) {
    const failures = [originalError, ...rollbackErrors].filter(
      (error, index, all) => all.indexOf(error) === index,
    );
    const affected = rollbackErrors
      .filter((error): error is FsRollbackError => error instanceof FsRollbackError)
      .flatMap(({ result }) => result.failures.map(({ path }) => path));
    super(
      failures,
      `Operation failed and filesystem rollback was incomplete${affected.length > 0 ? ` for: ${[...new Set(affected)].join(", ")}` : ""}`,
      { cause: originalError },
    );
    this.name = "InstallerRollbackError";
    this.originalError = originalError;
  }
}

async function rollbackTransactions(
  originalError: unknown,
  transactions: readonly FsTransaction[],
): Promise<void> {
  const rollbackErrors: unknown[] = [];
  for (const transaction of new Set(transactions)) {
    try {
      await transaction.rollback();
    } catch (error) {
      rollbackErrors.push(error);
    }
  }
  if (rollbackErrors.length > 0) {
    throw new InstallerRollbackError(originalError, rollbackErrors);
  }
}

interface SecurityInstallContext {
  readonly logger: GlobalOptions["logger"];
  readonly leaseOwner?: LockOwner;
  readonly onTransactionCommitted: (transaction: FsTransaction) => void;
  readonly createLifecycle?: DependencySecurityCreateLifecycle;
}

async function runInstall(
  cwd: string,
  runtime: "node" | "bun",
  onContainmentFallback?: (message: string) => void,
  context?: SecurityInstallContext,
): Promise<void> {
  void runtime;
  const { resolved } = await loadDesiredProjectConfig(cwd);
  const result = await runDependencySecurity({
    cwd,
    mode: "install",
    bootstrap: true,
    policy: dependencySecurityPolicy(
      resolved.apps.some((app) => app.target === "expo"),
      resolved.apps.some((app) => app.target === "nextjs" && app.deploy === "cloudflare"),
    ),
    logger: context?.logger,
    leaseOwner: context?.leaseOwner,
    onTransactionCommitted: context?.onTransactionCommitted,
    createLifecycle: context?.createLifecycle,
    onContainmentFallback,
    verifyProject: false,
  });
  if (!result.installedVerified || result.status === "blocked" || result.status === "failed") {
    throw new Error(result.message ?? "Dependency security installation could not be verified");
  }
  if (result.status === "partial")
    context?.logger.warn(
      result.message ?? "Lower-severity dependency findings still require review",
    );
}

async function runFormat(
  cwd: string,
  runtime: "node" | "bun",
  generatedPaths: readonly string[],
  onContainmentFallback?: (message: string) => void,
): Promise<void> {
  void runtime;
  const paths = [...new Set(generatedPaths.filter(isGenerationFormatPath))].sort();
  let batch: string[] = [];
  let batchLength = 0;
  const flush = async (): Promise<void> => {
    if (batch.length === 0) return;
    await runInstallerCommand({
      command: resolveCanonicalBunExecutable(),
      argv: ["x", "--no-install", "oxfmt", "--write", ...batch],
      cwd,
      label: "bun x oxfmt",
      timeoutMs: 120_000,
      onContainmentFallback,
    });
    batch = [];
    batchLength = 0;
  };
  for (const path of paths) {
    if (batch.length > 0 && batchLength + path.length + 1 > 12_000) await flush();
    batch.push(path);
    batchLength += path.length + 1;
  }
  await flush();
}

async function runVerification(
  cwd: string,
  runtime: "node" | "bun",
  onContainmentFallback?: (message: string) => void,
): Promise<void> {
  void runtime;
  // Shared security installation already ends with the installed patch and vulnerability
  // audit. Keep that expensive network gate single-owner and use this phase for
  // the generated TypeScript verification only.
  await runInstallerCommand({
    command: resolveCanonicalBunExecutable(),
    argv: ["run", "typecheck"],
    cwd,
    label: "bun run typecheck",
    timeoutMs: 300_000,
    onContainmentFallback,
  });
}

export interface InstallInput {
  readonly projectName: string;
  readonly projectRoot: string;
  readonly desiredConfig: DesiredProjectConfig;
  readonly resolvedConfig: ResolvedProjectConfig;
  readonly options: GlobalOptions;
  readonly noInstall: boolean;
  /** Create command uses this to fail closed if the destination already exists. */
  readonly requireAbsentTarget?: boolean;
}

export interface DryRunFile {
  readonly path: string;
  readonly size: number;
  readonly bytes: number;
}

export interface InstallerDependencies {
  readonly checkGitStatus: typeof checkGitStatus;
  readonly assertCleanGit: typeof assertCleanGit;
  readonly acquireLock: typeof acquireLock;
  readonly createTransaction: (root: string) => FsTransaction;
  readonly readFile: typeof readFile;
  readonly loadState: typeof loadState;
  readonly saveState: typeof saveState;
  readonly runInstall: typeof runInstall;
  readonly runFormat: typeof runFormat;
  readonly runVerification: typeof runVerification;
  readonly formatGenerationPlan: typeof canonicalizeGenerationPlan;
  readonly createSecretMaterializer: (root: string) => SecretMaterializerPort;
}

const defaultDependencies: InstallerDependencies = {
  checkGitStatus,
  assertCleanGit,
  acquireLock,
  createTransaction: (root) => new FsTransaction(root),
  readFile,
  loadState,
  saveState,
  runInstall,
  runFormat,
  runVerification,
  formatGenerationPlan: canonicalizeGenerationPlan,
  createSecretMaterializer: (root) => new FileSecretMaterializer(root),
};

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (error) {
    if ((error as { code?: string })?.code === "ENOENT") return false;
    throw error;
  }
}

async function privateCandidateRoot(
  projectRoot: string,
  requireAbsentTarget: boolean,
): Promise<{
  readonly root: string;
  readonly publish: boolean;
  readonly mergeIntoExisting: boolean;
  readonly isPrivate: boolean;
}> {
  if (await pathExists(projectRoot)) {
    if (requireAbsentTarget) {
      throw new ConflictError(`Target directory already exists: ${projectRoot}`);
    }
    if ((await readdir(projectRoot)).length === 0) {
      return { root: projectRoot, publish: false, mergeIntoExisting: false, isPrivate: false };
    }
    const prefix = join(dirname(projectRoot), `.${basename(projectRoot)}.ghostinit-candidate-`);
    return {
      root: await mkdtemp(prefix),
      publish: false,
      mergeIntoExisting: true,
      isPrivate: true,
    };
  }
  const prefix = join(dirname(projectRoot), `.${basename(projectRoot)}.ghostinit-candidate-`);
  return {
    root: await mkdtemp(prefix),
    publish: true,
    mergeIntoExisting: false,
    isPrivate: true,
  };
}

async function discardPrivateCandidate(root: string, isPrivate: boolean): Promise<void> {
  if (!isPrivate) return;
  await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}

function discoverModules(plan: GenerationPlan, mode: ProjectConfig["mode"]): string[] {
  const prefix = mode === "single" ? "src/server/modules/" : "packages/modules/src/";
  return [
    ...new Set(
      plan.files
        .map(({ physicalPath }) => {
          if (!physicalPath.startsWith(prefix)) return "";
          const relative = physicalPath.slice(prefix.length);
          return relative.includes("/") ? relative.split("/")[0] : "";
        })
        .filter(Boolean),
    ),
  ].sort();
}

function discoverProcedures(plan: GenerationPlan, mode: ProjectConfig["mode"]): string[] {
  const prefix = mode === "single" ? "src/server/api/procedures/" : "packages/api/src/procedures/";
  return plan.files
    .map(({ physicalPath }) =>
      physicalPath.startsWith(prefix) && physicalPath.endsWith(".ts")
        ? physicalPath.slice(prefix.length, -3)
        : "",
    )
    .filter((name) => name.length > 0 && !name.includes("/"))
    .sort();
}

export interface ProjectInstallResult {
  readonly filesWritten: number;
  readonly installFailed: boolean;
  readonly stagedFiles?: readonly DryRunFile[];
  readonly totalBytes?: number;
  readonly isDryRun: boolean;
  readonly plan: GenerationPlan;
  readonly resolvedProjectConfig: ResolvedProjectConfig;
}

export async function runProjectInstall(
  input: InstallInput,
  overrides: Partial<InstallerDependencies> = {},
): Promise<ProjectInstallResult> {
  const {
    projectRoot,
    desiredConfig,
    resolvedConfig,
    options,
    noInstall,
    requireAbsentTarget = false,
  } = input;
  let finalDesiredConfig = desiredConfig;
  let finalResolvedConfig = resolvedConfig;
  let compatibilityConfig = resolvedToLegacyRenderConfig(resolvedConfig);
  // The initial production render is pure. Verified security pin changes may
  // produce a second explicit plan before candidate byte/state attestation.
  const rawPlan = buildProjectGenerationPlan(resolvedConfig, { desiredConfig });
  let plan = await (overrides.formatGenerationPlan ?? defaultDependencies.formatGenerationPlan)(
    rawPlan,
  );

  if (options.dryRun) {
    const stagedFiles = plan.files.map((file) => {
      const bytes = Buffer.byteLength(file.content, "utf8");
      return { path: file.physicalPath, size: bytes, bytes };
    });
    return {
      filesWritten: stagedFiles.length,
      installFailed: false,
      stagedFiles,
      totalBytes: stagedFiles.reduce((sum, file) => sum + file.bytes, 0),
      isDryRun: true,
      plan,
      resolvedProjectConfig: resolvedConfig,
    };
  }

  // Resolve and version-check Bun before creating a candidate or acquiring its
  // lock. A Node-hosted CLI may need to probe several PATH candidates, and no
  // transaction should exist while that bounded discovery runs.
  if (!noInstall && overrides.runInstall === undefined) resolveCanonicalBunExecutable();
  const dependencies = { ...defaultDependencies, ...overrides };
  const candidate = await privateCandidateRoot(projectRoot, requireAbsentTarget);
  const protectedRoot = candidate.mergeIntoExisting ? projectRoot : candidate.root;
  let release: (() => Promise<void>) | undefined;
  let installLeaseOwner: LockOwner | undefined;
  const securityTransactions: FsTransaction[] = [];
  let nativeLifecycle: ReturnType<typeof createNativeInstallLifecycle> | undefined;
  let candidateTx: FsTransaction;
  try {
    const gitStatus = await dependencies.checkGitStatus(protectedRoot, options.logger);
    dependencies.assertCleanGit(gitStatus, options.force, options.logger);
    const acquired = await dependencies.acquireLock(protectedRoot, options.logger, {
      force: options.force,
    });
    release = acquired.release;
    if (protectedRoot === candidate.root) installLeaseOwner = acquired.owner;
    if (!candidate.isPrivate && !noInstall)
      nativeLifecycle = createNativeInstallLifecycle(candidate.root);
    candidateTx = dependencies.createTransaction(candidate.root);
  } catch (error) {
    await release?.().catch(() => undefined);
    await discardPrivateCandidate(candidate.root, candidate.isPrivate).catch(() => undefined);
    throw error;
  }
  let released = false;
  let retainLease = false;
  const safeRelease = async () => {
    if (released || retainLease) return;
    released = true;
    await release?.();
  };

  let effectTx = candidateTx;
  let effectRoot = candidate.root;
  let finalizationStarted = false;
  try {
    for (const file of plan.files) await candidateTx.write(file.physicalPath, file.content);
    const candidateCommit = await candidateTx.commit();
    let written = candidateCommit.written;

    if (!noInstall) {
      let containmentFallbackReported = false;
      const reportContainmentFallback = (message: string): void => {
        if (containmentFallbackReported) return;
        containmentFallbackReported = true;
        options.logger.warn(message);
      };
      options.logger.info("Installing dependencies and verifying candidate...", {
        packageManager: resolvedConfig.packageManager,
      });
      try {
        // The sanitized environment and placeholder-only plan ensure lifecycle
        // scripts and verification cannot observe generated secret material.
        await dependencies.runInstall(candidate.root, "bun", reportContainmentFallback, {
          logger: options.logger,
          leaseOwner: installLeaseOwner,
          onTransactionCommitted: (transaction) => securityTransactions.push(transaction),
          createLifecycle: nativeLifecycle?.runtime,
        });
        const secured = await recompileInstalledSecurityPlan(
          candidate.root,
          finalDesiredConfig,
          finalResolvedConfig,
          plan,
          dependencies.formatGenerationPlan,
          dependencies.readFile,
        );
        finalDesiredConfig = secured.desired;
        finalResolvedConfig = secured.resolved;
        plan = secured.plan;
        compatibilityConfig = resolvedToLegacyRenderConfig(finalResolvedConfig);
        await dependencies.runFormat(
          candidate.root,
          "bun",
          plan.files.map(({ physicalPath }) => physicalPath),
          reportContainmentFallback,
        );
        await dependencies.runVerification(candidate.root, "bun", reportContainmentFallback);
      } catch (error) {
        options.logger.error(
          `Installation, formatting, or verification failed: ${error instanceof Error ? error.message : String(error)}`,
        );
        if (
          error instanceof InstallerProcessTreeError ||
          error instanceof InstallerInterruptedError
        ) {
          throw error;
        }
        if (!candidate.isPrivate) {
          await nativeLifecycle?.preserveAfterNativeStart(false, error);
          await rollbackTransactions(
            error,
            [...securityTransactions].reverse().concat(candidateTx),
          );
        }
        await safeRelease();
        try {
          await discardPrivateCandidate(candidate.root, candidate.isPrivate);
        } catch (cleanupError) {
          throw new InstallerRollbackError(error, [cleanupError]);
        }
        return {
          filesWritten: written.length,
          installFailed: true,
          isDryRun: false,
          plan,
          resolvedProjectConfig: finalResolvedConfig,
        };
      }
      options.logger.info("Installation and verification complete");
    } else {
      options.logger.info(
        "Skipping install, format, and verification because --no-install was used. Run `bun run install:bootstrap` in the fresh project before any other dependency-backed script.",
      );
    }

    const preparedContent = new Map<string, string>();
    for (const file of plan.files) {
      const content = await dependencies.readFile(
        join(candidate.root, ...file.physicalPath.split("/")),
        "utf8",
      );
      if (!noInstall && content !== file.content) {
        throw new Error(
          `Installed formatter output diverged from the canonical generation plan at ${file.physicalPath}`,
        );
      }
      preparedContent.set(file.physicalPath, content);
    }

    if (candidate.mergeIntoExisting) {
      // `init --force` must not let package-manager lifecycle scripts, formatters,
      // or verification commands traverse unrelated user files. All such tools
      // ran in the private candidate. Only the exact generated paths are now
      // copied through a fresh transaction into the locked destination.
      effectRoot = projectRoot;
      effectTx = dependencies.createTransaction(projectRoot);
      for (const file of plan.files) {
        await effectTx.write(
          file.physicalPath,
          preparedContent.get(file.physicalPath) ?? file.content,
        );
      }
      written = (await effectTx.commit()).written;
      if (!noInstall) {
        options.logger.warn(
          "Dependencies were installed and verified in an isolated candidate so existing user files were not exposed to lifecycle scripts. The candidate lock cannot attest unrelated destination files; run `bun run install:bootstrap` in the initialized project before any other dependency-backed script.",
        );
      }
    }

    const selfIssued = plan.secrets.filter(
      (operation): operation is SelfIssuedSecretOperation =>
        operation.kind === "generate-self-issued",
    );
    finalizationStarted = true;
    if (selfIssued.length > 0) {
      await dependencies.createSecretMaterializer(effectRoot).materialize(selfIssued);
      const localSecretFiles = [
        ...new Set(
          selfIssued.flatMap((operation) =>
            operation.destinations.map(({ physicalPath }) => physicalPath),
          ),
        ),
      ].sort();
      options.logger.warn(
        `${localSecretFiles.join(", ")} ${localSecretFiles.length === 1 ? "was" : "were"} generated with local development secrets and must not be committed. The paths are already gitignored.`,
      );
    }

    const actualContent = new Map<string, string>();
    const checksums: ChecksumEntry[] = [];
    for (const file of plan.files) {
      const content = await dependencies.readFile(
        join(effectRoot, ...file.physicalPath.split("/")),
        "utf8",
      );
      actualContent.set(file.physicalPath, content);
      if (isDriftTracked(file.physicalPath)) {
        checksums.push(relativeChecksum(effectRoot, file.physicalPath, content));
      }
    }

    validateStateCompatibility(await dependencies.loadState(effectRoot), compatibilityConfig);
    await dependencies.saveState(
      effectRoot,
      compatibilityConfig,
      checksums,
      discoverModules(plan, resolvedConfig.mode),
      discoverProcedures(plan, resolvedConfig.mode),
      {
        desiredConfig: canonicalDesiredProjectConfig(finalDesiredConfig),
        resolvedConfig: finalResolvedConfig,
        managedFiles: plan.files.map((file) =>
          createManagedFileStateFromPlan(
            file,
            actualContent.get(file.physicalPath) ?? file.content,
          ),
        ),
        generationPlan: createGenerationPlanState(plan),
        acceptConfigChanges: true,
        desiredConfigAlreadyWritten: true,
      },
    );
    if (nativeLifecycle?.active) {
      await nativeLifecycle.complete(
        plan,
        await dependencies.readFile(join(effectRoot, ".ghostinit/state.json"), "utf8"),
      );
    }

    if (candidate.publish) {
      // New projects are built, installed, verified, secret-materialized, and
      // state-finalized in a private same-volume sibling. The completed tree is
      // the only state ever published at the requested destination.
      await safeRelease();
      if (await pathExists(projectRoot)) {
        throw new ConflictError(`Target directory appeared during generation: ${projectRoot}`);
      }
      await rename(candidate.root, projectRoot);
    } else if (candidate.isPrivate) {
      await discardPrivateCandidate(candidate.root, true);
    }

    return {
      filesWritten: written.length,
      installFailed: false,
      isDryRun: false,
      plan,
      resolvedProjectConfig: finalResolvedConfig,
    };
  } catch (error) {
    if (
      error instanceof InstallerProcessTreeError &&
      !(error instanceof InstallerContainmentUnavailableError)
    ) {
      retainLease = true;
      await nativeLifecycle?.preserveUnverifiedProcess().catch(() => undefined);
      options.logger.error(
        `Installer process-tree shutdown could not be verified. Rollback was intentionally withheld to prevent a surviving descendant from writing after cleanup. Preserved working directory: ${candidate.root}`,
      );
      throw error;
    }
    if (error instanceof InstallerNativeRecoveryError) {
      options.logger.error(error.message);
      throw error;
    }
    // Once native installation was attempted, every verified failure keeps the
    // live tree intact, including failures from secret/state transactions.
    await nativeLifecycle?.preserveAfterNativeStart(finalizationStarted, error);
    if (error instanceof InstallerContainmentUnavailableError) {
      options.logger.error(
        "Installer lifecycle containment is unavailable. No lifecycle command was started, so normal rollback remains safe.",
      );
    }
    if (error instanceof InstallerRollbackError) {
      options.logger.error(error.message);
      await safeRelease().catch(() => undefined);
      throw error;
    }
    if (error instanceof FsRollbackError) {
      options.logger.error(error.message);
      await safeRelease().catch(() => undefined);
      throw error;
    }
    const rollbackTargets = candidate.isPrivate
      ? effectTx === candidateTx
        ? []
        : [effectTx]
      : [...securityTransactions].reverse().concat(effectTx, candidateTx);
    try {
      if (!candidate.isPrivate) {
        await nativeLifecycle?.preserveAfterNativeStart(finalizationStarted, error);
      }
      await rollbackTransactions(error, rollbackTargets);
    } catch (rollbackError) {
      options.logger.error(
        rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
      );
      await safeRelease().catch(() => undefined);
      throw rollbackError;
    }
    await safeRelease().catch(() => undefined);
    try {
      await discardPrivateCandidate(candidate.root, candidate.isPrivate);
    } catch (cleanupError) {
      throw new InstallerRollbackError(error, [cleanupError]);
    }
    throw error;
  } finally {
    await safeRelease();
  }
}
