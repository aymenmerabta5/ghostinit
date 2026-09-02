import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import type { ArchitectureFinding, ImportReference, ParsedFile } from "./types.js";
import type { ResolvedImport } from "./resolution/index.js";

export const DEFAULT_MAX_SOURCE_FILE_BYTES = 4 * 1024 * 1024;
export const DEFAULT_MAX_TOTAL_SOURCE_BYTES = 256 * 1024 * 1024;

const SERVER_ONLY_PACKAGES = new Set([
  "server-only",
  "@repo/database",
  "@repo/config/server",
  "@orpc/server",
  "@orpc/openapi",
  "drizzle-orm",
  "drizzle-kit",
  "pg",
  "stripe",
  "@chargily/chargily-pay",
  "@paddle/paddle-node-sdk",
  "@polar-sh/sdk",
]);

export async function readBoundedSource(
  file: string,
  relFile: string,
  maxFileBytes: number,
  remainingBytes: number,
  findings: ArchitectureFinding[],
): Promise<{ source?: string; bytes: number }> {
  let source: string;
  try {
    source = await readFile(file, "utf8");
  } catch (error) {
    findings.push({
      id: "source-read-failure",
      severity: "BLOCKER",
      message: `Unable to read source file: ${errorCode(error)}`,
      file: relFile,
      rule: "source-coverage",
    });
    return { bytes: 0 };
  }
  const bytes = Buffer.byteLength(source, "utf8");
  if (bytes > maxFileBytes) {
    findings.push({
      id: "source-file-size-limit",
      severity: "BLOCKER",
      message: `Source file exceeds the ${maxFileBytes}-byte analysis limit`,
      file: relFile,
      rule: "source-coverage",
    });
    return { bytes };
  }
  if (bytes > remainingBytes) {
    findings.push({
      id: "source-total-size-limit",
      severity: "BLOCKER",
      message: "Total source byte budget exhausted before analysis completed",
      file: relFile,
      rule: "source-coverage",
    });
    return { bytes };
  }
  return { source, bytes };
}

export function parserFindings(
  findings: ArchitectureFinding[],
  file: string,
  source: string,
  parsed: ParsedFile,
): void {
  for (const diagnostic of parsed.diagnostics) {
    const start = diagnostic.labels[0]?.start ?? 0;
    const position = sourcePosition(source, start);
    findings.push({
      id: "parse-error",
      severity: "BLOCKER",
      message: `Unable to parse source: ${diagnostic.message.replace(/\s+/g, " ").trim()}`,
      file,
      rule: "parseable-source",
      ...position,
    });
  }
}

export function unresolvedImportFinding(
  file: string,
  resolution: ResolvedImport,
): ArchitectureFinding {
  return {
    id: "unresolved-owned-import",
    severity: "BLOCKER",
    message: `Unable to resolve project-owned ${resolution.reference.kind} '${resolution.specifier}' (${resolution.reason})`,
    file,
    rule: "import-resolution",
    line: resolution.reference.location.line,
    column: resolution.reference.location.column,
    specifier: resolution.specifier,
    importKind: resolution.reference.kind,
  };
}

export function decorateEdgeFindings(
  findings: ArchitectureFinding[],
  from: number,
  reference: ImportReference,
): void {
  for (let index = from; index < findings.length; index += 1) {
    const finding = findings[index];
    if (!finding) continue;
    finding.line ??= reference.location.line;
    finding.column ??= reference.location.column;
    finding.specifier ??= reference.specifier;
    finding.importKind ??= reference.kind;
  }
}

export function isServerOnlyImport(resolution: ResolvedImport): boolean {
  if (resolution.kind === "builtin") return true;
  const base = resolution.specifier.startsWith("@")
    ? resolution.specifier.split("/").slice(0, 2).join("/")
    : resolution.specifier.split("/")[0];
  if (SERVER_ONLY_PACKAGES.has(resolution.specifier) || SERVER_ONLY_PACKAGES.has(base)) return true;
  const target = resolution.target ?? "";
  if (target === "convex/_generated/api.js") return false;
  return (
    /(?:^|\/)(?:server|convex)(?:\/|$)/.test(target) ||
    /(?:^|\/)packages\/config\/src\/server(?:-schema)?\.[cm]?[jt]s$/.test(target) ||
    /(?:^|\/)src\/lib\/env\/server(?:-schema)?\.[cm]?[jt]s$/.test(target) ||
    /(?:^|\/)packages\/database(?:\/|$)/.test(target) ||
    /\/billing\/(?:src\/)?providers\//.test(target) ||
    /(?:^|\/)apps\/eve\//.test(target) ||
    /(?:^|\/)src\/(?:main|preload)\.[cm]?[jt]s$/.test(target)
  );
}

export function isAnalysisIncomplete(finding: ArchitectureFinding): boolean {
  return (
    finding.id === "project-root-unavailable" ||
    finding.id === "parse-error" ||
    finding.id === "unresolved-owned-import" ||
    finding.rule === "source-coverage" ||
    finding.rule === "source-collection" ||
    finding.rule === "package-discovery"
  );
}

function sourcePosition(source: string, offset: number): { line: number; column: number } {
  const prefix = source.slice(0, Math.max(0, offset));
  const lines = prefix.split(/\r?\n/);
  return { line: lines.length, column: (lines.at(-1)?.length ?? 0) + 1 };
}

function errorCode(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    return String((error as { code?: unknown }).code ?? "UNKNOWN");
  }
  return error instanceof Error ? error.name : "UNKNOWN";
}
