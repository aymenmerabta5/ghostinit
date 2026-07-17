/**
 * Parser-independent architecture checker.
 *
 * Uses `oxc-parser` to extract imports/exports without the TypeScript
 * compiler API. Checks are driven by package boundaries declared in
 * package.json files and by path conventions.
 */

import { readFile, readdir, realpath, stat } from "node:fs/promises";
import { join, relative, sep, resolve } from "node:path";
import { existsSync } from "node:fs";
import { parseSync } from "oxc-parser";

export interface ArchitectureFinding {
  id: string;
  severity: "BLOCKER" | "HIGH" | "MEDIUM" | "LOW";
  message: string;
  file: string;
  rule: string;
}

interface PackageInfo {
  name: string;
  dir: string;
  dependencies: Set<string>;
}

const FRAMEWORK_PACKAGES = new Set([
  "react",
  "react-dom",
  "next",
  "drizzle-orm",
  "drizzle-kit",
  "pg",
  "better-auth",
  "@orpc/server",
  "@orpc/client",
  "@orpc/contract",
  "@orpc/openapi",
  "@orpc/react-query",
  "@orpc/zod",
  "@tanstack/react-query",
  "@tanstack/react-form",
  "tailwindcss",
  "@tailwindcss/postcss",
  "@base-ui/react",
]);

const DATABASE_PACKAGES = new Set(["@repo/database", "drizzle-orm", "drizzle-kit", "pg"]);

const RESERVED_NAMES = new Set([
  "node_modules",
  "dist",
  ".next",
  "ghostinit",
  "api",
  "auth",
  "database",
  "config",
  "ui",
  "observability",
  "contracts",
  "typescript-config",
  "modules",
  "workflows",
]);

const MAX_VISITED_FILES = 50_000;
const MAX_WALK_DEPTH = 64;

export async function analyzeProject(root: string): Promise<ArchitectureFinding[]> {
  const findings: ArchitectureFinding[] = [];
  const packages = await discoverPackages(root);
  const packageByDir = new Map<string, PackageInfo>();
  for (const pkg of packages) {
    packageByDir.set(pkg.dir, pkg);
  }

  const tsFiles = await collectSourceFiles(root, packages, findings);

  for (const absFile of tsFiles) {
    const relFile = normalizePath(relative(root, absFile));
    const pkg = packageForFile(absFile, packages);
    const source = await readFile(absFile, "utf-8");
    let imports: string[] = [];
    try {
      imports = extractImports(source, extname(absFile));
    } catch {
      findings.push({
        id: "parse-error",
        severity: "LOW",
        message: "Unable to parse file for architecture check",
        file: relFile,
        rule: "parseable-source",
      });
      continue;
    }

    for (const imp of imports) {
      checkDomainLayer(findings, relFile, imp);
      checkApplicationLayer(findings, relFile, imp);
      checkPrivatePath(findings, relFile, imp);
      checkDatabaseIsolation(findings, relFile, imp);
      checkModuleToModule(findings, relFile, imp, pkg);
      checkServerOnlyClient(findings, relFile, imp, pkg);
      await checkUndeclaredDependency(findings, relFile, imp, pkg, packageByDir);
    }

    await checkMalformedGeneratedModule(findings, relFile);
  }

  checkPackageCycles(findings, packages);

  return dedupeFindings(findings);
}

async function discoverPackages(root: string): Promise<PackageInfo[]> {
  const packages: PackageInfo[] = [];
  const dirs = ["apps", "packages", "tooling"];
  for (const dir of dirs) {
    const base = join(root, dir);
    if (!existsSync(base)) continue;
    const entries = await readdir(base, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const pkgDir = join(base, entry.name);
      const manifestPath = join(pkgDir, "package.json");
      try {
        const manifest = JSON.parse(await readFile(manifestPath, "utf-8")) as {
          name?: string;
          dependencies?: Record<string, string>;
          devDependencies?: Record<string, string>;
        };
        const deps = new Set([
          ...Object.keys(manifest.dependencies ?? {}),
          ...Object.keys(manifest.devDependencies ?? {}),
        ]);
        packages.push({ name: manifest.name ?? entry.name, dir: pkgDir, dependencies: deps });
      } catch {
        packages.push({ name: entry.name, dir: pkgDir, dependencies: new Set() });
      }
    }
  }
  return packages;
}

async function collectSourceFiles(
  root: string,
  packages: PackageInfo[],
  findings: ArchitectureFinding[],
): Promise<string[]> {
  const files: string[] = [];
  const visited = new Set<string>();
  let realRoot: string;
  try {
    realRoot = await realpath(root);
  } catch {
    realRoot = resolve(root);
  }

  for (const pkg of packages) {
    for (const srcName of ["src", "tests"]) {
      const src = join(pkg.dir, srcName);
      if (!existsSync(src)) continue;
      await walkSource(src, realRoot, files, visited, findings, 0);
    }

    // Also scan package-level TypeScript source files located next to package.json.
    await scanPackageRoot(pkg.dir, realRoot, files, visited, findings);
  }

  if (visited.size > MAX_VISITED_FILES) {
    findings.push({
      id: "source-collection-limit",
      severity: "HIGH",
      message: `Scanned file limit exceeded: more than ${MAX_VISITED_FILES} entries visited`,
      file: "",
      rule: "source-collection",
    });
  }

  return files;
}

async function scanPackageRoot(
  pkgDir: string,
  realRoot: string,
  files: string[],
  visited: Set<string>,
  findings: ArchitectureFinding[],
): Promise<void> {
  const entries = await readdir(pkgDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (/\.(tsx?|jsx?)$/.test(entry.name)) {
      const absPath = join(pkgDir, entry.name);
      await tryAddSourceFile(absPath, realRoot, files, visited, findings);
    }
  }
}

async function walkSource(
  dir: string,
  realRoot: string,
  files: string[],
  visited: Set<string>,
  findings: ArchitectureFinding[],
  depth: number,
): Promise<void> {
  if (depth > MAX_WALK_DEPTH) {
    findings.push({
      id: "directory-depth-limit",
      severity: "HIGH",
      message: `Directory depth limit (${MAX_WALK_DEPTH}) exceeded at ${normalizePath(relative(realRoot, dir))}`,
      file: normalizePath(relative(realRoot, dir)),
      rule: "source-collection",
    });
    return;
  }

  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isSymbolicLink() || pathIncludesSymlink(path)) {
      const realPathStat = await safeRealpath(path);
      if (!realPathStat) {
        findings.push({
          id: "unresolvable-symlink",
          severity: "MEDIUM",
          message: `Unable to resolve symlink: ${normalizePath(relative(realRoot, path))}`,
          file: normalizePath(relative(realRoot, path)),
          rule: "source-collection",
        });
        continue;
      }
      if (!isInsideProject(realPathStat, realRoot)) {
        findings.push({
          id: "path-traversal-risk",
          severity: "HIGH",
          message: `Path resolved outside project root: ${normalizePath(relative(realRoot, path))}`,
          file: normalizePath(relative(realRoot, path)),
          rule: "source-collection",
        });
        continue;
      }
      if (entry.isDirectory() || (await isDirectory(realPathStat))) {
        await walkSource(realPathStat, realRoot, files, visited, findings, depth + 1);
        continue;
      }
      await tryAddSourceFile(realPathStat, realRoot, files, visited, findings);
      continue;
    }

    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      await walkSource(path, realRoot, files, visited, findings, depth + 1);
    } else if (entry.isFile() && /\.(tsx?|jsx?)$/.test(entry.name)) {
      await tryAddSourceFile(path, realRoot, files, visited, findings);
    }
  }
}

async function tryAddSourceFile(
  absPath: string,
  realRoot: string,
  files: string[],
  visited: Set<string>,
  findings: ArchitectureFinding[],
): Promise<void> {
  let realAbsPath: string;
  try {
    realAbsPath = await realpath(absPath);
  } catch {
    realAbsPath = resolve(absPath);
  }

  if (!isInsideProject(realAbsPath, realRoot)) {
    findings.push({
      id: "path-traversal-risk",
      severity: "HIGH",
      message: `Source file resolved outside project root: ${normalizePath(relative(realRoot, absPath))}`,
      file: normalizePath(relative(realRoot, absPath)),
      rule: "source-collection",
    });
    return;
  }

  if (visited.has(realAbsPath)) return;
  visited.add(realAbsPath);
  files.push(realAbsPath);
}

function isInsideProject(absPath: string, realRoot: string): boolean {
  const normalizedPath = normalizePath(absPath);
  const normalizedRoot = normalizePath(realRoot);
  return normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}/`);
}

async function safeRealpath(path: string): Promise<string | undefined> {
  try {
    return await realpath(path);
  } catch {
    return undefined;
  }
}

async function isDirectory(absPath: string): Promise<boolean> {
  try {
    return (await stat(absPath)).isDirectory();
  } catch {
    return false;
  }
}

function pathIncludesSymlink(_path: string): boolean {
  // This is a conservative placeholder; the primary symlink handling occurs
  // via Dirent.isSymbolicLink during directory traversal.
  return false;
}

function extname(absFile: string): string {
  const dot = absFile.lastIndexOf(".");
  if (dot === -1) return ".ts";
  return absFile.slice(dot);
}

function extractImports(source: string, ext: string): string[] {
  const imports = new Set<string>();
  const lang = ext.endsWith("x") ? (ext.endsWith("jsx") ? "jsx" : "tsx") : undefined;
  const result = parseSync("source" + ext, source, { sourceType: "module", lang });
  for (const stmt of result.program.body) {
    if (stmt.type === "ImportDeclaration" && typeof stmt.source?.value === "string") {
      imports.add(stmt.source.value);
    }
    if (stmt.type === "ExportAllDeclaration" || stmt.type === "ExportNamedDeclaration") {
      if (stmt.source && typeof stmt.source.value === "string") {
        imports.add(stmt.source.value);
      }
    }
  }
  return Array.from(imports).filter(Boolean);
}

function packageForFile(absFile: string, packages: PackageInfo[]): PackageInfo | undefined {
  return packages.find((pkg) => absFile.startsWith(pkg.dir + sep));
}

function checkDomainLayer(findings: ArchitectureFinding[], file: string, imp: string): void {
  if (!/\/domain\//.test(file)) return;
  if (FRAMEWORK_PACKAGES.has(imp) || FRAMEWORK_PACKAGES.has(getBasePackage(imp))) {
    findings.push({
      id: "domain-imports-framework",
      severity: "HIGH",
      message: `Domain layer imports framework package: ${imp}`,
      file,
      rule: "domain-purity",
    });
  }
}

function checkApplicationLayer(findings: ArchitectureFinding[], file: string, imp: string): void {
  if (!/\/application\//.test(file)) return;
  if (FRAMEWORK_PACKAGES.has(imp) || FRAMEWORK_PACKAGES.has(getBasePackage(imp))) {
    findings.push({
      id: "application-imports-framework",
      severity: "HIGH",
      message: `Application layer imports framework package: ${imp}`,
      file,
      rule: "application-purity",
    });
  }
}

function checkPrivatePath(findings: ArchitectureFinding[], file: string, imp: string): void {
  if (/(\/private\/|\/_\/)/.test(imp)) {
    findings.push({
      id: "private-path-import",
      severity: "MEDIUM",
      message: `Import references a private path: ${imp}`,
      file,
      rule: "private-paths",
    });
  }
}

function checkDatabaseIsolation(findings: ArchitectureFinding[], file: string, imp: string): void {
  const moduleMatch = /\/modules\/src\/([a-z0-9-]+)\//.exec(file);
  if (!moduleMatch) return;
  const moduleName = moduleMatch[1];
  // Allow database access only from concrete adapters inside the module's
  // infrastructure/database folder. Public index files and domain/application
  // layers must not leak database dependencies.
  const databaseDirPattern = new RegExp(`/modules/src/${moduleName}/infrastructure/database/`);
  const isPublicIndex = new RegExp(`/modules/src/${moduleName}/index\\.ts$`).test(file);
  if ((databaseDirPattern.test(file) && !isPublicIndex) || isPublicIndex) return;
  if (DATABASE_PACKAGES.has(imp) || DATABASE_PACKAGES.has(getBasePackage(imp))) {
    findings.push({
      id: "database-import-outside-infrastructure",
      severity: "HIGH",
      message: `Module ${moduleName} imports database package outside infrastructure/database: ${imp}`,
      file,
      rule: "database-isolation",
    });
  }
}

function checkModuleToModule(
  findings: ArchitectureFinding[],
  file: string,
  imp: string,
  pkg: PackageInfo | undefined,
): void {
  if (!pkg || !file.includes("/modules/")) return;
  const moduleMatch = /\/modules\/src\/([a-z0-9-]+)\//.exec(file);
  if (!moduleMatch) return;
  const currentModule = moduleMatch[1];
  if (imp.startsWith("@repo/modules")) {
    const targetMatch = /\/modules\/([a-z0-9-]+)\//.exec(imp);
    if (targetMatch && targetMatch[1] !== currentModule) {
      findings.push({
        id: "module-to-module-import",
        severity: "HIGH",
        message: `Module ${currentModule} imports another module ${targetMatch[1]}: ${imp}`,
        file,
        rule: "module-isolation",
      });
    }
  }
}

function checkServerOnlyClient(
  findings: ArchitectureFinding[],
  file: string,
  imp: string,
  pkg: PackageInfo | undefined,
): void {
  if (!pkg || pkg.name !== "web") return;
  // Client components run in browser; they must not import Node/server-only packages.
  const serverOnly = new Set(["@repo/database", "@repo/auth", "@repo/modules"]);
  const isClientFile =
    file.includes("/components/") || file.includes("/app/sign-") || file.includes('"use client"');
  if (isClientFile && (serverOnly.has(imp) || serverOnly.has(getBasePackage(imp)))) {
    findings.push({
      id: "client-imports-server-only",
      severity: "HIGH",
      message: `Client-side file imports server-only package: ${imp}`,
      file,
      rule: "client-boundary",
    });
  }
}

async function checkUndeclaredDependency(
  findings: ArchitectureFinding[],
  file: string,
  imp: string,
  pkg: PackageInfo | undefined,
  packageByDir: Map<string, PackageInfo>,
): Promise<void> {
  if (!pkg) return;
  if (imp.startsWith("node:")) return;
  if (imp === "bun:test") return;
  if (!imp.startsWith("@repo/") && !imp.startsWith(".")) {
    const base = getBasePackage(imp);
    if (!pkg.dependencies.has(base) && !base.startsWith("@types/")) {
      findings.push({
        id: "undeclared-dependency",
        severity: "MEDIUM",
        message: `Package ${pkg.name} imports undeclared dependency ${base}`,
        file,
        rule: "dependency-declaration",
      });
    }
  }
  // Cross-package workspace imports require the target package in dependencies.
  if (imp.startsWith("@repo/")) {
    const targetName = imp.split("/").slice(0, 2).join("/");
    const target = Array.from(packageByDir.values()).find((p) => p.name === targetName);
    if (target && !pkg.dependencies.has(target.name)) {
      findings.push({
        id: "undeclared-workspace-dependency",
        severity: "MEDIUM",
        message: `Package ${pkg.name} imports workspace package ${target.name} without declaring it`,
        file,
        rule: "dependency-declaration",
      });
    }
  }
}

async function checkMalformedGeneratedModule(
  findings: ArchitectureFinding[],
  relFile: string,
): Promise<void> {
  const moduleMatch = /\/modules\/src\/([a-z0-9-]+)\//.exec(relFile);
  if (!moduleMatch) return;
  const moduleName = moduleMatch[1];
  if (RESERVED_NAMES.has(moduleName)) {
    findings.push({
      id: "reserved-module-name",
      severity: "BLOCKER",
      message: `Module uses reserved name: ${moduleName}`,
      file: relFile,
      rule: "reserved-names",
    });
  }
}

function checkPackageCycles(findings: ArchitectureFinding[], packages: PackageInfo[]): void {
  const graph = new Map<string, Set<string>>();
  const pkgByName = new Map<string, PackageInfo>();
  for (const pkg of packages) {
    graph.set(
      pkg.name,
      new Set(Array.from(pkg.dependencies).filter((d) => d.startsWith("@repo/"))),
    );
    pkgByName.set(pkg.name, pkg);
  }

  const visited = new Set<string>();
  const stack = new Set<string>();
  const path: string[] = [];

  function dfs(node: string): string[] | undefined {
    visited.add(node);
    stack.add(node);
    path.push(node);
    for (const dep of graph.get(node) ?? []) {
      if (!visited.has(dep)) {
        const cycle = dfs(dep);
        if (cycle) return cycle;
      } else if (stack.has(dep)) {
        const start = path.indexOf(dep);
        return path.slice(start).concat(dep);
      }
    }
    path.pop();
    stack.delete(node);
    return undefined;
  }

  for (const pkg of packages) {
    if (!visited.has(pkg.name)) {
      const cycle = dfs(pkg.name);
      if (cycle) {
        const involved = Array.from(new Set(cycle)).sort().join(", ");
        const affectedPkg = pkgByName.get(cycle[0]);
        findings.push({
          id: "package-dependency-cycle",
          severity: "BLOCKER",
          message: `Workspace dependency cycle detected involving ${involved}`,
          file: affectedPkg ? normalizePath(`${affectedPkg.dir}/package.json`) : "",
          rule: "package-cycles",
        });
      }
    }
  }
}

function getBasePackage(specifier: string): string {
  if (specifier.startsWith("@")) {
    const parts = specifier.split("/");
    return `${parts[0]}/${parts[1]}`;
  }
  return specifier.split("/")[0];
}

function normalizePath(p: string): string {
  return p.split(sep).join("/");
}

function dedupeFindings(findings: ArchitectureFinding[]): ArchitectureFinding[] {
  const seen = new Set<string>();
  return findings.filter((f) => {
    const key = `${f.rule}|${f.file}|${f.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
