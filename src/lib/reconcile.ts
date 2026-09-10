// @allow-long 1300: planning, secret-safe env merging, apply-time validation, and recovery share one reconcile protocol
import { randomBytes, randomUUID } from "node:crypto";
import { lstat, readdir } from "node:fs/promises";
import type { Dirent } from "node:fs";
import { join } from "node:path";
import { canonicalHash } from "../domain/project/canonical.js";
import type {
  PlannedSecretOperation,
  SelfIssuedSecretOperation,
} from "../domain/generation/types.js";
import { buildProjectGenerationPlan, canonicalDesiredProjectConfig } from "../templates/default.js";
import { canonicalizeGenerationPlan } from "../generation/plan-formatter.js";
import {
  PROJECT_CONFIG_FILE,
  projectDesiredConfigSchema,
  type GenerationPlanState,
  type ManagedFileState,
  type State,
} from "./config.js";
import { ConflictError } from "./errors.js";
import { FsTransaction } from "./fs.js";
import {
  acquireEnvironmentLifecycleLease,
  environmentLifecycleGuidance,
  listEnvironmentLifecyclePaths,
} from "./environment-lifecycle.js";
import { hashContent } from "./checksum.js";
import { resolveDesiredProjectConfig, serializeDesiredProjectConfig } from "./project-config.js";
import {
  buildApiRegistry,
  buildModuleRegistry,
  mergeModuleSchemaRegistry,
} from "./registry-content.js";
import {
  dotenvFieldsEqual,
  isRuntimeDotenvFileName,
  MAX_DOTENV_FILE_BYTES,
  parseDotenvAssignments,
} from "./dotenv.js";
import {
  createGenerationPlanState,
  createManagedFileState,
  saveStateV2,
  type SaveStateOptions,
} from "./state.js";

export type ReconcileAction = "create" | "rewrite" | "delete" | "move";

interface TargetFile extends ManagedFileState {
  content: string;
}

export interface ReconcileChange {
  action: ReconcileAction;
  path: string;
  fromPath?: string;
  beforeHash: string | null;
  afterHash: string | null;
  content?: string;
  file?: ManagedFileState;
}

export interface ReconcileConflict {
  path: string;
  reason:
    | "untracked-collision"
    | "content-hash-mismatch"
    | "environment-path-migration-required"
    | "environment-runtime-file-forbidden"
    | "environment-local-file-unsafe"
    | "environment-lifecycle-in-progress"
    | "environment-mirror-missing"
    | "environment-mirror-diverged"
    | "pending-operation-mismatch"
    | "unsafe-removal";
  expectedHash: string | null;
  actualHash: string | null;
  proposedHash: string | null;
  sourcePath?: string;
  suggestion?: string;
}

interface EnvironmentFieldAddition {
  field: string;
  value: string;
}

interface ReconcileEnvironmentMerge {
  path: string;
  beforeHash: string | null;
  additions: EnvironmentFieldAddition[];
  materialize: string[];
  createFromTarget: boolean;
}

export interface ReconcilePlan {
  configHash: string;
  planHash: string;
  sourceStateVersion: 1 | 2;
  stateMigration: { path: ".ghostinit/state.json"; fromVersion: 1 | 2; toVersion: 2 };
  configChanged: boolean;
  creates: ReconcileChange[];
  moves: ReconcileChange[];
  rewrites: ReconcileChange[];
  deletions: ReconcileChange[];
  retired: string[];
  preserved: string[];
  unchanged: string[];
  conflicts: ReconcileConflict[];
  targets: Record<string, TargetFile>;
  generationPlan: GenerationPlanState;
  environmentMerges: ReconcileEnvironmentMerge[];
  secretOperations: SelfIssuedSecretOperation[];
}

async function readDiskFile(
  reader: FsTransaction,
  path: string,
): Promise<{ content: string; hash: string } | null> {
  const content = await reader.readText(path);
  return content === undefined ? null : { content, hash: hashContent(content) };
}

function desiredProjectConfigContentsEqual(current: string, target: string): boolean {
  try {
    const normalize = (content: string): string => {
      const desired = projectDesiredConfigSchema.parse(JSON.parse(content));
      resolveDesiredProjectConfig(desired);
      return serializeDesiredProjectConfig(canonicalDesiredProjectConfig(desired));
    };
    return normalize(current) === normalize(target);
  } catch {
    return false;
  }
}

async function targetFiles(
  state: State,
  formatGenerationPlan: typeof canonicalizeGenerationPlan,
): Promise<{
  targets: Record<string, TargetFile>;
  generationPlan: GenerationPlanState;
  secretOperations: readonly PlannedSecretOperation[];
}> {
  const plan = await formatGenerationPlan(
    buildProjectGenerationPlan(state.resolvedConfig, {
      desiredConfig: state.desiredConfig,
    }),
  );
  return {
    targets: Object.fromEntries(
      plan.files.map((file) => [
        file.physicalPath,
        {
          path: file.physicalPath,
          content: file.content,
          contentHash: file.contentHash,
          size: Buffer.byteLength(file.content, "utf8"),
          owner: file.owner,
          lifecycle: file.lifecycle,
          provenance: {
            ...file.provenance,
            artifacts: [...file.provenance.artifacts],
            acceptance: [...file.provenance.acceptance],
            contribution: [...file.provenance.contribution],
          },
        },
      ]),
    ),
    generationPlan: createGenerationPlanState(plan),
    secretOperations: plan.secrets,
  };
}

function preserveProductRegistryContributions(
  state: State,
  targets: Record<string, TargetFile>,
): void {
  const single = state.resolvedConfig.mode === "single";
  const modulesRoot = single ? "src/server/modules" : "packages/modules/src";
  const apiRoot = single ? "src/server/api" : "packages/api/src";
  const schemaRoot = single ? "src/server/db/schema" : "packages/database/src/schema";
  const additive = (path: string): boolean => {
    const prior = state.files[path];
    return (
      !prior ||
      prior.provenance.renderer === "ghostinit-add.v2" ||
      prior.provenance.renderer === "ghostinit.registry-sync.v2"
    );
  };
  // Older creation state accidentally listed the direct index.ts barrel as a
  // module. Direct base files are not module-directory contributions.
  const productModules = state.modules.filter(
    (name) => !targets[`${modulesRoot}/${name}`] && additive(`${modulesRoot}/${name}/index.ts`),
  );
  const productProcedures = state.procedures.filter((name) =>
    additive(`${apiRoot}/procedures/${name}.ts`),
  );
  const update = (path: string, content: string): void => {
    const target = targets[path];
    targets[path] = {
      ...target,
      content,
      contentHash: hashContent(content),
      size: Buffer.byteLength(content, "utf8"),
    };
  };
  const modulePath = `${modulesRoot}/index.ts`;
  if (targets[modulePath] && productModules.length > 0) {
    const baseModules = [
      ...targets[modulePath].content.matchAll(
        /export \* as [A-Za-z_$][\w$]* from ["']\.\/([^/"']+)\/index(?:\.js)?["']/g,
      ),
    ].map((match) => match[1]);
    update(
      modulePath,
      buildModuleRegistry([...new Set([...baseModules, ...productModules])].sort()),
    );
  }
  const contractPath = `${apiRoot}/contract.ts`;
  const routerPath = `${apiRoot}/router.ts`;
  if (targets[contractPath] && targets[routerPath] && productProcedures.length > 0) {
    const registry = buildApiRegistry(
      ["health", "me", ...productProcedures],
      targets[contractPath].content,
      targets[routerPath].content,
    );
    update(contractPath, registry.contract);
    update(routerPath, registry.router);
  }
  const schemaPath = `${schemaRoot}/index.ts`;
  if (targets[schemaPath] && productModules.length > 0) {
    const schemas = productModules.filter(
      (name) => state.files[`${schemaRoot}/${name}.ts`] && additive(`${schemaRoot}/${name}.ts`),
    );
    update(
      schemaPath,
      mergeModuleSchemaRegistry(targets[schemaPath].content, schemas, productModules),
    );
  }
}

function isLocalDotenvPath(path: string): boolean {
  return (
    path === ".env.local" ||
    path.endsWith("/.env.local") ||
    path === ".dev.vars" ||
    path.endsWith("/.dev.vars")
  );
}

function alternateLocalEnvironmentPath(path: string): string | null {
  if (path === ".env.local" || path.endsWith("/.env.local")) {
    return path.replace(/\.env\.local$/, ".dev.vars");
  }
  if (path === ".dev.vars" || path.endsWith("/.dev.vars")) {
    return path.replace(/\.dev\.vars$/, ".env.local");
  }
  return null;
}

interface RuntimeEnvironmentEntry {
  path: string;
  regularFile: boolean;
}

function isLegacyLocalEnvironmentPath(path: string): boolean {
  return path === ".env.local" || path === "apps/web/.env.local";
}

async function cloudflareRuntimeEnvironmentEntries(
  root: string,
  monorepo: boolean,
): Promise<RuntimeEnvironmentEntry[]> {
  const directories = [
    { absolute: root, prefix: "" },
    ...(monorepo ? [{ absolute: join(root, "apps", "web"), prefix: "apps/web/" }] : []),
  ];
  const found: RuntimeEnvironmentEntry[] = [];
  for (const directory of directories) {
    let entries: Dirent[];
    try {
      entries = await readdir(directory.absolute, { withFileTypes: true });
    } catch (error) {
      if ((error as { code?: string }).code === "ENOENT" && directory.prefix !== "") continue;
      throw new ConflictError("Cloudflare runtime environment paths could not be inspected", {
        path: directory.prefix || ".",
        cause: error instanceof Error ? error.message : String(error),
      });
    }
    for (const entry of entries) {
      if (!isRuntimeDotenvFileName(entry.name)) continue;
      let regularFile = false;
      try {
        const metadata = await lstat(join(directory.absolute, entry.name));
        regularFile =
          metadata.isFile() && !metadata.isSymbolicLink() && metadata.size <= MAX_DOTENV_FILE_BYTES;
      } catch (error) {
        if ((error as { code?: string }).code !== "ENOENT") {
          throw new ConflictError("Cloudflare runtime environment entry is unsafe", {
            path: `${directory.prefix}${entry.name}`,
            cause: error instanceof Error ? error.message : String(error),
          });
        }
      }
      found.push({
        path: `${directory.prefix}${entry.name}`,
        regularFile,
      });
    }
  }
  return found.sort((left, right) => left.path.localeCompare(right.path));
}

async function unsafeLocalEnvironmentPaths(
  root: string,
  paths: readonly string[],
): Promise<string[]> {
  const unsafe: string[] = [];
  for (const path of paths) {
    try {
      const metadata = await lstat(join(root, ...path.split("/")));
      if (
        !metadata.isFile() ||
        metadata.isSymbolicLink() ||
        metadata.size > MAX_DOTENV_FILE_BYTES
      ) {
        unsafe.push(path);
      }
    } catch (error) {
      if ((error as { code?: string }).code === "ENOENT") continue;
      throw new ConflictError("Local environment path could not be inspected safely", {
        path,
        cause: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return unsafe.sort();
}

function dotenvAssignments(content: string): Map<string, string> {
  return parseDotenvAssignments(content);
}

function isPlaceholder(value: string | undefined): boolean {
  return (
    value === undefined ||
    value.trim().length === 0 ||
    /^REPLACE_WITH_[A-Z0-9_]+$/.test(value.trim())
  );
}

async function planEnvironmentReconciliation(
  reader: FsTransaction,
  targets: Record<string, TargetFile>,
  operations: readonly PlannedSecretOperation[],
): Promise<{
  environmentMerges: ReconcileEnvironmentMerge[];
  secretOperations: SelfIssuedSecretOperation[];
}> {
  const environmentMerges: ReconcileEnvironmentMerge[] = [];
  const referencesToMaterialize = new Set<string>();

  for (const path of Object.keys(targets).filter(isLocalDotenvPath).sort()) {
    const target = targets[path];
    const actual = await readDiskFile(reader, path);
    const targetFields = dotenvAssignments(target.content);
    const actualFields = dotenvAssignments(actual?.content ?? "");
    const additions = [...targetFields]
      .filter(([field]) => !actualFields.has(field))
      .map(([field, value]) => ({ field, value }));
    const materialize: string[] = [];

    for (const operation of operations) {
      if (operation.kind !== "generate-self-issued") continue;
      const destinations = operation.destinations.filter(
        (destination) =>
          destination.physicalPath === path &&
          destination.format === "dotenv" &&
          destination.field === operation.environmentKey,
      );
      if (destinations.length === 0) continue;
      if (isPlaceholder(actualFields.get(operation.environmentKey))) {
        materialize.push(operation.reference);
        referencesToMaterialize.add(operation.reference);
      }
    }

    if (actual === null || additions.length > 0 || materialize.length > 0) {
      environmentMerges.push({
        path,
        beforeHash: actual?.hash ?? null,
        additions,
        materialize: materialize.sort(),
        createFromTarget: actual === null,
      });
    }
  }

  return {
    environmentMerges,
    secretOperations: operations
      .filter(
        (operation): operation is SelfIssuedSecretOperation =>
          operation.kind === "generate-self-issued" &&
          referencesToMaterialize.has(operation.reference),
      )
      .map((operation) => ({
        ...operation,
        destinations: operation.destinations.map((destination) => ({ ...destination })),
      })),
  };
}

function planBody(plan: Omit<ReconcilePlan, "planHash" | "targets">) {
  const compact = (change: ReconcileChange) => ({
    action: change.action,
    path: change.path,
    ...(change.fromPath ? { fromPath: change.fromPath } : {}),
    beforeHash: change.beforeHash,
    afterHash: change.afterHash,
  });
  return {
    configHash: plan.configHash,
    generationPlan: plan.generationPlan,
    sourceStateVersion: plan.sourceStateVersion,
    stateMigration: plan.stateMigration,
    configChanged: plan.configChanged,
    creates: plan.creates.map(compact),
    moves: plan.moves.map(compact),
    rewrites: plan.rewrites.map(compact),
    deletions: plan.deletions.map(compact),
    retired: plan.retired,
    preserved: plan.preserved,
    unchanged: plan.unchanged,
    conflicts: plan.conflicts,
    environmentMerges: plan.environmentMerges,
    secretOperations: plan.secretOperations,
  };
}

export async function buildReconcilePlan(
  root: string,
  state: State,
  options: {
    operation?: "sync" | "upgrade";
    formatGenerationPlan?: typeof canonicalizeGenerationPlan;
  } = {},
): Promise<ReconcilePlan> {
  const reader = new FsTransaction(root);
  const {
    targets,
    generationPlan,
    secretOperations: plannedSecretOperations,
  } = await targetFiles(state, options.formatGenerationPlan ?? canonicalizeGenerationPlan);
  preserveProductRegistryContributions(state, targets);
  const creates: ReconcileChange[] = [];
  const rewrites: ReconcileChange[] = [];
  const deletions: ReconcileChange[] = [];
  const moves: ReconcileChange[] = [];
  const retired: string[] = [];
  const preserved: string[] = [];
  const unchanged: string[] = [];
  const conflicts: ReconcileConflict[] = [];
  const usesCloudflare = state.resolvedConfig.apps.some(({ deploy }) => deploy === "cloudflare");
  const cloudflareMonorepo = usesCloudflare && state.resolvedConfig.mode === "monorepo";
  const environmentLifecyclePaths = listEnvironmentLifecyclePaths(root);
  const runtimeEnvironmentEntries = usesCloudflare
    ? await cloudflareRuntimeEnvironmentEntries(root, cloudflareMonorepo)
    : [];
  const runtimeEnvironmentPaths = new Set(runtimeEnvironmentEntries.map(({ path }) => path));
  const unsafeLegacyEnvironmentPaths = new Set(
    runtimeEnvironmentEntries
      .filter(({ path, regularFile }) => isLegacyLocalEnvironmentPath(path) && !regularFile)
      .map(({ path }) => path),
  );
  const unsafeLocalPaths = new Set(
    usesCloudflare
      ? await unsafeLocalEnvironmentPaths(
          root,
          Object.keys(targets).filter(isLocalDotenvPath).sort(),
        )
      : [],
  );

  for (const path of environmentLifecyclePaths) {
    conflicts.push({
      path,
      reason: "environment-lifecycle-in-progress",
      expectedHash: null,
      actualHash: null,
      proposedHash: null,
      suggestion: environmentLifecycleGuidance([path]),
    });
  }

  for (const path of unsafeLocalPaths) {
    conflicts.push({
      path,
      reason: "environment-local-file-unsafe",
      expectedHash: state.files[path]?.contentHash ?? null,
      actualHash: null,
      proposedHash: targets[path]?.contentHash ?? null,
      suggestion: `Replace ${path} with a regular file no larger than 1 MiB after preserving every operator-owned value. GhostInit will not read, rewrite, or mint secrets into unsafe local environment entries.`,
    });
  }

  for (const entry of runtimeEnvironmentEntries) {
    // A regular canonical .env.local keeps the established transition conflict
    // below, including its source hash. Linked/non-regular entries are never
    // read, even for hashing, and every other runtime dotenv name is forbidden.
    if (isLegacyLocalEnvironmentPath(entry.path) && entry.regularFile) continue;
    const destination = entry.path.startsWith("apps/web/") ? "apps/web/.dev.vars" : ".dev.vars";
    const legacy = isLegacyLocalEnvironmentPath(entry.path);
    conflicts.push({
      path: destination,
      sourcePath: entry.path,
      reason: legacy ? "environment-path-migration-required" : "environment-runtime-file-forbidden",
      expectedHash: state.files[entry.path]?.contentHash ?? null,
      actualHash: null,
      proposedHash: targets[destination]?.contentHash ?? null,
      suggestion: legacy
        ? `Refusing to read linked or non-regular ${entry.path}. Resolve the entry explicitly, preserve its operator-owned values in ${destination}, remove the obsolete runtime dotenv entry, then rerun sync.`
        : `Migrate ${entry.path} explicitly without changing operator-owned values: put local values in ${destination}, configure production build variables in Workers Builds, and configure runtime values as Worker bindings or secrets. Remove ${entry.path}, then rerun sync; GhostInit will not copy, delete, or mint from runtime dotenv files.`,
    });
  }

  for (const path of Object.keys(targets).sort()) {
    const target = targets[path];
    const actual = unsafeLocalPaths.has(path) ? null : await readDiskFile(reader, path);
    const prior = state.files[path];
    if (!actual) {
      if (isLocalDotenvPath(path)) {
        const alternatePath = alternateLocalEnvironmentPath(path);
        const alternate =
          alternatePath && !unsafeLegacyEnvironmentPaths.has(alternatePath)
            ? await readDiskFile(reader, alternatePath)
            : null;
        if (alternate && alternatePath) {
          conflicts.push({
            path,
            sourcePath: alternatePath,
            reason: "environment-path-migration-required",
            expectedHash: state.files[alternatePath]?.contentHash ?? null,
            actualHash: alternate.hash,
            proposedHash: target.contentHash,
            suggestion: `Move ${alternatePath} to ${path}, preserving its values, then rerun sync so GhostInit can merge newly required fields transactionally.`,
          });
        }
        continue;
      }
      // Never create an environment file from a dry-run placeholder during migration.
      creates.push({
        action: "create",
        path,
        beforeHash: null,
        afterHash: target.contentHash,
        content: target.content,
        file: target,
      });
      continue;
    }
    if (isLocalDotenvPath(path)) {
      const alternatePath = alternateLocalEnvironmentPath(path);
      const alternate =
        alternatePath && !unsafeLegacyEnvironmentPaths.has(alternatePath)
          ? await readDiskFile(reader, alternatePath)
          : null;
      if (alternate && alternatePath) {
        conflicts.push({
          path,
          sourcePath: alternatePath,
          reason: "environment-path-migration-required",
          expectedHash: state.files[alternatePath]?.contentHash ?? null,
          actualHash: alternate.hash,
          proposedHash: target.contentHash,
          suggestion: `Merge any required values into ${path}, remove ${alternatePath}, then rerun sync. GhostInit will not guess which secret-bearing file is authoritative.`,
        });
        continue;
      }
    }
    if (!prior && !isLocalDotenvPath(path)) {
      if (target.lifecycle === "seed-once") preserved.push(path);
      else
        conflicts.push({
          path,
          reason: "untracked-collision",
          expectedHash: null,
          actualHash: actual.hash,
          proposedHash: target.contentHash,
        });
      continue;
    }
    if (actual.hash === target.contentHash) {
      unchanged.push(path);
      continue;
    }
    if (path === PROJECT_CONFIG_FILE) {
      // The editable desired input may differ in formatting from its canonical
      // output. Normalize only the same validated configuration, using the
      // actual bytes as the transaction's compare-and-swap baseline.
      if (!desiredProjectConfigContentsEqual(actual.content, target.content)) {
        conflicts.push({
          path,
          reason: "content-hash-mismatch",
          expectedHash: prior?.contentHash ?? null,
          actualHash: actual.hash,
          proposedHash: target.contentHash,
        });
      } else {
        rewrites.push({
          action: "rewrite",
          path,
          beforeHash: actual.hash,
          afterHash: target.contentHash,
          content: target.content,
          file: target,
        });
      }
      continue;
    }
    // The current plan is authoritative for lifecycle upgrades.  An edited
    // former seed still conflicts by hash, while an untouched Next API route
    // can move from the old seed-once policy to generator-owned safely.
    const lifecycle = target.lifecycle;
    if (lifecycle === "seed-once") {
      preserved.push(path);
      continue;
    }
    if (lifecycle !== "generator-owned" && lifecycle !== "structured-merge") {
      conflicts.push({
        path,
        reason: prior ? "content-hash-mismatch" : "untracked-collision",
        expectedHash: prior?.contentHash ?? null,
        actualHash: actual.hash,
        proposedHash: target.contentHash,
      });
      continue;
    }
    if (!prior) {
      conflicts.push({
        path,
        reason: "untracked-collision",
        expectedHash: null,
        actualHash: actual.hash,
        proposedHash: target.contentHash,
      });
      continue;
    }
    if (actual.hash !== prior.contentHash) {
      conflicts.push({
        path,
        reason: "content-hash-mismatch",
        expectedHash: prior.contentHash,
        actualHash: actual.hash,
        proposedHash: target.contentHash,
      });
      continue;
    }
    rewrites.push({
      action: "rewrite",
      path,
      beforeHash: actual.hash,
      afterHash: target.contentHash,
      content: target.content,
      file: target,
    });
  }

  for (const [path, prior] of Object.entries(state.files).sort(([a], [b]) => a.localeCompare(b))) {
    if (targets[path]) continue;
    // Runtime dotenv files are operator-owned migration inputs. A conflict was
    // recorded above; do not read, hash, retire, or plan deletion of them.
    if (runtimeEnvironmentPaths.has(path)) continue;
    const actual = await readDiskFile(reader, path);
    if (!actual) continue;
    const belongsToDesiredPlan =
      state.sourceVersion === 1 ||
      state.generationPlan?.renderers.includes(prior.provenance.renderer) === true ||
      // Security maintenance invalidates the previous plan attestation, but
      // current base renderers still identify their obsolete generated files.
      generationPlan.renderers.includes(prior.provenance.renderer) ||
      prior.provenance.renderer === "legacy-template-adapter.v2" ||
      // Compatibility for early V2 state written before renderer ids were
      // versioned. New additive generators use their own provenance below.
      prior.provenance.renderer === "legacy-template-adapter";
    if (!belongsToDesiredPlan) {
      // `ghostinit add` artifacts and their registries are additive project
      // records, not files owned by the base desired-state renderer.
      preserved.push(path);
      continue;
    }
    if (prior.lifecycle === "seed-once") {
      // A seed becomes user-owned after creation.  Keep it on disk, report it
      // in previews, and retire it from the next managed-file state rather
      // than silently deleting it or tracking it forever.
      retired.push(path);
      continue;
    }
    if (prior.lifecycle === "structured-merge") {
      // Removing a merge-owned document would discard keys that GhostInit
      // cannot attribute to itself.  Require an explicit operator deletion;
      // a subsequent sync will observe the absent file and retire the record.
      conflicts.push({
        path,
        reason: "unsafe-removal",
        expectedHash: prior.contentHash,
        actualHash: actual.hash,
        proposedHash: null,
      });
      continue;
    }
    if (actual.hash !== prior.contentHash) {
      conflicts.push({
        path,
        reason: "content-hash-mismatch",
        expectedHash: prior.contentHash,
        actualHash: actual.hash,
        proposedHash: null,
      });
      continue;
    }
    deletions.push({
      action: "delete",
      path,
      beforeHash: actual.hash,
      afterHash: null,
      file: prior,
    });
  }

  // A hash-identical obsolete generator-owned file is an exact move candidate.
  for (let createIndex = creates.length - 1; createIndex >= 0; createIndex--) {
    const create = creates[createIndex];
    const deleteIndex = deletions.findIndex(
      (candidate) => candidate.beforeHash === create.afterHash && candidate.path !== create.path,
    );
    if (deleteIndex < 0) continue;
    const removed = deletions.splice(deleteIndex, 1)[0];
    creates.splice(createIndex, 1);
    moves.push({
      ...create,
      action: "move",
      fromPath: removed.path,
      beforeHash: removed.beforeHash,
    });
  }

  const pending = state.pendingOperation;
  if (pending && pending.configHash !== state.resolvedConfig.configHash) {
    conflicts.push({
      path: ".ghostinit/state.json",
      reason: "pending-operation-mismatch",
      expectedHash: pending.configHash,
      actualHash: state.resolvedConfig.configHash,
      proposedHash: state.resolvedConfig.configHash,
    });
  }

  if (cloudflareMonorepo) {
    const rootTarget = targets[".dev.vars"];
    const webTarget = targets["apps/web/.dev.vars"];
    if (!rootTarget || !webTarget) {
      throw new ConflictError("Generated Cloudflare monorepo environment mirrors are incomplete", {
        rootTarget: Boolean(rootTarget),
        webTarget: Boolean(webTarget),
      });
    }
    if (!dotenvFieldsEqual(rootTarget.content, webTarget.content)) {
      throw new ConflictError("Generated Cloudflare monorepo environment mirrors disagree", {
        rootTargetHash: rootTarget.contentHash,
        webTargetHash: webTarget.contentHash,
      });
    }

    const [rootEnvironment, webEnvironment, legacyRootEnvironment, legacyWebEnvironment] =
      await Promise.all([
        unsafeLocalPaths.has(".dev.vars") ? null : readDiskFile(reader, ".dev.vars"),
        unsafeLocalPaths.has("apps/web/.dev.vars")
          ? null
          : readDiskFile(reader, "apps/web/.dev.vars"),
        unsafeLegacyEnvironmentPaths.has(".env.local") ? null : readDiskFile(reader, ".env.local"),
        unsafeLegacyEnvironmentPaths.has("apps/web/.env.local")
          ? null
          : readDiskFile(reader, "apps/web/.env.local"),
      ]);
    const unsafeMirror =
      unsafeLocalPaths.has(".dev.vars") || unsafeLocalPaths.has("apps/web/.dev.vars");
    if (
      !unsafeMirror &&
      rootEnvironment &&
      webEnvironment &&
      !dotenvFieldsEqual(rootEnvironment.content, webEnvironment.content)
    ) {
      conflicts.push({
        path: ".dev.vars",
        sourcePath: "apps/web/.dev.vars",
        reason: "environment-mirror-diverged",
        expectedHash: rootEnvironment.hash,
        actualHash: webEnvironment.hash,
        proposedHash: targets[".dev.vars"].contentHash,
        suggestion:
          "Reconcile root and apps/web .dev.vars so every key has the same value in both files, preserving all real secrets, then rerun sync.",
      });
    } else if (
      !unsafeMirror &&
      Boolean(rootEnvironment) !== Boolean(webEnvironment) &&
      !legacyRootEnvironment &&
      !legacyWebEnvironment
    ) {
      const missingPath = rootEnvironment ? "apps/web/.dev.vars" : ".dev.vars";
      const sourcePath = rootEnvironment ? ".dev.vars" : "apps/web/.dev.vars";
      conflicts.push({
        path: missingPath,
        sourcePath,
        reason: "environment-mirror-missing",
        expectedHash: state.files[missingPath]?.contentHash ?? null,
        actualHash: null,
        proposedHash: targets[missingPath].contentHash,
        suggestion: `Copy ${sourcePath} to ${missingPath} without changing any key/value, then rerun sync. GhostInit will merge newly required capability fields only after both secret-bearing mirrors have one explicit authority.`,
      });
    }
  }

  for (const list of [creates, moves, rewrites, deletions])
    list.sort((a, b) => a.path.localeCompare(b.path));
  const { environmentMerges, secretOperations } =
    runtimeEnvironmentEntries.length > 0 ||
    unsafeLocalPaths.size > 0 ||
    environmentLifecyclePaths.length > 0
      ? { environmentMerges: [], secretOperations: [] }
      : await planEnvironmentReconciliation(reader, targets, plannedSecretOperations);
  retired.sort();
  preserved.sort();
  unchanged.sort();
  conflicts.sort((a, b) => a.path.localeCompare(b.path));
  const body = {
    configHash: state.resolvedConfig.configHash,
    generationPlan,
    sourceStateVersion: state.sourceVersion,
    stateMigration: {
      path: ".ghostinit/state.json" as const,
      fromVersion: state.sourceVersion,
      toVersion: 2 as const,
    },
    configChanged: state.configChanged,
    creates,
    moves,
    rewrites,
    deletions,
    retired,
    preserved,
    unchanged,
    conflicts,
    environmentMerges,
    secretOperations,
  };
  return { ...body, planHash: canonicalHash(planBody(body)), targets };
}

export function publicReconcilePlan(plan: ReconcilePlan) {
  return {
    ...planBody(plan),
    environmentMerges: plan.environmentMerges.map((merge) => ({
      path: merge.path,
      addedFields: merge.additions.map(({ field }) => field),
      materializedReferences: [...merge.materialize],
      createFromTarget: merge.createFromTarget,
    })),
    secretOperations: plan.secretOperations.map((operation) => ({
      kind: operation.kind,
      reference: operation.reference,
      environmentKey: operation.environmentKey,
      destinations: operation.destinations.map(({ physicalPath, format, field }) => ({
        physicalPath,
        format,
        field,
      })),
    })),
    planHash: plan.planHash,
  };
}

function summary(plan: ReconcilePlan) {
  return {
    creates: plan.creates.length,
    moves: plan.moves.length,
    rewrites: plan.rewrites.length,
    deletions: plan.deletions.length,
    conflicts: plan.conflicts.length,
  };
}

function assertPlanIntegrity(state: State, plan: ReconcilePlan): void {
  if (plan.configHash !== state.resolvedConfig.configHash) {
    throw new ConflictError("Reconciliation plan targets a different resolved configuration", {
      expectedConfigHash: state.resolvedConfig.configHash,
      actualConfigHash: plan.configHash,
    });
  }
  const actualPlanHash = canonicalHash(planBody(plan));
  if (actualPlanHash !== plan.planHash) {
    throw new ConflictError("Reconciliation plan changed after it was built", {
      expectedPlanHash: plan.planHash,
      actualPlanHash,
    });
  }

  for (const change of [...plan.creates, ...plan.moves, ...plan.rewrites]) {
    const actualContentHash = hashContent(change.content ?? "");
    const target = plan.targets[change.path];
    if (
      change.content === undefined ||
      change.afterHash === null ||
      actualContentHash !== change.afterHash ||
      target === undefined ||
      target.contentHash !== change.afterHash ||
      target.content !== change.content
    ) {
      throw new ConflictError("Reconciliation plan content does not match its declared hash", {
        action: change.action,
        path: change.path,
        declaredHash: change.afterHash,
        actualContentHash,
      });
    }
  }

  const plannedSecretReferences = new Set(plan.generationPlan.secretReferences);
  for (const operation of plan.secretOperations) {
    if (!plannedSecretReferences.has(operation.reference)) {
      throw new ConflictError(
        "Reconciliation secret operation is not part of the generation plan",
        {
          reference: operation.reference,
        },
      );
    }
  }
  const materializedReferences = new Set(plan.secretOperations.map(({ reference }) => reference));
  for (const merge of plan.environmentMerges) {
    const target = plan.targets[merge.path];
    if (!target || !isLocalDotenvPath(merge.path)) {
      throw new ConflictError("Environment reconciliation targets an unmanaged file", {
        path: merge.path,
      });
    }
    const targetFields = dotenvAssignments(target.content);
    for (const addition of merge.additions) {
      if (targetFields.get(addition.field) !== addition.value) {
        throw new ConflictError("Environment reconciliation changed after planning", {
          path: merge.path,
          field: addition.field,
        });
      }
    }
    for (const reference of merge.materialize) {
      if (!materializedReferences.has(reference)) {
        throw new ConflictError(
          "Environment reconciliation references an unknown secret operation",
          {
            path: merge.path,
            reference,
          },
        );
      }
    }
  }
}

function stalePlanConflict(
  change: ReconcileChange,
  path: string,
  expectedHash: string | null,
  actualHash: string | null,
): never {
  throw new ConflictError("Managed file changed after reconciliation planning", {
    action: change.action,
    path,
    expectedHash,
    actualHash,
  });
}

async function stageReconcilePlan(
  root: string,
  state: State,
  plan: ReconcilePlan,
  tx: FsTransaction,
): Promise<void> {
  assertPlanIntegrity(state, plan);
  const reader = new FsTransaction(root);

  for (const change of plan.creates) {
    const actual = await readDiskFile(reader, change.path);
    if (actual) stalePlanConflict(change, change.path, null, actual.hash);
    await tx.writeIfUnchanged(change.path, change.content ?? "", null);
  }
  for (const change of plan.rewrites) {
    const actual = await readDiskFile(reader, change.path);
    if (!actual || actual.hash !== change.beforeHash) {
      stalePlanConflict(change, change.path, change.beforeHash, actual?.hash ?? null);
    }
    await tx.writeIfUnchanged(change.path, change.content ?? "", actual.content);
  }
  for (const change of plan.moves) {
    if (!change.fromPath) {
      throw new ConflictError("Reconciliation move is missing its source path", {
        path: change.path,
      });
    }
    const [source, destination] = await Promise.all([
      readDiskFile(reader, change.fromPath),
      readDiskFile(reader, change.path),
    ]);
    if (!source || source.hash !== change.beforeHash) {
      stalePlanConflict(change, change.fromPath, change.beforeHash, source?.hash ?? null);
    }
    if (destination) stalePlanConflict(change, change.path, null, destination.hash);
    await tx.writeIfUnchanged(change.path, change.content ?? "", null);
    await tx.deleteIfUnchanged(change.fromPath, source.content);
  }
  for (const change of plan.deletions) {
    const actual = await readDiskFile(reader, change.path);
    if (!actual || actual.hash !== change.beforeHash) {
      stalePlanConflict(change, change.path, change.beforeHash, actual?.hash ?? null);
    }
    await tx.deleteIfUnchanged(change.path, actual.content);
  }
}

function appendDotenvFields(
  content: string,
  additions: readonly EnvironmentFieldAddition[],
): string {
  if (additions.length === 0) return content;
  const newline = content.includes("\r\n") ? "\r\n" : "\n";
  const prefix = content.length === 0 || content.endsWith("\n") ? content : `${content}${newline}`;
  return `${prefix}${additions.map(({ field, value }) => `${field}=${value}`).join(newline)}${newline}`;
}

function readSecretField(
  content: string,
  destination: SelfIssuedSecretOperation["destinations"][number],
): string | undefined {
  if (destination.format === "dotenv") return dotenvAssignments(content).get(destination.field);
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new ConflictError("Secret destination is not valid JSON", {
      path: destination.physicalPath,
      field: destination.field,
    });
  }
  if (parsed === null || Array.isArray(parsed) || typeof parsed !== "object") return undefined;
  const value = (parsed as Record<string, unknown>)[destination.field];
  return typeof value === "string" ? value : undefined;
}

function writeSecretField(
  content: string,
  destination: SelfIssuedSecretOperation["destinations"][number],
  value: string,
): string {
  if (destination.format === "dotenv") {
    const pattern = new RegExp(`^\\s*(?:export\\s+)?${destination.field}\\s*=.*$`, "m");
    if (pattern.test(content)) return content.replace(pattern, `${destination.field}=${value}`);
    return appendDotenvFields(content, [{ field: destination.field, value }]);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new ConflictError("Secret destination is not valid JSON", {
      path: destination.physicalPath,
      field: destination.field,
    });
  }
  if (parsed === null || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new ConflictError("Secret destination must contain a JSON object", {
      path: destination.physicalPath,
      field: destination.field,
    });
  }
  const record = parsed as Record<string, unknown>;
  if (!Object.prototype.hasOwnProperty.call(record, destination.field)) {
    throw new ConflictError("Secret destination is missing its planned JSON field", {
      path: destination.physicalPath,
      field: destination.field,
    });
  }
  record[destination.field] = value;
  return `${JSON.stringify(record, null, 2)}\n`;
}

type SecretEntropy = (bytes: number, encoding: "base64url" | "hex") => string;

async function stageEnvironmentAndSecrets(
  root: string,
  plan: ReconcilePlan,
  tx: FsTransaction,
  entropy: SecretEntropy,
): Promise<void> {
  const reader = new FsTransaction(root);
  for (const merge of plan.environmentMerges) {
    const actual = await readDiskFile(reader, merge.path);
    if ((actual?.hash ?? null) !== merge.beforeHash) {
      throw new ConflictError("Environment file changed after reconciliation planning", {
        path: merge.path,
        expectedHash: merge.beforeHash,
        actualHash: actual?.hash ?? null,
      });
    }
    const target = plan.targets[merge.path];
    const content = merge.createFromTarget
      ? target.content
      : appendDotenvFields(actual?.content ?? "", merge.additions);
    await tx.writeIfUnchanged(merge.path, content, actual?.content ?? null);
  }

  for (const operation of plan.secretOperations) {
    const realValues = new Set<string>();
    const pending: Array<{
      destination: SelfIssuedSecretOperation["destinations"][number];
      content: string;
    }> = [];
    for (const destination of operation.destinations) {
      const content = await tx.readText(destination.physicalPath);
      if (content === undefined) {
        throw new ConflictError("Secret destination is missing during reconciliation", {
          reference: operation.reference,
          path: destination.physicalPath,
          field: destination.field,
        });
      }
      const current = readSecretField(content, destination);
      if (isPlaceholder(current)) pending.push({ destination, content });
      else if (current !== undefined) realValues.add(current);
    }
    if (realValues.size > 1) {
      throw new ConflictError("Secret destinations contain inconsistent existing values", {
        reference: operation.reference,
        destinations: operation.destinations.map(
          ({ physicalPath, field }) => `${physicalPath}:${field}`,
        ),
      });
    }
    if (pending.length === 0) continue;
    const value = realValues.values().next().value ?? entropy(operation.bytes, operation.encoding);
    for (const { destination } of pending) {
      const latest = await tx.readText(destination.physicalPath);
      if (latest === undefined) {
        throw new ConflictError("Secret destination disappeared during reconciliation", {
          reference: operation.reference,
          path: destination.physicalPath,
        });
      }
      await tx.write(destination.physicalPath, writeSecretField(latest, destination, value));
    }
  }
}

async function finalFileRecords(
  root: string,
  state: State,
  plan: ReconcilePlan,
  committedContents: ReadonlyMap<string, string>,
) {
  const records: Record<string, ManagedFileState> = {};
  const reader = new FsTransaction(root);
  for (const [path, prior] of Object.entries(state.files)) {
    const removed =
      plan.deletions.some((change) => change.path === path) ||
      plan.moves.some((change) => change.fromPath === path) ||
      plan.retired.includes(path);
    if (removed) continue;
    const target = plan.targets[path];
    if (!target && !(await readDiskFile(reader, path))) continue;
    // A corrected seed policy relinquishes ownership even when product edits
    // are preserved. Keep the prior attested bytes and provenance unchanged.
    records[path] =
      target?.lifecycle === "seed-once" && plan.preserved.includes(path)
        ? { ...prior, lifecycle: "seed-once" }
        : prior;
  }
  for (const [path, target] of Object.entries(plan.targets)) {
    const committed = committedContents.get(path);
    const operatorEnvironment =
      committed === undefined && target.lifecycle === "seed-once" && isLocalDotenvPath(path)
        ? await readDiskFile(reader, path)
        : null;
    if (committed === undefined && !plan.unchanged.includes(path) && !operatorEnvironment) continue;
    // Baselines attest planned or committed bytes, never an unrelated edit
    // observed after the plan or transaction completed. Local environment files
    // instead remain operator-owned inputs to field-preserving reconciliation.
    records[path] = createManagedFileState(
      path,
      committed ?? operatorEnvironment?.content ?? target.content,
      {
        owner: target.owner,
        lifecycle: target.lifecycle,
        provenance: target.provenance,
      },
    );
  }
  return records;
}

export interface ReconcileApplyDependencies {
  entropy?: SecretEntropy;
}

export async function applyReconcilePlan(
  root: string,
  state: State,
  plan: ReconcilePlan,
  kind: "sync" | "upgrade",
  dependencies: ReconcileApplyDependencies = {},
): Promise<void> {
  const unsafeUpgradeChanges =
    kind === "upgrade"
      ? [
          ...[...plan.moves, ...plan.deletions].filter(
            (change) => change.file?.lifecycle !== "generator-owned",
          ),
          ...plan.rewrites.filter(
            (change) =>
              change.action !== "rewrite" ||
              (change.file?.lifecycle !== "generator-owned" &&
                !(
                  change.file?.lifecycle === "structured-merge" &&
                  change.beforeHash !== null &&
                  change.beforeHash === state.files[change.path]?.contentHash
                )),
          ),
        ]
      : [];
  if (unsafeUpgradeChanges.length > 0) {
    throw new ConflictError("Upgrade plan contains an unsupported managed-file mutation", {
      paths: unsafeUpgradeChanges.map((change) => change.path),
    });
  }
  if (plan.conflicts.length > 0) {
    throw new ConflictError("Managed-file conflicts prevent reconciliation", {
      plan: publicReconcilePlan(plan),
    });
  }
  const environmentLease = acquireEnvironmentLifecycleLease(root);
  try {
    environmentLease.assertIdle();
    const usesCloudflare = state.resolvedConfig.apps.some(({ deploy }) => deploy === "cloudflare");
    if (usesCloudflare) {
      const appeared = await cloudflareRuntimeEnvironmentEntries(
        root,
        state.resolvedConfig.mode === "monorepo",
      );
      if (appeared.length > 0) {
        throw new ConflictError(
          "Cloudflare runtime dotenv files appeared after reconciliation planning",
          {
            paths: appeared.map(({ path }) => path),
            suggestion:
              "Migrate operator-owned values explicitly to .dev.vars, Workers Builds, or Worker bindings; remove the runtime dotenv files and rebuild the reconciliation plan.",
          },
        );
      }
      const unsafeLocal = await unsafeLocalEnvironmentPaths(
        root,
        Object.keys(plan.targets).filter(isLocalDotenvPath).sort(),
      );
      if (unsafeLocal.length > 0) {
        throw new ConflictError(
          "Cloudflare local environment files became unsafe after reconciliation planning",
          {
            paths: unsafeLocal,
            suggestion:
              "Preserve every operator-owned value, replace each path with a regular file no larger than 1 MiB, and rebuild the reconciliation plan.",
          },
        );
      }
    }
    const now = new Date().toISOString();
    const operationId = state.pendingOperation?.id ?? randomUUID();
    const changes = [...plan.creates, ...plan.moves, ...plan.rewrites, ...plan.deletions];
    const pending = {
      id: operationId,
      kind,
      startedAt: state.pendingOperation?.startedAt ?? now,
      configHash: plan.configHash,
      planHash: plan.planHash,
      changes: changes.map((change) => ({
        action: change.action,
        path: change.path,
        ...(change.fromPath ? { fromPath: change.fromPath } : {}),
        beforeHash: change.beforeHash,
        afterHash: change.afterHash,
      })),
    } as const;
    const baseSave: Omit<SaveStateOptions, "migrateV1"> = {
      desiredConfig: canonicalDesiredProjectConfig(state.desiredConfig),
      resolvedConfig: state.resolvedConfig,
      replaceFiles: state.files,
      pendingOperation: pending,
      migrationHistory: state.migrationHistory,
      desiredConfigAlreadyWritten: true,
    };
    const tx = new FsTransaction(root);
    // Stage only after validating every beforeHash against the current disk.
    // FsTransaction retains the exact bytes it observed and revalidates them at
    // commit, closing the second race between staging and filesystem mutation.
    await stageReconcilePlan(root, state, plan, tx);
    await stageEnvironmentAndSecrets(
      root,
      plan,
      tx,
      dependencies.entropy ?? ((bytes, encoding) => randomBytes(bytes).toString(encoding)),
    );
    const committedContents = tx.getStagedContents();
    let pendingSaved = false;
    try {
      await saveStateV2(root, state, baseSave);
      pendingSaved = true;
      environmentLease.assertIdle();
      await tx.commit();

      const completedAt = new Date().toISOString();
      const history = [
        ...state.migrationHistory,
        {
          id: operationId,
          kind,
          fromVersion: state.sourceVersion,
          toVersion: 2 as const,
          status: "completed" as const,
          startedAt: pending.startedAt,
          completedAt,
          configHash: plan.configHash,
          summary: summary(plan),
        },
      ];
      await saveStateV2(root, state, {
        desiredConfig: canonicalDesiredProjectConfig(state.desiredConfig),
        resolvedConfig: state.resolvedConfig,
        replaceFiles: await finalFileRecords(root, state, plan, committedContents),
        generationPlan: plan.generationPlan,
        acceptConfigChanges: true,
        pendingOperation: null,
        migrationHistory: history,
        desiredConfigAlreadyWritten: true,
      });
    } catch (error) {
      await tx.rollback();
      if (!pendingSaved) throw error;
      const completedAt = new Date().toISOString();
      await saveStateV2(root, state, {
        desiredConfig: state.desiredConfig,
        resolvedConfig: state.resolvedConfig,
        replaceFiles: state.files,
        generationPlan: state.generationPlan,
        pendingOperation: null,
        migrationHistory: [
          ...state.migrationHistory,
          {
            id: operationId,
            kind,
            fromVersion: state.sourceVersion,
            toVersion: 2,
            status: "failed",
            startedAt: pending.startedAt,
            completedAt,
            configHash: plan.configHash,
            summary: summary(plan),
          },
        ],
        desiredConfigAlreadyWritten: true,
      });
      throw error;
    }
  } finally {
    environmentLease.release();
  }
}
