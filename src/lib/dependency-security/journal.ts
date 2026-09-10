import { randomUUID } from "node:crypto";
import type { DependencySecurityRepairPlan } from "../../domain/dependency-security/types.js";
import { hashContent } from "../checksum.js";
import { FsTransaction } from "../fs.js";
import type { LockOwner } from "../lock.js";
import { LockError } from "../errors.js";
import { SECURITY_JOURNAL_PATH } from "./workspace.js";
import { invalid, parseJson, record, utcTimestamp } from "./validation.js";
import type { DependencySecurityCleanupReason } from "./runtime-types.js";

export interface SecurityInstallationJournal {
  readonly schemaVersion: 1;
  readonly operationId: string;
  readonly status: "INSTALLING" | "FAILED" | "CLEANUP_UNVERIFIED";
  readonly beforeLockSha256: string | null;
  readonly afterLockSha256: string | null;
  readonly startedAt: string;
  readonly updatedAt: string;
  readonly recoveryRequired: true;
  readonly cleanupReason?: DependencySecurityCleanupReason;
}

export function parseSecurityInstallationJournal(
  content: string | null,
  lock: string | null,
  allowUnverifiedCleanup = false,
): SecurityInstallationJournal | null {
  if (content === null) return null;
  const parsed = record(parseJson(content, "installation journal"), "installation journal");
  const journal = record(parsed, "installation journal", [
    "schemaVersion",
    "operationId",
    "status",
    "beforeLockSha256",
    "afterLockSha256",
    "startedAt",
    "updatedAt",
    "recoveryRequired",
    ...(Object.hasOwn(parsed, "cleanupReason") ? ["cleanupReason"] : []),
  ]);
  if (
    journal.schemaVersion !== 1 ||
    typeof journal.operationId !== "string" ||
    !/^[0-9a-f-]{36}$/.test(journal.operationId) ||
    !["INSTALLING", "FAILED", "CLEANUP_UNVERIFIED"].includes(String(journal.status)) ||
    journal.recoveryRequired !== true ||
    (journal.beforeLockSha256 !== null &&
      (typeof journal.beforeLockSha256 !== "string" ||
        !/^[a-f0-9]{64}$/.test(journal.beforeLockSha256))) ||
    (journal.afterLockSha256 !== null &&
      (typeof journal.afterLockSha256 !== "string" ||
        !/^[a-f0-9]{64}$/.test(journal.afterLockSha256)))
  )
    invalid("installation recovery journal is invalid");
  if (
    journal.cleanupReason !== undefined &&
    (journal.status === "INSTALLING" ||
      !["process-tree", "creation-finalization"].includes(String(journal.cleanupReason)) ||
      (journal.status === "FAILED" && journal.cleanupReason !== "creation-finalization"))
  )
    invalid("installation cleanup reason is invalid");
  const startedAt = utcTimestamp(journal.startedAt, "installation start");
  const updatedAt = utcTimestamp(journal.updatedAt, "installation update");
  if (journal.status === "CLEANUP_UNVERIFIED" && !allowUnverifiedCleanup)
    invalid(
      "a prior dependency installation has unverified cleanup; further repair is blocked until cleanup is independently verified and its recovery journal is explicitly reconciled",
    );
  if (
    journal.status !== "CLEANUP_UNVERIFIED" &&
    (lock === null || hashContent(lock) !== journal.afterLockSha256)
  )
    invalid(
      "dependency sources changed after an incomplete installation; reconcile the recovery journal before retrying",
    );
  return {
    schemaVersion: 1,
    operationId: journal.operationId,
    status: journal.status as SecurityInstallationJournal["status"],
    beforeLockSha256: journal.beforeLockSha256 as string | null,
    afterLockSha256: journal.afterLockSha256 as string | null,
    startedAt,
    updatedAt,
    recoveryRequired: true,
    ...(journal.cleanupReason === undefined
      ? {}
      : { cleanupReason: journal.cleanupReason as DependencySecurityCleanupReason }),
  };
}

export function installationJournalContent(plan: DependencySecurityRepairPlan): string {
  const now = new Date().toISOString();
  const journal: SecurityInstallationJournal = {
    schemaVersion: 1,
    operationId: randomUUID(),
    status: "INSTALLING",
    beforeLockSha256: plan.beforeLockSha256,
    afterLockSha256: plan.afterLockSha256,
    startedAt: now,
    updatedAt: now,
    recoveryRequired: true,
  };
  return `${JSON.stringify(journal, null, 2)}\n`;
}

export async function securityLeaseContent(root: string, owner: LockOwner): Promise<string> {
  if (!owner.token) throw new LockError("Dependency security requires a token-owned project lease");
  const source = await new FsTransaction(root).readText(".ghostinit.lock");
  if (source === undefined) throw new LockError("Dependency security lost its project lease");
  const value = record(parseJson(source, "project lease"), "project lease");
  if (value.token !== owner.token || value.pid !== owner.pid || value.startTime !== owner.startTime)
    throw new LockError("Dependency security no longer owns its project lease");
  return source;
}

export async function retainFailedSecurityJournal(
  root: string,
  expected: string,
  owner: LockOwner,
  onCommitted?: (transaction: FsTransaction) => void,
  reason?: "creation-finalization",
): Promise<string> {
  const value = record(parseJson(expected, "installation journal"), "installation journal");
  if (value.status === "CLEANUP_UNVERIFIED")
    invalid("unverified installation cleanup cannot be downgraded to an ordinary failed journal");
  const content = `${JSON.stringify({ ...value, status: "FAILED", ...(reason ? { cleanupReason: reason } : {}), updatedAt: new Date().toISOString() }, null, 2)}\n`;
  const tx = new FsTransaction(root);
  await tx.assertUnchanged(".ghostinit.lock", await securityLeaseContent(root, owner));
  await tx.writeIfUnchanged(SECURITY_JOURNAL_PATH, content, expected);
  await tx.commit();
  onCommitted?.(tx);
  return content;
}

/** This marker cannot be cleared by an automatic retry, even after lease expiry. */
export async function retainUnverifiedCleanupJournal(
  root: string,
  expected: string | null,
  owner: LockOwner,
  onCommitted?: (transaction: FsTransaction) => void,
  cleanupReason: DependencySecurityCleanupReason = "process-tree",
): Promise<string> {
  const tx = new FsTransaction(root);
  await tx.assertUnchanged(".ghostinit.lock", await securityLeaseContent(root, owner));
  const lock = (await tx.readText("bun.lock")) ?? null;
  await tx.assertUnchanged("bun.lock", lock);
  const lockHash = lock === null ? null : hashContent(lock);
  const now = new Date().toISOString();
  const previous =
    expected === null
      ? {
          schemaVersion: 1,
          operationId: randomUUID(),
          beforeLockSha256: lockHash,
          startedAt: now,
          recoveryRequired: true,
        }
      : record(parseJson(expected, "installation journal"), "installation journal");
  const content = `${JSON.stringify({ ...previous, status: "CLEANUP_UNVERIFIED", cleanupReason, afterLockSha256: lockHash, updatedAt: now }, null, 2)}\n`;
  await tx.writeIfUnchanged(SECURITY_JOURNAL_PATH, content, expected);
  await tx.commit();
  onCommitted?.(tx);
  return content;
}

export async function clearSecurityJournal(
  root: string,
  expected: string,
  owner: LockOwner,
  sourceGuards: ReadonlyMap<string, string | null>,
  onCommitted?: (transaction: FsTransaction) => void,
): Promise<void> {
  const tx = new FsTransaction(root);
  await tx.assertUnchanged(".ghostinit.lock", await securityLeaseContent(root, owner));
  for (const [path, content] of sourceGuards) {
    if (path !== SECURITY_JOURNAL_PATH) await tx.assertUnchanged(path, content);
  }
  await tx.deleteIfUnchanged(SECURITY_JOURNAL_PATH, expected);
  await tx.commit();
  onCommitted?.(tx);
}
