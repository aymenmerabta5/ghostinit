import { file, type TemplateFile } from "../shared.js";
import { generatedGitattributesContent } from "../gitignore.js";
import {
  OPENNEXT_AWS_WINDOWS_PATCH_KEY,
  OPENNEXT_AWS_WINDOWS_PATCH_PATH,
} from "../root/cloudflare.js";
import {
  dependencyAuditScriptContent,
  IMAGE_SIZE_PATCH_KEY,
  IMAGE_SIZE_PATCH_PATH,
  IMAGE_SIZE_PATCH_CONTENT,
} from "./dependency-audit-policy.js";
import { dependencySecurityFiles } from "./dependency-security.js";
import {
  DEPENDENCY_SECURITY_RUNTIME_PATH,
  DEPENDENCY_SECURITY_INTEGRITY_PATH,
} from "../../domain/dependency-security/artifacts.js";

const DEPENDENCY_AUDIT_TOOLING_PATHS = new Set([
  "scripts/audit-dependencies.ts",
  "scripts/security-dependencies.cjs",
  DEPENDENCY_SECURITY_RUNTIME_PATH,
  DEPENDENCY_SECURITY_INTEGRITY_PATH,
]);

/** Capability names inside these standalone tools describe policy, not app imports. */
export function isDependencyAuditToolingFile(path: string): boolean {
  return DEPENDENCY_AUDIT_TOOLING_PATHS.has(path);
}

export {
  dependencyAuditScriptContent,
  IMAGE_SIZE_PATCH_KEY,
  IMAGE_SIZE_PATCH_PATH,
  IMAGE_SIZE_PATCH_GITATTRIBUTES,
  IMAGE_SIZE_PATCH_CONTENT,
  IMAGE_SIZE_PATCH_SHA256,
  IMAGE_SIZE_PATCH_ADVISORIES,
} from "./dependency-audit-policy.js";

export function dependencyAuditFiles(
  hasImageSizePatch: boolean,
  hasOpenNextPatch = false,
): TemplateFile[] {
  return [
    ...dependencySecurityFiles(hasImageSizePatch, hasOpenNextPatch),
    file(
      "scripts/audit-dependencies.ts",
      dependencyAuditScriptContent(hasImageSizePatch, hasOpenNextPatch),
    ),
    file(".gitattributes", generatedGitattributesContent(hasImageSizePatch || hasOpenNextPatch)),
    ...(hasImageSizePatch ? [file(IMAGE_SIZE_PATCH_PATH, IMAGE_SIZE_PATCH_CONTENT)] : []),
  ];
}

export function integrateDependencyAuditManifest(
  packageFile: TemplateFile,
  hasImageSizePatch: boolean,
  hasOpenNextPatch = false,
): TemplateFile {
  if (packageFile.path !== "package.json") {
    throw new Error("Dependency audit integration requires the root package.json");
  }
  const manifest = JSON.parse(packageFile.content) as {
    scripts?: Record<string, string>;
    patchedDependencies?: Record<string, string>;
    [key: string]: unknown;
  };
  manifest.scripts = {
    ...manifest.scripts,
    preinstall: "bun scripts/audit-dependencies.ts --lock-only",
    "lock:resolve": "bun install --lockfile-only --ignore-scripts",
    "audit:lock": "bun scripts/audit-dependencies.ts --lock-only",
    "audit:lock:refresh": "bun scripts/audit-dependencies.ts --refresh-lock-evidence",
    "audit:dependencies": "bun scripts/audit-dependencies.ts",
    "security:audit": "bun scripts/security-dependencies.cjs audit",
    "security:fix": "bun scripts/security-dependencies.cjs fix",
    "install:verified": "bun scripts/security-dependencies.cjs install",
    "install:bootstrap": "bun scripts/security-dependencies.cjs install --bootstrap",
    ...(manifest.scripts?.["install:cmd"] === undefined
      ? {}
      : { "install:cmd": "bun run install:verified" }),
  };
  // The exact compiled artifact is exempt from authored-source lint only while
  // its owning compiler digest verifies. lint:all already delegates to lint.
  const integrity = `bun ${DEPENDENCY_SECURITY_INTEGRITY_PATH}`;
  manifest.scripts["lint:tooling-integrity"] = integrity;
  for (const name of ["lint", "lint:oxlint"] as const) {
    const command = manifest.scripts[name];
    if (command && !command.startsWith(`${integrity} && `))
      manifest.scripts[name] = `${integrity} && ${command}`;
  }
  const lintAll = manifest.scripts["lint:all"];
  if (
    lintAll &&
    !/(?:^|&&\s*)bun run lint(?:\s*&&|\s*$)/.test(lintAll) &&
    !lintAll.startsWith(`${integrity} && `)
  ) {
    manifest.scripts["lint:all"] = `${integrity} && ${lintAll}`;
  }
  if (hasImageSizePatch) {
    manifest.patchedDependencies = {
      ...manifest.patchedDependencies,
      [IMAGE_SIZE_PATCH_KEY]: IMAGE_SIZE_PATCH_PATH,
    };
  }
  if (hasOpenNextPatch) {
    manifest.patchedDependencies = {
      ...manifest.patchedDependencies,
      [OPENNEXT_AWS_WINDOWS_PATCH_KEY]: OPENNEXT_AWS_WINDOWS_PATCH_PATH,
    };
  }
  return { ...packageFile, content: `${JSON.stringify(manifest, null, 2)}\n` };
}
