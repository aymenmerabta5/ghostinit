import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { GenerationPlan } from "../../domain/generation/types.js";
import type { DesiredProjectConfig, ResolvedProjectConfig } from "../../domain/project/config.js";
import { canonicalJson } from "../../domain/project/canonical.js";
import { canonicalDesiredProjectConfig } from "../../domain/project/desired-canonical.js";
import { dependencySecurityResolutionKey } from "../../domain/dependency-security/resolutions.js";
import {
  compareSecurityVersions,
  isCompatibleSecurityVersion,
} from "../../domain/dependency-security/versions.js";
import { hashContent } from "../../lib/checksum.js";
import { ConflictError } from "../../lib/errors.js";
import { resolveDesiredProjectConfig } from "../../lib/project-config.js";
import { PROJECT_CONFIG_FILE, projectDesiredConfigSchema } from "../../lib/config.js";
import { buildProjectGenerationPlan } from "../../templates/default.js";
import { supplyChain } from "../../../packages/versions/src/index.js";

function withoutSecurity(value: DesiredProjectConfig): unknown {
  const { dependencySecurity: _security, ...rest } = canonicalDesiredProjectConfig(value);
  return rest;
}

function fieldValue(content: string, field: readonly string[]): unknown {
  let value: unknown = JSON.parse(content);
  for (const part of field) {
    if (
      value === null ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      !Object.hasOwn(value, part)
    )
      return undefined;
    value = (value as Record<string, unknown>)[part];
  }
  return value;
}

/** A security-maintained candidate gets a second explicit compiled plan. */
export async function recompileInstalledSecurityPlan(
  root: string,
  beforeDesired: DesiredProjectConfig,
  beforeResolved: ResolvedProjectConfig,
  beforePlan: GenerationPlan,
  format: (plan: GenerationPlan) => Promise<GenerationPlan>,
  readCandidateFile: typeof readFile = readFile,
): Promise<{
  desired: DesiredProjectConfig;
  resolved: ResolvedProjectConfig;
  plan: GenerationPlan;
}> {
  const desired = canonicalDesiredProjectConfig(
    projectDesiredConfigSchema.parse(
      JSON.parse(await readCandidateFile(join(root, PROJECT_CONFIG_FILE), "utf8")),
    ),
  );
  const resolved = resolveDesiredProjectConfig(desired);
  if (canonicalJson(withoutSecurity(desired)) !== canonicalJson(withoutSecurity(beforeDesired))) {
    throw new ConflictError(
      "Installation changed project choices outside dependency security maintenance",
    );
  }
  if (
    canonicalJson(desired.dependencySecurity ?? null) ===
    canonicalJson(beforeDesired.dependencySecurity ?? null)
  ) {
    return { desired: beforeDesired, resolved: beforeResolved, plan: beforePlan };
  }
  const previous = new Map(
    (beforeDesired.dependencySecurity?.resolutions ?? []).map((item) => [
      dependencySecurityResolutionKey(item),
      item,
    ]),
  );
  const next = new Map(
    (desired.dependencySecurity?.resolutions ?? []).map((item) => [
      dependencySecurityResolutionKey(item),
      item,
    ]),
  );
  for (const [key, prior] of previous) {
    const value = next.get(key);
    if (!value || compareSecurityVersions(value.version, prior.version) < 0) {
      throw new ConflictError(
        "Installation removed or lowered a recorded dependency security resolution",
      );
    }
  }
  const lock = await readCandidateFile(join(root, "bun.lock"), "utf8");
  const evidence = JSON.parse(
    await readCandidateFile(join(root, "dependency-lock-evidence.json"), "utf8"),
  ) as {
    schemaVersion?: unknown;
    registry?: unknown;
    minimumReleaseAgeSeconds?: unknown;
    auditedAt?: unknown;
    lockSha256?: unknown;
    releases?: unknown;
  };
  if (
    evidence.schemaVersion !== 1 ||
    evidence.registry !== "https://registry.npmjs.org" ||
    evidence.minimumReleaseAgeSeconds !== supplyChain.minimumReleaseAgeSeconds ||
    evidence.lockSha256 !== hashContent(lock) ||
    typeof evidence.auditedAt !== "string" ||
    !Array.isArray(evidence.releases)
  ) {
    throw new ConflictError(
      "Installed dependency security evidence does not bind the candidate lock",
    );
  }
  const auditedAt = Date.parse(evidence.auditedAt);
  if (!Number.isFinite(auditedAt) || auditedAt > Date.now()) {
    throw new ConflictError(
      "Installed dependency security evidence has an invalid audit timestamp",
    );
  }
  const releases = new Map<string, { publishedAt: string; integrity: string }>();
  for (const item of evidence.releases) {
    if (
      item === null ||
      typeof item !== "object" ||
      typeof item.package !== "string" ||
      typeof item.version !== "string" ||
      typeof item.publishedAt !== "string" ||
      typeof item.integrity !== "string"
    ) {
      throw new ConflictError("Installed dependency release evidence is malformed");
    }
    const key = item.package + "@" + item.version;
    if (releases.has(key))
      throw new ConflictError("Installed dependency release evidence repeats a release");
    releases.set(key, item);
  }
  for (const [key, item] of next) {
    const prior = previous.get(key);
    if (prior && canonicalJson(prior) === canonicalJson(item)) continue;
    const original = beforePlan.files.find((file) => file.physicalPath === item.manifestPath);
    const declaration = original ? fieldValue(original.content, item.field) : undefined;
    const originMatches =
      declaration === item.originalSpec ||
      Boolean(
        prior &&
        prior.originalSpec === item.originalSpec &&
        typeof declaration === "string" &&
        isCompatibleSecurityVersion(prior.originalSpec, declaration),
      );
    const release = releases.get(item.package + "@" + item.version);
    if (
      typeof declaration !== "string" ||
      !originMatches ||
      !isCompatibleSecurityVersion(declaration, item.version) ||
      !release ||
      release.integrity !== item.integrity ||
      release.publishedAt !== item.publishedAt ||
      Date.parse(item.auditedAt) > Date.parse(evidence.auditedAt)
    ) {
      throw new ConflictError(
        "Installed security resolution is not an evidenced compatible change to a planned dependency",
        { path: item.manifestPath, package: item.package },
      );
    }
  }
  const plan = await format(buildProjectGenerationPlan(resolved, { desiredConfig: desired }));
  const oldFiles = new Map(beforePlan.files.map((file) => [file.physicalPath, file]));
  if (
    plan.files.length !== beforePlan.files.length ||
    canonicalJson(plan.secrets) !== canonicalJson(beforePlan.secrets)
  ) {
    throw new ConflictError(
      "Security maintenance changed the generation file or secret-operation scope",
    );
  }
  for (const file of plan.files) {
    const previousFile = oldFiles.get(file.physicalPath);
    if (
      !previousFile ||
      (file.physicalPath !== "ghostinit.config.json" &&
        file.physicalPath !== "package.json" &&
        !file.physicalPath.endsWith("/package.json") &&
        file.content !== previousFile.content)
    ) {
      throw new ConflictError("Security maintenance changed unrelated generated output", {
        path: file.physicalPath,
      });
    }
  }
  return { desired, resolved, plan };
}
