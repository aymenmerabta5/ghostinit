import type {
  DependencySecurityAdvisory,
  DependencySecuritySeverity,
} from "../../domain/dependency-security/types.js";
import {
  compareSecurityVersions,
  securityRangeBase,
  securityVersion,
} from "../../domain/dependency-security/versions.js";
import { isSecurityManifestPath } from "../../domain/dependency-security/resolutions.js";
import { ADVISORY_ID, invalid, list, packageName, parseJson, record } from "./validation.js";

export interface AuditManifestEdit {
  readonly file: string;
  readonly catalog: string | null;
  readonly key: string;
  readonly from: string;
  readonly to: string;
}

export interface AuditFix {
  readonly name: string;
  readonly from: string;
  readonly to: string;
  readonly packageJson: readonly AuditManifestEdit[];
}

export interface AuditFixReport {
  readonly dryRun: boolean;
  readonly fixes: readonly AuditFix[];
  readonly blockedPackages: readonly string[];
  readonly unfixablePackages: readonly string[];
}

function version(value: unknown): string {
  if (typeof value !== "string" || !securityVersion(value))
    invalid("fix report requires stable exact versions");
  return value;
}

function manifestEdit(value: unknown, name: string, to: string): AuditManifestEdit {
  const item = record(value, "manifest edit", ["file", "catalog", "key", "from", "to"]);
  if (typeof item.file !== "string" || !isSecurityManifestPath(item.file))
    invalid("fix report has an unsafe manifest path");
  if (
    item.catalog !== null &&
    (typeof item.catalog !== "string" ||
      !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(item.catalog) ||
      ["__proto__", "constructor", "prototype"].includes(item.catalog))
  )
    invalid("fix report has an invalid catalog");
  if (
    item.key !== name ||
    typeof item.from !== "string" ||
    !securityRangeBase(item.from) ||
    typeof item.to !== "string" ||
    securityRangeBase(item.to) !== to
  )
    invalid("fix report has an inconsistent manifest declaration");
  return { file: item.file, catalog: item.catalog, key: name, from: item.from, to: item.to };
}

export function parseAuditFixReport(source: string, dryRun: boolean): AuditFixReport {
  const report = record(parseJson(source, "audit fix report"), "audit fix report", [
    "dryRun",
    "fixed",
    "remaining",
    "fixes",
    "blocked",
    "unfixable",
    "manifestUnavailable",
    "unmatched",
    "unaudited",
    "vulnerableAfterInstall",
  ]);
  if (
    report.dryRun !== dryRun ||
    !Number.isSafeInteger(report.fixed) ||
    Number(report.fixed) < 0 ||
    !Number.isSafeInteger(report.remaining) ||
    Number(report.remaining) < 0
  )
    invalid("audit fix report has invalid counters or mode");
  for (const key of ["manifestUnavailable", "unmatched", "unaudited", "vulnerableAfterInstall"]) {
    if (list(report[key], key).length > 0)
      invalid(`audit fix could not verify all dependencies (${key})`);
  }
  const fixes = list(report.fixes, "fixes").map((value): AuditFix => {
    const item = record(value, "fix", [
      "name",
      "from",
      "to",
      "downgrade",
      "newerThanMinimumReleaseAge",
      "packageJson",
    ]);
    const name = packageName(item.name);
    const from = version(item.from);
    const to = version(item.to);
    if (
      item.downgrade !== false ||
      item.newerThanMinimumReleaseAge !== false ||
      compareSecurityVersions(to, from) <= 0
    )
      invalid("audit fix proposed a downgrade, non-update, or release-age exception");
    return {
      name,
      from,
      to,
      packageJson: list(item.packageJson, "packageJson").map((edit) =>
        manifestEdit(edit, name, to),
      ),
    };
  });
  const identities = fixes.map((fix) => `${fix.name}@${fix.from}`);
  if (new Set(identities).size !== identities.length) invalid("audit fix repeats a locked release");
  const blockedPackages = list(report.blocked, "blocked").map((value) => {
    const item = record(value, "blocked fix", [
      "name",
      "from",
      "to",
      "downgrade",
      "latestFixes",
      "blockers",
    ]);
    const name = packageName(item.name);
    version(item.from);
    version(item.to);
    if (typeof item.downgrade !== "boolean" || typeof item.latestFixes !== "boolean")
      invalid("invalid blocked fix flags");
    for (const value of list(item.blockers, "blockers")) {
      const blocker = record(value, "blocker", ["dependent", "range", "bundled"]);
      if (
        typeof blocker.dependent !== "string" ||
        typeof blocker.range !== "string" ||
        typeof blocker.bundled !== "boolean"
      )
        invalid("invalid dependency range blocker");
    }
    return name;
  });
  const unfixablePackages = list(report.unfixable, "unfixable").map((value) => {
    const item = record(value, "unfixable package", ["name", "from", "advisories"]);
    const name = packageName(item.name);
    version(item.from);
    if (
      !list(item.advisories, "advisories").every(
        (id) => typeof id === "string" && ADVISORY_ID.test(id),
      )
    )
      invalid("unfixable package has invalid advisory IDs");
    return name;
  });
  return { dryRun, fixes, blockedPackages, unfixablePackages };
}

export function parseAuditReport(source: string, exitCode: number): DependencySecurityAdvisory[] {
  const report = record(parseJson(source, "audit report"), "audit report");
  const entries: DependencySecurityAdvisory[] = [];
  for (const [name, raw] of Object.entries(report)) {
    packageName(name);
    for (const value of list(raw, "package advisories")) {
      const item = record(value, "advisory");
      if (
        typeof item.url !== "string" ||
        !/^https:\/\/github\.com\/advisories\/GHSA-[23456789cfghjmpqrvwx]{4}-[23456789cfghjmpqrvwx]{4}-[23456789cfghjmpqrvwx]{4}$/.test(
          item.url,
        )
      )
        invalid("advisory has an unrecognized identity");
      if (
        typeof item.severity !== "string" ||
        !["low", "moderate", "high", "critical"].includes(item.severity)
      )
        invalid("advisory has unknown severity");
      entries.push({
        package: name,
        url: item.url,
        severity: item.severity as DependencySecuritySeverity,
        disposition: "unresolved",
      });
    }
  }
  if ((exitCode !== 0 && exitCode !== 1) || (exitCode === 1 && entries.length === 0))
    invalid("audit did not return a complete advisory report");
  return entries;
}

export function isBlockingAdvisory(item: DependencySecurityAdvisory): boolean {
  return item.disposition !== "patched" && ["high", "critical", "unknown"].includes(item.severity);
}
