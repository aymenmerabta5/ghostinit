import type {
  DependencySecurityFileChange,
  DependencySecurityRepairPlan,
  DependencySecurityResolution,
  DependencySecurityResolutions,
} from "../domain/dependency-security/types.js";
import {
  dependencySecurityResolutionKey,
  isSecurityManifestPath,
  normalizeDependencySecurityResolutions,
} from "../domain/dependency-security/resolutions.js";
import {
  compareSecurityVersions,
  isCompatibleSecurityVersion,
  securityRangeBase,
} from "../domain/dependency-security/versions.js";
import { canonicalJson } from "../domain/project/canonical.js";
import { dependencySecurityDeclaration } from "../domain/dependency-security/declarations.js";
import type { DesiredProjectConfig } from "../domain/project/config.js";
import { canonicalDesiredProjectConfig } from "../domain/project/desired-canonical.js";
import { PROJECT_CONFIG_FILE, projectDesiredConfigSchema, stateV2Schema } from "./config.js";
import { hashContent } from "./checksum.js";
import { ConflictError } from "./errors.js";
import { FsTransaction } from "./fs.js";
import { resolveDesiredProjectConfig, serializeDesiredProjectConfig } from "./project-config.js";
import { createManagedFileState } from "./state.js";

const STATE_PATH = ".ghostinit/state.json";

/** Internal snapshot bytes must never be exposed in a JSON envelope or log. */
export interface DependencySecurityMaintenanceSnapshot {
  readonly desiredConfigContent: string | null;
  readonly stateContent: string | null;
}

export async function snapshotDependencySecurityMaintenance(
  root: string,
): Promise<DependencySecurityMaintenanceSnapshot> {
  const reader = new FsTransaction(root);
  const desiredConfigContent = (await reader.readText(PROJECT_CONFIG_FILE)) ?? null;
  const stateContent = (await reader.readText(STATE_PATH)) ?? null;
  return { desiredConfigContent, stateContent };
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parsedObject(content: string, path: string): Record<string, unknown> {
  const value: unknown = JSON.parse(content);
  if (!object(value))
    throw new ConflictError("Dependency maintenance requires a JSON object", { path });
  return value;
}

function mergeResolutions(
  previous: DependencySecurityResolutions | undefined,
  next: DependencySecurityResolutions,
): DependencySecurityResolutions {
  const merged = new Map(
    (previous?.resolutions ?? []).map((item) => [dependencySecurityResolutionKey(item), item]),
  );
  for (const item of next.resolutions) {
    const key = dependencySecurityResolutionKey(item);
    const prior = merged.get(key);
    const nextBase = securityRangeBase(item.originalSpec)!;
    const sameFamily = prior && isCompatibleSecurityVersion(prior.originalSpec, nextBase);
    if (
      prior &&
      (compareSecurityVersions(item.version, prior.version) < 0 ||
        (sameFamily && !isCompatibleSecurityVersion(prior.originalSpec, item.version)))
    ) {
      throw new ConflictError(
        "Dependency maintenance cannot lower or change an existing compatible security floor",
        { path: item.manifestPath, package: item.package },
      );
    }
    merged.set(
      key,
      prior && sameFamily
        ? {
            ...item,
            originalSpec: prior.originalSpec,
            advisories: [...new Set([...prior.advisories, ...item.advisories])],
          }
        : item,
    );
  }
  return normalizeDependencySecurityResolutions({
    schemaVersion: 1,
    resolutions: [...merged.values()],
  });
}

function validateManifestChange(
  change: DependencySecurityFileChange,
  resolutions: readonly DependencySecurityResolution[],
): void {
  if (change.before === null)
    throw new ConflictError("Dependency maintenance cannot add a manifest", { path: change.path });
  const expected = parsedObject(change.before, change.path);
  for (const resolution of resolutions.filter(({ manifestPath }) => manifestPath === change.path)) {
    const declaration = dependencySecurityDeclaration(expected, resolution.field);
    if (!declaration)
      throw new ConflictError("Dependency maintenance cannot create a dependency field", {
        path: change.path,
        field: resolution.field,
      });
    const { parent, key } = declaration;
    const before = parent[key];
    if (typeof before !== "string" || !isCompatibleSecurityVersion(before, resolution.version)) {
      throw new ConflictError(
        "Dependency maintenance would add a dependency, downgrade it, or change its compatible range",
        { path: change.path, package: resolution.package },
      );
    }
    parent[key] = resolution.version;
  }
  if (canonicalJson(expected) !== canonicalJson(parsedObject(change.after, change.path))) {
    throw new ConflictError("Dependency maintenance changed unrelated manifest fields", {
      path: change.path,
    });
  }
}

/**
 * Stage maintenance through the installer's transaction. A completed installed
 * audit is the caller's responsibility; no subprocess or commit runs here.
 */
export async function stageDependencySecurityMaintenance(
  tx: FsTransaction,
  root: string,
  snapshot: DependencySecurityMaintenanceSnapshot,
  repair: DependencySecurityRepairPlan,
): Promise<{ desiredConfig: DesiredProjectConfig | null; managedManifestPaths: string[] }> {
  if (
    repair.schemaVersion !== 1 ||
    !/^[a-f0-9]{64}$/.test(repair.afterLockSha256) ||
    (repair.beforeLockSha256 !== null && !/^[a-f0-9]{64}$/.test(repair.beforeLockSha256))
  ) {
    throw new ConflictError("Dependency maintenance has invalid lock hashes or plan schema");
  }
  await tx.assertUnchanged(PROJECT_CONFIG_FILE, snapshot.desiredConfigContent);
  await tx.assertUnchanged(STATE_PATH, snapshot.stateContent);
  const next = normalizeDependencySecurityResolutions(repair.resolutions);
  const beforeDesired =
    snapshot.desiredConfigContent === null
      ? null
      : canonicalDesiredProjectConfig(
          projectDesiredConfigSchema.parse(JSON.parse(snapshot.desiredConfigContent)),
        );
  if (beforeDesired === null && next.resolutions.length > 0) {
    throw new ConflictError(
      "Persisting dependency resolutions requires ghostinit.config.json; upgrade this project first",
    );
  }
  const persisted =
    snapshot.stateContent === null ? null : stateV2Schema.parse(JSON.parse(snapshot.stateContent));
  if (persisted?.pendingOperation)
    throw new ConflictError("Complete the pending project operation before dependency maintenance");
  const merged = mergeResolutions(beforeDesired?.dependencySecurity, next);
  const desired =
    beforeDesired === null
      ? null
      : canonicalDesiredProjectConfig({
          ...beforeDesired,
          ...(merged.resolutions.length === 0 && beforeDesired.dependencySecurity === undefined
            ? {}
            : { dependencySecurity: merged }),
        });
  const files = persisted ? { ...persisted.files } : {};
  const managedManifestPaths: string[] = [];
  const seen = new Set<string>();
  for (const change of repair.files) {
    await tx.assertUnchanged(change.path, change.before);
    if (seen.has(change.path))
      throw new ConflictError("Dependency maintenance repeats a file", { path: change.path });
    seen.add(change.path);
    if (
      change.path !== "bun.lock" &&
      change.path !== "dependency-lock-evidence.json" &&
      !isSecurityManifestPath(change.path)
    )
      throw new ConflictError(
        "Dependency maintenance can only change manifests, bun.lock, and its verified evidence",
        { path: change.path },
      );
    if (change.path === "bun.lock") {
      if (
        (change.before === null ? null : hashContent(change.before)) !== repair.beforeLockSha256 ||
        hashContent(change.after) !== repair.afterLockSha256
      )
        throw new ConflictError("Dependency maintenance lock hashes do not match its plan");
    } else if (change.path === "dependency-lock-evidence.json") {
      if (parsedObject(change.after, change.path).lockSha256 !== repair.afterLockSha256)
        throw new ConflictError(
          "Dependency maintenance lock evidence does not match the repaired lockfile",
        );
    } else {
      validateManifestChange(change, next.resolutions);
      const prior = files[change.path];
      if (
        prior &&
        prior.lifecycle === "structured-merge" &&
        change.before !== null &&
        hashContent(change.before) === prior.contentHash
      ) {
        files[change.path] = createManagedFileState(change.path, change.after, prior);
        managedManifestPaths.push(change.path);
      }
    }
    await tx.writeIfUnchanged(change.path, change.after, change.before);
  }
  if (!seen.has("bun.lock") && repair.beforeLockSha256 !== repair.afterLockSha256)
    throw new ConflictError("Dependency maintenance omitted its changed lockfile");
  const reader = new FsTransaction(root);
  if (
    ((await reader.readText(PROJECT_CONFIG_FILE)) ?? null) !== snapshot.desiredConfigContent ||
    ((await reader.readText(STATE_PATH)) ?? null) !== snapshot.stateContent
  ) {
    throw new ConflictError("Project configuration or state changed during dependency maintenance");
  }
  if (desired && beforeDesired) {
    const changed = canonicalJson(desired) !== canonicalJson(beforeDesired);
    const content = changed
      ? serializeDesiredProjectConfig(desired)
      : snapshot.desiredConfigContent!;
    await tx.writeIfUnchanged(PROJECT_CONFIG_FILE, content, snapshot.desiredConfigContent);
    if (persisted) {
      const previousResolved = resolveDesiredProjectConfig(beforeDesired);
      const resolved = resolveDesiredProjectConfig(desired);
      if (files[PROJECT_CONFIG_FILE] && persisted.configHash === previousResolved.configHash) {
        files[PROJECT_CONFIG_FILE] = createManagedFileState(
          PROJECT_CONFIG_FILE,
          content,
          files[PROJECT_CONFIG_FILE],
        );
      }
      const afterState = {
        ...persisted,
        // Preserve pre-existing desired-state drift for ordinary reconciliation.
        configHash:
          persisted.configHash === previousResolved.configHash
            ? resolved.configHash
            : persisted.configHash,
        generationPlan:
          changed || managedManifestPaths.length > 0 ? null : persisted.generationPlan,
        files,
      };
      await tx.writeIfUnchanged(
        STATE_PATH,
        `${JSON.stringify(afterState, null, 2)}\n`,
        snapshot.stateContent,
      );
    }
  }
  return { desiredConfig: desired, managedManifestPaths };
}
