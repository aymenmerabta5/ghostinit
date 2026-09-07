// @allow-long 1000: one fail-closed audit keeps grammar, manifests, registry, lock, age, and evidence invariants together
/**
 * Fail closed when a host/generated pin is missing, deprecated without an
 * approved hold, younger than the release-age policy, or behind the newest
 * age-eligible stable npm release without refreshed evidence.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AnySchema } from "ajv";
import Ajv2020 from "ajv/dist/2020.js";
import * as versions from "../packages/versions/src/index.js";
import type { ProjectConfig } from "../src/lib/config.js";
import { generateProjectFiles } from "../src/templates/default.js";
import {
  collectRepositoryLockedPins,
  isSha512Integrity,
  releaseAgeWindow,
} from "./lock-age-policy.js";

export { lockedRegistryPinsFromText, releaseAgeWindow } from "./lock-age-policy.js";

interface Pin {
  scope: string;
  group: string;
  key: string;
  package: string;
  source: "catalog" | "host" | "generated" | "fixture";
  spec: string;
  version: string;
}

interface RegistryVersion {
  deprecated?: string;
  dist?: { integrity?: string };
}

interface RegistryDocument {
  "dist-tags"?: { latest?: string };
  versions?: Record<string, RegistryVersion>;
  time?: Record<string, string>;
}

export interface RegistryReleaseFacts {
  registryLatest: string;
  registryLatestPublishedAt: string;
  eligibleLatest: string;
  eligibleLatestPublishedAt: string;
}

interface EvidencePin {
  scope: string;
  group: string;
  key: string;
  package: string;
  source: "catalog" | "host";
  exists: true;
  currentDeprecated: string | null;
  pinned: string;
  pinnedPublishedAt: string;
  registryLatest: string;
  registryLatestPublishedAt: string;
  eligibleLatest: string;
  eligibleLatestPublishedAt: string;
  status: "latest" | "compatibility-hold";
}

interface VersionEvidence {
  schemaVersion: 3;
  auditedAt: string;
  asOf: string;
  registry: "https://registry.npmjs.org";
  bun: string;
  supplyChain: {
    minimumReleaseAgeSeconds: number;
    cutoffAt: string;
    releaseAgeExceptions: [];
  };
  holds: Array<{
    package: string;
    pinned: string;
    reasonCode: string;
    detail: string;
    evidence: string[];
    scopes: string[];
  }>;
  omissions: Array<{
    package: string;
    registryLatest: string;
    registryLatestPublishedAt: string;
    eligibleLatest: string;
    eligibleLatestPublishedAt: string;
    reason: string;
  }>;
  nonNpm: Array<{ scope: string; value: string; reason: string }>;
  lockedReleases: Array<{
    package: string;
    version: string;
    publishedAt: string;
    integrity: string;
  }>;
  pins: EvidencePin[];
  summary: {
    auditedScopes: number;
    uniquePackages: number;
    latestScopes: number;
    compatibilityHeldScopes: number;
    uniqueCompatibilityHolds: number;
    auditedLockfiles: number;
    lockedPackageVersions: number;
    missingPins: number;
    unreviewedPins: number;
  };
}

const PACKAGE_ALIASES: Readonly<Record<string, string>> = {
  typescriptNext: "typescript",
};

const PRERELEASE_IDENTIFIER = "(?:0|[1-9]\\d*|\\d*[A-Za-z-][0-9A-Za-z-]*)";
const BUILD_IDENTIFIER = "[0-9A-Za-z-]+";
const SEMVER =
  `(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)` +
  `(?:-${PRERELEASE_IDENTIFIER}(?:\\.${PRERELEASE_IDENTIFIER})*)?` +
  `(?:\\+${BUILD_IDENTIFIER}(?:\\.${BUILD_IDENTIFIER})*)?`;
export const REGISTRY_SPEC_PATTERN = new RegExp(`^(?:\\^|~)?(${SEMVER})$`);
const STABLE_VERSION_PATTERN = new RegExp(
  `^((?:0|[1-9]\\d*))\\.((?:0|[1-9]\\d*))\\.((?:0|[1-9]\\d*))(?:\\+${BUILD_IDENTIFIER}(?:\\.${BUILD_IDENTIFIER})*)?$`,
);
const DEPENDENCY_SECTIONS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
  "overrides",
] as const;

interface ManifestDependencies {
  dependencies?: Record<string, unknown>;
  devDependencies?: Record<string, unknown>;
  peerDependencies?: Record<string, unknown>;
  optionalDependencies?: Record<string, unknown>;
  overrides?: Record<string, unknown>;
}

interface CollectedPins {
  readonly pins: Pin[];
  readonly failures: string[];
}

/** Only exact, caret, or tilde semver is permitted; protocols and tags fail closed. */
export function registryVersionFromSpec(spec: unknown, allowWorkspace: boolean): string | null {
  if (allowWorkspace && spec === "workspace:*") return null;
  if (typeof spec !== "string")
    throw new Error(`dependency spec must be a string, got ${typeof spec}`);
  const match = REGISTRY_SPEC_PATTERN.exec(spec);
  // JavaScript's `$` also matches immediately before one trailing line break.
  // Requiring the full match prevents a superficially valid version followed by
  // hidden whitespace from entering the release ledger.
  if (!match?.[1] || match[0] !== spec) {
    throw new Error(
      `unsupported dependency spec ${JSON.stringify(spec)}; use exact, ^, or ~ semver${allowWorkspace ? " (or workspace:* for an internal package)" : ""}`,
    );
  }
  return match[1];
}

function stableVersionParts(version: string): readonly [bigint, bigint, bigint] | null {
  const match = STABLE_VERSION_PATTERN.exec(version);
  if (!match?.[1] || !match[2] || !match[3]) return null;
  return [BigInt(match[1]), BigInt(match[2]), BigInt(match[3])];
}

/** Compare stable SemVer versions without accepting prerelease ambiguity. */
export function compareStableVersions(left: string, right: string): number {
  const leftParts = stableVersionParts(left);
  const rightParts = stableVersionParts(right);
  if (!leftParts || !rightParts) {
    throw new Error(
      "stable version comparison requires stable SemVer (" + left + ", " + right + ")",
    );
  }
  for (let index = 0; index < leftParts.length; index += 1) {
    if (leftParts[index]! < rightParts[index]!) return -1;
    if (leftParts[index]! > rightParts[index]!) return 1;
  }
  return left.localeCompare(right);
}

function requiredPublishedAt(
  pkg: string,
  version: string,
  registry: RegistryDocument,
): { value: string; milliseconds: number } {
  if (!registry.versions?.[version]) {
    throw new Error(pkg + "@" + version + " does not exist");
  }
  const value = registry.time?.[version];
  const milliseconds = typeof value === "string" ? Date.parse(value) : Number.NaN;
  if (typeof value !== "string" || !Number.isFinite(milliseconds)) {
    throw new Error(pkg + "@" + version + " has no valid registry publication timestamp");
  }
  return { value, milliseconds };
}

/**
 * Resolve immutable registry facts for the evidence snapshot. Every stable
 * version needs a timestamp so a missing field can never silently bypass age.
 */
export function registryReleaseFacts(
  pkg: string,
  registry: RegistryDocument,
  cutoffMilliseconds: number,
): RegistryReleaseFacts {
  if (!Number.isFinite(cutoffMilliseconds)) {
    throw new Error("release-age cutoff must be a finite timestamp");
  }
  const latest = registry["dist-tags"]?.latest;
  if (typeof latest !== "string" || latest.length === 0) {
    throw new Error(pkg + " has no latest dist-tag");
  }
  const latestPublishedAt = requiredPublishedAt(pkg, latest, registry);
  const stableVersions = Object.keys(registry.versions ?? {}).filter(
    (version) => stableVersionParts(version) !== null,
  );
  const eligible: string[] = [];
  for (const version of stableVersions) {
    const publishedAt = requiredPublishedAt(pkg, version, registry);
    if (publishedAt.milliseconds <= cutoffMilliseconds) eligible.push(version);
  }
  eligible.sort(compareStableVersions);
  const eligibleLatest = eligible.at(-1);
  if (!eligibleLatest) {
    throw new Error(pkg + " has no stable release old enough for the release-age policy");
  }
  const eligibleLatestPublishedAt = requiredPublishedAt(pkg, eligibleLatest, registry);
  return {
    registryLatest: latest,
    registryLatestPublishedAt: latestPublishedAt.value,
    eligibleLatest,
    eligibleLatestPublishedAt: eligibleLatestPublishedAt.value,
  };
}

function manifestPins(
  manifest: ManifestDependencies,
  scopePrefix: string,
  allowWorkspace: boolean,
  source: Pin["source"],
): CollectedPins {
  const pins: Pin[] = [];
  const failures: string[] = [];
  for (const section of DEPENDENCY_SECTIONS) {
    const dependencies = manifest[section];
    if (dependencies === undefined) continue;
    if (!dependencies || typeof dependencies !== "object" || Array.isArray(dependencies)) {
      failures.push(`${scopePrefix}.${section}: dependency section must be an object`);
      continue;
    }
    for (const [pkg, spec] of Object.entries(dependencies)) {
      const scope = `${scopePrefix}.${section}.${pkg}`;
      try {
        const version = registryVersionFromSpec(spec, allowWorkspace);
        if (version) {
          pins.push({
            scope,
            group: `${scopePrefix}.${section}`,
            key: pkg,
            package: pkg,
            source,
            spec: spec as string,
            version,
          });
        }
      } catch (error) {
        failures.push(`${scope}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  return { pins, failures };
}

function catalogPins(nonNpmEvidence: VersionEvidence["nonNpm"]): CollectedPins {
  const pins: Pin[] = [];
  const failures: string[] = [];
  const nonNpm = new Map<string, { value: string; used: boolean }>();
  for (const entry of nonNpmEvidence) {
    if (nonNpm.has(entry.scope)) {
      failures.push(`dependency evidence contains duplicate non-npm scope ${entry.scope}`);
      continue;
    }
    nonNpm.set(entry.scope, { value: entry.value, used: false });
  }
  for (const [group, value] of Object.entries(versions as Record<string, unknown>)) {
    if (!value || typeof value !== "object" || group === "catalog" || group === "supplyChain")
      continue;
    for (const [key, spec] of Object.entries(value as Record<string, unknown>)) {
      const scope = `${group}.${key}`;
      try {
        const version = registryVersionFromSpec(spec, false);
        if (version) {
          pins.push({
            scope,
            group,
            key,
            package: PACKAGE_ALIASES[key] ?? key,
            source: "catalog",
            spec: spec as string,
            version,
          });
        }
      } catch (error) {
        const omission = nonNpm.get(scope);
        if (typeof spec === "string" && omission?.value === spec) {
          omission.used = true;
          continue;
        }
        failures.push(`${scope}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  for (const [scope, entry] of nonNpm) {
    if (!entry.used) failures.push(`dependency evidence contains stale non-npm scope ${scope}`);
  }
  return { pins, failures };
}

function hostPins(host: ManifestDependencies): CollectedPins {
  return manifestPins(host, "host", false, "host");
}

/** Also verify package names as emitted, catching a valid version used for the wrong package. */
function generatedPins(): CollectedPins {
  const base: ProjectConfig = {
    name: "demo",
    runtime: "bun",
    version: "0.1.0",
    mode: "monorepo",
    billing: ["stripe", "chargily", "paddle", "polar"],
    features: ["eve", "i18n"],
    database: "postgres",
    framework: "nextjs",
    apps: ["web", "mobile", "desktop"],
  } as ProjectConfig;
  const corners: ProjectConfig[] = [
    base,
    {
      ...base,
      preset: "custom",
      auth: true,
      api: true,
      email: true,
      analytics: true,
      pdf: true,
      messaging: true,
      storage: true,
      notifications: true,
      featureFlags: "posthog",
      jobs: true,
      jobsUserFacingApi: true,
      cache: "redis",
    },
    { ...base, framework: "tanstack-start", features: ["i18n"] },
    { ...base, database: "convex", features: ["i18n"] },
    { ...base, mode: "single", apps: ["web"] },
    { ...base, mode: "single", framework: "tanstack-start", apps: ["web"], features: ["i18n"] },
    {
      ...base,
      database: "convex",
      billing: [],
      deploy: "cloudflare",
      features: ["i18n"],
    },
    {
      ...base,
      mode: "single",
      framework: "tanstack-start",
      apps: ["web"],
      database: "convex",
      billing: [],
      deploy: "cloudflare",
      features: ["i18n"],
    },
  ] as ProjectConfig[];

  const pins = new Map<string, Pin>();
  const failures: string[] = [];
  for (const config of corners) {
    for (const generated of generateProjectFiles(config, { dryRun: false })) {
      if (!generated.path.endsWith("package.json")) continue;
      let manifest: ManifestDependencies;
      try {
        manifest = JSON.parse(generated.content) as ManifestDependencies;
      } catch (error) {
        failures.push(
          `generated:${generated.path}: invalid package.json: ${error instanceof Error ? error.message : String(error)}`,
        );
        continue;
      }
      const collected = manifestPins(manifest, `generated:${generated.path}`, true, "generated");
      failures.push(...collected.failures);
      for (const pin of collected.pins) {
        const key = `${pin.package}@${pin.version}`;
        if (!pins.has(key)) {
          pins.set(key, pin);
        }
      }
    }
  }
  return { pins: [...pins.values()], failures };
}

function fixturePins(): CollectedPins {
  const root = fileURLToPath(new URL("../tests/fixtures/compatibility/", import.meta.url));
  const pins = new Map<string, Pin>();
  const failures: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const path = join(root, entry.name, "package.json");
    let manifest: ManifestDependencies;
    try {
      manifest = JSON.parse(readFileSync(path, "utf8")) as ManifestDependencies;
    } catch (error) {
      failures.push(
        `fixture:${entry.name}: invalid package.json: ${error instanceof Error ? error.message : String(error)}`,
      );
      continue;
    }
    const collected = manifestPins(manifest, `fixture:${entry.name}`, false, "fixture");
    failures.push(...collected.failures);
    for (const pin of collected.pins) pins.set(`${pin.package}@${pin.version}`, pin);
  }
  return { pins: [...pins.values()], failures };
}

export interface RegistryVersionSnapshot {
  deprecated: string | null;
  publishedAt: string;
  publishedAtMilliseconds: number;
  integrity: string;
}

export interface RecordedReleaseSnapshot {
  registryLatest: string;
  registryLatestPublishedAt: string;
  eligibleLatest: string;
  eligibleLatestPublishedAt: string;
}

/** Validate immutable audit facts while allowing only cutoff-irrelevant dist-tag drift. */
export function releaseSnapshotFailures(
  pkg: string,
  recorded: RecordedReleaseSnapshot,
  observed: RegistryReleaseFacts,
  observedVersions: ReadonlyMap<string, RegistryVersionSnapshot>,
  cutoffMilliseconds: number,
  auditedAtMilliseconds: number,
): string[] {
  const failures: string[] = [];
  const recordedLatest = observedVersions.get(recorded.registryLatest);
  if (!recordedLatest) {
    failures.push(`${pkg}: recorded registry latest ${recorded.registryLatest} disappeared`);
  } else {
    if (recordedLatest.publishedAt !== recorded.registryLatestPublishedAt) {
      failures.push(`${pkg}: recorded registry-latest publication timestamp changed`);
    }
    if (recordedLatest.publishedAtMilliseconds > auditedAtMilliseconds) {
      failures.push(`${pkg}: recorded registry latest was published after auditedAt`);
    }
  }

  if (recorded.eligibleLatest !== observed.eligibleLatest) {
    failures.push(
      `${pkg}: eligible latest changed from ${recorded.eligibleLatest} to ${observed.eligibleLatest} for the audited cutoff`,
    );
  }
  if (recorded.eligibleLatestPublishedAt !== observed.eligibleLatestPublishedAt) {
    failures.push(`${pkg}: eligible-latest publication timestamp changed`);
  }

  if (recorded.registryLatest !== observed.registryLatest) {
    const observedLatest = observedVersions.get(observed.registryLatest);
    if (!observedLatest) {
      failures.push(`${pkg}: observed registry latest ${observed.registryLatest} has no metadata`);
    } else if (observedLatest.publishedAtMilliseconds <= cutoffMilliseconds) {
      failures.push(
        `${pkg}: newly observed registry latest ${observed.registryLatest} was published by the audited cutoff`,
      );
    }
  }
  return failures;
}

interface RegistrySnapshot {
  release: RegistryReleaseFacts | null;
  versions: ReadonlyMap<string, RegistryVersionSnapshot>;
}

type RegistryLookup = { snapshot: RegistrySnapshot; error?: never } | { error: string };

function createRegistryLoader(
  requestedVersions: ReadonlyMap<string, ReadonlySet<string>>,
  releaseMetadataPackages: ReadonlySet<string>,
  cutoffMilliseconds: number,
): (pkg: string) => Promise<RegistryLookup> {
  const cache = new Map<string, Promise<RegistryLookup>>();
  return (pkg: string): Promise<RegistryLookup> => {
    const cached = cache.get(pkg);
    if (cached) return cached;
    const pending = (async (): Promise<RegistryLookup> => {
      try {
        const response = await fetch("https://registry.npmjs.org/" + encodeURIComponent(pkg), {
          // Publication times are intentionally omitted from the abbreviated
          // install-v1 packument, so the release-age gate needs the full record.
          headers: { accept: "application/json" },
        });
        if (!response.ok) {
          return { error: pkg + ": registry returned HTTP " + response.status };
        }
        const registry = (await response.json()) as RegistryDocument;
        const release = releaseMetadataPackages.has(pkg)
          ? registryReleaseFacts(pkg, registry, cutoffMilliseconds)
          : null;
        const versionsToKeep = new Set(requestedVersions.get(pkg) ?? []);
        if (release) {
          versionsToKeep.add(release.registryLatest);
          versionsToKeep.add(release.eligibleLatest);
        }
        const projected = new Map<string, RegistryVersionSnapshot>();
        for (const version of versionsToKeep) {
          const publishedAt = requiredPublishedAt(pkg, version, registry);
          const integrity = registry.versions?.[version]?.dist?.integrity;
          if (!isSha512Integrity(integrity)) {
            throw new Error(pkg + "@" + version + " has no canonical sha512 registry integrity");
          }
          projected.set(version, {
            deprecated: registry.versions?.[version]?.deprecated ?? null,
            publishedAt: publishedAt.value,
            publishedAtMilliseconds: publishedAt.milliseconds,
            integrity,
          });
        }
        return { snapshot: { release, versions: projected } };
      } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
      }
    })();
    cache.set(pkg, pending);
    return pending;
  };
}

async function main(): Promise<void> {
  const host = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  ) as ManifestDependencies & { version?: unknown };
  if (host.version !== versions.ghostinitVersion) {
    throw new Error(
      `GhostInit version mismatch: package.json=${String(host.version)}, registry=${versions.ghostinitVersion}`,
    );
  }

  const evidenceDocument: unknown = JSON.parse(
    readFileSync(
      new URL("../evidence/compatibility/dependency-versions.json", import.meta.url),
      "utf8",
    ),
  );
  const evidenceSchema = JSON.parse(
    readFileSync(
      new URL("../evidence/compatibility/dependency-versions.schema.json", import.meta.url),
      "utf8",
    ),
  ) as AnySchema;
  const ajv = new Ajv2020({ allErrors: true, strict: true, validateFormats: false });
  if (!ajv.validate(evidenceSchema, evidenceDocument)) {
    throw new Error(`Dependency evidence is schema-invalid: ${JSON.stringify(ajv.errors)}`);
  }
  const evidence = evidenceDocument as VersionEvidence;
  if (
    evidence.bun !== versions.runtime.bun ||
    evidence.registry !== "https://registry.npmjs.org" ||
    evidence.supplyChain.minimumReleaseAgeSeconds !==
      versions.supplyChain.minimumReleaseAgeSeconds ||
    evidence.supplyChain.releaseAgeExceptions.length !== 0 ||
    evidence.summary.missingPins !== 0 ||
    evidence.summary.unreviewedPins !== 0 ||
    !Array.isArray(evidence.nonNpm)
  ) {
    throw new Error(
      "Dependency evidence does not match the selected Bun runtime or has unreviewed pins.",
    );
  }
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(evidence.asOf) ||
    Number.isNaN(Date.parse(evidence.auditedAt)) ||
    evidence.auditedAt.slice(0, 10) !== evidence.asOf
  ) {
    throw new Error("Dependency evidence has an invalid or internally inconsistent audit date.");
  }
  const { auditedAtMilliseconds, cutoffMilliseconds, cutoffAt } = releaseAgeWindow(
    evidence.auditedAt,
    versions.supplyChain.minimumReleaseAgeSeconds,
  );
  if (evidence.supplyChain.cutoffAt !== cutoffAt) {
    throw new Error(
      `Dependency evidence release-age cutoff is stale: expected ${cutoffAt}, got ${evidence.supplyChain.cutoffAt}`,
    );
  }

  const catalog = catalogPins(evidence.nonNpm);
  const hostDependencies = hostPins(host);
  const generated = generatedPins();
  const fixtures = fixturePins();
  const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
  const locks = collectRepositoryLockedPins(repositoryRoot);
  const specFailures = [
    ...catalog.failures,
    ...hostDependencies.failures,
    ...generated.failures,
    ...fixtures.failures,
    ...locks.failures,
  ];
  if (specFailures.length > 0) {
    for (const failure of specFailures) console.error(`INVALID ${failure}`);
    throw new Error(`${specFailures.length} unsupported dependency spec(s)`);
  }

  const audited = [...catalog.pins, ...hostDependencies.pins];
  const emitted = [...generated.pins, ...fixtures.pins];
  const currentLockedVersions = new Map(
    locks.pins.map((pin) => [`${pin.package}@${pin.version}`, pin]),
  );
  const lockedReleaseEvidence = new Map(
    evidence.lockedReleases.map((entry) => [`${entry.package}@${entry.version}`, entry]),
  );
  if (lockedReleaseEvidence.size !== evidence.lockedReleases.length) {
    throw new Error("Dependency evidence contains duplicate locked package releases");
  }
  if (currentLockedVersions.size !== lockedReleaseEvidence.size) {
    throw new Error(
      `Dependency locked-release evidence count is stale: current=${currentLockedVersions.size}, evidence=${lockedReleaseEvidence.size}`,
    );
  }
  for (const key of currentLockedVersions.keys()) {
    if (!lockedReleaseEvidence.has(key)) {
      throw new Error(`Dependency evidence is missing locked release ${key}`);
    }
  }
  for (const key of lockedReleaseEvidence.keys()) {
    if (!currentLockedVersions.has(key)) {
      throw new Error(`Dependency evidence contains stale locked release ${key}`);
    }
  }
  const requestedVersions = new Map<string, Set<string>>();
  const requestRegistryVersion = (pkg: string, version?: string): void => {
    const requested = requestedVersions.get(pkg) ?? new Set<string>();
    if (version) requested.add(version);
    requestedVersions.set(pkg, requested);
  };
  for (const pin of [...audited, ...emitted, ...locks.pins]) {
    requestRegistryVersion(pin.package, pin.version);
  }
  for (const pin of evidence.pins) requestRegistryVersion(pin.package, pin.registryLatest);
  for (const omission of evidence.omissions) {
    requestRegistryVersion(omission.package, omission.registryLatest);
  }
  const releaseMetadataPackages = new Set([
    ...[...audited, ...emitted].map((pin) => pin.package),
    ...evidence.omissions.map((omission) => omission.package),
  ]);
  const registryPackages = [...requestedVersions.keys()].sort();
  const fetchRegistry = createRegistryLoader(
    requestedVersions,
    releaseMetadataPackages,
    cutoffMilliseconds,
  );
  for (let index = 0; index < registryPackages.length; index += 16) {
    await Promise.all(registryPackages.slice(index, index + 16).map((pkg) => fetchRegistry(pkg)));
  }
  const auditedScopes = new Map(audited.map((pin) => [pin.scope, pin]));
  const evidencePins = new Map(evidence.pins.map((pin) => [pin.scope, pin]));
  if (auditedScopes.size !== audited.length) {
    throw new Error("Current catalog/host collection contains duplicate audit scopes");
  }
  if (evidencePins.size !== evidence.pins.length) {
    throw new Error("Dependency evidence contains duplicate pin scopes");
  }
  if (auditedScopes.size !== evidence.summary.auditedScopes) {
    throw new Error(
      `Dependency evidence scope count is stale: current=${auditedScopes.size}, evidence=${evidence.summary.auditedScopes}`,
    );
  }
  for (const scope of evidencePins.keys()) {
    if (!auditedScopes.has(scope))
      throw new Error(`Dependency evidence contains stale scope ${scope}`);
  }

  const holdScopes = new Map<string, Set<string>>();
  const heldScopeOwners = new Map<string, string>();
  for (const hold of evidence.holds) {
    const key = `${hold.package}@${hold.pinned}`;
    if (holdScopes.has(key)) {
      throw new Error(`Dependency evidence contains duplicate compatibility hold ${key}`);
    }
    const scopes = new Set(hold.scopes);
    if (scopes.size !== hold.scopes.length) {
      throw new Error(`Dependency evidence hold ${key} contains duplicate scopes`);
    }
    for (const scope of scopes) {
      const previous = heldScopeOwners.get(scope);
      if (previous) {
        throw new Error(
          `Dependency evidence scope ${scope} is held by both ${previous} and ${key}`,
        );
      }
      const recorded = evidencePins.get(scope);
      if (
        !recorded ||
        recorded.package !== hold.package ||
        recorded.pinned !== hold.pinned ||
        recorded.status !== "compatibility-hold"
      ) {
        throw new Error(
          `Dependency evidence contains stale compatibility hold ${key} for ${scope}`,
        );
      }
      heldScopeOwners.set(scope, key);
    }
    holdScopes.set(key, scopes);
  }

  const omissionPackages = new Set<string>();
  for (const omission of evidence.omissions) {
    if (omissionPackages.has(omission.package)) {
      throw new Error(`Dependency evidence contains duplicate omission ${omission.package}`);
    }
    omissionPackages.add(omission.package);
    if (audited.some((pin) => pin.package === omission.package)) {
      throw new Error(`Dependency evidence omission ${omission.package} is now an audited pin`);
    }
    const lookup = await fetchRegistry(omission.package);
    if ("error" in lookup) {
      throw new Error(`Dependency evidence omission ${omission.package}: ${lookup.error}`);
    }
    const release = lookup.snapshot.release;
    if (!release) {
      throw new Error(`Dependency evidence omission ${omission.package} has no release metadata`);
    }
    const snapshotFailures = releaseSnapshotFailures(
      omission.package,
      omission,
      release,
      lookup.snapshot.versions,
      cutoffMilliseconds,
      auditedAtMilliseconds,
    );
    if (snapshotFailures.length > 0) {
      throw new Error(
        `Dependency evidence omission ${omission.package} has stale release metadata: ${snapshotFailures.join("; ")}`,
      );
    }
  }

  const failures: string[] = [];
  let latestCount = 0;
  let heldCount = 0;
  console.log(
    `Checking ${audited.length} catalog/host pins, generated/fixture manifests, and ${locks.lockfiles.length} Bun locks against npm releases published by ${cutoffAt}...`,
  );

  for (const pin of audited) {
    const lookup = await fetchRegistry(pin.package);
    if ("error" in lookup) {
      failures.push(`${pin.scope}: registry lookup failed for ${pin.package}: ${lookup.error}`);
      continue;
    }
    const metadata = lookup.snapshot.versions.get(pin.version);
    const release = lookup.snapshot.release;
    if (!release) {
      failures.push(`${pin.scope}: registry release metadata is unavailable for ${pin.package}`);
      continue;
    }
    const isEligibleLatest = pin.version === release.eligibleLatest;
    const approved = holdScopes.get(`${pin.package}@${pin.version}`)?.has(pin.scope) === true;
    if (isEligibleLatest) latestCount += 1;
    else if (approved) heldCount += 1;
    if (!metadata) {
      failures.push(`${pin.scope}: ${pin.package}@${pin.version} does not exist`);
      continue;
    }
    if (metadata.publishedAtMilliseconds > cutoffMilliseconds) {
      failures.push(
        `${pin.scope}: ${pin.package}@${pin.version} was published ${metadata.publishedAt}, after release-age cutoff ${cutoffAt}`,
      );
    }
    const recorded = evidencePins.get(pin.scope);
    if (
      !recorded ||
      recorded.package !== pin.package ||
      recorded.group !== pin.group ||
      recorded.key !== pin.key ||
      recorded.source !== pin.source ||
      recorded.exists !== true ||
      recorded.pinned !== pin.version ||
      recorded.pinnedPublishedAt !== metadata.publishedAt ||
      recorded.currentDeprecated !== metadata.deprecated
    ) {
      failures.push(
        `${pin.scope}: audit evidence is missing or stale: identity or pinned release facts changed`,
      );
      continue;
    }
    for (const failure of releaseSnapshotFailures(
      pin.package,
      recorded,
      release,
      lookup.snapshot.versions,
      cutoffMilliseconds,
      auditedAtMilliseconds,
    )) {
      failures.push(`${pin.scope}: ${failure}`);
    }
    if (isEligibleLatest) {
      if (recorded.status !== "latest") failures.push(`${pin.scope}: latest pin is mislabeled`);
      if (metadata.deprecated)
        failures.push(`${pin.scope}: latest pin is deprecated: ${metadata.deprecated}`);
      continue;
    }
    if (recorded.status !== "compatibility-hold" || !approved) {
      failures.push(
        `${pin.scope}: ${pin.package}@${pin.version} differs from eligible latest ${release.eligibleLatest} without a hold`,
      );
    }
  }

  const expectedSummary = {
    auditedScopes: audited.length,
    uniquePackages: new Set(audited.map((pin) => pin.package)).size,
    latestScopes: latestCount,
    compatibilityHeldScopes: heldCount,
    uniqueCompatibilityHolds: holdScopes.size,
    auditedLockfiles: locks.lockfiles.length,
    lockedPackageVersions: new Set(locks.pins.map((pin) => `${pin.package}@${pin.version}`)).size,
    missingPins: 0,
    unreviewedPins: 0,
  };
  for (const [field, expected] of Object.entries(expectedSummary)) {
    const actual = evidence.summary[field as keyof typeof expectedSummary];
    if (actual !== expected) {
      failures.push(`summary.${field}: evidence=${actual}, current=${expected}`);
    }
  }

  const knownPinVersions = new Set(audited.map((pin) => `${pin.package}@${pin.version}`));
  for (const pin of emitted) {
    const lookup = await fetchRegistry(pin.package);
    if ("error" in lookup) {
      failures.push(`${pin.scope}: registry lookup failed for ${pin.package}: ${lookup.error}`);
      continue;
    }
    const metadata = lookup.snapshot.versions.get(pin.version);
    if (!metadata) {
      failures.push(
        `${pin.scope}: emitted ${pin.package}@${pin.spec} (base ${pin.version}) does not exist`,
      );
      continue;
    }
    if (metadata.publishedAtMilliseconds > cutoffMilliseconds) {
      failures.push(
        `${pin.scope}: emitted ${pin.package}@${pin.spec} was published ${metadata.publishedAt}, after release-age cutoff ${cutoffAt}`,
      );
      continue;
    }
    if (knownPinVersions.has(`${pin.package}@${pin.version}`)) continue;
    const release = lookup.snapshot.release;
    if (!release) {
      failures.push(`${pin.scope}: registry release metadata is unavailable for ${pin.package}`);
      continue;
    }
    const eligibleLatest = release.eligibleLatest;
    if (pin.version !== eligibleLatest && !holdScopes.has(`${pin.package}@${pin.version}`)) {
      failures.push(
        `${pin.scope}: emitted unreviewed ${pin.package}@${pin.spec} (base ${pin.version}, eligible latest ${eligibleLatest})`,
      );
    } else if (pin.version === eligibleLatest && metadata.deprecated) {
      failures.push(`${pin.scope}: emitted latest pin is deprecated: ${metadata.deprecated}`);
    }
  }

  for (const pin of locks.pins) {
    const lookup = await fetchRegistry(pin.package);
    if ("error" in lookup) {
      failures.push(
        `${pin.lockfile}:${pin.key}: registry lookup failed for ${pin.package}: ${lookup.error}`,
      );
      continue;
    }
    const metadata = lookup.snapshot.versions.get(pin.version);
    if (!metadata) {
      failures.push(
        `${pin.lockfile}:${pin.key}: locked ${pin.package}@${pin.version} does not exist`,
      );
      continue;
    }
    const recorded = lockedReleaseEvidence.get(`${pin.package}@${pin.version}`);
    if (
      !recorded ||
      recorded.publishedAt !== metadata.publishedAt ||
      recorded.integrity !== metadata.integrity ||
      pin.integrity !== metadata.integrity
    ) {
      failures.push(
        `${pin.lockfile}:${pin.key}: locked publication or integrity evidence is missing or stale for ${pin.package}@${pin.version}`,
      );
      continue;
    }
    if (metadata.publishedAtMilliseconds > cutoffMilliseconds) {
      failures.push(
        `${pin.lockfile}:${pin.key}: locked ${pin.package}@${pin.version} was published ${metadata.publishedAt}, after release-age cutoff ${cutoffAt}`,
      );
    }
  }

  if (failures.length > 0) {
    for (const failure of failures) console.error(`INVALID ${failure}`);
    console.error(`\n${failures.length} dependency audit failure(s).`);
    process.exit(1);
  }
  console.log(
    `All pins exist and meet the ${versions.supplyChain.minimumReleaseAgeSeconds}-second age gate: ${latestCount} eligible-latest scopes, ${heldCount} compatibility holds, ${expectedSummary.lockedPackageVersions} locked package versions.`,
  );
}

if (import.meta.main) await main();
