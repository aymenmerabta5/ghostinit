import { dirname, extname, isAbsolute, join, resolve } from "node:path";
import { packageNameFromSpecifier, packageSubpath, selectExportsTarget } from "./packages.js";
import { ProjectPathResolver } from "./paths.js";
import type {
  PackageManifest,
  PackageTarget,
  TypeScriptPathMapping,
  TypeScriptResolutionConfig,
  WorkspaceInventory,
} from "./types.js";

interface RawTypeScriptConfig {
  extends?: string | string[];
  compilerOptions?: {
    baseUrl?: string;
    paths?: Record<string, string[]>;
  };
}

interface RawConfigPackage {
  exports?: PackageTarget;
  main?: string;
  tsconfig?: string;
}

export interface MatchedTypeScriptPath {
  matched: boolean;
  targets: string[];
}

export class TypeScriptConfigLoader {
  private readonly configCache = new Map<string, Promise<TypeScriptResolutionConfig | undefined>>();
  private readonly nearestCache = new Map<
    string,
    Promise<TypeScriptResolutionConfig | undefined>
  >();

  constructor(
    private readonly paths: ProjectPathResolver,
    private readonly workspaces: WorkspaceInventory,
  ) {}

  loadNearest(fromFile: string): Promise<TypeScriptResolutionConfig | undefined> {
    const start = dirname(resolve(fromFile));
    const cached = this.nearestCache.get(start);
    if (cached) return cached;
    const pending = this.findAndLoadNearest(start);
    this.nearestCache.set(start, pending);
    return pending;
  }

  private async findAndLoadNearest(start: string): Promise<TypeScriptResolutionConfig | undefined> {
    let current = start;
    while (this.paths.isInside(current)) {
      for (const name of ["tsconfig.json", "jsconfig.json"]) {
        const candidate = join(current, name);
        const raw = await this.paths.readJson<RawTypeScriptConfig>(candidate);
        if (raw) return this.loadConfig(candidate, new Set());
      }
      if (current === this.paths.root) break;
      const parent = dirname(current);
      if (parent === current) break;
      current = parent;
    }
    return undefined;
  }

  private loadConfig(
    configPath: string,
    ancestors: Set<string>,
  ): Promise<TypeScriptResolutionConfig | undefined> {
    const absolute = resolve(configPath);
    const cached = this.configCache.get(absolute);
    if (cached) return cached;
    const pending = this.readConfig(absolute, ancestors);
    this.configCache.set(absolute, pending);
    return pending;
  }

  private async readConfig(
    configPath: string,
    ancestors: Set<string>,
  ): Promise<TypeScriptResolutionConfig | undefined> {
    if (ancestors.has(configPath)) return undefined;
    const raw = await this.paths.readJson<RawTypeScriptConfig>(configPath);
    if (!raw) return undefined;
    const nextAncestors = new Set(ancestors).add(configPath);
    let effective: TypeScriptResolutionConfig = {};
    const extended = typeof raw.extends === "string" ? [raw.extends] : (raw.extends ?? []);

    for (const specifier of extended) {
      const basePath = await this.resolveExtends(specifier, dirname(configPath));
      if (!basePath) continue;
      const base = await this.loadConfig(basePath, nextAncestors);
      if (base) effective = { ...effective, ...base };
    }

    const options = raw.compilerOptions;
    if (!options) return effective;
    if (typeof options.baseUrl === "string") {
      effective.baseUrl = resolve(dirname(configPath), options.baseUrl);
    }
    if (options.paths && typeof options.paths === "object") {
      const mappingBase = effective.baseUrl ?? dirname(configPath);
      effective.paths = Object.entries(options.paths)
        .filter(
          (entry): entry is [string, string[]] =>
            Boolean(entry[0]) &&
            Array.isArray(entry[1]) &&
            entry[1].every((value) => typeof value === "string"),
        )
        .map(([pattern, targets]) => ({
          pattern,
          targets: targets.map((value) => ({ value, baseDir: mappingBase })),
        }))
        .sort(comparePathMappings);
    }
    return effective;
  }

  private async resolveExtends(specifier: string, configDir: string): Promise<string | undefined> {
    if (specifier.startsWith(".") || isAbsolute(specifier)) {
      return this.resolveConfigFile(resolve(configDir, specifier));
    }

    const packageName = packageNameFromSpecifier(specifier);
    if (!packageName) return undefined;
    const workspaceMatches = this.workspaces.packagesByName.get(packageName) ?? [];
    if (workspaceMatches.length === 1) {
      return this.resolveConfigFromPackage(workspaceMatches[0]!, specifier, packageName);
    }

    let current = configDir;
    while (this.paths.isInside(current)) {
      const packageDir = join(current, "node_modules", ...packageName.split("/"));
      const raw = await this.paths.readJson<RawConfigPackage>(join(packageDir, "package.json"));
      if (raw) {
        const manifest: PackageManifest = {
          dir: packageDir,
          relativeDir: this.paths.toProjectPath(packageDir) ?? ".",
          exports: raw.exports,
          main: raw.main,
          tsconfig: raw.tsconfig,
        };
        return this.resolveConfigFromPackage(manifest, specifier, packageName);
      }
      if (current === this.paths.root) break;
      const parent = dirname(current);
      if (parent === current) break;
      current = parent;
    }
    return undefined;
  }

  private async resolveConfigFromPackage(
    manifest: PackageManifest,
    specifier: string,
    packageName: string,
  ): Promise<string | undefined> {
    const subpath = packageSubpath(specifier, packageName);
    if (manifest.exports !== undefined) {
      const selected = selectExportsTarget(
        manifest.exports,
        subpath,
        new Set(["types", "import", "node", "default"]),
      );
      if (selected.status === "matched" && selected.target?.startsWith("./")) {
        const resolved = await this.resolveConfigFile(resolve(manifest.dir, selected.target));
        if (resolved) return resolved;
      }
    }

    const direct =
      subpath === "." ? (manifest.tsconfig ?? manifest.main ?? "tsconfig.json") : subpath.slice(2);
    return this.resolveConfigFile(resolve(manifest.dir, direct));
  }

  private async resolveConfigFile(requested: string): Promise<string | undefined> {
    const candidates = extname(requested)
      ? [requested]
      : [requested, `${requested}.json`, join(requested, "tsconfig.json")];
    for (const candidate of candidates) {
      const resolved = await this.paths.resolveExact(candidate);
      if (resolved.status === "resolved") return resolved.absolute;
    }
    return undefined;
  }
}

export function matchTypeScriptPaths(
  mappings: readonly TypeScriptPathMapping[] | undefined,
  specifier: string,
): MatchedTypeScriptPath {
  const mapping = mappings?.find(({ pattern }) => pathPatternMatches(pattern, specifier));
  if (!mapping) return { matched: false, targets: [] };
  const capture = capturePathPattern(mapping.pattern, specifier);
  return {
    matched: true,
    targets: mapping.targets.map(({ value, baseDir }) =>
      resolve(baseDir, value.replaceAll("*", capture)),
    ),
  };
}

function comparePathMappings(left: TypeScriptPathMapping, right: TypeScriptPathMapping): number {
  const leftStar = left.pattern.indexOf("*");
  const rightStar = right.pattern.indexOf("*");
  if (leftStar === -1 || rightStar === -1) {
    if (leftStar === -1 && rightStar !== -1) return -1;
    if (leftStar !== -1 && rightStar === -1) return 1;
  }
  return (
    rightStar - leftStar ||
    right.pattern.length - left.pattern.length ||
    compareText(left.pattern, right.pattern)
  );
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function pathPatternMatches(pattern: string, specifier: string): boolean {
  const star = pattern.indexOf("*");
  if (star === -1) return pattern === specifier;
  const prefix = pattern.slice(0, star);
  const suffix = pattern.slice(star + 1);
  return (
    specifier.startsWith(prefix) &&
    specifier.endsWith(suffix) &&
    specifier.length >= prefix.length + suffix.length
  );
}

function capturePathPattern(pattern: string, specifier: string): string {
  const star = pattern.indexOf("*");
  if (star === -1) return "";
  const suffixLength = pattern.length - star - 1;
  return specifier.slice(star, suffixLength === 0 ? undefined : -suffixLength);
}
