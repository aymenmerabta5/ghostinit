import type { DependencySecurityRepairPlan } from "../../domain/dependency-security/types.js";
import {
  stageDependencySecurityMaintenance,
  type DependencySecurityMaintenanceSnapshot,
} from "../dependency-security-maintenance.js";
import { FsTransaction } from "../fs.js";
import type { LockOwner } from "../lock.js";
import { installationJournalContent, securityLeaseContent } from "./journal.js";
import {
  assertSecurityInputsUnchanged,
  SECURITY_JOURNAL_PATH,
  type SecurityWorkspaceSnapshot,
} from "./workspace.js";

export interface PublishedSecuritySources {
  readonly journal: string;
  readonly guards: ReadonlyMap<string, string | null>;
}

export async function publishSecuritySources(
  snapshot: SecurityWorkspaceSnapshot,
  maintenance: DependencySecurityMaintenanceSnapshot,
  repair: DependencySecurityRepairPlan,
  owner: LockOwner,
  onCommitted?: (transaction: FsTransaction) => void,
): Promise<PublishedSecuritySources> {
  const tx = new FsTransaction(snapshot.root);
  await tx.assertUnchanged(".ghostinit.lock", await securityLeaseContent(snapshot.root, owner));
  await assertSecurityInputsUnchanged(tx, snapshot);
  await stageDependencySecurityMaintenance(tx, snapshot.root, maintenance, repair);
  const journal = installationJournalContent(repair);
  await tx.writeIfUnchanged(
    SECURITY_JOURNAL_PATH,
    journal,
    snapshot.files.get(SECURITY_JOURNAL_PATH) ?? null,
  );
  const guards = new Map(snapshot.files);
  guards.set("ghostinit.config.json", maintenance.desiredConfigContent);
  guards.set(".ghostinit/state.json", maintenance.stateContent);
  for (const file of tx.getStagedFiles()) guards.set(file.path, file.content);
  await tx.commit();
  onCommitted?.(tx);
  return { journal, guards };
}
