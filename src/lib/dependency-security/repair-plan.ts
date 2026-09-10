import type {
  DependencyFieldPath,
  DependencySecurityAdvisory,
  DependencySecurityChange,
  DependencySecurityRepairPlan,
  DependencySecurityResolution,
} from "../../domain/dependency-security/types.js";
import {
  dependencySecurityResolutionKey,
  normalizeDependencySecurityResolutions,
} from "../../domain/dependency-security/resolutions.js";
import { isCompatibleSecurityVersion } from "../../domain/dependency-security/versions.js";
import { hashContent } from "../checksum.js";
import { FsTransaction } from "../fs.js";
import type { AuditFixReport, AuditManifestEdit } from "./audit.js";
import type { SecurityLockEvidence } from "./runtime-types.js";
import type { SecurityWorkspaceSnapshot } from "./workspace.js";
import { invalid, isRecord } from "./validation.js";

interface DeclarationEdit {
  readonly manifestPath: string;
  readonly field: DependencyFieldPath;
  readonly package: string;
  readonly originalSpec: string;
  readonly version: string;
  readonly advisories: readonly string[];
}

function declarationField(
  manifest: Record<string, unknown>,
  edit: AuditManifestEdit,
): DependencyFieldPath {
  const fields: DependencyFieldPath[] = [];
  if (edit.catalog === null) {
    for (const name of [
      "dependencies",
      "devDependencies",
      "optionalDependencies",
      "peerDependencies",
      "overrides",
    ] as const) {
      const declarations = manifest[name];
      if (isRecord(declarations) && Object.hasOwn(declarations, edit.key))
        fields.push([name, edit.key]);
    }
  } else {
    if (edit.file !== "package.json") invalid("catalog edits must name the root manifest");
    if (
      edit.catalog === "default" &&
      isRecord(manifest.catalog) &&
      Object.hasOwn(manifest.catalog, edit.key)
    )
      fields.push(["catalog", edit.key]);
    const namedCatalog = isRecord(manifest.catalogs) ? manifest.catalogs[edit.catalog] : undefined;
    if (isRecord(namedCatalog) && Object.hasOwn(namedCatalog, edit.key))
      fields.push(["catalogs", edit.catalog, edit.key]);
    if (isRecord(manifest.workspaces)) {
      if (
        edit.catalog === "default" &&
        isRecord(manifest.workspaces.catalog) &&
        Object.hasOwn(manifest.workspaces.catalog, edit.key)
      )
        fields.push(["workspaces", "catalog", edit.key]);
      const namedWorkspaceCatalog = isRecord(manifest.workspaces.catalogs)
        ? manifest.workspaces.catalogs[edit.catalog]
        : undefined;
      if (isRecord(namedWorkspaceCatalog) && Object.hasOwn(namedWorkspaceCatalog, edit.key))
        fields.push(["workspaces", "catalogs", edit.catalog, edit.key]);
    }
  }
  if (fields.length !== 1)
    invalid("manifest edit has an absent or ambiguous dependency declaration");
  return fields[0];
}

export function prepareSecurityManifestEdits(
  snapshot: SecurityWorkspaceSnapshot,
  report: AuditFixReport,
  advisories: readonly DependencySecurityAdvisory[],
  originalEvidence: SecurityLockEvidence,
): DeclarationEdit[] {
  const edits = new Map<string, DeclarationEdit>();
  for (const fix of report.fixes) {
    if (
      !originalEvidence.releases.some(
        (release) => release.package === fix.name && release.version === fix.from,
      )
    )
      invalid("audit fix names a release absent from the original verified lock");
    const ids = [
      ...new Set(
        advisories
          .filter((item) => item.package === fix.name)
          .map((item) => item.url.split("/").at(-1)!),
      ),
    ].sort();
    if (ids.length === 0) invalid("audit fix lacks an advisory in the original report");
    for (const edit of fix.packageJson) {
      const manifest = snapshot.manifests.get(edit.file);
      if (!manifest) invalid("manifest edit names an undeclared workspace");
      const field = declarationField(manifest, edit);
      let parent = manifest;
      for (const key of field.slice(0, -1)) parent = parent[key] as Record<string, unknown>;
      if (parent[edit.key] !== edit.from || !isCompatibleSecurityVersion(edit.from, fix.to))
        invalid("manifest edit changed its source declaration or compatible release family");
      const next: DeclarationEdit = {
        manifestPath: edit.file,
        field,
        package: fix.name,
        originalSpec: edit.from,
        version: fix.to,
        advisories: ids,
      };
      const key = dependencySecurityResolutionKey(next as DependencySecurityResolution);
      const prior = edits.get(key);
      if (prior && JSON.stringify(prior) !== JSON.stringify(next))
        invalid("audit fix proposes conflicting edits for one declaration");
      edits.set(key, next);
    }
  }
  return [...edits.values()];
}

export async function materializeSecurityManifestEdits(
  candidate: string,
  snapshot: SecurityWorkspaceSnapshot,
  edits: readonly DeclarationEdit[],
): Promise<void> {
  const documents = new Map<string, Record<string, unknown>>();
  for (const edit of edits) {
    let manifest = documents.get(edit.manifestPath);
    if (!manifest) {
      manifest = structuredClone(snapshot.manifests.get(edit.manifestPath)!);
      documents.set(edit.manifestPath, manifest);
    }
    let parent = manifest;
    for (const key of edit.field.slice(0, -1)) parent = parent[key] as Record<string, unknown>;
    parent[edit.field.at(-1)!] = edit.version;
  }
  const tx = new FsTransaction(candidate);
  for (const [path, manifest] of documents)
    await tx.writeIfUnchanged(
      path,
      `${JSON.stringify(manifest, null, 2)}\n`,
      snapshot.files.get(path)!,
    );
  await tx.commit();
}

export async function buildSecurityRepairPlan(
  candidate: string,
  snapshot: SecurityWorkspaceSnapshot,
  report: AuditFixReport,
  edits: readonly DeclarationEdit[],
  evidence: SecurityLockEvidence,
): Promise<DependencySecurityRepairPlan> {
  const reader = new FsTransaction(candidate);
  const resolutions = normalizeDependencySecurityResolutions({
    schemaVersion: 1,
    resolutions: edits.map((edit) => {
      const release = evidence.releases.find(
        (value) => value.package === edit.package && value.version === edit.version,
      );
      if (!release) invalid("manifest security floor is absent from the verified candidate lock");
      return {
        ...edit,
        integrity: release.integrity,
        publishedAt: release.publishedAt,
        auditedAt: evidence.auditedAt,
      };
    }),
  });
  const changes: DependencySecurityChange[] = report.fixes.map((fix) => {
    if (!evidence.releases.some((value) => value.package === fix.name && value.version === fix.to))
      invalid("audit fix target is absent from the verified candidate lock");
    if (evidence.releases.some((value) => value.package === fix.name && value.version === fix.from))
      invalid("audit fix left the vulnerable locked release installed");
    return {
      package: fix.name,
      from: fix.from,
      to: fix.to,
      manifests: [...new Set(fix.packageJson.map((edit) => edit.file))].sort(),
    };
  });
  const files = [];
  for (const path of new Set([
    "bun.lock",
    "dependency-lock-evidence.json",
    ...edits.map((edit) => edit.manifestPath),
  ])) {
    const after = await reader.readText(path);
    if (after === undefined) invalid("verified repair omitted required metadata");
    const before = snapshot.files.get(path) ?? null;
    if (after !== before) files.push({ path, before, after });
  }
  const originalLock = snapshot.files.get("bun.lock") ?? null;
  return {
    schemaVersion: 1,
    beforeLockSha256: originalLock === null ? null : hashContent(originalLock),
    afterLockSha256: evidence.lockSha256,
    changes,
    resolutions,
    files,
  };
}
