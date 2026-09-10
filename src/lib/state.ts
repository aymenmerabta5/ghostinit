// @allow-long 490: state hydration, V1 compatibility, staged persistence, and semver policy form one boundary
/** Versioned desired-state and internal-state persistence. */

import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import {
  GHOSTINIT_DIR,
  PROJECT_CONFIG_FILE,
  STATE_FILE,
  STATE_SCHEMA_URI,
  legacyStateV1Schema,
  projectConfigSchema,
  stateV2Schema,
  type LegacyStateV1,
  type GenerationPlanState,
  type ManagedFileState,
  type MigrationHistoryEntry,
  type PendingOperation,
  type PersistedStateV2,
  type ProjectConfig,
  type State,
} from "./config.js";
import type { ChecksumEntry } from "./checksum.js";
import { hashContent } from "./checksum.js";
import { IncompatibleSchemaError, ProjectStateError } from "./errors.js";
import { ghostinitVersion } from "../../packages/versions/src/index.js";
import { FsTransaction } from "./fs.js";
import {
  desiredToProjectConfig,
  loadDesiredProjectConfig,
  projectConfigToDesired,
  resolveDesiredProjectConfig,
  serializeDesiredProjectConfig,
} from "./project-config.js";
import type { DesiredProjectConfig } from "../domain/project/config.js";
import type { FileLifecycle, FileOwner } from "../domain/generation/types.js";
import type { GenerationPlan, PlannedFile } from "../domain/generation/types.js";

export function stateDir(root: string): string {
  return join(root, GHOSTINIT_DIR);
}

export function stateFilePath(root: string): string {
  return join(stateDir(root), STATE_FILE);
}

export function desiredConfigFilePath(root: string): string {
  return join(root, PROJECT_CONFIG_FILE);
}

function inferOwner(path: string): FileOwner {
  if (path === PROJECT_CONFIG_FILE || path.startsWith(".ghostinit/")) return "ghostinit";
  if (/^(apps\/[^/]+\/src|src\/(?:app|routes|components))\//.test(path)) return "ui";
  if (path.includes("/api/") || path.startsWith("packages/api/")) return "transport";
  if (path.includes("/application/") || path.includes("/services/")) return "application";
  if (path.includes("/domain/") || path.startsWith("packages/modules/")) return "domain";
  if (path.includes("database") || path.includes("/db/") || path.includes("/providers/"))
    return "adapter";
  if (path.startsWith("tooling/") || path.includes("config") || path.endsWith(".json"))
    return "tooling";
  if (/\.(?:md|mdc)$/.test(path)) return "documentation";
  return "root";
}

function inferLifecycle(path: string): FileLifecycle {
  if (path === PROJECT_CONFIG_FILE || path.startsWith(".ghostinit/")) return "generator-owned";
  if (
    path === "package.json" ||
    path.endsWith("/package.json") ||
    path === "turbo.json" ||
    path.endsWith("tsconfig.json")
  )
    return "structured-merge";
  if (
    path === ".env.local" ||
    path.endsWith("README.md") ||
    path.endsWith("AGENTS.md") ||
    path.endsWith("CLAUDE.md") ||
    /^(?:apps\/[^/]+\/)?src\/(?:app|routes)\/(?!api\/).*(?:page|layout|route)\.tsx?$/.test(path)
  )
    return "seed-once";
  // Service, transport, schema, design-system, and capability slices are
  // deterministic generator artifacts. Hash gates still prevent overwriting a
  // user edit, while unchanged disabled slices can be removed safely.
  return "generator-owned";
}

export function createManagedFileState(
  path: string,
  content: string,
  overrides: Partial<Pick<ManagedFileState, "owner" | "lifecycle" | "provenance">> = {},
): ManagedFileState {
  const normalized = path.replaceAll("\\", "/");
  return {
    path: normalized,
    owner: overrides.owner ?? inferOwner(normalized),
    lifecycle: overrides.lifecycle ?? inferLifecycle(normalized),
    contentHash: hashContent(content),
    size: Buffer.byteLength(content, "utf8"),
    provenance: overrides.provenance ?? {
      renderer: "legacy-template-adapter",
      source: "src/templates",
      // Legacy callers do not provide contribution metadata. A filename is
      // not evidence of capability ownership, so preserve an explicit unknown.
      capability: null,
      appId: null,
      target: null,
      artifacts: [],
      acceptance: [],
      contribution: [],
    },
  };
}

export function createManagedFileStateFromPlan(
  file: PlannedFile,
  content: string = file.content,
): ManagedFileState {
  return createManagedFileState(file.physicalPath, content, {
    owner: file.owner,
    lifecycle: file.lifecycle,
    provenance: {
      ...file.provenance,
      artifacts: [...file.provenance.artifacts],
      acceptance: [...file.provenance.acceptance],
      contribution: [...file.provenance.contribution],
    },
  });
}

export function createGenerationPlanState(plan: GenerationPlan): GenerationPlanState {
  return {
    $schema: plan.$schema,
    schemaVersion: plan.schemaVersion,
    projectConfigHash: plan.projectConfigHash,
    planHash: plan.planHash,
    fileCount: plan.files.length,
    renderers: [...new Set(plan.files.map(({ provenance }) => provenance.renderer))].sort(),
    secretReferences: plan.secrets.map(({ reference }) => reference).sort(),
  };
}

function fileFromChecksum(path: string, entry: ChecksumEntry): ManagedFileState {
  const normalized = path.replaceAll("\\", "/");
  return {
    path: normalized,
    owner: inferOwner(normalized),
    lifecycle: inferLifecycle(normalized),
    contentHash: entry.hash.toLowerCase(),
    size: entry.size,
    provenance: {
      renderer: "v1-checksum-migration",
      source: "ghostinit-v1-state",
      // V1 stored only hashes. Do not invent provenance during migration.
      capability: null,
      appId: null,
      target: null,
      artifacts: [],
      acceptance: [],
      contribution: [],
    },
  };
}

function checksumsFromFiles(files: Record<string, ManagedFileState>): State["checksums"] {
  return Object.fromEntries(
    Object.entries(files).map(([path, file]) => [
      path,
      { algorithm: "sha256" as const, hash: file.contentHash, size: file.size, path },
    ]),
  );
}

async function hydrateV1(root: string, legacy: LegacyStateV1): Promise<State> {
  const { desired, resolved, exists } = await loadDesiredProjectConfig(root, legacy.project);
  const files = Object.fromEntries(
    Object.entries(legacy.checksums).map(([path, entry]) => [
      path.replaceAll("\\", "/"),
      fileFromChecksum(path, entry),
    ]),
  );
  return {
    $schema: STATE_SCHEMA_URI,
    schemaVersion: 2,
    version: 2,
    sourceVersion: 1,
    configHash: resolved.configHash,
    generationPlan: null,
    normalizedConfigHash: resolved.configHash,
    configChanged: false,
    configFileExists: exists,
    generatedBy: legacy.generatedBy,
    generatedAt: legacy.generatedAt,
    files,
    checksums: checksumsFromFiles(files),
    modules: legacy.modules,
    procedures: legacy.procedures,
    pendingOperation: null,
    migrationHistory: [],
    desiredConfig: desired,
    resolvedConfig: resolved,
    project: exists
      ? desiredToProjectConfig(desired, legacy.generatedAt, resolved)
      : legacy.project,
  } as State;
}

async function hydrateV2(root: string, persisted: PersistedStateV2): Promise<State> {
  const { desired, resolved, exists } = await loadDesiredProjectConfig(root);
  for (const [path, file] of Object.entries(persisted.files)) {
    if (path.replaceAll("\\", "/") !== file.path) {
      throw new IncompatibleSchemaError("State file key does not match its managed path", {
        key: path,
        path: file.path,
      });
    }
  }
  return {
    ...persisted,
    sourceVersion: 2,
    normalizedConfigHash: resolved.configHash,
    configChanged: persisted.configHash !== resolved.configHash,
    configFileExists: exists,
    desiredConfig: desired,
    resolvedConfig: resolved,
    project: desiredToProjectConfig(desired, persisted.generatedAt, resolved),
    checksums: checksumsFromFiles(persisted.files),
  } as State;
}

export async function loadState(root: string): Promise<State | undefined> {
  const path = stateFilePath(root);
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if ((error as { code?: string })?.code === "ENOENT") return undefined;
    throw new ProjectStateError(`Unable to read GhostInit state at ${path}`, {
      path,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new IncompatibleSchemaError(`GhostInit state at ${path} is not valid JSON`, {
      path,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  if ((parsed as { version?: unknown })?.version === 1) {
    const result = legacyStateV1Schema.safeParse(parsed);
    if (!result.success) throwStateSchemaError(path, 1, result.error.issues);
    return hydrateV1(root, result.data);
  }
  const result = stateV2Schema.safeParse(parsed);
  if (!result.success) throwStateSchemaError(path, 2, result.error.issues);
  return hydrateV2(root, result.data);
}

function throwStateSchemaError(
  path: string,
  version: number,
  issues: ReadonlyArray<{ path: PropertyKey[]; code: string; message: string }>,
): never {
  throw new IncompatibleSchemaError(
    `GhostInit state at ${path} does not match schema v${version}`,
    {
      path,
      schemaVersion: version,
      issues: issues.map((issue) => ({
        path: issue.path.map(String).join("."),
        code: issue.code,
        message: issue.message,
      })),
    },
  );
}

export interface SaveStateOptions {
  desiredConfig?: DesiredProjectConfig;
  managedFiles?: readonly ManagedFileState[];
  replaceFiles?: Record<string, ManagedFileState>;
  migrateV1?: boolean;
  acceptConfigChanges?: boolean;
  pendingOperation?: PendingOperation | null;
  migrationHistory?: readonly MigrationHistoryEntry[];
  resolvedConfig?: import("../domain/project/config.js").ResolvedProjectConfig;
  generationPlan?: GenerationPlanState | null;
  desiredConfigAlreadyWritten?: boolean;
  existingState?: State;
}

/**
 * Stage project state into a caller-owned transaction. The transaction must be
 * rooted at `root`; callers use this to publish artifacts, registries, desired
 * config, and state through one commit/rollback boundary.
 */
export async function stageState(
  tx: FsTransaction,
  root: string,
  project: ProjectConfig,
  checksums: ChecksumEntry[],
  modules: string[],
  procedures: string[] = [],
  options: SaveStateOptions = {},
): Promise<void> {
  project = projectConfigSchema.parse(project);
  const existing = options.existingState ?? (await loadState(root));
  if (existing?.sourceVersion === 1 && !options.migrateV1) {
    const checksumMap = { ...existing.checksums };
    for (const entry of checksums) checksumMap[entry.path] = entry;
    const legacy: LegacyStateV1 = {
      version: 1,
      project,
      checksums: checksumMap,
      generatedBy: ghostinitVersion,
      generatedAt: new Date().toISOString(),
      modules: [...modules].sort(),
      procedures: [...procedures].sort(),
    };
    await tx.write(`${GHOSTINIT_DIR}/${STATE_FILE}`, `${JSON.stringify(legacy, null, 2)}\n`);
    return;
  }

  const desired =
    options.desiredConfig ?? existing?.desiredConfig ?? projectConfigToDesired(project);
  const resolved = options.resolvedConfig ?? resolveDesiredProjectConfig(desired);
  const files: Record<string, ManagedFileState> = options.replaceFiles
    ? { ...options.replaceFiles }
    : existing?.sourceVersion === 2
      ? { ...existing.files }
      : {};
  for (const entry of checksums) {
    const prior = files[entry.path];
    files[entry.path] = prior
      ? { ...prior, contentHash: entry.hash.toLowerCase(), size: entry.size }
      : fileFromChecksum(entry.path, entry);
  }
  for (const file of options.managedFiles ?? []) files[file.path] = file;

  const now = new Date().toISOString();
  const history = options.migrationHistory
    ? [...options.migrationHistory]
    : existing?.sourceVersion === 2
      ? [...existing.migrationHistory]
      : [];
  if (!existing && history.length === 0) {
    history.push({
      id: randomUUID(),
      kind: "create",
      fromVersion: null,
      toVersion: 2,
      status: "completed",
      startedAt: now,
      completedAt: now,
      configHash: resolved.configHash,
      summary: {
        creates: Object.keys(files).length,
        moves: 0,
        rewrites: 0,
        deletions: 0,
        conflicts: 0,
      },
    });
  }
  const persisted: PersistedStateV2 = {
    $schema: STATE_SCHEMA_URI,
    schemaVersion: 2,
    version: 2,
    configHash:
      options.acceptConfigChanges || !existing || existing.sourceVersion === 1
        ? resolved.configHash
        : existing.configHash,
    generationPlan:
      options.generationPlan === undefined
        ? existing?.sourceVersion === 2
          ? existing.generationPlan
          : null
        : options.generationPlan,
    generatedBy: ghostinitVersion,
    generatedAt: now,
    files: Object.fromEntries(
      Object.entries(files).sort(([left], [right]) => left.localeCompare(right)),
    ),
    modules: [...modules].sort(),
    procedures: [...procedures].sort(),
    pendingOperation:
      options.pendingOperation === undefined
        ? existing?.sourceVersion === 2
          ? existing.pendingOperation
          : null
        : options.pendingOperation,
    migrationHistory: history,
  };
  if (
    !options.desiredConfigAlreadyWritten &&
    (!existing?.configFileExists || options.desiredConfig || options.migrateV1)
  ) {
    await tx.write(PROJECT_CONFIG_FILE, serializeDesiredProjectConfig(desired));
  }
  await tx.write(`${GHOSTINIT_DIR}/${STATE_FILE}`, `${JSON.stringify(persisted, null, 2)}\n`);
}

export async function saveState(
  root: string,
  project: ProjectConfig,
  checksums: ChecksumEntry[],
  modules: string[],
  procedures: string[] = [],
  options: SaveStateOptions = {},
): Promise<void> {
  const tx = new FsTransaction(root);
  await stageState(tx, root, project, checksums, modules, procedures, options);
  await tx.commit();
}

export async function saveStateV2(
  root: string,
  state: State,
  options: Omit<SaveStateOptions, "migrateV1"> = {},
): Promise<void> {
  await saveState(
    root,
    state.project,
    options.replaceFiles ? [] : Object.values(state.checksums),
    state.modules,
    state.procedures,
    {
      ...options,
      resolvedConfig: options.resolvedConfig ?? state.resolvedConfig,
      existingState: options.existingState ?? state,
      migrateV1: true,
    },
  );
}

export type SemVer = { major: number; minor: number; patch: number; prerelease?: string };

export function parseSemver(version: string): SemVer | null {
  if (!version || typeof version !== "string") return null;
  const clean = version.trim().replace(/^v/i, "");
  const match = clean.match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
  if (!match) return null;
  const major = Number.parseInt(match[1], 10);
  const minor = Number.parseInt(match[2], 10);
  const patch = Number.parseInt(match[3], 10);
  if ([major, minor, patch].some(Number.isNaN)) return null;
  return {
    major,
    minor,
    patch,
    prerelease: clean.match(/^\d+\.\d+\.\d+-([^+\s]+)/)?.[1],
  };
}

export function compareVersions(a: string, b: string): number {
  const left = parseSemver(a);
  const right = parseSemver(b);
  if (!left || !right) return a === b ? 0 : a < b ? -1 : 1;
  for (const key of ["major", "minor", "patch"] as const) {
    if (left[key] !== right[key]) return left[key] < right[key] ? -1 : 1;
  }
  if (left.prerelease && !right.prerelease) return -1;
  if (!left.prerelease && right.prerelease) return 1;
  if (left.prerelease && right.prerelease)
    return left.prerelease === right.prerelease ? 0 : left.prerelease < right.prerelease ? -1 : 1;
  return 0;
}

export function isCompatibleVersion(current: string, generated: string): boolean {
  if (current === generated) return true;
  const left = parseSemver(current);
  const right = parseSemver(generated);
  return !!left && !!right && left.major === right.major;
}

export function validateStateCompatibility(
  current: State | undefined,
  config: ProjectConfig,
): void {
  if (!current) return;
  if (current.project.name !== config.name) {
    throw new IncompatibleSchemaError("Project name in existing state does not match", {
      expected: config.name,
      actual: current.project.name,
    });
  }
  if (current.generatedBy === ghostinitVersion) return;
  if (isCompatibleVersion(ghostinitVersion, current.generatedBy)) return;
  throw new IncompatibleSchemaError(
    `GhostInit state generated by incompatible CLI version ${current.generatedBy} (current ${ghostinitVersion}). Major version mismatch.`,
    { currentCli: ghostinitVersion, generatedBy: current.generatedBy },
  );
}
