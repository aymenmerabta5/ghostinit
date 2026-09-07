import { builtinModules } from "node:module";
import { dirname, resolve } from "node:path";
import type { ImportReference } from "../types.js";
import { OwnedPackageResolver } from "./package-resolver.js";
import { discoverWorkspacePackages } from "./packages.js";
import {
  ProjectPathResolver,
  intendedProjectPath,
  normalizePath,
  stripQueryAndHash,
} from "./paths.js";
import { resolutionResult as result } from "./result.js";
import { matchTypeScriptPaths, TypeScriptConfigLoader } from "./tsconfig.js";
import type {
  ImportResolver,
  ImportResolverOptions,
  ResolvedImport,
  WorkspaceInventory,
} from "./types.js";

const NODE_BUILTINS = new Set(builtinModules.flatMap((name) => [name, name.replace(/^node:/, "")]));
const URL_SCHEME = /^[a-z][a-z\d+.-]*:/i;
const SOURCE_EXTENSION = /\.(?:[cm]?[jt]sx?)$/i;
const ROUTE_TREE_SPECIFIER = /^\.\/routeTree\.gen(?:\.[cm]?[jt]sx?)?$/i;
const NEXT_ENV_SOURCE = /^(?:apps\/web\/)?next-env\.d\.ts$/;
const NEXT_GENERATED_TYPE_SPECIFIER = /^\.\/\.next\/types\/(?:routes|root-params)\.d\.ts$/;

export async function createImportResolver(
  root: string,
  options: ImportResolverOptions = {},
): Promise<ImportResolver> {
  const paths = new ProjectPathResolver(root);
  const workspaces = await discoverWorkspacePackages(paths);
  return new ProjectImportResolver(paths, workspaces, options);
}

class ProjectImportResolver implements ImportResolver {
  private readonly configs: TypeScriptConfigLoader;
  private readonly packages: OwnedPackageResolver;

  constructor(
    private readonly paths: ProjectPathResolver,
    workspaces: WorkspaceInventory,
    options: ImportResolverOptions,
  ) {
    const conditions = [...new Set(options.conditions ?? ["bun", "node"])].sort();
    this.configs = new TypeScriptConfigLoader(paths, workspaces);
    this.packages = new OwnedPackageResolver(paths, workspaces, conditions);
  }

  async resolve(fromFile: string, reference: ImportReference): Promise<ResolvedImport> {
    const sourceAbsolute = this.paths.toAbsolute(fromFile);
    const source = this.paths.toProjectPath(sourceAbsolute) ?? "<outside-project>";
    const specifier = normalizePath(stripQueryAndHash(reference.specifier.trim()));
    if (!this.paths.isInside(sourceAbsolute)) {
      return result(reference, specifier, source, "unresolved", false, "source-outside-project");
    }
    if (!specifier) {
      return result(reference, specifier, source, "unresolved", false, "invalid-specifier");
    }
    if (isRelativeSpecifier(specifier)) {
      return this.resolveRelative(sourceAbsolute, source, specifier, reference);
    }
    if (specifier === "bun" || specifier.startsWith("bun:")) {
      return result(
        reference,
        specifier,
        source,
        "builtin",
        false,
        "bun-builtin",
        undefined,
        "bun",
      );
    }
    if (specifier.startsWith("node:") || NODE_BUILTINS.has(specifier)) {
      const packageName = specifier.replace(/^node:/, "").split("/")[0];
      return result(
        reference,
        specifier,
        source,
        "builtin",
        false,
        "node-builtin",
        undefined,
        packageName,
      );
    }
    if (specifier.startsWith("#")) {
      return this.packages.resolvePackageImport(sourceAbsolute, source, specifier, reference);
    }
    return this.resolveBare(sourceAbsolute, source, specifier, reference);
  }

  async resolveAll(
    fromFile: string,
    references: readonly ImportReference[],
  ): Promise<ResolvedImport[]> {
    const resolved = await Promise.all(
      references.map((reference) => this.resolve(fromFile, reference)),
    );
    return resolved.sort(
      (left, right) =>
        left.reference.location.start - right.reference.location.start ||
        left.reference.location.end - right.reference.location.end ||
        compareText(left.specifier, right.specifier) ||
        compareText(left.reference.kind, right.reference.kind),
    );
  }

  private async resolveRelative(
    sourceAbsolute: string,
    source: string,
    specifier: string,
    reference: ImportReference,
  ): Promise<ResolvedImport> {
    const requested = resolve(dirname(sourceAbsolute), specifier);
    const nextGeneratedType = this.nextGeneratedTypeTarget(source, specifier, requested, reference);
    if (nextGeneratedType) return nextGeneratedType;
    const pathResolution = await this.paths.resolveModule(requested, reference.typeOnly);
    if (pathResolution.status === "resolved") {
      return result(
        reference,
        specifier,
        source,
        "internal",
        true,
        "relative-file",
        this.paths.toProjectPath(pathResolution.absolute!),
      );
    }
    if (pathResolution.status === "outside") {
      return result(reference, specifier, source, "unresolved", true, "target-outside-project");
    }
    const generated = this.generatedTarget(sourceAbsolute, source, specifier, requested, reference);
    if (generated) return generated;
    return result(
      reference,
      specifier,
      source,
      "unresolved",
      true,
      "relative-target-missing",
      intendedProjectPath(this.paths, requested),
    );
  }

  private async resolveBare(
    sourceAbsolute: string,
    source: string,
    specifier: string,
    reference: ImportReference,
  ): Promise<ResolvedImport> {
    if (URL_SCHEME.test(specifier)) {
      return result(reference, specifier, source, "external", false, "external-url");
    }

    const config = await this.configs.loadNearest(sourceAbsolute);
    const aliases = matchTypeScriptPaths(config?.paths, specifier);
    let aliasFailure: ResolvedImport | undefined;
    if (aliases.matched) {
      let firstTarget: string | undefined;
      for (const target of aliases.targets) {
        firstTarget ??= intendedProjectPath(this.paths, target);
        const resolution = await this.paths.resolveModule(target, reference.typeOnly);
        if (resolution.status === "outside") {
          return result(reference, specifier, source, "unresolved", true, "target-outside-project");
        }
        if (resolution.status === "resolved") {
          return result(
            reference,
            specifier,
            source,
            "internal",
            true,
            "tsconfig-path",
            this.paths.toProjectPath(resolution.absolute!),
          );
        }
      }
      aliasFailure = result(
        reference,
        specifier,
        source,
        "unresolved",
        true,
        "tsconfig-path-target-missing",
        firstTarget,
      );
    }

    if (config?.baseUrl) {
      const baseUrlTarget = resolve(config.baseUrl, specifier);
      const baseUrlResolution = await this.paths.resolveModule(baseUrlTarget, reference.typeOnly);
      if (baseUrlResolution.status === "outside") {
        return result(reference, specifier, source, "unresolved", true, "target-outside-project");
      }
      if (baseUrlResolution.status === "resolved") {
        return result(
          reference,
          specifier,
          source,
          "internal",
          true,
          "tsconfig-base-url",
          this.paths.toProjectPath(baseUrlResolution.absolute!),
        );
      }
    }
    const packageResolution = await this.packages.resolvePackageSpecifier(
      sourceAbsolute,
      source,
      specifier,
      reference,
    );
    if (packageResolution.kind !== "external" || !aliasFailure) return packageResolution;
    return aliasFailure;
  }

  private generatedTarget(
    sourceAbsolute: string,
    source: string,
    specifier: string,
    requested: string,
    reference: ImportReference,
  ): ResolvedImport | undefined {
    const target = intendedProjectPath(this.paths, requested);
    const siblingRouteTree = resolve(dirname(sourceAbsolute), "routeTree.gen");
    const normalizedTarget = resolve(requested.replace(SOURCE_EXTENSION, ""));
    if (ROUTE_TREE_SPECIFIER.test(specifier) && normalizedTarget === siblingRouteTree) {
      return result(
        reference,
        specifier,
        source,
        "generated",
        true,
        "generated-route-tree",
        target,
      );
    }
    return undefined;
  }

  private nextGeneratedTypeTarget(
    source: string,
    specifier: string,
    requested: string,
    reference: ImportReference,
  ): ResolvedImport | undefined {
    if (!NEXT_ENV_SOURCE.test(source) || !NEXT_GENERATED_TYPE_SPECIFIER.test(specifier)) {
      return undefined;
    }
    const target = intendedProjectPath(this.paths, requested);
    const expectedTarget =
      source === "next-env.d.ts" ? specifier.slice(2) : `apps/web/${specifier.slice(2)}`;
    if (target !== expectedTarget) return undefined;
    return result(reference, specifier, source, "generated", true, "generated-next-types", target);
  }
}

function isRelativeSpecifier(specifier: string): boolean {
  return (
    specifier === "." ||
    specifier === ".." ||
    specifier.startsWith("./") ||
    specifier.startsWith("../")
  );
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
