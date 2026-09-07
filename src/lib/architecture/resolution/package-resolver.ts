// @allow-long 323: package imports, exports, self-references, and namespace ownership share one fail-closed decision path
// @allow-long 320: one resolver owns package imports, workspace exports, conditions, and cache coherence
import { dirname, resolve } from "node:path";
import type { ImportReference } from "../types.js";
import {
  findNearestPackageManifest,
  packageNameFromSpecifier,
  packageSubpath,
  selectExportsTarget,
  selectImportsTarget,
} from "./packages.js";
import { ProjectPathResolver, intendedProjectPath } from "./paths.js";
import { resolutionResult as result } from "./result.js";
import type {
  ImportResolutionReason,
  PackageManifest,
  ResolvedImport,
  WorkspaceInventory,
} from "./types.js";

export class OwnedPackageResolver {
  private readonly packageCache = new Map<string, Promise<PackageManifest | undefined>>();
  private readonly ownedScopes = new Set(["@repo"]);

  constructor(
    private readonly paths: ProjectPathResolver,
    private readonly workspaces: WorkspaceInventory,
    private readonly extraConditions: readonly string[],
  ) {
    for (const packageName of workspaces.packagesByName.keys()) {
      const scope = workspaceScope(packageName);
      if (scope) this.ownedScopes.add(scope);
    }
    const rootScope = workspaceScope(workspaces.rootManifest?.name);
    if (rootScope) this.ownedScopes.add(rootScope);
  }

  async resolvePackageImport(
    sourceAbsolute: string,
    source: string,
    specifier: string,
    reference: ImportReference,
    seen = new Set<string>(),
  ): Promise<ResolvedImport> {
    if (seen.has(specifier)) {
      return result(
        reference,
        specifier,
        source,
        "unresolved",
        true,
        "package-import-target-missing",
      );
    }
    seen.add(specifier);
    const owner = await this.nearestPackage(sourceAbsolute);
    const selected = selectImportsTarget(owner?.imports, specifier, this.conditions(reference));
    if (selected.status === "unmatched") {
      return result(reference, specifier, source, "unresolved", true, "package-import-not-defined");
    }
    if (selected.status === "blocked" || !selected.target) {
      return result(reference, specifier, source, "unresolved", true, "package-import-blocked");
    }
    if (selected.target.startsWith("#")) {
      return this.resolvePackageImport(sourceAbsolute, source, selected.target, reference, seen);
    }
    if (!selected.target.startsWith("./") || !owner) {
      return this.resolvePackageSpecifier(sourceAbsolute, source, selected.target, reference);
    }

    const requested = resolve(owner.dir, selected.target);
    const resolution = await this.paths.resolveModule(requested, reference.typeOnly);
    if (resolution.status === "outside") {
      return result(reference, specifier, source, "unresolved", true, "target-outside-project");
    }
    return resolution.status === "resolved"
      ? result(
          reference,
          specifier,
          source,
          "internal",
          true,
          "package-import",
          this.paths.toProjectPath(resolution.absolute!),
        )
      : result(
          reference,
          specifier,
          source,
          "unresolved",
          true,
          "package-import-target-missing",
          intendedProjectPath(this.paths, requested),
        );
  }

  async resolvePackageSpecifier(
    sourceAbsolute: string,
    source: string,
    specifier: string,
    reference: ImportReference,
  ): Promise<ResolvedImport> {
    const packageName = packageNameFromSpecifier(specifier);
    if (!packageName) {
      return result(reference, specifier, source, "unresolved", false, "invalid-specifier");
    }
    const owner = await this.nearestPackage(sourceAbsolute);
    if (owner?.name === packageName) {
      return this.resolvePackageManifest(owner, source, specifier, packageName, reference, true);
    }

    const workspaceMatches = this.workspaces.packagesByName.get(packageName) ?? [];
    if (workspaceMatches.length > 1) {
      return result(
        reference,
        specifier,
        source,
        "unresolved",
        true,
        "workspace-package-ambiguous",
        undefined,
        packageName,
      );
    }
    if (workspaceMatches[0]) {
      return this.resolvePackageManifest(
        workspaceMatches[0],
        source,
        specifier,
        packageName,
        reference,
        false,
      );
    }
    const scope = workspaceScope(packageName);
    if (scope && this.ownedScopes.has(scope)) {
      return result(
        reference,
        specifier,
        source,
        "unresolved",
        true,
        "workspace-package-not-found",
        undefined,
        packageName,
      );
    }
    return result(
      reference,
      specifier,
      source,
      "external",
      false,
      "external-package",
      undefined,
      packageName,
    );
  }

  private async resolvePackageManifest(
    manifest: PackageManifest,
    source: string,
    specifier: string,
    packageName: string,
    reference: ImportReference,
    self: boolean,
  ): Promise<ResolvedImport> {
    const prefix = self ? "self" : "workspace";
    const subpath = packageSubpath(specifier, packageName);
    if (manifest.exports !== undefined) {
      const selected = selectExportsTarget(manifest.exports, subpath, this.conditions(reference));
      if (selected.status !== "matched" || !selected.target) {
        const reason =
          `${prefix}-export-${selected.status === "blocked" ? "blocked" : "not-defined"}` as ImportResolutionReason;
        return result(
          reference,
          specifier,
          source,
          "unresolved",
          true,
          reason,
          undefined,
          packageName,
        );
      }
      if (!selected.target.startsWith("./")) {
        return result(
          reference,
          specifier,
          source,
          "unresolved",
          true,
          "target-outside-project",
          undefined,
          packageName,
        );
      }
      return this.resolveManifestPath(
        resolve(manifest.dir, selected.target),
        source,
        specifier,
        packageName,
        reference,
        self,
      );
    }

    const candidates =
      subpath === "."
        ? [
            manifest.types,
            manifest.typings,
            manifest.module,
            manifest.main,
            "src/index.ts",
            "index.ts",
          ].filter((value): value is string => Boolean(value))
        : [subpath.slice(2)];
    for (const candidate of candidates) {
      const requested = resolve(manifest.dir, candidate);
      const resolution = await this.paths.resolveModule(requested, reference.typeOnly);
      if (resolution.status === "outside") {
        return result(
          reference,
          specifier,
          source,
          "unresolved",
          true,
          "target-outside-project",
          undefined,
          packageName,
        );
      }
      if (resolution.status === "resolved") {
        return result(
          reference,
          specifier,
          source,
          "workspace",
          true,
          self ? "self-reference" : "workspace-export",
          this.paths.toProjectPath(resolution.absolute!),
          packageName,
        );
      }
    }
    return result(
      reference,
      specifier,
      source,
      "unresolved",
      true,
      `${prefix}-target-missing` as ImportResolutionReason,
      undefined,
      packageName,
    );
  }

  private async resolveManifestPath(
    requested: string,
    source: string,
    specifier: string,
    packageName: string,
    reference: ImportReference,
    self: boolean,
  ): Promise<ResolvedImport> {
    const resolution = await this.paths.resolveModule(requested, reference.typeOnly);
    if (resolution.status === "outside") {
      return result(
        reference,
        specifier,
        source,
        "unresolved",
        true,
        "target-outside-project",
        undefined,
        packageName,
      );
    }
    return resolution.status === "resolved"
      ? result(
          reference,
          specifier,
          source,
          "workspace",
          true,
          self ? "self-reference" : "workspace-export",
          this.paths.toProjectPath(resolution.absolute!),
          packageName,
        )
      : result(
          reference,
          specifier,
          source,
          "unresolved",
          true,
          self ? "self-target-missing" : "workspace-target-missing",
          intendedProjectPath(this.paths, requested),
          packageName,
        );
  }

  private nearestPackage(sourceAbsolute: string): Promise<PackageManifest | undefined> {
    const directory = dirname(sourceAbsolute);
    const cached = this.packageCache.get(directory);
    if (cached) return cached;
    const pending = findNearestPackageManifest(this.paths, sourceAbsolute);
    this.packageCache.set(directory, pending);
    return pending;
  }

  private conditions(reference: ImportReference): ReadonlySet<string> {
    const conditions = new Set(this.extraConditions);
    if (reference.typeOnly) conditions.add("types");
    conditions.add(
      reference.kind === "require" || reference.kind === "import-equals" ? "require" : "import",
    );
    conditions.add("default");
    return conditions;
  }
}

function workspaceScope(packageName: string | undefined): string | undefined {
  return packageName?.startsWith("@") ? packageName.split("/")[0] : undefined;
}
