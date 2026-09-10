import { realpath } from "node:fs/promises";
import { dirname, join } from "node:path";
import { buildGenerationPlan } from "../../domain/generation/plan-builder.js";
import type { GenerationPlan } from "../../domain/generation/types.js";
import { canonicalJson } from "../../domain/project/canonical.js";
import { canonicalDesiredProjectConfig } from "../../domain/project/desired-canonical.js";
import type { DependencySecurityRepairPlan } from "../../domain/dependency-security/types.js";
import { PROJECT_CONFIG_FILE, projectDesiredConfigSchema, stateV2Schema } from "../config.js";
import { FsTransaction } from "../fs.js";
import type { LockOwner } from "../lock.js";
import { resolveDesiredProjectConfig } from "../project-config.js";
import { createGenerationPlanState, createManagedFileStateFromPlan } from "../state.js";
import {
  clearSecurityJournal,
  retainFailedSecurityJournal,
  retainUnverifiedCleanupJournal,
} from "./journal.js";
import type { PublishedSecuritySources } from "./publication.js";
import type {
  DependencySecurityCreateCompletion,
  DependencySecurityCreatePublication,
} from "./runtime-types.js";
import { invalid, parseJson, record } from "./validation.js";
import {
  SECURITY_JOURNAL_PATH,
  securityWorkspaceManifestPaths,
  type SecurityWorkspaceSnapshot,
} from "./workspace.js";

const STATE_PATH = ".ghostinit/state.json";

async function finalCreationGuards(
  snapshot: SecurityWorkspaceSnapshot,
  published: PublishedSecuritySources,
  plan: GenerationPlan,
  stateContent: string,
): Promise<ReadonlyMap<string, string | null>> {
  const rebuilt = buildGenerationPlan({
    projectConfigHash: plan.projectConfigHash,
    files: plan.files,
    secrets: plan.secrets,
  });
  if (rebuilt.planHash !== plan.planHash)
    invalid("creation completion received an invalid final plan hash");
  const config = published.guards.get(PROJECT_CONFIG_FILE);
  if (typeof config !== "string" || published.guards.get(STATE_PATH) !== null)
    invalid("deferred completion requires newly created project configuration and state");
  const desired = canonicalDesiredProjectConfig(
    projectDesiredConfigSchema.parse(parseJson(config, "published project configuration")),
  );
  const resolved = resolveDesiredProjectConfig(desired);
  if (plan.projectConfigHash !== resolved.configHash)
    invalid("creation completion changed the verified project configuration");
  const state = stateV2Schema.parse(parseJson(stateContent, "creation state"));
  if (
    state.pendingOperation !== null ||
    state.configHash !== resolved.configHash ||
    canonicalJson(state.generationPlan) !== canonicalJson(createGenerationPlanState(rebuilt))
  )
    invalid("creation state does not attest the known final plan");
  const expectedManifests = [...snapshot.manifests.keys()].sort();
  const finalManifests = rebuilt.files
    .filter(
      (file) => file.physicalPath === "package.json" || file.physicalPath.endsWith("/package.json"),
    )
    .map((file) => file.physicalPath)
    .sort();
  if (JSON.stringify(expectedManifests) !== JSON.stringify(finalManifests))
    invalid("creation completion changed the declared workspace manifests");
  const guards = new Map(published.guards);
  for (const path of [...expectedManifests, PROJECT_CONFIG_FILE]) {
    const before = published.guards.get(path);
    const final = rebuilt.files.find((file) => file.physicalPath === path);
    if (typeof before !== "string" || !final)
      invalid("creation completion omitted dependency or project configuration");
    const priorValue = parseJson(before, "published metadata");
    const finalValue = parseJson(final.content, "final plan metadata");
    const same =
      path === PROJECT_CONFIG_FILE
        ? canonicalJson(
            canonicalDesiredProjectConfig(projectDesiredConfigSchema.parse(priorValue)),
          ) ===
          canonicalJson(canonicalDesiredProjectConfig(projectDesiredConfigSchema.parse(finalValue)))
        : canonicalJson(priorValue) === canonicalJson(finalValue);
    if (!same) invalid("creation completion changed dependency or project-config semantics");
    guards.set(path, final.content);
  }
  const selfIssuedDestinations = new Set(
    rebuilt.secrets
      .filter((secret) => secret.kind === "generate-self-issued")
      .flatMap((secret) => secret.destinations.map((destination) => destination.physicalPath)),
  );
  const reader = new FsTransaction(snapshot.root);
  for (const file of rebuilt.files) {
    // Only explicitly planned self-issued destinations differ from placeholder
    // plan bytes; their saved state is bound to the exact materialized content.
    const content = selfIssuedDestinations.has(file.physicalPath)
      ? await reader.readText(file.physicalPath)
      : file.content;
    if (
      content === undefined ||
      !state.files[file.physicalPath] ||
      canonicalJson(state.files[file.physicalPath]) !==
        canonicalJson(createManagedFileStateFromPlan(file, content))
    )
      invalid("creation state does not attest final generated file bytes");
    if (guards.has(file.physicalPath) && guards.get(file.physicalPath) !== content)
      invalid("creation completion changed protected installation metadata");
    guards.set(file.physicalPath, content);
  }
  guards.set(STATE_PATH, stateContent);
  return guards;
}

export interface SecurityCreationController {
  readonly publication: DependencySecurityCreatePublication;
  readonly markVerified: () => void;
}

/** A live enclosing create operation owns this closure; it is not a resumable protocol. */
export async function createSecurityCreationController(
  snapshot: SecurityWorkspaceSnapshot,
  published: PublishedSecuritySources,
  repair: DependencySecurityRepairPlan,
  owner: LockOwner,
  onCommitted: ((transaction: FsTransaction) => void) | undefined,
  onJournalChanged: (content: string) => void,
): Promise<SecurityCreationController> {
  let phase: "installing" | "ready" | "failed" | "unsafe" | "complete" = "installing";
  let journal = published.journal;
  let active = false;
  const completion: DependencySecurityCreateCompletion = Object.freeze({
    complete: async ({
      plan,
      stateContent,
    }: Parameters<DependencySecurityCreateCompletion["complete"]>[0]) => {
      if (active || phase !== "ready")
        invalid(
          "creation completion requires a verified installation and an unfinished creation operation",
        );
      active = true;
      try {
        const guards = await finalCreationGuards(snapshot, published, plan, stateContent);
        const membership = await securityWorkspaceManifestPaths(
          snapshot.root,
          snapshot.manifests.get("package.json")!,
        );
        if (JSON.stringify(membership) !== JSON.stringify([...snapshot.manifests.keys()]))
          invalid("workspace membership changed before creation completion");
        await clearSecurityJournal(snapshot.root, journal, owner, guards, onCommitted);
        phase = "complete";
      } finally {
        active = false;
      }
    },
    fail: async ({
      cleanupVerified,
      reason,
    }: Parameters<DependencySecurityCreateCompletion["fail"]>[0]) => {
      if (active || phase === "complete")
        invalid("creation failure cannot replace an active or completed journal transition");
      if (phase === "unsafe" || (phase === "failed" && cleanupVerified && reason === undefined))
        return;
      active = true;
      try {
        journal = cleanupVerified
          ? await retainFailedSecurityJournal(snapshot.root, journal, owner, onCommitted, reason)
          : await retainUnverifiedCleanupJournal(
              snapshot.root,
              journal,
              owner,
              onCommitted,
              reason ?? "process-tree",
            );
        phase = cleanupVerified ? "failed" : "unsafe";
        onJournalChanged(journal);
      } finally {
        active = false;
      }
    },
  });
  const parsedJournal = record(
    parseJson(journal, "creation installation journal"),
    "creation installation journal",
  );
  if (typeof parsedJournal.operationId !== "string")
    invalid("creation installation journal has no identity");
  const manifestPaths = [...snapshot.manifests.keys()];
  const workspaceRoots = await Promise.all(
    manifestPaths
      .filter((path) => path !== "package.json")
      .map(async (path) => {
        const expected = dirname(join(snapshot.root, path));
        const canonical = await realpath(expected);
        if (canonical !== expected)
          invalid("workspace location changed before project installation");
        return canonical;
      }),
  );
  return {
    publication: Object.freeze({
      root: snapshot.root,
      workspaceRoots: Object.freeze(workspaceRoots),
      manifestPaths: Object.freeze(manifestPaths),
      beforeLockSha256: repair.beforeLockSha256,
      afterLockSha256: repair.afterLockSha256,
      journalPath: SECURITY_JOURNAL_PATH,
      journalOperationId: parsedJournal.operationId,
      completion,
    }),
    markVerified: () => {
      if (phase !== "installing")
        invalid("creation installation journal is no longer pending verification");
      phase = "ready";
    },
  };
}
