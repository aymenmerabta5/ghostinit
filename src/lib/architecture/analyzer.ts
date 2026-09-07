/** Deterministic fail-closed architecture analysis pipeline. */

import { realpath, stat } from "node:fs/promises";
import { extname, relative } from "node:path";
import type { ArchitectureFinding, ArchitectureReport, PackageInfo } from "./types.js";
import { dedupeFindings, normalizePath, packageForFile } from "./utils.js";
import {
  collectSourceFiles,
  discoverPackages,
  type PackageDiscoveryOptions,
  type SourceCollectionOptions,
} from "./collectors/index.js";
import { parseFile } from "./parsers/imports.js";
import { createImportResolver, type ResolvedImport } from "./resolution/index.js";
import {
  analyzeRuntimeGraph,
  checkPackageCycles,
  type RuntimeGraphEdge,
  type RuntimeGraphNode,
} from "./graph/index.js";
import {
  checkApplicationLayer,
  checkCapabilityIsolation,
  checkDatabaseIsolation,
  checkDeepRelativeImport,
  checkDomainLayer,
  checkLayeredDependency,
  checkMalformedGeneratedModule,
  checkModuleToModule,
  checkPrivatePath,
  checkServerOnlyClient,
  checkUndeclaredDependency,
  checkVendorIsolation,
  checkWebhookStructure,
} from "./rules/index.js";
import {
  DEFAULT_MAX_SOURCE_FILE_BYTES,
  DEFAULT_MAX_TOTAL_SOURCE_BYTES,
  decorateEdgeFindings,
  isAnalysisIncomplete,
  isServerOnlyImport,
  parserFindings,
  readBoundedSource,
  unresolvedImportFinding,
} from "./analyzer-helpers.js";

export interface AnalyzeProjectOptions {
  sourceCollection?: SourceCollectionOptions;
  packageDiscovery?: PackageDiscoveryOptions;
  maxSourceFileBytes?: number;
  maxTotalSourceBytes?: number;
}

interface SourceUnit {
  file: string;
  relativeFile: string;
  source: string;
  pkg?: PackageInfo;
  resolutions: ResolvedImport[];
  directives: Set<string>;
  serverActionValid: boolean;
}

export async function analyzeProject(root: string, options: AnalyzeProjectOptions = {}) {
  return (await analyzeProjectReport(root, options)).findings;
}

export async function analyzeProjectReport(
  root: string,
  options: AnalyzeProjectOptions = {},
): Promise<ArchitectureReport> {
  const findings: ArchitectureFinding[] = [];
  const canonicalRoot = await validateRoot(root, findings);
  if (!canonicalRoot) return report(findings, 0, 0, 0);

  const maxFileBytes = options.maxSourceFileBytes ?? DEFAULT_MAX_SOURCE_FILE_BYTES;
  const maxTotalBytes = options.maxTotalSourceBytes ?? DEFAULT_MAX_TOTAL_SOURCE_BYTES;
  if (!validBudget(maxFileBytes) || !validBudget(maxTotalBytes)) {
    findings.push({
      id: "source-size-invalid-budget",
      severity: "BLOCKER",
      message: "Source byte limits must be non-negative safe integers",
      file: "",
      rule: "source-coverage",
    });
    return report(findings, 0, 0, 0);
  }

  const packages = await discoverPackages(canonicalRoot, findings, options.packageDiscovery);
  const files = await collectSourceFiles(
    canonicalRoot,
    packages,
    findings,
    options.sourceCollection,
  );
  const resolver = await createImportResolver(canonicalRoot);
  const packageByDir = new Map(packages.map((item) => [item.dir, item]));
  const units: SourceUnit[] = [];
  let totalBytes = 0;
  let importCount = 0;
  let resolvedCount = 0;
  let unresolvedCount = 0;

  for (const file of files) {
    const relativeFile = normalizePath(relative(canonicalRoot, file));
    const bounded = await readBoundedSource(
      file,
      relativeFile,
      maxFileBytes,
      maxTotalBytes - totalBytes,
      findings,
    );
    totalBytes += bounded.bytes;
    if (!bounded.source) {
      if (findings.some(({ id }) => id === "source-total-size-limit")) break;
      continue;
    }
    let parsed;
    try {
      parsed = parseFile(bounded.source, extname(file));
    } catch (error) {
      findings.push({
        id: "parse-error",
        severity: "BLOCKER",
        message: `Unable to parse source: ${errorName(error)}`,
        file: relativeFile,
        rule: "parseable-source",
      });
      continue;
    }
    parserFindings(findings, relativeFile, bounded.source, parsed);
    if (parsed.diagnostics.length > 0) continue;

    const resolutions = await resolver.resolveAll(file, parsed.importReferences);
    importCount += resolutions.length;
    const pkg = packageForFile(file, packages);
    for (const resolution of resolutions) {
      if (resolution.kind === "unresolved" && resolution.owned) {
        findings.push(unresolvedImportFinding(relativeFile, resolution));
        unresolvedCount += 1;
      } else if (resolution.kind !== "unresolved") {
        resolvedCount += 1;
      }
      await runImportRules(
        findings,
        relativeFile,
        file,
        pkg,
        packageByDir,
        parsed.directives,
        bounded.source,
        resolution,
      );
    }
    checkWebhookStructure(findings, relativeFile, bounded.source, extname(file));
    await checkMalformedGeneratedModule(findings, relativeFile);
    units.push({
      file,
      relativeFile,
      source: bounded.source,
      pkg,
      resolutions,
      directives: parsed.directives,
      serverActionValid: parsed.serverActionValid,
    });
  }

  addRuntimeTaintFindings(findings, units);
  checkPackageCycles(findings, packages, canonicalRoot);
  return report(findings, files.length, importCount, resolvedCount, unresolvedCount);
}

async function runImportRules(
  findings: ArchitectureFinding[],
  file: string,
  absoluteFile: string,
  pkg: PackageInfo | undefined,
  packageByDir: Map<string, PackageInfo>,
  directives: Set<string>,
  source: string,
  resolution: ResolvedImport,
): Promise<void> {
  const imp = resolution.specifier;
  const start = findings.length;
  checkDomainLayer(findings, file, imp);
  checkApplicationLayer(findings, file, imp);
  checkPrivatePath(findings, file, imp, resolution.target);
  checkDatabaseIsolation(findings, file, imp, resolution.target);
  checkDeepRelativeImport(findings, resolution);
  checkModuleToModule(findings, file, absoluteFile, imp, pkg, resolution.target);
  if (!resolution.reference.typeOnly) {
    checkServerOnlyClient(findings, file, imp, pkg, directives, source);
  }
  checkVendorIsolation(findings, file, imp);
  checkCapabilityIsolation(findings, file, absoluteFile, imp, resolution.target);
  checkLayeredDependency(
    findings,
    file,
    absoluteFile,
    imp,
    resolution.target,
    resolution.reference.kind,
  );
  await checkUndeclaredDependency(findings, file, imp, pkg, packageByDir);
  decorateEdgeFindings(findings, start, resolution.reference);
}

function addRuntimeTaintFindings(findings: ArchitectureFinding[], units: SourceUnit[]): void {
  const nodes: RuntimeGraphNode[] = [];
  const edges: RuntimeGraphEdge[] = [];
  for (const unit of units) {
    nodes.push({
      id: unit.relativeFile,
      file: unit.relativeFile,
      directives: unit.directives,
      serverAction: unit.serverActionValid,
      serverReferenceBoundary: isTanStackServerFunctionReference(unit),
      client: isSinglePlatformClient(unit),
    });
    for (const resolution of unit.resolutions) {
      const serverOnly = isServerOnlyImport(resolution);
      if (
        (resolution.kind === "internal" || resolution.kind === "workspace") &&
        resolution.target &&
        /\.[cm]?[jt]sx?$/.test(resolution.target)
      ) {
        edges.push({
          from: unit.relativeFile,
          to: resolution.target,
          kind: resolution.reference.kind,
          typeOnly: resolution.reference.typeOnly,
          specifier: resolution.specifier,
          serverOnly,
        });
      } else if (serverOnly) {
        const target = `${resolution.kind}:${resolution.specifier}`;
        nodes.push({ id: target, serverOnly: true, builtin: resolution.kind === "builtin" });
        edges.push({
          from: unit.relativeFile,
          to: target,
          kind: resolution.reference.kind,
          typeOnly: resolution.reference.typeOnly,
          specifier: resolution.specifier,
          serverOnly: true,
          builtin: resolution.kind === "builtin",
        });
      }
    }
  }
  for (const taint of analyzeRuntimeGraph(nodes, edges).findings) {
    const firstEdge = taint.edges[0];
    findings.push({
      id: "client-transitive-server-import",
      severity: "HIGH",
      message: `Client runtime reaches server-only code: ${taint.trace.join(" -> ")}`,
      file: taint.client,
      rule: "client-boundary",
      specifier: firstEdge?.specifier,
      importKind: firstEdge?.kind,
      trace: taint.trace,
    });
  }
}

function isTanStackServerFunctionReference(unit: SourceUnit): boolean {
  const file = unit.relativeFile.replace(/\\/g, "/");
  const runtimeImports = unit.resolutions.filter(({ reference }) => !reference.typeOnly);
  return (
    /(?:^|\/)src\/lib\/server-functions\.[cm]?[jt]sx?$/.test(file) &&
    !unit.directives.has("use client") &&
    unit.source.includes('createServerFn({ method: "GET" })') &&
    runtimeImports.every(
      ({ reference, specifier }) =>
        specifier === "@tanstack/react-start" ||
        (reference.kind === "dynamic-import" &&
          (specifier === "@tanstack/react-start/server" ||
            specifier === "@repo/services/application" ||
            specifier === "@/server/services/application")),
    )
  );
}

function isSinglePlatformClient(unit: SourceUnit): boolean {
  const deps = unit.pkg?.dependencies;
  if (!deps) return false;
  if ((deps.has("expo") || deps.has("react-native")) && unit.relativeFile.startsWith("app/")) {
    return !unit.relativeFile.startsWith("app/api/");
  }
  return deps.has("electron") && unit.relativeFile.startsWith("src/renderer/");
}

async function validateRoot(
  root: string,
  findings: ArchitectureFinding[],
): Promise<string | undefined> {
  try {
    const info = await stat(root);
    if (!info.isDirectory()) throw new Error("NOT_DIRECTORY");
    return await realpath(root);
  } catch (error) {
    findings.push({
      id: "project-root-unavailable",
      severity: "BLOCKER",
      message: `Project root is unavailable: ${errorName(error)}`,
      file: "",
      rule: "project-coverage",
    });
    return undefined;
  }
}

function report(
  findings: ArchitectureFinding[],
  files: number,
  imports: number,
  resolvedImports: number,
  unresolvedOwnedImports = 0,
): ArchitectureReport {
  const stable = dedupeFindings(findings);
  return {
    schemaVersion: 2,
    complete: !stable.some(isAnalysisIncomplete),
    findings: stable,
    stats: { files, imports, resolvedImports, unresolvedOwnedImports },
  };
}

function validBudget(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function errorName(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    return String((error as { code?: unknown }).code ?? "UNKNOWN");
  }
  return error instanceof Error ? error.name : "UNKNOWN";
}
