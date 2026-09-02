// @allow-long 560: one fail-closed verifier keeps lock parsing, graph traversal, and audit policy together
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
  type Dirent,
} from "node:fs";
import { isAbsolute, join, relative, sep } from "node:path";

type PackageManifest = {
  patchedDependencies?: Record<string, unknown>;
  workspaces?: unknown;
};

type InstalledPackageManifest = {
  name?: unknown;
  version?: unknown;
};

type BunLock = {
  lockfileVersion?: unknown;
  patchedDependencies?: unknown;
  packages?: unknown;
};

type PackageLocation = {
  readonly installName: string;
  readonly root: string;
};

type AuditAdvisory = {
  severity?: unknown;
  url?: unknown;
};

type JsonToken =
  | { readonly kind: "primitive"; readonly value: string }
  | { readonly kind: "punctuation"; readonly value: string }
  | { readonly kind: "string"; readonly value: string };

const HAS_IMAGE_SIZE_PATCH = true;
const PATCH_KEY = "image-size@1.2.1";
const PATCH_PATH = "patches/image-size@1.2.1.patch";
const PATCH_SHA256 = "7805ea36efb396516b71b6965774b03c7df465bdda1489b937dc19d3bde8a7d8";
const PATCHED_FILES = new Map<string, string>([
  ["dist/types/icns.js", "ea073da10e66839d1f989dd62775312f85ba53e3d6b37476bce477f25da4e82f"],
  ["dist/types/utils.js", "6786c3d52ea46fab31d0d7883c16041f15a1604356bd0f139c1b2adc261234c1"],
]);
const REVIEWED_ADVISORIES = new Map<string, string>([
  ["GHSA-w3rx-r6r6-pgpr", "https://github.com/advisories/GHSA-w3rx-r6r6-pgpr"],
  ["GHSA-5p2g-fcmc-qvqq", "https://github.com/advisories/GHSA-5p2g-fcmc-qvqq"],
]);
const severityRank = new Map<string, number>([
  ["unknown", 0],
  ["low", 1],
  ["moderate", 2],
  ["high", 3],
  ["critical", 4],
]);
// Bun 1.4.0 reads existing v1 text locks and emits v2 for freshly resolved
// workspace graphs. Both are structural JSONC variants of the same package map.
const SUPPORTED_BUN_LOCKFILE_VERSIONS = new Set<number>([1, 2]);
const punctuation = new Set(["{", "}", "[", "]", ":", ","]);

function fail(message: string): never {
  console.error("Dependency audit failed: " + message);
  process.exit(1);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isWhitespace(code: number): boolean {
  return code === 9 || code === 10 || code === 13 || code === 32;
}

function tokenizeJsonc(source: string): JsonToken[] {
  const tokens: JsonToken[] = [];
  let index = 0;
  while (index < source.length) {
    const code = source.charCodeAt(index);
    if (isWhitespace(code)) {
      index += 1;
      continue;
    }
    if (code === 47 && source.charCodeAt(index + 1) === 47) {
      index += 2;
      while (index < source.length && ![10, 13].includes(source.charCodeAt(index))) index += 1;
      continue;
    }
    if (code === 47 && source.charCodeAt(index + 1) === 42) {
      const closing = source.indexOf("*/", index + 2);
      if (closing === -1) fail("bun.lock contains an unterminated comment");
      index = closing + 2;
      continue;
    }
    if (code === 34) {
      const start = index;
      index += 1;
      let closed = false;
      while (index < source.length) {
        const stringCode = source.charCodeAt(index);
        if (stringCode === 92) {
          index += 2;
          continue;
        }
        index += 1;
        if (stringCode === 34) {
          closed = true;
          break;
        }
      }
      if (!closed) fail("bun.lock contains an unterminated string");
      let value: unknown;
      try {
        value = JSON.parse(source.slice(start, index));
      } catch {
        fail("bun.lock contains an invalid string token");
      }
      if (typeof value !== "string") fail("bun.lock contains an invalid string token");
      tokens.push({ kind: "string", value });
      continue;
    }
    const character = source[index];
    if (punctuation.has(character)) {
      tokens.push({ kind: "punctuation", value: character });
      index += 1;
      continue;
    }
    const start = index;
    while (index < source.length) {
      const current = source[index];
      const currentCode = source.charCodeAt(index);
      if (
        isWhitespace(currentCode) ||
        punctuation.has(current) ||
        (currentCode === 47 && [42, 47].includes(source.charCodeAt(index + 1)))
      ) {
        break;
      }
      index += 1;
    }
    if (index === start) fail("bun.lock contains an invalid token");
    tokens.push({ kind: "primitive", value: source.slice(start, index) });
  }
  return tokens;
}

function assertNoDuplicateJsoncKeys(tokens: readonly JsonToken[]): void {
  let cursor = 0;

  const parseValue = (): void => {
    const token = tokens[cursor];
    if (token === undefined) fail("bun.lock ended before its value was complete");
    if (token.kind !== "punctuation") {
      cursor += 1;
      return;
    }
    if (token.value === "{") {
      cursor += 1;
      const keys = new Set<string>();
      if (tokens[cursor]?.value === "}") {
        cursor += 1;
        return;
      }
      while (true) {
        const key = tokens[cursor];
        if (key?.kind !== "string") fail("bun.lock contains an invalid object key");
        if (keys.has(key.value)) fail("bun.lock contains a duplicate object key: " + key.value);
        keys.add(key.value);
        cursor += 1;
        if (tokens[cursor]?.value !== ":") fail("bun.lock contains an object key without a value");
        cursor += 1;
        parseValue();
        const delimiter = tokens[cursor];
        if (delimiter?.value === "}") {
          cursor += 1;
          return;
        }
        if (delimiter?.value !== ",") fail("bun.lock contains an invalid object delimiter");
        cursor += 1;
        if (tokens[cursor]?.value === "}") {
          cursor += 1;
          return;
        }
      }
    }
    if (token.value === "[") {
      cursor += 1;
      if (tokens[cursor]?.value === "]") {
        cursor += 1;
        return;
      }
      while (true) {
        parseValue();
        const delimiter = tokens[cursor];
        if (delimiter?.value === "]") {
          cursor += 1;
          return;
        }
        if (delimiter?.value !== ",") fail("bun.lock contains an invalid array delimiter");
        cursor += 1;
        if (tokens[cursor]?.value === "]") {
          cursor += 1;
          return;
        }
      }
    }
    fail("bun.lock contains an unexpected punctuation token");
  };

  parseValue();
  if (cursor !== tokens.length) fail("bun.lock contains trailing structural data");
}

function normalizedJsonc(tokens: readonly JsonToken[]): string {
  return tokens
    .flatMap((token, index) => {
      if (
        token.kind === "punctuation" &&
        token.value === "," &&
        ["}", "]"].includes(tokens[index + 1]?.value ?? "")
      ) {
        return [];
      }
      return [token.kind === "string" ? JSON.stringify(token.value) : token.value];
    })
    .join("");
}

function parseBunLock(source: string): BunLock {
  const tokens = tokenizeJsonc(source);
  assertNoDuplicateJsoncKeys(tokens);
  let parsed: unknown;
  try {
    parsed = JSON.parse(normalizedJsonc(tokens));
  } catch {
    fail("bun.lock is not valid Bun JSONC");
  }
  if (!isRecord(parsed)) fail("bun.lock does not contain a root object");
  return parsed as BunLock;
}

function resolveContained(projectRoot: string, path: string, label: string): string {
  let canonical: string;
  try {
    canonical = realpathSync(path);
  } catch {
    fail(label + " is missing or unreadable");
  }
  const descendant = relative(projectRoot, canonical);
  if (descendant === ".." || descendant.startsWith(".." + sep) || isAbsolute(descendant)) {
    fail(label + " escapes the project root");
  }
  return canonical;
}

function containedDirectory(projectRoot: string, path: string, label: string): string {
  const canonical = resolveContained(projectRoot, path, label);
  if (!statSync(canonical).isDirectory()) fail(label + " is not a directory");
  return canonical;
}

function containedRegularFile(projectRoot: string, path: string, label: string): string {
  const canonical = resolveContained(projectRoot, path, label);
  if (!lstatSync(path).isFile() || !statSync(canonical).isFile()) {
    fail(label + " must be a regular file, not a symlink or special file");
  }
  return canonical;
}

function sha256(projectRoot: string, path: string, label: string): string {
  const canonical = containedRegularFile(projectRoot, path, label);
  return createHash("sha256").update(readFileSync(canonical)).digest("hex");
}

function readJsonRecord(
  projectRoot: string,
  path: string,
  label: string,
): Record<string, unknown> {
  const canonical = containedRegularFile(projectRoot, path, label);
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(canonical, "utf8"));
  } catch {
    fail(label + " is not valid JSON");
  }
  if (!isRecord(parsed)) fail(label + " does not contain an object");
  return parsed;
}

function directoryLike(entry: Dirent): boolean {
  return entry.isDirectory() || entry.isSymbolicLink();
}

function declaredWorkspaces(manifest: PackageManifest): unknown[] {
  if (Array.isArray(manifest.workspaces)) return manifest.workspaces;
  if (typeof manifest.workspaces !== "object" || manifest.workspaces === null) return [];
  const packages = (manifest.workspaces as { packages?: unknown }).packages;
  return Array.isArray(packages) ? packages : [];
}

function workspaceRoots(root: string, manifest: PackageManifest): string[] {
  const declared = declaredWorkspaces(manifest);
  const roots: string[] = [];
  for (const rawPattern of declared) {
    if (typeof rawPattern !== "string") fail("package.json contains a non-string workspace path");
    const pattern = rawPattern.replaceAll("\\", "/");
    const segments = pattern.split("/");
    if (
      pattern.length === 0 ||
      pattern.includes(String.fromCharCode(0)) ||
      pattern.startsWith("/") ||
      /^[A-Za-z]:/.test(pattern) ||
      segments.includes("..")
    ) {
      fail("package.json contains an unsafe workspace path");
    }
    if (!pattern.includes("*")) {
      const workspace = join(root, ...segments);
      if (existsSync(workspace)) {
        roots.push(containedDirectory(root, workspace, "workspace " + pattern));
      }
      continue;
    }
    if (!pattern.endsWith("/*") || pattern.slice(0, -2).includes("*")) {
      fail("package.json contains an unsupported workspace pattern");
    }
    const parent = join(root, ...segments.slice(0, -1));
    if (!existsSync(parent)) continue;
    const canonicalParent = containedDirectory(root, parent, "workspace parent " + pattern);
    for (const entry of readdirSync(canonicalParent, { withFileTypes: true })) {
      if (!directoryLike(entry)) continue;
      roots.push(
        containedDirectory(root, join(canonicalParent, entry.name), "workspace " + entry.name),
      );
    }
  }
  return roots;
}

function packageRoots(projectRoot: string, modules: string): PackageLocation[] {
  const roots: PackageLocation[] = [];
  for (const entry of readdirSync(modules, { withFileTypes: true })) {
    if (!directoryLike(entry) || entry.name.startsWith(".")) continue;
    const packageRoot = join(modules, entry.name);
    if (!entry.name.startsWith("@")) {
      roots.push({
        installName: entry.name,
        root: containedDirectory(projectRoot, packageRoot, "installed package " + entry.name),
      });
      continue;
    }
    const scopeRoot = containedDirectory(projectRoot, packageRoot, "installed scope " + entry.name);
    for (const scoped of readdirSync(scopeRoot, { withFileTypes: true })) {
      if (!directoryLike(scoped) || scoped.name.startsWith(".")) continue;
      const installName = entry.name + "/" + scoped.name;
      roots.push({
        installName,
        root: containedDirectory(
          projectRoot,
          join(scopeRoot, scoped.name),
          "installed package " + installName,
        ),
      });
    }
  }
  return roots;
}

function bunStoreModuleRoots(projectRoot: string, modules: string): string[] {
  const store = join(modules, ".bun");
  if (!existsSync(store)) return [];
  const canonicalStore = containedDirectory(projectRoot, store, "Bun install store");
  const roots: string[] = [];
  for (const entry of readdirSync(canonicalStore, { withFileTypes: true })) {
    if (!directoryLike(entry) || entry.name.startsWith(".")) continue;
    const storeEntry = containedDirectory(
      projectRoot,
      join(canonicalStore, entry.name),
      "Bun install store entry " + entry.name,
    );
    const nestedModules = join(storeEntry, "node_modules");
    if (existsSync(nestedModules)) roots.push(nestedModules);
  }
  return roots;
}

function installedImageSizePackages(root: string, manifest: PackageManifest): string[] {
  const candidates = new Set<string>();
  const pending = [root, ...workspaceRoots(root, manifest)].flatMap((packageRoot) => {
    const modules = join(packageRoot, "node_modules");
    return existsSync(modules) ? [modules] : [];
  });
  const visited = new Set<string>();
  while (pending.length > 0) {
    const modules = pending.pop();
    if (modules === undefined) fail("internal dependency traversal underflow");
    const canonicalModules = containedDirectory(root, modules, "node_modules directory");
    if (visited.has(canonicalModules)) continue;
    visited.add(canonicalModules);
    pending.push(...bunStoreModuleRoots(root, canonicalModules));
    for (const location of packageRoots(root, canonicalModules)) {
      const packageManifestPath = join(location.root, "package.json");
      if (existsSync(packageManifestPath)) {
        const installed = readJsonRecord(
          root,
          packageManifestPath,
          "installed package manifest " + location.installName,
        ) as InstalledPackageManifest;
        if (location.installName === "image-size" && installed.name !== "image-size") {
          fail("the image-size install path has an unexpected package identity");
        }
        if (installed.name === "image-size") candidates.add(location.root);
      } else if (location.installName === "image-size") {
        fail("the image-size install path is missing package.json");
      }
      const nested = join(location.root, "node_modules");
      if (existsSync(nested)) pending.push(nested);
    }
  }
  return [...candidates];
}

function verifyReviewedPatch(root: string): void {
  const manifest = readJsonRecord(root, join(root, "package.json"), "package.json") as PackageManifest;
  if (manifest.patchedDependencies?.[PATCH_KEY] !== PATCH_PATH) {
    fail("package.json does not bind the reviewed image-size patch");
  }
  const patch = join(root, PATCH_PATH);
  if (sha256(root, patch, "reviewed image-size patch") !== PATCH_SHA256) {
    fail("the reviewed image-size patch is missing or its SHA-256 changed");
  }
  const lockPath = containedRegularFile(root, join(root, "bun.lock"), "bun.lock");
  const lock = parseBunLock(readFileSync(lockPath, "utf8"));
  if (
    typeof lock.lockfileVersion !== "number" ||
    !SUPPORTED_BUN_LOCKFILE_VERSIONS.has(lock.lockfileVersion)
  ) {
    fail("bun.lock uses an unsupported lockfile version");
  }
  if (!isRecord(lock.patchedDependencies) || lock.patchedDependencies[PATCH_KEY] !== PATCH_PATH) {
    fail("bun.lock does not bind the reviewed image-size patch");
  }
  if (!isRecord(lock.packages)) fail("bun.lock does not contain a package resolution map");
  const lockResolutions: string[] = [];
  for (const [packageKey, rawRecord] of Object.entries(lock.packages)) {
    if (!Array.isArray(rawRecord) || typeof rawRecord[0] !== "string") {
      fail("bun.lock contains an invalid package record: " + packageKey);
    }
    if (rawRecord[0].startsWith("image-size@")) lockResolutions.push(rawRecord[0]);
  }
  if (
    lockResolutions.length === 0 ||
    lockResolutions.some((resolution) => resolution !== PATCH_KEY)
  ) {
    fail("bun.lock contains an unreviewed or missing image-size resolution");
  }
  const packages = installedImageSizePackages(root, manifest);
  if (packages.length === 0) fail("image-size@1.2.1 is not installed where Bun can verify it");
  for (const packageRoot of packages) {
    const installed = readJsonRecord(
      root,
      join(packageRoot, "package.json"),
      "installed image-size package manifest",
    ) as InstalledPackageManifest;
    if (installed.name !== "image-size" || installed.version !== "1.2.1") {
      fail("the reviewed patch resolved an unexpected image-size package");
    }
    for (const [relativePath, digest] of PATCHED_FILES) {
      const target = join(packageRoot, relativePath);
      if (sha256(root, target, "installed image-size file " + relativePath) !== digest) {
        fail("the installed image-size patch was not applied exactly: " + relativePath);
      }
    }
  }
}

function advisoryId(url: unknown): string {
  const value = String(url ?? "");
  return value.slice(value.lastIndexOf("/") + 1);
}

const root = realpathSync(process.cwd());
if (HAS_IMAGE_SIZE_PATCH) verifyReviewedPatch(root);
const result = spawnSync(process.execPath, ["audit", "--json"], {
  cwd: root,
  encoding: "utf8",
  env: process.env,
  windowsHide: true,
});
if (result.error) fail("bun audit could not start: " + result.error.message);
if (result.status !== 0 && result.status !== 1) {
  fail("bun audit could not complete: " + String(result.stderr ?? "").trim());
}
let parsedReport: unknown;
try {
  parsedReport = JSON.parse(String(result.stdout ?? ""));
} catch {
  fail("bun audit returned malformed JSON");
}
if (!isRecord(parsedReport)) fail("bun audit returned an invalid advisory report");
const unexpected: string[] = [];
let reviewed = 0;
for (const [packageName, advisories] of Object.entries(parsedReport)) {
  if (!Array.isArray(advisories)) fail("bun audit returned an invalid advisory list");
  for (const advisory of advisories) {
    if (!isRecord(advisory)) fail("bun audit returned an invalid advisory");
    const entry = advisory as AuditAdvisory;
    const severity = String(entry.severity ?? "unknown").toLowerCase();
    const rank = severityRank.get(severity);
    if (rank === undefined || severity === "unknown") {
      unexpected.push(packageName + ":" + advisoryId(entry.url) + ":unknown");
      continue;
    }
    if (rank < 3) continue;
    const id = advisoryId(entry.url);
    if (
      HAS_IMAGE_SIZE_PATCH &&
      packageName === "image-size" &&
      REVIEWED_ADVISORIES.get(id) === entry.url
    ) {
      reviewed += 1;
      continue;
    }
    unexpected.push(packageName + ":" + id + ":" + severity);
  }
}
if (unexpected.length > 0) fail("unreviewed HIGH/CRITICAL advisories: " + unexpected.join(", "));
const ignored = HAS_IMAGE_SIZE_PATCH
  ? [...REVIEWED_ADVISORIES.keys()].map((id) => "--ignore=" + id)
  : [];
const blocking = spawnSync(process.execPath, ["audit", "--audit-level=high", ...ignored], {
  cwd: root,
  encoding: "utf8",
  env: process.env,
  windowsHide: true,
});
if (blocking.error) fail("blocking bun audit could not start: " + blocking.error.message);
if (blocking.status !== 0) {
  fail("bun audit still reports an unreviewed HIGH/CRITICAL advisory");
}
console.log("Dependency audit passed" + (reviewed > 0 ? " with " + reviewed + " exactly patched image-size advisories" : ""));
