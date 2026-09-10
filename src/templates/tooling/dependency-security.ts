import { DEPENDENCY_SECURITY_RUNTIME } from "../../generation/embedded-dependency-security-runtime.js";
import type { DependencySecurityPolicy } from "../../lib/dependency-security/runtime-types.js";
import { file, type TemplateFile } from "../shared.js";
import { dependencySecurityPolicy } from "./dependency-security-policy.js";
import {
  dependencySecurityIntegrityContent,
  DEPENDENCY_SECURITY_INTEGRITY_PATH,
  DEPENDENCY_SECURITY_RUNTIME_PATH,
} from "./dependency-security-integrity.js";

/** Standalone CJS entrypoint; application dependencies and GhostInit are not required. */
export function dependencySecurityLauncherContent(policy: DependencySecurityPolicy): string {
  return `#!/usr/bin/env bun
const policy = ${JSON.stringify(policy)};
const usage = "Usage: bun scripts/security-dependencies.cjs <audit|fix|install> [--json] [--dry-run] [--bootstrap (install only)]";
const json = process.argv.slice(2).includes("--json");
let runtimeInvoked = false;

function printResult(result) {
  if (json) console.log(JSON.stringify(result, null, 2));
  else {
    console.log("Dependency security: " + result.status + (result.dryRun ? " (dry run)" : ""));
    for (const change of result.changes) console.log("  " + change.package + ": " + change.from + " -> " + change.to);
    for (const advisory of result.remaining) console.log("  " + advisory.package + ": " + advisory.severity + " (" + advisory.disposition + ") " + advisory.url);
    if (result.message) console.log(result.message);
  }
  process.exitCode = result.status === "blocked" || result.status === "failed" ? 1
    : result.status === "partial" && !(process.argv[2] === "install" && result.installedVerified) ? 8 : 0;
}

async function main() {
  const [mode, ...flags] = process.argv.slice(2);
  if (!["audit", "fix", "install"].includes(mode)) throw new Error(usage);
  const accepted = new Set(["--json", "--dry-run", ...(mode === "install" ? ["--bootstrap"] : [])]);
  const selected = new Set();
  for (const flag of flags) {
    if (!accepted.has(flag) || selected.has(flag)) throw new Error(usage);
    selected.add(flag);
  }
  const { loadDependencySecurityRuntime } = require("./lib/dependency-security-integrity.cjs");
  const { runDependencySecurity } = loadDependencySecurityRuntime();
  runtimeInvoked = true;
  const result = await runDependencySecurity({
    cwd: process.cwd(),
    mode,
    dryRun: selected.has("--dry-run"),
    bootstrap: selected.has("--bootstrap"),
    verifyProject: mode === "fix",
    policy,
  });
  printResult(result);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  if (runtimeInvoked) {
    const failure = {
      status: "failed",
      dryRun: process.argv.slice(2).includes("--dry-run"),
      outcomeUnknown: true,
      message,
    };
    if (json) console.log(JSON.stringify(failure, null, 2));
    else console.log("Dependency security failed before a complete outcome was reported: " + message);
    process.exitCode = 1;
    return;
  }
  printResult({
    status: "failed",
    dryRun: process.argv.slice(2).includes("--dry-run"),
    applied: false,
    installedVerified: false,
    changes: [],
    remaining: [],
    verifiedPatchAdvisories: [],
    message,
  });
});
`;
}

export function dependencySecurityFiles(
  hasImageSizePatch: boolean,
  hasOpenNextPatch = false,
): TemplateFile[] {
  const policy = dependencySecurityPolicy(hasImageSizePatch, hasOpenNextPatch);
  return [
    file("scripts/security-dependencies.cjs", dependencySecurityLauncherContent(policy)),
    file(DEPENDENCY_SECURITY_INTEGRITY_PATH, dependencySecurityIntegrityContent()),
    file(DEPENDENCY_SECURITY_RUNTIME_PATH, DEPENDENCY_SECURITY_RUNTIME),
  ];
}
