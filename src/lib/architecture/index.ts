/**
 * Modular architecture analyzer - composer.
 * Orchestrates collectors + parsers + rules + graph.
 *
 * Modularization constraints (enforced):
 * - Each rule <200 LOC (e.g., layered.ts, capability.ts, vendor.ts, client-boundary.ts) — split god files
 * - Composers <5 imports aggregated via barrels (collectors/index.ts, parsers/, rules/index.ts, graph/)
 * - <300 LOC/file overall, see AGENTS.md
 *
 * oxc-parser breaking change mitigation:
 * - oxc-parser version pinned in packages/versions/src/index.ts (tooling group, currently oxlint/oxfmt bump tracks oxc)
 * - Import extraction tolerates AST shape changes: parseFile checks both ImportDeclaration and ExportAll/Named,
 *   plus dynamic ImportExpression and CallExpression(import) / require() via recursive walk.
 *   If oxc-parser introduces new node types, only parsers/imports.ts needs update; rules stay stable.
 *   Build verifies dist/cli.d.ts real (not fake stub) via declarationMap — ensures parser API still present.
 *
 * Layered architecture rationale: docs/ARCHITECTURE.md GhostInit Layered Architecture
 *   UI(1)->Transport(2)->Domain(3)->Capabilities(4)->Vendors(5)->Supporting(6) downward only.
 *   Intra-module same BC (modules/src/identity/) skip avoids false positives.
 *   Framework entrypoints __root.tsx / router.tsx skipped globally via isFrameworkEntryPoint().
 */

import { readFile } from "node:fs/promises";
import { relative } from "node:path";
import type { ArchitectureFinding, PackageInfo } from "./types.js";
import { dedupeFindings, extname, normalizePath, packageForFile } from "./utils.js";
import { discoverPackages, collectSourceFiles } from "./collectors/index.js";
import { parseFile } from "./parsers/imports.js";
import { checkPackageCycles } from "./graph/index.js";
import {
  checkDomainLayer,
  checkApplicationLayer,
  checkPrivatePath,
  checkDatabaseIsolation,
  checkModuleToModule,
  checkServerOnlyClient,
  checkVendorIsolation,
  checkCapabilityIsolation,
  checkLayeredDependency,
  checkUndeclaredDependency,
  checkMalformedGeneratedModule,
} from "./rules/index.js";

export async function analyzeProject(root: string): Promise<ArchitectureFinding[]> {
  const findings: ArchitectureFinding[] = [];
  const packages = await discoverPackages(root);
  const packageByDir = new Map<string, PackageInfo>();
  for (const pkg of packages) packageByDir.set(pkg.dir, pkg);

  const tsFiles = await collectSourceFiles(root, packages, findings);

  for (const absFile of tsFiles) {
    const relFile = normalizePath(relative(root, absFile));
    const pkg = packageForFile(absFile, packages);
    const source = await readFile(absFile, "utf-8");
    let parsed;
    try {
      parsed = parseFile(source, extname(absFile));
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

    for (const imp of parsed.imports) {
      checkDomainLayer(findings, relFile, imp);
      checkApplicationLayer(findings, relFile, imp);
      checkPrivatePath(findings, relFile, imp);
      checkDatabaseIsolation(findings, relFile, imp);
      checkModuleToModule(findings, relFile, absFile, imp, pkg);
      checkServerOnlyClient(findings, relFile, imp, pkg, parsed.directives, source);
      checkVendorIsolation(findings, relFile, imp);
      checkCapabilityIsolation(findings, relFile, absFile, imp);
      checkLayeredDependency(findings, relFile, absFile, imp);
      await checkUndeclaredDependency(findings, relFile, imp, pkg, packageByDir);
    }

    await checkMalformedGeneratedModule(findings, relFile);
  }

  checkPackageCycles(findings, packages);
  return dedupeFindings(findings);
}

export type { ArchitectureFinding } from "./types.js";
