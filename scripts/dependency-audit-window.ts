import { supplyChain } from "../packages/versions/src/index.js";
import { isSha512Integrity, releaseAgeWindow } from "./lock-age-policy.js";

export interface PinAuditWindow {
  scope: string;
  package: string;
  version: string;
  publishedAt: string;
  auditedAt: string;
  cutoffAt: string;
}

/** Incremental verification binds one exact release; it never changes lock/install policy. */
export function exactPinAuditWindow(
  current: { scope: string; package: string; version: string },
  recorded: { pinnedPublishedAt: string; auditWindow: PinAuditWindow },
  baselineAuditedAt: string,
  minimumReleaseAgeSeconds: number,
  nowMilliseconds = Date.now(),
): ReturnType<typeof releaseAgeWindow> {
  const audit = recorded.auditWindow;
  if (
    audit.scope !== current.scope ||
    audit.package !== current.package ||
    audit.version !== current.version ||
    audit.publishedAt !== recorded.pinnedPublishedAt
  )
    throw new Error(
      "Incremental dependency audit does not match the exact pin and publication facts.",
    );
  const window = releaseAgeWindow(audit.auditedAt, minimumReleaseAgeSeconds, nowMilliseconds);
  if (window.auditedAtMilliseconds <= Date.parse(baselineAuditedAt))
    throw new Error("Incremental dependency audit must be newer than the baseline snapshot.");
  if (window.cutoffAt !== audit.cutoffAt)
    throw new Error(
      "Incremental dependency audit cutoff must preserve the full release-age policy.",
    );
  const publication = Date.parse(audit.publishedAt);
  if (!Number.isFinite(publication) || publication > window.cutoffMilliseconds)
    throw new Error("Incremental dependency audit release does not meet the minimum age.");
  return window;
}

export interface LockedReleaseEvidence {
  package: string;
  version: string;
  publishedAt: string;
  integrity: string;
  auditWindow?: LockedReleaseAuditWindow;
}

export interface LockedReleaseAuditWindow {
  scope: "locked-release";
  package: string;
  version: string;
  publishedAt: string;
  integrity: string;
  auditedAt: string;
  cutoffAt: string;
}

function recordWithStrings(
  value: unknown,
  fields: readonly string[],
  optionalFields: readonly string[] = [],
): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).every((key) => fields.includes(key) || optionalFields.includes(key)) &&
    fields.every(
      (key) =>
        Object.hasOwn(value, key) &&
        typeof (value as Record<string, unknown>)[key] === "string" &&
        (value as Record<string, string>)[key]!.length > 0,
    )
  );
}

/** A lock window authorizes only this release and SRI; absent windows retain the baseline. */
export function exactLockedReleaseAuditWindow(
  current: { package: string; version: string; integrity: string },
  recorded: unknown,
  baselineAuditedAt: string,
  minimumReleaseAgeSeconds: number,
  nowMilliseconds = Date.now(),
): ReturnType<typeof releaseAgeWindow> {
  if (minimumReleaseAgeSeconds !== supplyChain.minimumReleaseAgeSeconds)
    throw new Error("Locked-release audits require the full 604800-second release-age policy.");
  if (typeof baselineAuditedAt !== "string")
    throw new Error("Dependency evidence baseline auditedAt must be a valid timestamp.");
  const baseline = releaseAgeWindow(baselineAuditedAt, minimumReleaseAgeSeconds, nowMilliseconds);
  const releaseFields = ["package", "version", "publishedAt", "integrity"];
  if (
    !recordWithStrings(recorded, releaseFields, ["auditWindow"]) ||
    !isSha512Integrity(recorded.integrity)
  )
    throw new Error("Dependency evidence contains a malformed locked release.");
  if (
    recorded.package !== current.package ||
    recorded.version !== current.version ||
    recorded.integrity !== current.integrity
  )
    throw new Error("Locked-release audit does not match the exact lock tuple.");

  let window = baseline;
  if (Object.hasOwn(recorded, "auditWindow")) {
    const audit = recorded.auditWindow;
    if (
      !recordWithStrings(audit, [...releaseFields, "scope", "auditedAt", "cutoffAt"]) ||
      !isSha512Integrity(audit.integrity)
    )
      throw new Error("Dependency evidence contains a malformed locked-release audit window.");
    if (
      audit.scope !== "locked-release" ||
      releaseFields.some((field) => audit[field] !== recorded[field])
    )
      throw new Error("Locked-release audit does not match the exact release and integrity facts.");
    window = releaseAgeWindow(audit.auditedAt as string, minimumReleaseAgeSeconds, nowMilliseconds);
    if (window.auditedAtMilliseconds <= baseline.auditedAtMilliseconds)
      throw new Error("Locked-release audit must be newer than the baseline snapshot.");
    if (audit.cutoffAt !== window.cutoffAt)
      throw new Error("Locked-release audit cutoff must preserve the full release-age policy.");
  }
  const publication = Date.parse(recorded.publishedAt as string);
  if (!Number.isFinite(publication))
    throw new Error("Dependency evidence has an invalid locked-release publication time.");
  if (publication > window.cutoffMilliseconds)
    throw new Error(
      current.package +
        "@" +
        current.version +
        " was published " +
        recorded.publishedAt +
        ", after release-age cutoff " +
        window.cutoffAt,
    );
  return window;
}
