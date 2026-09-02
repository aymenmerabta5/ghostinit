/**
 * Shared helpers for generating template files.
 */

import { randomBytes } from "node:crypto";
import type { ProjectConfig } from "../lib/config.js";
import type { AddonInstallerMap, ProjectMode } from "../lib/addons.js";
import * as v from "./versions.js";

export type TemplateRuntime = "node" | "bun";

/* ------------------------------------------------------------------ */
/* normalizeArgs — shared across email, billing-generator, services  */
/* ------------------------------------------------------------------ */

function isProjectMode(value: unknown): value is ProjectMode {
  return value === "monorepo" || value === "single";
}

function isRuntime(value: unknown): value is TemplateRuntime {
  return value === "node" || value === "bun";
}

export function normalizeTemplateArgs(
  modeOrOpts: ProjectMode | string | Record<string, unknown> | undefined,
  runtimeOrAddons:
    | TemplateRuntime
    | string
    | AddonInstallerMap
    | Record<string, unknown>
    | undefined,
  maybeAddons: AddonInstallerMap | Record<string, unknown> | undefined,
): { mode: ProjectMode; runtime: TemplateRuntime; addons: AddonInstallerMap | undefined } {
  let mode: ProjectMode = "monorepo";
  let runtime: TemplateRuntime = "bun";
  let addons: AddonInstallerMap | undefined;

  if (typeof modeOrOpts === "string") {
    if (isProjectMode(modeOrOpts)) {
      mode = modeOrOpts;
    } else if (isRuntime(modeOrOpts)) {
      runtime = modeOrOpts;
    }
  } else if (modeOrOpts && typeof modeOrOpts === "object") {
    const obj = modeOrOpts as Record<string, unknown>;
    if (isProjectMode(obj.mode)) mode = obj.mode as ProjectMode;
    if (obj.runtime === "node" || obj.runtime === "bun") runtime = obj.runtime as TemplateRuntime;
    if (obj.addons && typeof obj.addons === "object") addons = obj.addons as AddonInstallerMap;
    if (obj.addonRegistry && typeof obj.addonRegistry === "object")
      addons = obj.addonRegistry as AddonInstallerMap;
  }

  if (typeof runtimeOrAddons === "string") {
    if (isRuntime(runtimeOrAddons)) {
      runtime = runtimeOrAddons as TemplateRuntime;
    } else if (isProjectMode(runtimeOrAddons)) {
      mode = runtimeOrAddons as ProjectMode;
    }
  } else if (runtimeOrAddons && typeof runtimeOrAddons === "object") {
    addons = runtimeOrAddons as AddonInstallerMap;
  }

  if (maybeAddons && typeof maybeAddons === "object") {
    addons = maybeAddons as AddonInstallerMap;
  }

  return { mode, runtime, addons };
}

/** Backwards compat alias — some generators used `normalizeArgs` name */
export const normalizeArgs = normalizeTemplateArgs;

export interface TemplateFile {
  path: string;
  content: string;
}

export interface GenerateContext {
  dryRun: boolean;
  /** When true, validate generated TS/TSX files with oxc-parser before returning. */
  validate?: boolean;
}

export function file(path: string, content: string): TemplateFile {
  if (!path || typeof path !== "string") {
    throw new Error(`[ghostinit] file() path must be non-empty string, got: ${String(path)}`);
  }
  // Disallow absolute paths (POSIX / or Windows C:\ or \\)
  if (
    path.startsWith("/") ||
    path.startsWith("\\") ||
    /^[a-zA-Z]:[\\/]/.test(path) ||
    path.startsWith("\\\\")
  ) {
    throw new Error(`[ghostinit] file() path must be relative, got absolute: ${path}`);
  }
  // Normalize backslashes to forward for check
  const forward = path.replace(/\\/g, "/");
  // Disallow traversal segments
  const segments = forward.split("/");
  for (const seg of segments) {
    if (seg === "..") {
      throw new Error(`[ghostinit] file() path must not contain traversal '..', got: ${path}`);
    }
  }
  // Disallow double slash // and trailing slash
  if (forward.includes("//")) {
    throw new Error(`[ghostinit] file() path must not contain double slash '//', got: ${path}`);
  }
  if (forward.endsWith("/")) {
    throw new Error(`[ghostinit] file() path must not have trailing slash, got: ${path}`);
  }
  // Also disallow "." as whole path or empty segments that could be suspicious, but allow "." inside filename? Simpler: disallow "/./" normalization via regex
  if (
    forward.includes("/./") ||
    forward.startsWith("./") ||
    forward === "." ||
    forward === "./" ||
    forward.startsWith("../")
  ) {
    // "./" at start is okay? Common to use "./"? In our templates we never use "./". Disallow to enforce canonical relative without ./ prefix and no ./ in middle.
    // However allow if path === "./"? We disallow, but we have check for "./" prefix.
    if (forward !== "." && forward.startsWith("./")) {
      throw new Error(
        `[ghostinit] file() path must not start with './', got: ${path}. Use canonical relative path without ./ prefix.`,
      );
    }
    if (forward.includes("/./")) {
      throw new Error(`[ghostinit] file() path must not contain '/./', got: ${path}`);
    }
  }
  // Disallow null bytes
  if (path.includes("\0")) {
    throw new Error(`[ghostinit] file() path must not contain null byte`);
  }
  return { path: forward, content: normalizeSourceImports(content) };
}

function normalizeSourceImports(content: string): string {
  // Strip .js from relative ESM imports so Next.js and bundlers resolve tsx/ts
  // files natively while keeping external package specifiers unchanged.
  return content
    .replace(/(from\s+["'])(\.\.?\/[^"']+)\.js(["'])/g, "$1$2$3")
    .replace(/(export\s+.*\s+from\s+["'])(\.\.?\/[^"']+)\.js(["'])/g, "$1$2$3");
}

export function secret(byteLength = 48): string {
  if (!Number.isInteger(byteLength) || byteLength < 24 || byteLength > 128) {
    throw new Error("Generated secret byte length is outside safe bounds");
  }
  const value = randomBytes(byteLength).toString("base64url");
  if (value.length < 32) {
    throw new Error("Generated secret is shorter than 32 characters");
  }
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error("Generated secret contains non-base64url-safe characters");
  }
  return value;
}

export function packageJson(opts: {
  name: string;
  version?: string;
  type?: "module";
  private?: boolean;
  engines?: Record<string, string>;
  packageManager?: string;
  workspaces?: string[];
  main?: string;
  scripts: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  overrides?: Record<string, string>;
  exports?: Record<string, string>;
}): string {
  const obj: Record<string, unknown> = {
    name: opts.name,
    version: opts.version ?? v.ghostinitVersion,
  };
  if (opts.private) obj.private = true;
  if (opts.type) obj.type = opts.type;
  if (opts.main) obj.main = opts.main;
  if (opts.engines && Object.keys(opts.engines).length > 0) obj.engines = sortKeys(opts.engines);
  if (opts.packageManager) obj.packageManager = opts.packageManager;
  if (opts.workspaces) obj.workspaces = opts.workspaces;
  obj.scripts = opts.scripts;
  if (opts.dependencies && Object.keys(opts.dependencies).length > 0) {
    obj.dependencies = sortKeys(normalizeDeps(opts.dependencies));
  }
  if (opts.devDependencies && Object.keys(opts.devDependencies).length > 0) {
    obj.devDependencies = sortKeys(normalizeDeps(opts.devDependencies));
  }
  if (opts.peerDependencies && Object.keys(opts.peerDependencies).length > 0) {
    obj.peerDependencies = sortKeys(normalizeDeps(opts.peerDependencies));
  }
  if (opts.overrides && Object.keys(opts.overrides).length > 0) {
    obj.overrides = sortKeys(normalizeDeps(opts.overrides));
  }
  if (opts.exports && Object.keys(opts.exports).length > 0) {
    obj.exports = opts.exports;
  }
  return `${JSON.stringify(obj, null, 2)}\n`;
}

function sortKeys<T extends Record<string, string>>(obj: T): T {
  const entries = Object.entries(obj).map(([k, v]) => [k, v]) as [string, string][];
  entries.sort(([a], [b]) => a.localeCompare(b));
  return Object.fromEntries(entries) as T;
}

function normalizeVersion(version: string): string {
  return version.startsWith("^") ? version.slice(1) : version;
}

function normalizeDeps(deps: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(deps)) {
    out[k] = normalizeVersion(v);
  }
  return out;
}

export function tsconfig(opts: {
  extends?: string;
  include?: string[];
  compilerOptions?: Record<string, unknown>;
}): string {
  const obj: Record<string, unknown> = {};
  if (opts.extends) obj.extends = opts.extends;
  obj.compilerOptions = {
    target: "ES2024",
    module: "ESNext",
    moduleResolution: "bundler",
    lib: ["ES2024", "DOM", "DOM.Iterable"],
    strict: true,
    esModuleInterop: true,
    skipLibCheck: true,
    forceConsistentCasingInFileNames: true,
    resolveJsonModule: true,
    ...opts.compilerOptions,
  };
  if (opts.include) {
    obj.include = opts.include;
  }
  return `${JSON.stringify(obj, null, 2)}\n`;
}

export function codeScripts(
  opts: { test?: string; e2e?: boolean; typecheck?: string } = {},
): Record<string, string> {
  const scripts: Record<string, string> = {
    // TanStack apps override this to run the route-tree codegen first.
    typecheck: opts.typecheck ?? "tsc --noEmit",
    lint: "oxlint --deny-warnings .",
    format: "oxfmt --write .",
    "format:check": "oxfmt --check .",
  };
  if (opts.test) {
    scripts.test = opts.test;
    // Provide a conventional unit-test alias used by node-based package scripts.
    scripts["test:unit"] = opts.test;
  }
  if (opts.e2e) scripts.e2e = "playwright test";
  return scripts;
}

export function paramCase(name: string): string {
  return name.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
}

export function pascalCase(name: string): string {
  return name
    .split(/[-_]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

export function mergeFiles(...groups: TemplateFile[][]): TemplateFile[] {
  return groups.flat();
}

export interface FileConflict {
  path: string;
  /** Byte length of each competing version, in composition order. */
  sizes: number[];
}

export interface DedupeResult {
  files: TemplateFile[];
  conflicts: FileConflict[];
}

/**
 * Collapse a composed file list by path, reporting genuine conflicts.
 *
 * Composers legitimately emit the same path more than once — that is how a
 * framework-specific composer overrides a default. Those duplicates are
 * byte-identical and harmless. A duplicate with DIFFERENT content is not an
 * override, it is two implementations of the same file where one is silently
 * discarded by composition order.
 *
 * That is not hypothetical. `apps/api.ts` and `billing/webhooks/providers/*`
 * both emitted `apps/web/src/app/api/webhooks/<provider>/route.ts`; the plain
 * `Map.set` that used to live here dropped one at random-looking order, so the
 * losing implementation rotted undetected — it could not even be caught by the
 * generation matrix, which only ever sees files that survived the collapse.
 *
 * Last-writer-wins is preserved so behaviour does not change; the conflicts are
 * returned so callers can fail loudly instead of guessing.
 */
export function dedupeFiles(files: TemplateFile[]): DedupeResult {
  const byPath = new Map<string, TemplateFile>();
  const variants = new Map<string, Set<string>>();
  const sizes = new Map<string, number[]>();

  for (const f of files) {
    byPath.set(f.path, f);
    let seen = variants.get(f.path);
    if (!seen) {
      seen = new Set();
      variants.set(f.path, seen);
      sizes.set(f.path, []);
    }
    if (!seen.has(f.content)) {
      seen.add(f.content);
      sizes.get(f.path)?.push(f.content.length);
    }
  }

  const conflicts: FileConflict[] = [];
  for (const [path, seen] of variants) {
    if (seen.size > 1) conflicts.push({ path, sizes: sizes.get(path) ?? [] });
  }

  return {
    files: [...byPath.values()],
    conflicts: conflicts.sort((a, b) => a.path.localeCompare(b.path)),
  };
}

/**
 * Collapse by path and throw if any two composers disagree on a file's content.
 *
 * Generation is the only place this can be caught: once the output is on disk
 * the discarded implementation leaves no trace.
 */
export function dedupeFilesOrThrow(files: TemplateFile[]): TemplateFile[] {
  const { files: deduped, conflicts } = dedupeFiles(files);
  if (conflicts.length > 0) {
    const detail = conflicts
      .map((c) => `  ${c.path} (${c.sizes.length} differing versions: ${c.sizes.join(", ")} bytes)`)
      .join("\n");
    throw new Error(
      `Template composition conflict: ${conflicts.length} file(s) emitted with differing content by more than one composer.\n` +
        `${detail}\n` +
        `One implementation would be silently discarded. Give the file a single owner.`,
    );
  }
  return deduped;
}

export function withConfigVars(content: string, config: ProjectConfig): string {
  return content
    .replace(/__PROJECT_NAME__/g, config.name)
    .replace(/__PROJECT_RUNTIME__/g, config.runtime);
}
