import { nextStack, runtime, supplyChain } from "../../packages/versions/src/index.js";
import type { DependencySecurityResolution } from "../../src/domain/dependency-security/types.js";
import type { GenerationPlan } from "../../src/domain/generation/types.js";
import {
  PROJECT_CONFIG_SCHEMA_URI,
  type DesiredProjectConfig,
} from "../../src/domain/project/config.js";
import { canonicalDesiredProjectConfig } from "../../src/domain/project/desired-canonical.js";
import {
  canonicalizeGenerationPlan,
  formatGenerationText,
} from "../../src/generation/plan-formatter.js";
import { hashContent } from "../../src/lib/checksum.js";
import { FsTransaction } from "../../src/lib/fs.js";
import {
  resolveDesiredProjectConfig,
  serializeDesiredProjectConfig,
} from "../../src/lib/project-config.js";
import { buildProjectGenerationPlan } from "../../src/templates/default.js";

/** Synthetic evidence for injected process boundaries; no package installation or publication claim. */
export function installationSecurityResolution(offset = 1): DependencySecurityResolution {
  const [major, minor, patch] = nextStack.react.split(".").map(Number);
  return {
    manifestPath: "package.json",
    field: ["dependencies", "react"],
    package: "react",
    originalSpec: nextStack.react,
    version: `${major}.${minor}.${patch + offset}`,
    integrity: `sha512-${"A".repeat(86)}==`,
    publishedAt: "2026-01-01T00:00:00.000Z",
    auditedAt: "2026-01-08T00:00:00.000Z",
    advisories: ["GHSA-2345-6789-cfgh"],
  };
}

export function installationDesired(
  resolution?: DependencySecurityResolution,
): DesiredProjectConfig {
  return canonicalDesiredProjectConfig({
    $schema: PROJECT_CONFIG_SCHEMA_URI,
    schemaVersion: 2,
    name: "security-install",
    mode: "single",
    runtime: "bun",
    packageManager: { name: "bun", version: runtime.bun },
    apps: [{ id: "web", target: "nextjs", deploy: "none" }],
    backend: false,
    capabilities: {},
    ...(resolution ? { dependencySecurity: { schemaVersion: 1, resolutions: [resolution] } } : {}),
  });
}

export async function installationPlan(desired = installationDesired()) {
  const resolved = resolveDesiredProjectConfig(desired);
  const plan = await canonicalizeGenerationPlan(
    buildProjectGenerationPlan(resolved, { desiredConfig: desired }),
  );
  return { desired, resolved, plan };
}

export async function stageInstallationSecurity(
  tx: FsTransaction,
  beforePlan: GenerationPlan,
  desired: DesiredProjectConfig,
  resolution = installationSecurityResolution(),
) {
  const before = beforePlan.files.find(
    ({ physicalPath }) => physicalPath === "package.json",
  )!.content;
  const manifest = JSON.parse(before);
  manifest.dependencies.react = resolution.version;
  const updated = canonicalDesiredProjectConfig({
    ...desired,
    dependencySecurity: { schemaVersion: 1, resolutions: [resolution] },
  });
  const lock = "synthetic lock for an injected installer boundary\n";
  const evidence = {
    schemaVersion: 1,
    registry: "https://registry.npmjs.org",
    minimumReleaseAgeSeconds: supplyChain.minimumReleaseAgeSeconds,
    auditedAt: resolution.auditedAt,
    lockSha256: hashContent(lock),
    releases: [
      {
        package: resolution.package,
        version: resolution.version,
        integrity: resolution.integrity,
        publishedAt: resolution.publishedAt,
      },
    ],
  };
  await tx.write(
    "package.json",
    await formatGenerationText("package.json", `${JSON.stringify(manifest, null, 2)}\n`),
  );
  await tx.write(
    "ghostinit.config.json",
    await formatGenerationText("ghostinit.config.json", serializeDesiredProjectConfig(updated)),
  );
  await tx.write("bun.lock", lock);
  await tx.write("dependency-lock-evidence.json", `${JSON.stringify(evidence, null, 2)}\n`);
  return { updated, lock, evidence };
}
