/**
 * Dependency-free preinstall gate. It intentionally imports only local source
 * and Node/Bun built-ins so CI can run it before dependency installation.
 */
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { runtime, supplyChain } from "../packages/versions/src/index.js";
import {
  exactLockedReleaseAuditWindow,
  type LockedReleaseEvidence,
} from "./dependency-audit-window.js";
import {
  collectRepositoryLockedPins,
  isSha512Integrity,
  releaseAgeWindow,
} from "./lock-age-policy.js";

interface PreflightEvidence {
  schemaVersion: number;
  auditedAt: string;
  asOf: string;
  registry: string;
  bun: string;
  supplyChain: {
    minimumReleaseAgeSeconds: number;
    cutoffAt: string;
    releaseAgeExceptions: unknown[];
  };
  summary: {
    auditedLockfiles: number;
    lockedPackageVersions: number;
  };
  lockedReleases: LockedReleaseEvidence[];
}

export interface LockAgePreflightResult {
  failures: string[];
  cutoffAt: string | null;
  auditedLockfiles: number;
  lockedPackageVersions: number;
}

function readEvidence(repositoryRoot: string, failures: string[]): PreflightEvidence | null {
  const path = join(repositoryRoot, "evidence", "compatibility", "dependency-versions.json");
  if (!existsSync(path)) {
    failures.push("evidence/compatibility/dependency-versions.json is missing");
    return null;
  }
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    failures.push("dependency evidence must be a regular non-symlink file");
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      failures.push("dependency evidence must be an object");
      return null;
    }
    return parsed as PreflightEvidence;
  } catch (error) {
    failures.push(
      "dependency evidence is malformed: " +
        (error instanceof Error ? error.message : String(error)),
    );
    return null;
  }
}

export function lockAgePreflight(
  repositoryRoot: string,
  nowMilliseconds = Date.now(),
): LockAgePreflightResult {
  const failures: string[] = [];
  const locks = collectRepositoryLockedPins(repositoryRoot);
  failures.push(...locks.failures);
  const current = new Map(locks.pins.map((pin) => [pin.package + "@" + pin.version, pin]));
  const evidence = readEvidence(repositoryRoot, failures);
  if (!evidence) {
    return {
      failures,
      cutoffAt: null,
      auditedLockfiles: locks.lockfiles.length,
      lockedPackageVersions: current.size,
    };
  }

  if (evidence.schemaVersion !== 3) failures.push("dependency evidence schemaVersion must be 3");
  if (evidence.registry !== "https://registry.npmjs.org") {
    failures.push("dependency evidence registry must be the public npm registry");
  }
  if (evidence.bun !== runtime.bun) {
    failures.push("dependency evidence Bun version does not match the runtime SSOT");
  }
  if (
    !evidence.supplyChain ||
    evidence.supplyChain.minimumReleaseAgeSeconds !== supplyChain.minimumReleaseAgeSeconds ||
    !Array.isArray(evidence.supplyChain.releaseAgeExceptions) ||
    evidence.supplyChain.releaseAgeExceptions.length !== 0
  ) {
    failures.push("dependency evidence does not match the no-exception release-age policy");
  }

  let cutoffAt: string | null = null;
  try {
    const window = releaseAgeWindow(
      evidence.auditedAt,
      supplyChain.minimumReleaseAgeSeconds,
      nowMilliseconds,
    );
    cutoffAt = window.cutoffAt;
    if (evidence.supplyChain?.cutoffAt !== window.cutoffAt) {
      failures.push("dependency evidence cutoffAt is stale");
    }
    if (typeof evidence.asOf !== "string" || evidence.auditedAt.slice(0, 10) !== evidence.asOf) {
      failures.push("dependency evidence asOf does not match auditedAt");
    }
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  }

  const recorded = new Map<string, LockedReleaseEvidence>();
  if (!Array.isArray(evidence.lockedReleases)) {
    failures.push("dependency evidence lockedReleases must be an array");
  } else {
    for (const entry of evidence.lockedReleases) {
      if (
        !entry ||
        typeof entry !== "object" ||
        Array.isArray(entry) ||
        typeof entry.package !== "string" ||
        entry.package.length === 0 ||
        typeof entry.version !== "string" ||
        entry.version.length === 0 ||
        typeof entry.publishedAt !== "string" ||
        !isSha512Integrity(entry.integrity)
      ) {
        failures.push("dependency evidence contains a malformed locked release");
        continue;
      }
      const key = entry.package + "@" + entry.version;
      if (recorded.has(key)) {
        failures.push("dependency evidence contains duplicate locked release " + key);
        continue;
      }
      try {
        exactLockedReleaseAuditWindow(
          entry,
          entry,
          evidence.auditedAt,
          supplyChain.minimumReleaseAgeSeconds,
          nowMilliseconds,
        );
      } catch (error) {
        failures.push(key + ": " + (error instanceof Error ? error.message : String(error)));
      }
      recorded.set(key, entry);
    }
  }

  for (const pin of locks.pins) {
    const key = pin.package + "@" + pin.version;
    const release = recorded.get(key);
    if (!release) {
      failures.push("dependency evidence is missing locked release " + key);
    } else if (release.integrity !== pin.integrity) {
      failures.push(
        pin.lockfile +
          ":" +
          pin.key +
          ": locked integrity differs from reviewed evidence for " +
          key,
      );
    }
  }
  for (const key of recorded.keys()) {
    if (!current.has(key))
      failures.push("dependency evidence contains stale locked release " + key);
  }
  if (
    !evidence.summary ||
    evidence.summary.auditedLockfiles !== locks.lockfiles.length ||
    evidence.summary.lockedPackageVersions !== current.size
  ) {
    failures.push("dependency evidence lock summary is stale");
  }

  return {
    failures,
    cutoffAt,
    auditedLockfiles: locks.lockfiles.length,
    lockedPackageVersions: current.size,
  };
}

async function main(): Promise<void> {
  const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
  const result = lockAgePreflight(repositoryRoot);
  if (result.failures.length > 0) {
    for (const failure of result.failures) console.error("INVALID " + failure);
    console.error("\n" + result.failures.length + " preinstall lock-age failure(s).");
    process.exit(1);
  }
  console.log(
    "Preinstall lock-age check passed: " +
      result.lockedPackageVersions +
      " locked package versions across " +
      result.auditedLockfiles +
      " locks, cutoff " +
      result.cutoffAt +
      ".",
  );
}

if (import.meta.main) await main();
