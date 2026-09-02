import { readFile, realpath, stat } from "node:fs/promises";
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { parseJsonc } from "./json.js";

type EntryKind = "file" | "directory" | "missing" | "outside";

export interface PathResolution {
  status: "resolved" | "missing" | "outside";
  absolute?: string;
}

const TYPESCRIPT_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts"];
const JAVASCRIPT_EXTENSIONS = [".js", ".jsx", ".mjs", ".cjs"];
const SOURCE_EXTENSIONS = [...TYPESCRIPT_EXTENSIONS, ...JAVASCRIPT_EXTENSIONS];
const DECLARATION_EXTENSIONS = [".d.ts", ".d.mts", ".d.cts"];
const EXACT_IMPORT_EXTENSIONS = new Set([
  ".avif",
  ".bmp",
  ".css",
  ".csv",
  ".eot",
  ".gif",
  ".gql",
  ".graphql",
  ".html",
  ".ico",
  ".jpeg",
  ".jpg",
  ".json",
  ".json5",
  ".less",
  ".md",
  ".mdx",
  ".node",
  ".otf",
  ".png",
  ".sass",
  ".scss",
  ".sql",
  ".svg",
  ".toml",
  ".ttf",
  ".txt",
  ".wasm",
  ".webp",
  ".woff",
  ".woff2",
  ".xml",
  ".yaml",
  ".yml",
]);
const JS_TO_TS_EXTENSIONS: Readonly<Record<string, readonly string[]>> = {
  ".js": [".ts", ".tsx", ".mts", ".cts"],
  ".jsx": [".tsx", ".ts"],
  ".mjs": [".mts", ".ts"],
  ".cjs": [".cts", ".ts"],
};

export class ProjectPathResolver {
  readonly root: string;
  private readonly entryCache = new Map<string, EntryKind>();
  private readonly jsonCache = new Map<string, unknown>();

  constructor(root: string) {
    this.root = resolve(root);
  }

  toAbsolute(path: string): string {
    return isAbsolute(path) ? resolve(path) : resolve(this.root, path);
  }

  isInside(path: string): boolean {
    const rel = relative(this.root, resolve(path));
    return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
  }

  toProjectPath(path: string): string | undefined {
    if (!this.isInside(path)) return undefined;
    const rel = relative(this.root, resolve(path));
    return normalizePath(rel || ".");
  }

  async readJson<T>(path: string): Promise<T | undefined> {
    const absolute = resolve(path);
    if (this.jsonCache.has(absolute)) return this.jsonCache.get(absolute) as T | undefined;
    try {
      const parsed = parseJsonc<T>(await readFile(absolute, "utf8"));
      this.jsonCache.set(absolute, parsed);
      return parsed;
    } catch {
      this.jsonCache.set(absolute, undefined);
      return undefined;
    }
  }

  async resolveModule(
    requestedPath: string,
    allowDeclarationFiles = false,
  ): Promise<PathResolution> {
    const requested = resolve(requestedPath);
    if (!this.isInside(requested)) return { status: "outside" };

    const extension = extname(requested).toLowerCase();
    if (EXACT_IMPORT_EXTENSIONS.has(extension)) {
      return this.resolveExact(requested);
    }

    const fileCandidates = moduleFileCandidates(requested, extension, allowDeclarationFiles);
    for (const candidate of fileCandidates) {
      const kind = await this.entryKind(candidate);
      if (kind === "outside") return { status: "outside" };
      if (kind === "file") return { status: "resolved", absolute: candidate };
    }

    if ((await this.entryKind(requested)) === "directory") {
      const manifest = await this.readJson<{
        types?: string;
        typings?: string;
        module?: string;
        main?: string;
      }>(join(requested, "package.json"));
      for (const entry of [manifest?.types, manifest?.typings, manifest?.module, manifest?.main]) {
        if (!entry) continue;
        const nested = await this.resolveModule(resolve(requested, entry), allowDeclarationFiles);
        if (nested.status !== "missing") return nested;
      }
      const indexExtensions = [
        ...TYPESCRIPT_EXTENSIONS,
        ...(allowDeclarationFiles ? DECLARATION_EXTENSIONS : []),
        ...JAVASCRIPT_EXTENSIONS,
        ".json",
      ];
      for (const sourceExtension of indexExtensions) {
        const indexCandidate = join(requested, `index${sourceExtension}`);
        const kind = await this.entryKind(indexCandidate);
        if (kind === "outside") return { status: "outside" };
        if (kind === "file") return { status: "resolved", absolute: indexCandidate };
      }
    }

    return { status: "missing" };
  }

  async resolveExact(requestedPath: string): Promise<PathResolution> {
    const requested = resolve(requestedPath);
    if (!this.isInside(requested)) return { status: "outside" };
    const kind = await this.entryKind(requested);
    if (kind === "outside") return { status: "outside" };
    return kind === "file" ? { status: "resolved", absolute: requested } : { status: "missing" };
  }

  private async entryKind(path: string): Promise<EntryKind> {
    const absolute = resolve(path);
    const cached = this.entryCache.get(absolute);
    if (cached) return cached;
    if (!this.isInside(absolute)) return "outside";
    try {
      const entry = await stat(absolute);
      const canonical = await realpath(absolute);
      if (!this.isInside(canonical)) {
        this.entryCache.set(absolute, "outside");
        return "outside";
      }
      const kind = entry.isFile() ? "file" : entry.isDirectory() ? "directory" : "missing";
      this.entryCache.set(absolute, kind);
      return kind;
    } catch {
      this.entryCache.set(absolute, "missing");
      return "missing";
    }
  }
}

export function normalizePath(path: string): string {
  return path.replaceAll("\\", "/");
}

export function stripQueryAndHash(specifier: string): string {
  if (specifier.startsWith("#")) {
    const query = specifier.indexOf("?");
    return query === -1 ? specifier : specifier.slice(0, query);
  }
  const query = specifier.indexOf("?");
  const hash = specifier.indexOf("#");
  const end = Math.min(
    query === -1 ? specifier.length : query,
    hash === -1 ? specifier.length : hash,
  );
  return specifier.slice(0, end);
}

export function intendedProjectPath(
  paths: ProjectPathResolver,
  requestedPath: string,
): string | undefined {
  return paths.toProjectPath(resolve(requestedPath));
}

export function containingDirectory(path: string): string {
  return dirname(path);
}

function moduleFileCandidates(
  requested: string,
  extension: string,
  allowDeclarationFiles: boolean,
): string[] {
  if (isDeclarationFile(requested)) return allowDeclarationFiles ? [requested] : [];
  if (extension) {
    const stem = requested.slice(0, -extension.length);
    const sourceSubstitutions = JS_TO_TS_EXTENSIONS[extension];
    if (sourceSubstitutions) {
      return [
        ...sourceSubstitutions.map((ext) => stem + ext),
        ...(allowDeclarationFiles ? declarationSubstitutions(stem, extension) : []),
        requested,
      ];
    }
    return SOURCE_EXTENSIONS.includes(extension)
      ? [requested]
      : [requested, ...SOURCE_EXTENSIONS.map((ext) => requested + ext)];
  }
  return [
    requested,
    ...TYPESCRIPT_EXTENSIONS.map((ext) => requested + ext),
    ...(allowDeclarationFiles ? DECLARATION_EXTENSIONS.map((ext) => requested + ext) : []),
    ...JAVASCRIPT_EXTENSIONS.map((ext) => requested + ext),
    requested + ".json",
  ];
}

function isDeclarationFile(path: string): boolean {
  const lower = path.toLowerCase();
  return DECLARATION_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

function declarationSubstitutions(stem: string, extension: string): string[] {
  if (extension === ".mjs") return [stem + ".d.mts", stem + ".d.ts"];
  if (extension === ".cjs") return [stem + ".d.cts", stem + ".d.ts"];
  return [stem + ".d.ts"];
}
