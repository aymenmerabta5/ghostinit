/** The generated checker reuses the host's bounded source discovery and resolver. */
import { extname, relative } from "node:path";
import { realpath } from "node:fs/promises";
import { collectSourceFiles, discoverPackages } from "../collectors/index.js";
import { createImportResolver } from "../resolution/index.js";
import { parseFile } from "../parsers/imports.js";
import { normalizePath, packageForFile } from "../utils.js";
import {
  DEFAULT_MAX_SOURCE_FILE_BYTES,
  DEFAULT_MAX_TOTAL_SOURCE_BYTES,
  isAnalysisIncomplete,
  parserFindings,
  readBoundedSource,
} from "../analyzer-helpers.js";
import type { ArchitectureFinding } from "../types.js";
import { analyzeFrontendFile, classifyFrontendFile } from "./index.js";

export {
  analyzeFrontendFile,
  classifyFrontendFile,
  DEFAULT_FRONTEND_OWNERSHIP_POLICY,
  validateFrontendOwnershipPolicy,
} from "./index.js";

export async function analyzeFrontendProject(root: string) {
  const findings: ArchitectureFinding[] = [];
  const canonicalRoot = await realpath(root);
  const packages = await discoverPackages(canonicalRoot, findings);
  const files = await collectSourceFiles(canonicalRoot, packages, findings);
  const resolver = await createImportResolver(canonicalRoot);
  let totalBytes = 0;
  for (const absolute of files) {
    const file = normalizePath(relative(canonicalRoot, absolute));
    const bounded = await readBoundedSource(
      absolute,
      file,
      DEFAULT_MAX_SOURCE_FILE_BYTES,
      DEFAULT_MAX_TOTAL_SOURCE_BYTES - totalBytes,
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
    } catch {
      findings.push({
        id: "parse-error",
        severity: "BLOCKER",
        message: "Unable to parse maintained source",
        file,
        rule: "parseable-source",
      });
      continue;
    }
    parserFindings(findings, file, bounded.source, parsed);
    if (parsed.diagnostics.length || classifyFrontendFile(file) === "other") continue;
    const imports = await resolver.resolveAll(absolute, parsed.importReferences);
    const pkg = packageForFile(absolute, packages);
    findings.push(
      ...analyzeFrontendFile({
        file,
        source: bounded.source,
        program: parsed.program,
        comments: parsed.comments,
        platform:
          pkg?.dependencies.has("expo") && pkg.dependencies.has("react-native") ? "expo" : "web",
        imports: imports.map(({ specifier, target, reference }) => ({
          specifier,
          target,
          typeOnly: reference.typeOnly,
        })),
      }),
    );
  }
  return { complete: !findings.some(isAnalysisIncomplete), findings, files: files.length };
}
