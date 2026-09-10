// @allow-long 323: one phase coordinator binds metadata verification, source publication, and installed recovery
import { lstat, mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { runtime as toolchainRuntime, supplyChain } from "../../../packages/versions/src/index.js";
import type {
  DependencySecurityAdvisory,
  DependencySecurityRepairPlan,
  DependencySecurityResult,
} from "../../domain/dependency-security/types.js";
import { snapshotDependencySecurityMaintenance } from "../dependency-security-maintenance.js";
import { FsTransaction } from "../fs.js";
import { acquireLock, type LockOwner } from "../lock.js";
import { Logger } from "../logger.js";
import {
  InstallerInterruptedError,
  InstallerProcessTreeError,
  resolveCanonicalBunExecutable,
  runSupervisedCommand,
} from "../process-supervisor.js";
import {
  isBlockingAdvisory,
  parseAuditFixReport,
  parseAuditReport,
  type AuditFixReport,
} from "./audit.js";
import { parseSecurityLockEvidence } from "./evidence.js";
import { createSecurityCreationController, type SecurityCreationController } from "./creation.js";
import {
  clearSecurityJournal,
  parseSecurityInstallationJournal,
  retainFailedSecurityJournal,
  retainUnverifiedCleanupJournal,
  securityLeaseContent,
} from "./journal.js";
import { publishSecuritySources, type PublishedSecuritySources } from "./publication.js";
import {
  buildSecurityRepairPlan,
  materializeSecurityManifestEdits,
  prepareSecurityManifestEdits,
} from "./repair-plan.js";
import { SecurityCommandRunner } from "./runner.js";
import type {
  DependencySecurityPolicy,
  DependencySecurityRunOptions,
  DependencySecurityRuntimeDependencies,
  SecurityLockEvidence,
} from "./runtime-types.js";
import { ADVISORY_ID, invalid, packageName } from "./validation.js";
import {
  assertSecurityInputsUnchanged,
  copySecuritySnapshot,
  SECURITY_JOURNAL_PATH,
  securityWorkspaceManifestPaths,
  snapshotSecurityWorkspace,
  type SecurityWorkspaceSnapshot,
} from "./workspace.js";

const EMPTY_FIX_REPORT: AuditFixReport = {
  dryRun: false,
  fixes: [],
  blockedPackages: [],
  unfixablePackages: [],
};

function result(
  options: DependencySecurityRunOptions,
  status: DependencySecurityResult["status"],
  remaining: readonly DependencySecurityAdvisory[],
  extras: Partial<DependencySecurityResult> = {},
): DependencySecurityResult {
  return {
    status,
    dryRun: options.dryRun === true,
    applied: false,
    installedVerified: false,
    changes: [],
    remaining,
    verifiedPatchAdvisories: [],
    ...extras,
  };
}

function validatePolicy(policy: DependencySecurityPolicy): void {
  if (
    policy.expectedBunVersion !== toolchainRuntime.bun ||
    !Number.isSafeInteger(policy.minimumReleaseAgeSeconds) ||
    policy.minimumReleaseAgeSeconds < supplyChain.minimumReleaseAgeSeconds ||
    typeof policy.auditScriptContent !== "string" ||
    policy.auditScriptContent.length === 0
  )
    invalid("unsupported Bun version or dependency-security policy");
  for (const patch of policy.patchedAdvisories) {
    packageName(patch.package);
    if (!ADVISORY_ID.test(patch.id)) invalid("patched advisory policy has an invalid ID");
  }
}

function mayBePatched(item: DependencySecurityAdvisory, policy: DependencySecurityPolicy): boolean {
  return policy.patchedAdvisories.some(
    (patch) =>
      patch.package === item.package && item.url === `https://github.com/advisories/${patch.id}`,
  );
}

function findings(
  advisories: readonly DependencySecurityAdvisory[],
  report: AuditFixReport,
  policy: DependencySecurityPolicy,
  patchVerified: boolean,
): DependencySecurityAdvisory[] {
  return advisories.map((item) => ({
    ...item,
    disposition:
      patchVerified && mayBePatched(item, policy)
        ? "patched"
        : report.blockedPackages.includes(item.package)
          ? "blocked-range"
          : report.unfixablePackages.includes(item.package)
            ? "no-published-fix"
            : "unresolved",
  }));
}

function successfulStatus(
  remaining: readonly DependencySecurityAdvisory[],
  changed: boolean,
): DependencySecurityResult["status"] {
  if (remaining.some((item) => item.disposition !== "patched")) return "partial";
  return changed ? "fixed" : "clean";
}

function patchIds(remaining: readonly DependencySecurityAdvisory[]): string[] {
  return [
    ...new Set(
      remaining
        .filter((item) => item.disposition === "patched")
        .map((item) => item.url.split("/").at(-1)!),
    ),
  ].sort();
}

async function evidence(
  candidate: string,
  runner: SecurityCommandRunner,
): Promise<SecurityLockEvidence> {
  await runner.audit(candidate, "--refresh-lock-evidence");
  const reader = new FsTransaction(candidate);
  const source = await reader.readText("dependency-lock-evidence.json");
  const lock = await reader.readText("bun.lock");
  if (source === undefined || lock === undefined)
    invalid("canonical verifier did not produce lock evidence");
  return parseSecurityLockEvidence(source, lock, runner.policy);
}

async function auditReport(
  cwd: string,
  runner: SecurityCommandRunner,
): Promise<DependencySecurityAdvisory[]> {
  const command = await runner.run(cwd, ["audit", "--json"], "Dependency advisory audit", true);
  return parseAuditReport(command.stdout, command.exitCode);
}

async function assertCandidateInputs(
  candidate: string,
  snapshot: SecurityWorkspaceSnapshot,
  beforeInstallation: boolean,
): Promise<void> {
  const tx = new FsTransaction(candidate);
  for (const [path, content] of snapshot.files) {
    if (!["bun.lock", "dependency-lock-evidence.json", SECURITY_JOURNAL_PATH].includes(path))
      await tx.assertUnchanged(path, content);
  }
  if (beforeInstallation) {
    for (const path of snapshot.manifests.keys()) {
      try {
        await lstat(join(candidate, path.slice(0, -"package.json".length), "node_modules"));
        invalid("metadata-only remediation unexpectedly created node_modules");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
  }
}

async function assertCandidatePlan(
  candidate: string,
  snapshot: SecurityWorkspaceSnapshot,
  plan: DependencySecurityRepairPlan,
): Promise<void> {
  const tx = new FsTransaction(candidate);
  const expected = new Map(snapshot.files);
  for (const file of plan.files) expected.set(file.path, file.after);
  for (const [path, content] of expected) {
    if (path !== SECURITY_JOURNAL_PATH) await tx.assertUnchanged(path, content);
  }
}

async function verifyFinalSources(
  snapshot: SecurityWorkspaceSnapshot,
  published: PublishedSecuritySources,
  owner: LockOwner,
): Promise<void> {
  const tx = new FsTransaction(snapshot.root);
  await tx.assertUnchanged(".ghostinit.lock", await securityLeaseContent(snapshot.root, owner));
  for (const [path, content] of published.guards) await tx.assertUnchanged(path, content);
  const membership = await securityWorkspaceManifestPaths(
    snapshot.root,
    snapshot.manifests.get("package.json")!,
  );
  if (JSON.stringify(membership) !== JSON.stringify([...snapshot.manifests.keys()]))
    invalid("workspace membership changed during installation");
}

async function readOnlyResult(
  options: DependencySecurityRunOptions,
  snapshot: SecurityWorkspaceSnapshot,
  runner: SecurityCommandRunner,
  advisories: readonly DependencySecurityAdvisory[],
  report: AuditFixReport,
  plan?: DependencySecurityRepairPlan,
): Promise<DependencySecurityResult> {
  let patchVerified = false;
  if (advisories.some((item) => mayBePatched(item, options.policy))) {
    try {
      await runner.audit(snapshot.root);
      patchVerified = true;
    } catch (error) {
      if (error instanceof InstallerProcessTreeError || error instanceof InstallerInterruptedError)
        throw error;
      // A waiver needs a complete installed verification.
    }
  }
  await assertSecurityInputsUnchanged(new FsTransaction(snapshot.root), snapshot);
  const remaining = findings(advisories, report, options.policy, patchVerified);
  return result(
    options,
    remaining.some(isBlockingAdvisory)
      ? "blocked"
      : successfulStatus(remaining, (plan?.changes.length ?? 0) > 0),
    remaining,
    {
      changes: plan?.changes ?? [],
      verifiedPatchAdvisories: patchIds(remaining),
      message:
        options.mode === "audit"
          ? "Dependency audit completed without changing project files."
          : "Security repair preview completed; project files and installed dependencies were unchanged.",
    },
  );
}

interface SecurityRecoveryContext {
  readonly root: string;
  readonly journal: string | null;
  readonly markUnverifiedCleanup?: () => Promise<void>;
}

type PublishedSecurityPhase =
  | "creation continuation setup"
  | "published source verification"
  | "dependency lock verification"
  | "creation installation preparation"
  | "pre-install source verification"
  | "project dependency installation"
  | "installed source verification"
  | "installed dependency audit"
  | "bun run typecheck"
  | "bun run lint:all"
  | "bun run test"
  | "final source verification"
  | "installation journal completion";

async function execute(
  options: DependencySecurityRunOptions,
  runner: SecurityCommandRunner,
  candidate: string,
  owner: LockOwner | undefined,
  captureRecovery: (context: SecurityRecoveryContext) => void,
): Promise<DependencySecurityResult> {
  const snapshot = await snapshotSecurityWorkspace(options.cwd, options.policy);
  const maintenance = await snapshotDependencySecurityMaintenance(snapshot.root);
  if (options.createLifecycle && maintenance.desiredConfigContent === null)
    invalid("deferred creation requires generated project configuration");
  if (
    options.createLifecycle &&
    (maintenance.stateContent !== null ||
      (snapshot.files.get(SECURITY_JOURNAL_PATH) ?? null) !== null)
  )
    invalid("deferred creation requires no previous state or installation journal");
  const previousJournal = parseSecurityInstallationJournal(
    snapshot.files.get(SECURITY_JOURNAL_PATH) ?? null,
    snapshot.files.get("bun.lock") ?? null,
    options.mode === "audit" || options.dryRun === true,
  );
  captureRecovery({
    root: snapshot.root,
    journal: snapshot.files.get(SECURITY_JOURNAL_PATH) ?? null,
  });
  const freshLock = options.bootstrap === true || options.reconcileLock === true;
  await copySecuritySnapshot(snapshot, candidate, { freshLock });
  if (freshLock) {
    await runner.run(
      candidate,
      ["install", "--lockfile-only", "--ignore-scripts"],
      "Fresh dependency lock resolution",
    );
  } else if (snapshot.files.get("bun.lock") === null) {
    return result(options, "blocked", [], {
      message: "A regular bun.lock is required. Run the project's verified bootstrap first.",
    });
  }
  const originalEvidence = await evidence(candidate, runner);
  await assertCandidateInputs(candidate, snapshot, true);
  const before = await auditReport(candidate, runner);
  if (options.mode === "audit") {
    const audited = await readOnlyResult(options, snapshot, runner, before, EMPTY_FIX_REPORT);
    return previousJournal
      ? {
          ...audited,
          status: "blocked",
          recoveryRequired: true,
          message:
            previousJournal.status === "CLEANUP_UNVERIFIED"
              ? "Audit completed without changing project files. A prior dependency installation still requires independent cleanup verification before mutations can resume."
              : "A previous dependency installation requires recovery. Run ghostinit security fix.",
        }
      : audited;
  }
  let report = EMPTY_FIX_REPORT;
  if (before.length > 0) {
    const command = await runner.run(
      candidate,
      ["audit", "fix", "--lockfile-only", "--ignore-scripts", "--json"],
      "Compatible security repair",
      true,
    );
    report = parseAuditFixReport(command.stdout, false);
    await assertCandidateInputs(candidate, snapshot, true);
  }
  const edits = prepareSecurityManifestEdits(snapshot, report, before, originalEvidence);
  await materializeSecurityManifestEdits(candidate, snapshot, edits);
  if (report.fixes.length > 0)
    await runner.run(
      candidate,
      ["install", "--lockfile-only", "--ignore-scripts"],
      "Repaired dependency lock resolution",
    );
  const verifiedEvidence =
    report.fixes.length > 0 ? await evidence(candidate, runner) : originalEvidence;
  const plan = await buildSecurityRepairPlan(candidate, snapshot, report, edits, verifiedEvidence);
  await assertCandidatePlan(candidate, snapshot, plan);
  const after = await auditReport(candidate, runner);
  if (options.dryRun) {
    const preview = await readOnlyResult(options, snapshot, runner, after, report, plan);
    return previousJournal?.status === "CLEANUP_UNVERIFIED"
      ? {
          ...preview,
          status: "blocked",
          recoveryRequired: true,
          message:
            "Repair preview completed without changing project files. Independent cleanup verification is still required before applying changes.",
        }
      : preview;
  }
  let remaining = findings(after, report, options.policy, false);
  if (remaining.some((item) => isBlockingAdvisory(item) && !mayBePatched(item, options.policy)))
    return result(options, "blocked", remaining, {
      changes: plan.changes,
      message:
        "Unresolved HIGH/CRITICAL vulnerabilities prevent publication; project files were unchanged.",
    });
  await runner.run(
    candidate,
    ["install", "--frozen-lockfile", "--ignore-scripts"],
    "Candidate dependency installation",
  );
  await runner.audit(candidate);
  remaining = findings(await auditReport(candidate, runner), report, options.policy, true);
  if (remaining.some(isBlockingAdvisory))
    return result(options, "blocked", remaining, { changes: plan.changes });
  await runner.audit(candidate, "--lock-only");
  await assertCandidatePlan(candidate, snapshot, plan);
  if (!owner) invalid("source publication requires a project lease");
  const published = await publishSecuritySources(
    snapshot,
    maintenance,
    plan,
    owner,
    options.onTransactionCommitted,
  );
  captureRecovery({ root: snapshot.root, journal: published.journal });
  let creation: SecurityCreationController | undefined;
  let createHookFailed = false;
  let currentOperation: PublishedSecurityPhase = "creation continuation setup";
  const captureCreationRecovery = (journal: string): void => {
    const controller = creation;
    captureRecovery({
      root: snapshot.root,
      journal,
      ...(controller
        ? {
            markUnverifiedCleanup: () =>
              controller.publication.completion.fail({ cleanupVerified: false }),
          }
        : {}),
    });
  };
  try {
    if (options.createLifecycle) {
      creation = await createSecurityCreationController(
        snapshot,
        published,
        plan,
        owner,
        options.onTransactionCommitted,
        captureCreationRecovery,
      );
      captureCreationRecovery(published.journal);
    }
    currentOperation = "published source verification";
    await verifyFinalSources(snapshot, published, owner);
    currentOperation = "dependency lock verification";
    await runner.audit(snapshot.root, "--lock-only");
    if (creation && options.createLifecycle) {
      currentOperation = "creation installation preparation";
      try {
        await options.createLifecycle.beforeProjectInstall(creation.publication);
      } catch (error) {
        createHookFailed = true;
        throw error;
      }
      currentOperation = "pre-install source verification";
      await verifyFinalSources(snapshot, published, owner);
    }
    currentOperation = "project dependency installation";
    await runner.run(
      snapshot.root,
      ["install", "--frozen-lockfile"],
      "Project dependency installation",
    );
    currentOperation = "installed source verification";
    await verifyFinalSources(snapshot, published, owner);
    currentOperation = "installed dependency audit";
    await runner.audit(snapshot.root);
    if (options.verifyProject) {
      const manifest = snapshot.manifests.get("package.json")!;
      for (const script of ["typecheck", "lint:all", "test"] as const) {
        currentOperation = `bun run ${script}`;
        if (
          typeof manifest.scripts !== "object" ||
          manifest.scripts === null ||
          typeof (manifest.scripts as Record<string, unknown>)[script] !== "string"
        )
          invalid(`project verification requires the ${script} script`);
        await runner.run(snapshot.root, ["run", script], `Project ${script}`);
      }
    }
    currentOperation = "final source verification";
    await verifyFinalSources(snapshot, published, owner);
    currentOperation = "installation journal completion";
    if (creation) creation.markVerified();
    else
      await clearSecurityJournal(
        snapshot.root,
        published.journal,
        owner,
        published.guards,
        options.onTransactionCommitted,
      );
    return result(options, successfulStatus(remaining, plan.changes.length > 0), remaining, {
      changes: plan.changes,
      applied: plan.files.length > 0,
      installedVerified: true,
      verifiedPatchAdvisories: patchIds(remaining),
      message: remaining.some((item) => item.disposition !== "patched")
        ? "Compatible fixes are installed and verified; lower-severity findings still require attention."
        : "Dependencies are installed and verified under the existing security policy.",
    });
  } catch (error) {
    if (runner.canRemoveTemporaryFiles === false) throw error;
    try {
      if (creation) await creation.publication.completion.fail({ cleanupVerified: true });
      else
        await retainFailedSecurityJournal(
          snapshot.root,
          published.journal,
          owner,
          options.onTransactionCommitted,
        );
    } catch {
      /* Preserve racing journal edits; published sources still require recovery. */
    }
    if (
      createHookFailed ||
      error instanceof InstallerProcessTreeError ||
      error instanceof InstallerInterruptedError
    )
      throw error;
    return result(options, "failed", remaining, {
      changes: plan.changes,
      applied: true,
      recoveryRequired: true,
      message: `Dependency sources were published, but ${currentOperation} failed. Published sources require recovery; installed dependencies have not been rolled back. Inspect any recovery journal and current project files before retrying ghostinit security fix.`,
    });
  }
}

/** @internal Dependency injection does not change the production trust boundary. */
export async function runDependencySecurityWithDependencies(
  options: DependencySecurityRunOptions,
  dependencies: DependencySecurityRuntimeDependencies,
): Promise<DependencySecurityResult> {
  validatePolicy(options.policy);
  if (options.reconcileLock && (options.mode !== "install" || options.dryRun === true))
    invalid("lock reconciliation is limited to a dependency-affecting installation");
  if (
    options.createLifecycle &&
    (options.createLifecycle.kind !== "existing-empty-root" ||
      options.mode !== "install" ||
      options.bootstrap !== true ||
      !options.leaseOwner ||
      options.dryRun === true)
  )
    invalid("deferred creation is limited to a live bootstrap with a caller-owned lease");
  const mutating = options.mode !== "audit" && options.dryRun !== true;
  const logger = options.logger ?? new Logger({ quiet: true });
  let lease: Awaited<ReturnType<typeof acquireLock>> | undefined;
  let temporary: string | undefined;
  let runner: SecurityCommandRunner | undefined;
  let recovery: SecurityRecoveryContext | undefined;
  let owner: LockOwner | undefined;
  try {
    if (mutating && !options.leaseOwner) lease = await acquireLock(options.cwd, logger);
    owner = options.leaseOwner ?? lease?.owner;
    if (mutating && owner) await securityLeaseContent(options.cwd, owner);
    temporary = await mkdtemp(join(tmpdir(), "ghostinit-security-"));
    const nested = relative(resolve(options.cwd), resolve(temporary));
    if (nested === "" || (!nested.startsWith("..") && !isAbsolute(nested)))
      invalid("security candidates must be outside the project");
    const candidate = join(temporary, "candidate");
    await mkdir(candidate);
    await mkdir(join(temporary, "home"));
    const helper = new FsTransaction(temporary);
    await helper.write("audit-dependencies.ts", options.policy.auditScriptContent);
    await helper.commit();
    runner = new SecurityCommandRunner(
      options.policy,
      dependencies,
      temporary,
      options.onContainmentFallback,
    );
    return await execute(options, runner, candidate, owner, (context) => {
      recovery = context;
    });
  } catch (error) {
    if (mutating && owner && recovery && runner?.canRemoveTemporaryFiles === false) {
      try {
        if (recovery.markUnverifiedCleanup) await recovery.markUnverifiedCleanup();
        else
          await retainUnverifiedCleanupJournal(
            recovery.root,
            recovery.journal,
            owner,
            options.onTransactionCommitted,
          );
      } catch {
        // Preserve conflicting journal bytes and the fatal cleanup error. The
        // owned lease is retained even when the recovery marker cannot be written.
      }
    }
    throw error;
  } finally {
    try {
      if (temporary && runner?.canRemoveTemporaryFiles !== false) {
        // Only delete the exact directory returned by mkdtemp, never a project path.
        const canonical = await realpath(temporary);
        if (resolve(canonical) === resolve(temporary))
          await rm(temporary, { recursive: true, force: true });
      }
    } finally {
      // Unknown descendants may still write: never open this lease for another
      // mutation. Caller-owned leases have no release path in this runtime.
      if (runner?.canRemoveTemporaryFiles !== false) await lease?.release();
    }
  }
}

export async function runDependencySecurity(
  options: DependencySecurityRunOptions,
): Promise<DependencySecurityResult> {
  return runDependencySecurityWithDependencies(options, {
    resolveBun: resolveCanonicalBunExecutable,
    runCommand: runSupervisedCommand,
  });
}
