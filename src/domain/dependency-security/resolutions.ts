import { supplyChain } from "../../../packages/versions/src/index.js";
import { deepFreeze } from "../project/canonical.js";
import { isWindowsReservedDeviceName } from "../project/choices.js";
import type { DependencySecurityResolution, DependencySecurityResolutions } from "./types.js";
import { isCompatibleSecurityVersion, securityRangeBase, securityVersion } from "./versions.js";

const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
const ADVISORY_ID =
  /^GHSA-[23456789cfghjmpqrvwx]{4}-[23456789cfghjmpqrvwx]{4}-[23456789cfghjmpqrvwx]{4}$/;
const INTEGRITY = /^sha512-[A-Za-z0-9+/]{85}[AQgw]==$/;
const ISO_TIMESTAMP = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/;
const DEPENDENCY_FIELDS = new Set([
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
  "overrides",
  "catalog",
]);
const UNSAFE_COMPONENTS = new Set([
  "node_modules",
  ".git",
  ".ghostinit",
  "__proto__",
  "constructor",
  "prototype",
]);

export class DependencySecurityResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DependencySecurityResolutionError";
  }
}

function invalid(message: string): never {
  throw new DependencySecurityResolutionError(message);
}

function record(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    invalid(`${label} must be an object`);
  const actual = Object.keys(value);
  if (actual.length !== keys.length || actual.some((key) => !keys.includes(key))) {
    invalid(`${label} has missing or unsupported fields`);
  }
  return value as Record<string, unknown>;
}

export function isSecurityManifestPath(path: string): boolean {
  if (path === "package.json") return true;
  const segments = path.split("/");
  return (
    segments.length > 1 &&
    segments.length <= 32 &&
    path.length <= 1024 &&
    segments.at(-1) === "package.json" &&
    segments.every(
      (segment) =>
        /^[a-zA-Z0-9._-]+$/.test(segment) &&
        segment !== "." &&
        segment !== ".." &&
        !segment.endsWith(".") &&
        !UNSAFE_COMPONENTS.has(segment.toLowerCase()) &&
        !isWindowsReservedDeviceName(segment),
    )
  );
}

function timestamp(value: unknown, label: string): number {
  if (typeof value !== "string" || !ISO_TIMESTAMP.test(value))
    invalid(`${label} must be an ISO UTC timestamp`);
  const time = Date.parse(value);
  if (
    !Number.isFinite(time) ||
    new Date(time).toISOString() !== value.replace(/Z$/, value.includes(".") ? "Z" : ".000Z")
  ) {
    invalid(`${label} is not a real UTC timestamp`);
  }
  return time;
}

export function dependencySecurityResolutionKey(resolution: DependencySecurityResolution): string {
  return JSON.stringify([resolution.manifestPath, ...resolution.field]);
}

function normalizeResolution(input: unknown): DependencySecurityResolution {
  const item = record(
    input,
    [
      "manifestPath",
      "field",
      "package",
      "originalSpec",
      "version",
      "integrity",
      "publishedAt",
      "auditedAt",
      "advisories",
    ],
    "Security resolution",
  );
  if (typeof item.manifestPath !== "string" || !isSecurityManifestPath(item.manifestPath))
    invalid("Security resolution has an unsafe manifest path");
  if (
    typeof item.package !== "string" ||
    item.package.length > 214 ||
    !PACKAGE_NAME.test(item.package) ||
    UNSAFE_COMPONENTS.has(item.package)
  )
    invalid("Security resolution has an invalid package name");
  if (!Array.isArray(item.field) || !item.field.every((part) => typeof part === "string"))
    invalid("Security resolution has an invalid dependency field");
  const field = item.field as string[];
  const declaration = field[0] === "workspaces" ? field.slice(1) : field;
  const catalogName = declaration[1];
  const validField =
    (field.length === 2 && DEPENDENCY_FIELDS.has(field[0])) ||
    (declaration.length === 2 && declaration[0] === "catalog") ||
    (declaration.length === 3 &&
      declaration[0] === "catalogs" &&
      /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(catalogName) &&
      !UNSAFE_COMPONENTS.has(catalogName));
  if (!validField || field.at(-1) !== item.package)
    invalid("Security resolution field must name its package");
  if (typeof item.originalSpec !== "string" || !securityRangeBase(item.originalSpec))
    invalid("Security resolution requires a stable exact, caret, or tilde original range");
  if (
    typeof item.version !== "string" ||
    !securityVersion(item.version) ||
    !isCompatibleSecurityVersion(item.originalSpec, item.version)
  )
    invalid("Security resolution version is outside the original compatible release family");
  if (typeof item.integrity !== "string" || !INTEGRITY.test(item.integrity))
    invalid("Security resolution requires a SHA-512 integrity value");
  const published = timestamp(item.publishedAt, "publishedAt");
  const audited = timestamp(item.auditedAt, "auditedAt");
  if (audited - published < supplyChain.minimumReleaseAgeSeconds * 1000)
    invalid("Security resolution does not satisfy the minimum release age at audit time");
  if (
    !Array.isArray(item.advisories) ||
    item.advisories.length === 0 ||
    item.advisories.length > 128 ||
    !item.advisories.every((value) => typeof value === "string" && ADVISORY_ID.test(value))
  )
    invalid("Security resolution requires recognized advisory IDs");
  return {
    manifestPath: item.manifestPath,
    field: [...field] as unknown as DependencySecurityResolution["field"],
    package: item.package,
    originalSpec: item.originalSpec,
    version: item.version,
    integrity: item.integrity,
    publishedAt: new Date(published).toISOString(),
    auditedAt: new Date(audited).toISOString(),
    advisories: [...new Set(item.advisories as string[])].sort(),
  };
}

/** No clock or network access: evidence records eligibility at their audited time. */
export function normalizeDependencySecurityResolutions(
  value: unknown,
): DependencySecurityResolutions {
  const document = record(value, ["schemaVersion", "resolutions"], "Dependency security");
  if (
    document.schemaVersion !== 1 ||
    !Array.isArray(document.resolutions) ||
    document.resolutions.length > 512
  )
    invalid("Dependency security must use schemaVersion 1 with at most 512 resolutions");
  const resolutions = document.resolutions.map(normalizeResolution);
  const keys = resolutions.map(dependencySecurityResolutionKey);
  if (new Set(keys).size !== keys.length)
    invalid("Dependency security declares the same dependency field more than once");
  resolutions.sort((left, right) => {
    const a = dependencySecurityResolutionKey(left);
    const b = dependencySecurityResolutionKey(right);
    return a < b ? -1 : a > b ? 1 : 0;
  });
  return deepFreeze({ schemaVersion: 1, resolutions });
}
