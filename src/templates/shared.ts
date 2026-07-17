/**
 * Shared helpers for generating template files.
 */

import { randomBytes } from "node:crypto";
import type { ProjectConfig } from "../lib/config.js";
import * as v from "./versions.js";

export interface TemplateFile {
  path: string;
  content: string;
}

export interface GenerateContext {
  dryRun: boolean;
}

export function file(path: string, content: string): TemplateFile {
  return { path, content: normalizeSourceImports(content) };
}

function normalizeSourceImports(content: string): string {
  // Strip .js from relative ESM imports so Next.js and bundlers resolve tsx/ts
  // files natively while keeping external package specifiers unchanged.
  return content
    .replace(/(from\s+["'])(\.\.?\/[^"']+)\.js(["'])/g, "$1$2$3")
    .replace(/(export\s+.*\s+from\s+["'])(\.\.?\/[^"']+)\.js(["'])/g, "$1$2$3");
}

export function secret(): string {
  const value = randomBytes(48).toString("base64url");
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
  packageManager?: string;
  workspaces?: string[];
  scripts: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  exports?: Record<string, string>;
}): string {
  const obj: Record<string, unknown> = {
    name: opts.name,
    version: opts.version ?? v.ghostinitVersion,
  };
  if (opts.private) obj.private = true;
  if (opts.type) obj.type = opts.type;
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

export function codeScripts(opts: { test?: string; e2e?: boolean } = {}): Record<string, string> {
  const scripts: Record<string, string> = {
    typecheck: "tsc --noEmit",
    lint: "oxlint .",
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

export function withConfigVars(content: string, config: ProjectConfig): string {
  return content
    .replace(/__PROJECT_NAME__/g, config.name)
    .replace(/__PROJECT_RUNTIME__/g, config.runtime);
}
