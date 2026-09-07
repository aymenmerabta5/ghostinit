import { readFile, realpath } from "node:fs/promises";
import { basename, join } from "node:path";
import type { ArchitectureFinding, PackageInfo } from "../types.js";
import { compareText, displayPath, errorCode, isContained, isMissing } from "./collector-utils.js";
import {
  stopPackageDiscovery,
  stopPackageIo,
  type DiscoveryState,
  type PackageManifest,
} from "./package-policy.js";

export interface PackageManifestResult {
  readonly dir: string;
  readonly canonicalManifestPath: string;
  readonly manifest: PackageManifest;
}

export async function readPackageManifest(
  dir: string,
  realRoot: string,
  findings: ArchitectureFinding[],
  state: DiscoveryState,
  rootManifest: boolean,
): Promise<PackageManifestResult | undefined> {
  const manifestPath = join(dir, "package.json");
  let canonicalManifest: string;
  try {
    canonicalManifest = await realpath(manifestPath);
  } catch (error) {
    if (isMissing(error)) return undefined;
    stopPackageIo(state, findings, manifestPath, realRoot, error);
    return undefined;
  }
  if (!isContained(canonicalManifest, realRoot)) {
    stopPackageDiscovery(
      state,
      findings,
      "package-manifest-outside-project",
      "Package manifest resolves outside the project",
      displayPath(manifestPath, realRoot),
    );
    return undefined;
  }

  let source: string;
  try {
    source = await readFile(canonicalManifest, "utf-8");
  } catch (error) {
    stopPackageIo(state, findings, manifestPath, realRoot, error);
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch (error) {
    stopPackageDiscovery(
      state,
      findings,
      "package-manifest-coverage-failure",
      `Unable to parse ${rootManifest ? "root " : ""}package manifest: ${errorCode(error)}`,
      displayPath(manifestPath, realRoot),
    );
    return undefined;
  }
  if (!isPackageManifest(parsed)) {
    stopPackageDiscovery(
      state,
      findings,
      "package-manifest-coverage-failure",
      `Invalid ${rootManifest ? "root " : ""}package manifest shape`,
      displayPath(manifestPath, realRoot),
    );
    return undefined;
  }

  let canonicalDir: string;
  try {
    canonicalDir = await realpath(dir);
  } catch (error) {
    stopPackageIo(state, findings, dir, realRoot, error);
    return undefined;
  }
  return { dir: canonicalDir, canonicalManifestPath: canonicalManifest, manifest: parsed };
}

export function toPackageInfo(dir: string, manifest: PackageManifest): PackageInfo {
  const dependencies = [
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.devDependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
    ...Object.keys(manifest.optionalDependencies ?? {}),
  ].sort(compareText);
  return {
    name: manifest.name ?? basename(dir),
    dir,
    dependencies: new Set(dependencies),
  };
}

export function workspacesFrom(manifest?: PackageManifest): readonly string[] {
  if (!manifest?.workspaces) return [];
  return Array.isArray(manifest.workspaces)
    ? manifest.workspaces
    : ((manifest.workspaces as { packages?: readonly string[] }).packages ?? []);
}

function isPackageManifest(value: unknown): value is PackageManifest {
  if (!isRecord(value)) return false;
  if (value.name !== undefined && typeof value.name !== "string") return false;
  if (!validWorkspaces(value.workspaces)) return false;
  return [
    value.dependencies,
    value.devDependencies,
    value.peerDependencies,
    value.optionalDependencies,
  ].every(validDependencyMap);
}

function validWorkspaces(value: unknown): boolean {
  if (value === undefined) return true;
  if (Array.isArray(value)) return value.every((entry) => typeof entry === "string");
  return (
    isRecord(value) &&
    (value.packages === undefined ||
      (Array.isArray(value.packages) && value.packages.every((entry) => typeof entry === "string")))
  );
}

function validDependencyMap(value: unknown): boolean {
  return (
    value === undefined ||
    (isRecord(value) && Object.values(value).every((entry) => typeof entry === "string"))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
