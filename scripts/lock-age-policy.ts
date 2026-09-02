import { Buffer } from "node:buffer";
import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const PRERELEASE_IDENTIFIER = "(?:0|[1-9]\\d*|\\d*[A-Za-z-][0-9A-Za-z-]*)";
const BUILD_IDENTIFIER = "[0-9A-Za-z-]+";
const SEMVER =
  "(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)" +
  "(?:-" +
  PRERELEASE_IDENTIFIER +
  "(?:\\." +
  PRERELEASE_IDENTIFIER +
  ")*)?" +
  "(?:\\+" +
  BUILD_IDENTIFIER +
  "(?:\\." +
  BUILD_IDENTIFIER +
  ")*)?";
const LOCKED_REGISTRY_PACKAGE_PATTERN = new RegExp("^(.+)@(" + SEMVER + ")$");
const SHA512_INTEGRITY_PATTERN = /^sha512-[A-Za-z0-9+/]+={0,2}$/;

function isSha512Integrity(value: unknown): value is string {
  if (typeof value !== "string" || !SHA512_INTEGRITY_PATTERN.test(value)) return false;
  const encoded = value.slice("sha512-".length);
  const decoded = Buffer.from(encoded, "base64");
  return decoded.length === 64 && decoded.toString("base64") === encoded;
}

export interface LockedPin {
  lockfile: string;
  key: string;
  package: string;
  version: string;
}

export interface CollectedLockedPins {
  readonly lockfiles: string[];
  readonly pins: LockedPin[];
  readonly failures: string[];
}

export function releaseAgeWindow(
  auditedAt: string,
  minimumReleaseAgeSeconds: number,
  nowMilliseconds = Date.now(),
): { auditedAtMilliseconds: number; cutoffMilliseconds: number; cutoffAt: string } {
  const auditedAtMilliseconds = Date.parse(auditedAt);
  if (!Number.isFinite(auditedAtMilliseconds)) {
    throw new Error("Dependency evidence auditedAt must be a valid timestamp.");
  }
  if (auditedAtMilliseconds > nowMilliseconds) {
    throw new Error("Dependency evidence auditedAt must not be in the future.");
  }
  if (!Number.isInteger(minimumReleaseAgeSeconds) || minimumReleaseAgeSeconds <= 0) {
    throw new Error("Supply-chain minimum release age must be a positive integer.");
  }
  const cutoffMilliseconds = auditedAtMilliseconds - minimumReleaseAgeSeconds * 1000;
  return {
    auditedAtMilliseconds,
    cutoffMilliseconds,
    cutoffAt: new Date(cutoffMilliseconds).toISOString(),
  };
}

/** Parse Bun's JSONC text lock and fail closed on non-public-registry package refs. */
export function lockedRegistryPinsFromText(lockfile: string, content: string): CollectedLockedPins {
  let document: unknown;
  try {
    document = Bun.JSONC.parse(content);
  } catch (error) {
    return {
      lockfiles: [lockfile],
      pins: [],
      failures: [
        lockfile +
          ": invalid Bun text lock: " +
          (error instanceof Error ? error.message : String(error)),
      ],
    };
  }
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    return {
      lockfiles: [lockfile],
      pins: [],
      failures: [lockfile + ": Bun text lock must be an object"],
    };
  }
  const record = document as {
    lockfileVersion?: unknown;
    workspaces?: unknown;
    packages?: unknown;
  };
  if (record.lockfileVersion !== 1 && record.lockfileVersion !== 2) {
    return {
      lockfiles: [lockfile],
      pins: [],
      failures: [lockfile + ": unsupported Bun lockfileVersion " + String(record.lockfileVersion)],
    };
  }
  if (!record.packages || typeof record.packages !== "object" || Array.isArray(record.packages)) {
    return {
      lockfiles: [lockfile],
      pins: [],
      failures: [lockfile + ": Bun text lock packages must be an object"],
    };
  }

  const pins: LockedPin[] = [];
  const failures: string[] = [];
  for (const [key, value] of Object.entries(record.packages as Record<string, unknown>)) {
    if (!Array.isArray(value) || typeof value[0] !== "string") {
      failures.push(lockfile + ":" + key + ": package entry has no string resolution");
      continue;
    }
    const resolution = value[0];
    const workspace = /^(.+)@workspace:(.+)$/.exec(resolution);
    if (workspace?.[1] && workspace[2]) {
      const workspaceRecords =
        record.workspaces &&
        typeof record.workspaces === "object" &&
        !Array.isArray(record.workspaces)
          ? (record.workspaces as Record<string, unknown>)
          : null;
      const workspaceRecord = workspaceRecords?.[workspace[2]];
      const workspaceName =
        workspaceRecord && typeof workspaceRecord === "object" && !Array.isArray(workspaceRecord)
          ? (workspaceRecord as { name?: unknown }).name
          : undefined;
      if (workspaceName !== workspace[1] || value.length !== 1) {
        failures.push(lockfile + ":" + key + ": unresolved workspace package " + resolution);
      }
      continue;
    }
    const match = LOCKED_REGISTRY_PACKAGE_PATTERN.exec(resolution);
    if (!match?.[1] || !match[2]) {
      failures.push(lockfile + ":" + key + ": unsupported package resolution " + resolution);
      continue;
    }
    const metadata = value[2];
    const integrity = value[3];
    if (
      value.length !== 4 ||
      value[1] !== "" ||
      !metadata ||
      typeof metadata !== "object" ||
      Array.isArray(metadata) ||
      !isSha512Integrity(integrity)
    ) {
      failures.push(
        lockfile +
          ":" +
          key +
          ": registry package must use the public-registry tuple with sha512 integrity",
      );
      continue;
    }
    pins.push({ lockfile, key, package: match[1], version: match[2] });
  }
  return { lockfiles: [lockfile], pins, failures };
}

export function collectRepositoryLockedPins(repositoryRoot: string): CollectedLockedPins {
  const fixturesRoot = join(repositoryRoot, "tests", "fixtures", "compatibility");
  const candidates: Array<{ label: string; path: string }> = [
    { label: "bun.lock", path: join(repositoryRoot, "bun.lock") },
  ];
  if (!existsSync(fixturesRoot) || !lstatSync(fixturesRoot).isDirectory()) {
    return {
      lockfiles: ["bun.lock"],
      pins: [],
      failures: ["tests/fixtures/compatibility: required fixture directory is missing"],
    };
  }
  for (const entry of readdirSync(fixturesRoot, { withFileTypes: true }).sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    if (!entry.isDirectory()) continue;
    const manifest = join(fixturesRoot, entry.name, "package.json");
    if (!existsSync(manifest)) continue;
    candidates.push({
      label: "tests/fixtures/compatibility/" + entry.name + "/bun.lock",
      path: join(fixturesRoot, entry.name, "bun.lock"),
    });
  }

  const lockfiles: string[] = [];
  const pins: LockedPin[] = [];
  const failures: string[] = [];
  for (const candidate of candidates) {
    lockfiles.push(candidate.label);
    if (!existsSync(candidate.path)) {
      failures.push(candidate.label + ": required Bun text lock is missing");
      continue;
    }
    const stat = lstatSync(candidate.path);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      failures.push(candidate.label + ": Bun text lock must be a regular non-symlink file");
      continue;
    }
    const collected = lockedRegistryPinsFromText(
      candidate.label,
      readFileSync(candidate.path, "utf8"),
    );
    pins.push(...collected.pins);
    failures.push(...collected.failures);
  }
  return { lockfiles, pins, failures };
}
