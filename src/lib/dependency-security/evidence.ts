import { hashContent } from "../checksum.js";
import type { DependencySecurityPolicy, SecurityLockEvidence } from "./runtime-types.js";
import {
  invalid,
  list,
  packageName,
  parseJson,
  record,
  SHA512,
  utcTimestamp,
} from "./validation.js";

/** Parse only after the canonical auditor has verified the candidate graph. */
export function parseSecurityLockEvidence(
  source: string,
  lockContent: string,
  policy: DependencySecurityPolicy,
): SecurityLockEvidence {
  const value = record(parseJson(source, "lock evidence"), "lock evidence", [
    "schemaVersion",
    "registry",
    "minimumReleaseAgeSeconds",
    "auditedAt",
    "lockSha256",
    "releases",
  ]);
  if (
    value.schemaVersion !== 1 ||
    value.registry !== "https://registry.npmjs.org" ||
    value.minimumReleaseAgeSeconds !== policy.minimumReleaseAgeSeconds ||
    value.lockSha256 !== hashContent(lockContent)
  )
    invalid("lock evidence does not describe the verified lock and policy");
  const auditedAt = utcTimestamp(value.auditedAt, "lock audit time");
  if (Date.parse(auditedAt) > Date.now() + 1000)
    invalid("lock evidence audit time is in the future");
  const identities = new Set<string>();
  const releases = list(value.releases, "locked releases").map((raw) => {
    const release = record(raw, "locked release", [
      "package",
      "version",
      "publishedAt",
      "integrity",
    ]);
    const name = packageName(release.package);
    if (
      typeof release.version !== "string" ||
      !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(
        release.version,
      )
    )
      invalid("lock evidence has an invalid registry version");
    const identity = `${name}@${release.version}`;
    if (identities.has(identity)) invalid("lock evidence repeats a package release");
    identities.add(identity);
    if (typeof release.integrity !== "string" || !SHA512.test(release.integrity))
      invalid("lock evidence has an invalid SHA512 integrity");
    const publishedAt = utcTimestamp(release.publishedAt, "release publication time");
    if (Date.parse(auditedAt) - Date.parse(publishedAt) < policy.minimumReleaseAgeSeconds * 1000)
      invalid("lock evidence contains a release younger than policy allows");
    const protectedVersion = policy.protectedPackageVersions?.[name];
    if (protectedVersion !== undefined && protectedVersion !== release.version)
      invalid("lock evidence changed a protected package version");
    return { package: name, version: release.version, integrity: release.integrity, publishedAt };
  });
  return {
    schemaVersion: 1,
    registry: "https://registry.npmjs.org",
    minimumReleaseAgeSeconds: policy.minimumReleaseAgeSeconds,
    auditedAt,
    lockSha256: value.lockSha256 as string,
    releases,
  };
}
