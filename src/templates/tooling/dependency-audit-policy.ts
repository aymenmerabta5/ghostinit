// @allow-long 1250: canonical fail-closed lock, registry, advisory, and exact installed-patch policy
import { generatedGitattributesContent } from "../gitignore.js";
import {
  OPENNEXT_AWS_PATCHED_COPY_TRACED_FILES_SHA256,
  OPENNEXT_AWS_WINDOWS_PATCH_KEY,
  OPENNEXT_AWS_WINDOWS_PATCH_PATH,
  OPENNEXT_AWS_WINDOWS_PATCH_SHA256,
  OPENNEXT_AWS_WINDOWS_PATCH_VERSION,
} from "../root/cloudflare.js";
import { runtime, supplyChain } from "../versions.js";

export const IMAGE_SIZE_PATCH_KEY = "image-size@1.2.1";
export const IMAGE_SIZE_PATCH_ADVISORIES = ["GHSA-w3rx-r6r6-pgpr", "GHSA-5p2g-fcmc-qvqq"] as const;
export const IMAGE_SIZE_PATCH_PATH = "patches/image-size@1.2.1.patch";
export const IMAGE_SIZE_PATCH_GITATTRIBUTES = generatedGitattributesContent(true);

export const IMAGE_SIZE_PATCH_CONTENT = `diff --git a/dist/types/icns.js b/dist/types/icns.js
index f2bfafef3723cb423b110304815e56e3f97f81e0..d38ef16bbd2904328fad2d6093dc0858b909a655 100644
--- a/dist/types/icns.js
+++ b/dist/types/icns.js
@@ -74,6 +74,13 @@ function getImageSize(type) {
     const size = ICON_TYPE_SIZE[type];
     return { width: size, height: size, type };
 }
+function nextImageOffset(imageOffset, imageLength) {
+    // An ICNS entry contains an eight-byte type/length header. Rejecting
+    // zero or undersized lengths prevents an attacker from pinning the loop.
+    if (!Number.isSafeInteger(imageLength) || imageLength < SIZE_HEADER)
+        throw new TypeError('Invalid ICNS entry length');
+    return imageOffset + imageLength;
+}
 exports.ICNS = {
     validate: (input) => (0, utils_1.toUTF8String)(input, 0, 4) === 'icns',
     calculate(input) {
@@ -82,7 +89,7 @@ exports.ICNS = {
         let imageOffset = SIZE_HEADER;
         let imageHeader = readImageHeader(input, imageOffset);
         let imageSize = getImageSize(imageHeader[0]);
-        imageOffset += imageHeader[1];
+        imageOffset = nextImageOffset(imageOffset, imageHeader[1]);
         if (imageOffset === fileLength)
             return imageSize;
         const result = {
@@ -93,7 +100,7 @@ exports.ICNS = {
         while (imageOffset < fileLength && imageOffset < inputLength) {
             imageHeader = readImageHeader(input, imageOffset);
             imageSize = getImageSize(imageHeader[0]);
-            imageOffset += imageHeader[1];
+            imageOffset = nextImageOffset(imageOffset, imageHeader[1]);
             result.images.push(imageSize);
         }
         return result;
diff --git a/dist/types/utils.js b/dist/types/utils.js
index 5224bbafe87551ac415cb3de234820ccc0ff6e2c..a3411a0c528a9a7af8a662bd1e6f6f77bb03fcee 100644
--- a/dist/types/utils.js
+++ b/dist/types/utils.js
@@ -52,7 +52,9 @@ function readBox(input, offset) {
     if (input.length - offset < 4)
         return;
     const boxSize = (0, exports.readUInt32BE)(input, offset);
-    if (input.length - offset < boxSize)
+    // Every box consumed here needs an eight-byte size/type header. Rejecting
+    // zero or undersized lengths also guarantees findBox always makes progress.
+    if (boxSize < 8 || input.length - offset < boxSize)
         return;
     return {
         name: (0, exports.toUTF8String)(input, 4 + offset, 8 + offset),
`;

// Reviewed immutable digest. Tests recompute this from IMAGE_SIZE_PATCH_CONTENT;
// never derive the expected value at runtime or a changed patch would bless itself.
export const IMAGE_SIZE_PATCH_SHA256 =
  "7805ea36efb396516b71b6965774b03c7df465bdda1489b937dc19d3bde8a7d8";

const PATCHED_ICNS_SHA256 = "ea073da10e66839d1f989dd62775312f85ba53e3d6b37476bce477f25da4e82f";
const PATCHED_UTILS_SHA256 = "6786c3d52ea46fab31d0d7883c16041f15a1604356bd0f139c1b2adc261234c1";

export function dependencyAuditScriptContent(
  hasImageSizePatch: boolean,
  hasOpenNextPatch = false,
): string {
  return `// @allow-long 1200: one fail-closed verifier keeps lock parsing, release-age checks, graph traversal, and audit policy together
import { spawnSync } from "node:child_process";
import { Buffer } from "node:buffer";
import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
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
  workspaces?: unknown;
};

type LockedRegistryPackage = {
  readonly key: string;
  readonly name: string;
  readonly version: string;
  readonly integrity: string;
};

type LockedReleaseEvidence = {
  readonly package: string;
  readonly version: string;
  readonly publishedAt: string;
  readonly integrity: string;
};

type LockEvidence = {
  readonly schemaVersion?: unknown;
  readonly registry?: unknown;
  readonly minimumReleaseAgeSeconds?: unknown;
  readonly auditedAt?: unknown;
  readonly lockSha256?: unknown;
  readonly releases?: unknown;
};

type BunRuntime = {
  readonly version: string;
  readonly TOML: { readonly parse: (source: string) => unknown };
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

const HAS_IMAGE_SIZE_PATCH = ${JSON.stringify(hasImageSizePatch)};
const HAS_OPENNEXT_PATCH = ${JSON.stringify(hasOpenNextPatch)};
const PATCH_KEY = ${JSON.stringify(IMAGE_SIZE_PATCH_KEY)};
const PATCH_PATH = ${JSON.stringify(IMAGE_SIZE_PATCH_PATH)};
const PATCH_SHA256 = ${JSON.stringify(IMAGE_SIZE_PATCH_SHA256)};
const PATCHED_FILES = new Map<string, string>([
  ["dist/types/icns.js", ${JSON.stringify(PATCHED_ICNS_SHA256)}],
  ["dist/types/utils.js", ${JSON.stringify(PATCHED_UTILS_SHA256)}],
]);
const OPENNEXT_PATCH_KEY = ${JSON.stringify(OPENNEXT_AWS_WINDOWS_PATCH_KEY)};
const OPENNEXT_PATCH_PATH = ${JSON.stringify(OPENNEXT_AWS_WINDOWS_PATCH_PATH)};
const OPENNEXT_PATCH_SHA256 = ${JSON.stringify(OPENNEXT_AWS_WINDOWS_PATCH_SHA256)};
const OPENNEXT_PATCHED_FILE_SHA256 = ${JSON.stringify(OPENNEXT_AWS_PATCHED_COPY_TRACED_FILES_SHA256)};
const OPENNEXT_PATCH_VERSION = ${JSON.stringify(OPENNEXT_AWS_WINDOWS_PATCH_VERSION)};
const EXPECTED_BUN_VERSION = ${JSON.stringify(runtime.bun)};
const MINIMUM_RELEASE_AGE_SECONDS = ${JSON.stringify(supplyChain.minimumReleaseAgeSeconds)};
const PUBLIC_REGISTRY = "https://registry.npmjs.org";
const LOCK_EVIDENCE_PATH = "dependency-lock-evidence.json";
const REGISTRY_OVERRIDE_KEYS = new Set(["BUN_CONFIG_REGISTRY", "NPM_CONFIG_REGISTRY"]);
const REGISTRY_CONFIG_PATH_KEYS = new Set(["BUN_CONFIG_PATH", "NPM_CONFIG_USERCONFIG"]);
const REGISTRY_TIMEOUT_MS = 15_000;
const REGISTRY_CONCURRENCY = 8;
const REGISTRY_MAX_ATTEMPTS = 3;
const REGISTRY_RETRY_BASE_DELAY_MS = 250;
const ADVISORY_AUDIT_ATTEMPT_TIMEOUT_MS = 60_000;
const ADVISORY_AUDIT_MAX_ATTEMPTS = 3;
const ADVISORY_AUDIT_RETRY_BASE_DELAY_MS = 500;
const ADVISORY_AUDIT_MAX_BUFFER_BYTES = 16 * 1024 * 1024;
const SEMVER_PATTERN = /^(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)(?:-(?:0|[1-9]\\d*|\\d*[A-Za-z-][0-9A-Za-z-]*)(?:\\.(?:0|[1-9]\\d*|\\d*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$/;
const SHA512_INTEGRITY_PATTERN = /^sha512-[A-Za-z0-9+/]+={0,2}$/;
const REVIEWED_ADVISORIES = new Map<string, string>([
${IMAGE_SIZE_PATCH_ADVISORIES.map((id) => "  [" + JSON.stringify(id) + ", " + JSON.stringify("https://github.com/advisories/" + id) + "],").join("\n")}
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
const bunRuntime = (globalThis as typeof globalThis & { readonly Bun?: BunRuntime }).Bun;

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

function isSha512Integrity(value: unknown): value is string {
  if (typeof value !== "string" || !SHA512_INTEGRITY_PATTERN.test(value)) return false;
  const encoded = value.slice("sha512-".length);
  const decoded = Buffer.from(encoded, "base64");
  return decoded.length === 64 && decoded.toString("base64") === encoded;
}

function lockedRegistryPackages(lock: BunLock): LockedRegistryPackage[] {
  if (
    typeof lock.lockfileVersion !== "number" ||
    !SUPPORTED_BUN_LOCKFILE_VERSIONS.has(lock.lockfileVersion)
  ) {
    fail("bun.lock uses an unsupported lockfile version");
  }
  if (!isRecord(lock.packages)) fail("bun.lock does not contain a package resolution map");
  const workspaces = isRecord(lock.workspaces) ? lock.workspaces : undefined;
  const packages: LockedRegistryPackage[] = [];
  for (const [key, record] of Object.entries(lock.packages)) {
    if (!Array.isArray(record) || typeof record[0] !== "string") {
      fail("bun.lock contains an invalid package record: " + key);
    }
    const resolution = record[0];
    const workspace = /^(.+)@workspace:(.+)$/.exec(resolution);
    if (workspace?.[1] && workspace[2]) {
      const workspaceRecord = workspaces?.[workspace[2]];
      const workspaceName = isRecord(workspaceRecord) ? workspaceRecord.name : undefined;
      if (workspaceName !== workspace[1] || record.length !== 1) {
        fail("bun.lock contains an unresolved workspace package: " + key);
      }
      continue;
    }
    const separator = resolution.lastIndexOf("@");
    const name = separator > 0 ? resolution.slice(0, separator) : "";
    const version = separator > 0 ? resolution.slice(separator + 1) : "";
    if (!name || !SEMVER_PATTERN.test(version)) {
      fail("bun.lock contains an unsupported package resolution: " + key);
    }
    if (
      record.length !== 4 ||
      record[1] !== "" ||
      !isRecord(record[2]) ||
      !isSha512Integrity(record[3])
    ) {
      fail("bun.lock package is not a public-registry tuple with canonical sha512 integrity: " + key);
    }
    packages.push({ key, name, version, integrity: record[3] });
  }
  return packages;
}

function retryableRegistryStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

async function waitForRegistryRetry(attempt: number): Promise<void> {
  await new Promise((resolve) =>
    setTimeout(resolve, REGISTRY_RETRY_BASE_DELAY_MS * 2 ** attempt),
  );
}

async function fetchRegistryDocument(name: string): Promise<unknown> {
  const url = PUBLIC_REGISTRY + "/" + encodeURIComponent(name);
  let lastRetryableFailure = "unknown transient failure";
  for (let attempt = 0; attempt < REGISTRY_MAX_ATTEMPTS; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { accept: "application/json" },
        redirect: "error",
        signal: AbortSignal.timeout(REGISTRY_TIMEOUT_MS),
      });
    } catch {
      lastRetryableFailure = "network request failed or timed out";
      if (attempt + 1 < REGISTRY_MAX_ATTEMPTS) {
        await waitForRegistryRetry(attempt);
        continue;
      }
      break;
    }
    if (!response.ok) {
      if (!retryableRegistryStatus(response.status)) {
        fail("npm publication metadata returned HTTP " + response.status + " for " + name);
      }
      lastRetryableFailure = "HTTP " + response.status;
      if (attempt + 1 < REGISTRY_MAX_ATTEMPTS) {
        await waitForRegistryRetry(attempt);
        continue;
      }
      break;
    }
    try {
      return await response.json();
    } catch {
      lastRetryableFailure = "response body was malformed or truncated JSON";
      if (attempt + 1 < REGISTRY_MAX_ATTEMPTS) {
        await waitForRegistryRetry(attempt);
        continue;
      }
      break;
    }
  }
  fail(
    "npm publication metadata failed after " +
      REGISTRY_MAX_ATTEMPTS +
      " attempts for " +
      name +
      ": " +
      lastRetryableFailure,
  );
}

async function fetchReleaseEvidence(
  packages: readonly LockedRegistryPackage[],
  auditedAt: string,
): Promise<LockedReleaseEvidence[]> {
  if (!Number.isInteger(MINIMUM_RELEASE_AGE_SECONDS) || MINIMUM_RELEASE_AGE_SECONDS <= 0) {
    fail("minimum release age is not a positive integer");
  }
  const now = Date.parse(auditedAt);
  if (!Number.isFinite(now)) fail("lock evidence audit time is invalid");
  const cutoff = now - MINIMUM_RELEASE_AGE_SECONDS * 1000;
  const versionsByPackage = new Map<string, Map<string, Set<string>>>();
  for (const entry of packages) {
    const versions = versionsByPackage.get(entry.name) ?? new Map<string, Set<string>>();
    const integrities = versions.get(entry.version) ?? new Set<string>();
    integrities.add(entry.integrity);
    versions.set(entry.version, integrities);
    versionsByPackage.set(entry.name, versions);
  }
  const entries = [...versionsByPackage.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  );
  const releases: LockedReleaseEvidence[] = [];
  const verifyPackage = async ([name, versions]: readonly [
    string,
    Map<string, Set<string>>,
  ]): Promise<void> => {
    const document = await fetchRegistryDocument(name);
    if (
      !isRecord(document) ||
      document.name !== name ||
      !isRecord(document.time) ||
      !isRecord(document.versions)
    ) {
      fail("npm publication metadata has an invalid identity or time map for " + name);
    }
    for (const [version, lockedIntegrities] of [...versions.entries()].sort(([left], [right]) =>
      left.localeCompare(right),
    )) {
      const publishedAt = document.time[version];
      if (typeof publishedAt !== "string") {
        fail("npm publication time is missing or invalid for " + name + "@" + version);
      }
      const publishedMilliseconds = Date.parse(publishedAt);
      if (!Number.isFinite(publishedMilliseconds)) {
        fail("npm publication time is missing or invalid for " + name + "@" + version);
      }
      if (publishedMilliseconds > cutoff) {
        fail(
          name +
            "@" +
            version +
            " was published " +
            publishedAt +
            ", after the release-age cutoff " +
            new Date(cutoff).toISOString(),
        );
      }
      const versionDocument = document.versions[version];
      const dist = isRecord(versionDocument) ? versionDocument.dist : undefined;
      const registryIntegrity = isRecord(dist) ? dist.integrity : undefined;
      if (!isSha512Integrity(registryIntegrity)) {
        fail("npm registry has no canonical sha512 integrity for " + name + "@" + version);
      }
      if (
        lockedIntegrities.size !== 1 ||
        !lockedIntegrities.has(registryIntegrity)
      ) {
        fail("bun.lock integrity does not match the public npm registry for " + name + "@" + version);
      }
      releases.push({ package: name, version, publishedAt, integrity: registryIntegrity });
    }
  };
  for (let index = 0; index < entries.length; index += REGISTRY_CONCURRENCY) {
    await Promise.all(entries.slice(index, index + REGISTRY_CONCURRENCY).map(verifyPackage));
  }
  return releases.sort(
    (left, right) =>
      left.package.localeCompare(right.package) || left.version.localeCompare(right.version),
  );
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

function publicRegistryOrigin(value: string, label: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    fail(label + " must be the public npm registry URL");
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    (parsed.pathname !== "" && parsed.pathname !== "/") ||
    parsed.search !== "" ||
    parsed.hash !== ""
  ) {
    fail(label + " must be an HTTPS registry origin without credentials or a path");
  }
  return parsed.origin;
}

function verifyPublicRegistryConfiguration(root: string): void {
  if (!bunRuntime || bunRuntime.version !== EXPECTED_BUN_VERSION) {
    fail(
      "dependency verification requires Bun " +
        EXPECTED_BUN_VERSION +
        "; received " +
        (!bunRuntime ? "a non-Bun runtime" : "Bun " + bunRuntime.version),
    );
  }
  const bunfigPath = containedRegularFile(root, join(root, "bunfig.toml"), "bunfig.toml");
  let bunfig: unknown;
  try {
    bunfig = bunRuntime.TOML.parse(readFileSync(bunfigPath, "utf8"));
  } catch {
    fail("bunfig.toml is not valid TOML");
  }
  const install = isRecord(bunfig) && isRecord(bunfig.install) ? bunfig.install : undefined;
  if (
    !install ||
    typeof install.registry !== "string" ||
    publicRegistryOrigin(install.registry, "bunfig.toml install.registry") !== PUBLIC_REGISTRY ||
    install.minimumReleaseAge !== MINIMUM_RELEASE_AGE_SECONDS ||
    !Array.isArray(install.minimumReleaseAgeExcludes) ||
    install.minimumReleaseAgeExcludes.length !== 0
  ) {
    fail("bunfig.toml does not enforce the reviewed public-registry and release-age policy");
  }
  const lockfile = isRecord(install.lockfile) ? install.lockfile : undefined;
  if (!lockfile || lockfile.path !== "bun.lock") {
    fail("bunfig.toml must keep the reviewed root bun.lock path");
  }
  if (existsSync(join(root, ".npmrc"))) {
    fail("project .npmrc overrides are not allowed by the public-registry dependency policy");
  }
  for (const [rawKey, rawValue] of Object.entries(process.env)) {
    if (!rawValue) continue;
    const key = rawKey.toUpperCase();
    if (REGISTRY_CONFIG_PATH_KEYS.has(key)) {
      fail("registry configuration path override is not allowed: " + rawKey);
    }
    if (
      REGISTRY_OVERRIDE_KEYS.has(key) &&
      publicRegistryOrigin(rawValue, rawKey) !== PUBLIC_REGISTRY
    ) {
      fail("registry override does not select the public npm registry: " + rawKey);
    }
  }
}

function lockSha256(lockPath: string): string {
  return createHash("sha256").update(readFileSync(lockPath)).digest("hex");
}

function releaseKey(name: string, version: string): string {
  return name + "@" + version;
}

function verifyCommittedReleaseEvidence(
  root: string,
  lockPath: string,
  packages: readonly LockedRegistryPackage[],
): void {
  const evidencePath = join(root, LOCK_EVIDENCE_PATH);
  const evidence = readJsonRecord(root, evidencePath, LOCK_EVIDENCE_PATH) as LockEvidence;
  const expectedKeys = [
    "auditedAt",
    "lockSha256",
    "minimumReleaseAgeSeconds",
    "registry",
    "releases",
    "schemaVersion",
  ];
  if (Object.keys(evidence).sort().join(",") !== expectedKeys.join(",")) {
    fail(LOCK_EVIDENCE_PATH + " has an unexpected shape");
  }
  if (
    evidence.schemaVersion !== 1 ||
    evidence.registry !== PUBLIC_REGISTRY ||
    evidence.minimumReleaseAgeSeconds !== MINIMUM_RELEASE_AGE_SECONDS ||
    typeof evidence.auditedAt !== "string" ||
    typeof evidence.lockSha256 !== "string" ||
    !Array.isArray(evidence.releases)
  ) {
    fail(LOCK_EVIDENCE_PATH + " does not match the lock-audit policy");
  }
  if (evidence.lockSha256 !== lockSha256(lockPath)) {
    fail(LOCK_EVIDENCE_PATH + " does not attest the current bun.lock");
  }
  const auditedAt = Date.parse(evidence.auditedAt);
  if (!Number.isFinite(auditedAt) || auditedAt > Date.now()) {
    fail(LOCK_EVIDENCE_PATH + " has an invalid or future auditedAt timestamp");
  }
  const cutoff = auditedAt - MINIMUM_RELEASE_AGE_SECONDS * 1000;
  const recorded = new Map<string, LockedReleaseEvidence>();
  for (const rawRelease of evidence.releases) {
    if (
      !isRecord(rawRelease) ||
      Object.keys(rawRelease).sort().join(",") !== "integrity,package,publishedAt,version" ||
      typeof rawRelease.package !== "string" ||
      rawRelease.package.length === 0 ||
      typeof rawRelease.version !== "string" ||
      !SEMVER_PATTERN.test(rawRelease.version) ||
      typeof rawRelease.publishedAt !== "string" ||
      !isSha512Integrity(rawRelease.integrity)
    ) {
      fail(LOCK_EVIDENCE_PATH + " contains a malformed release record");
    }
    const key = releaseKey(rawRelease.package, rawRelease.version);
    if (recorded.has(key)) fail(LOCK_EVIDENCE_PATH + " contains duplicate release " + key);
    const publishedAt = Date.parse(rawRelease.publishedAt);
    if (!Number.isFinite(publishedAt)) {
      fail(LOCK_EVIDENCE_PATH + " contains an invalid publication time for " + key);
    }
    if (publishedAt > cutoff) {
      fail(key + " was not old enough at the committed dependency audit cutoff");
    }
    recorded.set(key, {
      package: rawRelease.package,
      version: rawRelease.version,
      publishedAt: rawRelease.publishedAt,
      integrity: rawRelease.integrity,
    });
  }
  const locked = new Set<string>();
  for (const entry of packages) {
    const key = releaseKey(entry.name, entry.version);
    locked.add(key);
    const release = recorded.get(key);
    if (!release) fail(LOCK_EVIDENCE_PATH + " is missing locked release " + key);
    if (release.integrity !== entry.integrity) {
      fail(LOCK_EVIDENCE_PATH + " integrity does not attest bun.lock for " + key);
    }
  }
  for (const key of recorded.keys()) {
    if (!locked.has(key)) fail(LOCK_EVIDENCE_PATH + " contains stale release " + key);
  }
}

function writeReleaseEvidence(
  root: string,
  lockDigest: string,
  auditedAt: string,
  releases: readonly LockedReleaseEvidence[],
): void {
  const target = join(root, LOCK_EVIDENCE_PATH);
  if (existsSync(target)) {
    const metadata = lstatSync(target);
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      fail(LOCK_EVIDENCE_PATH + " must be a regular non-symlink file");
    }
  }
  const transactionId = randomUUID();
  const temporary = target + "." + transactionId + ".tmp";
  const backup = target + "." + transactionId + ".bak";
  let movedExisting = false;
  try {
    writeFileSync(
      temporary,
      JSON.stringify(
        {
          schemaVersion: 1,
          registry: PUBLIC_REGISTRY,
          minimumReleaseAgeSeconds: MINIMUM_RELEASE_AGE_SECONDS,
          auditedAt,
          lockSha256: lockDigest,
          releases,
        },
        null,
        2,
      ) + "\\n",
      { encoding: "utf8", flag: "wx" },
    );
    if (existsSync(target)) {
      renameSync(target, backup);
      movedExisting = true;
    }
    try {
      renameSync(temporary, target);
    } catch (error) {
      if (movedExisting && !existsSync(target) && existsSync(backup)) {
        renameSync(backup, target);
        movedExisting = false;
      }
      throw error;
    }
    if (movedExisting) {
      rmSync(backup, { force: true });
      movedExisting = false;
    }
  } catch (error) {
    rmSync(temporary, { force: true });
    if (movedExisting && !existsSync(target) && existsSync(backup)) {
      try {
        renameSync(backup, target);
        movedExisting = false;
      } catch {}
    }
    fail(
      "could not publish " +
        LOCK_EVIDENCE_PATH +
        ": " +
        (error instanceof Error ? error.message : String(error)),
    );
  }
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
    const pattern = rawPattern.replaceAll("\\\\", "/");
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

function installedPackages(
  root: string,
  manifest: PackageManifest,
  expectedName: string,
): string[] {
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
        if (location.installName === expectedName && installed.name !== expectedName) {
          fail("the reviewed install path has an unexpected package identity: " + expectedName);
        }
        if (installed.name === expectedName) candidates.add(location.root);
      } else if (location.installName === expectedName) {
        fail("the reviewed install path is missing package.json: " + expectedName);
      }
      const nested = join(location.root, "node_modules");
      if (existsSync(nested)) pending.push(nested);
    }
  }
  return [...candidates];
}

function verifyReviewedPatchLock(
  root: string,
  manifest: PackageManifest,
  lock: BunLock,
  registryPackages: readonly LockedRegistryPackage[],
): void {
  if (manifest.patchedDependencies?.[PATCH_KEY] !== PATCH_PATH) {
    fail("package.json does not bind the reviewed image-size patch");
  }
  const patch = join(root, PATCH_PATH);
  if (sha256(root, patch, "reviewed image-size patch") !== PATCH_SHA256) {
    fail("the reviewed image-size patch is missing or its SHA-256 changed");
  }
  if (!isRecord(lock.patchedDependencies) || lock.patchedDependencies[PATCH_KEY] !== PATCH_PATH) {
    fail("bun.lock does not bind the reviewed image-size patch");
  }
  const lockResolutions = registryPackages
    .filter(({ name }) => name === "image-size")
    .map(({ name, version }) => name + "@" + version);
  if (
    lockResolutions.length === 0 ||
    lockResolutions.some((resolution) => resolution !== PATCH_KEY)
  ) {
    fail("bun.lock contains an unreviewed or missing image-size resolution");
  }
}

function verifyReviewedPatchInstalled(root: string, manifest: PackageManifest): void {
  const packages = installedPackages(root, manifest, "image-size");
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

function verifyOpenNextPatchLock(
  root: string,
  manifest: PackageManifest,
  lock: BunLock,
  registryPackages: readonly LockedRegistryPackage[],
): void {
  if (manifest.patchedDependencies?.[OPENNEXT_PATCH_KEY] !== OPENNEXT_PATCH_PATH) {
    fail("package.json does not bind the reviewed OpenNext Windows patch");
  }
  if (sha256(root, join(root, OPENNEXT_PATCH_PATH), "reviewed OpenNext patch") !== OPENNEXT_PATCH_SHA256) {
    fail("the reviewed OpenNext patch is missing or its SHA-256 changed");
  }
  if (!isRecord(lock.patchedDependencies) || lock.patchedDependencies[OPENNEXT_PATCH_KEY] !== OPENNEXT_PATCH_PATH) {
    fail("bun.lock does not bind the reviewed OpenNext patch");
  }
  const resolutions = registryPackages
    .filter(({ name }) => name === "@opennextjs/aws")
    .map(({ name, version }) => name + "@" + version);
  if (resolutions.length === 0 || resolutions.some((resolution) => resolution !== OPENNEXT_PATCH_KEY)) {
    fail("bun.lock contains an unreviewed or missing @opennextjs/aws resolution");
  }
}

function verifyOpenNextPatchInstalled(root: string, manifest: PackageManifest): void {
  const packages = installedPackages(root, manifest, "@opennextjs/aws");
  if (packages.length === 0) fail("the reviewed @opennextjs/aws package is not installed");
  for (const packageRoot of packages) {
    const installed = readJsonRecord(root, join(packageRoot, "package.json"), "installed OpenNext AWS package manifest") as InstalledPackageManifest;
    if (installed.name !== "@opennextjs/aws" || installed.version !== OPENNEXT_PATCH_VERSION) {
      fail("the reviewed OpenNext patch resolved an unexpected package");
    }
    const target = join(packageRoot, "dist/build/copyTracedFiles.js");
    if (sha256(root, target, "installed OpenNext copyTracedFiles.js") !== OPENNEXT_PATCHED_FILE_SHA256) {
      fail("the installed OpenNext Windows patch was not applied exactly");
    }
  }
}

async function verifyLockOnly(root: string, refreshEvidence: boolean): Promise<PackageManifest> {
  verifyPublicRegistryConfiguration(root);
  const manifest = readJsonRecord(root, join(root, "package.json"), "package.json") as PackageManifest;
  const lockPath = containedRegularFile(root, join(root, "bun.lock"), "bun.lock");
  const initialLockDigest = lockSha256(lockPath);
  const lock = parseBunLock(readFileSync(lockPath, "utf8"));
  const registryPackages = lockedRegistryPackages(lock);
  if (HAS_IMAGE_SIZE_PATCH) verifyReviewedPatchLock(root, manifest, lock, registryPackages);
  if (HAS_OPENNEXT_PATCH) verifyOpenNextPatchLock(root, manifest, lock, registryPackages);
  if (refreshEvidence) {
    const auditedAt = new Date().toISOString();
    const releases = await fetchReleaseEvidence(registryPackages, auditedAt);
    if (lockSha256(lockPath) !== initialLockDigest) {
      fail("bun.lock changed while public-registry evidence was being refreshed");
    }
    writeReleaseEvidence(
      root,
      initialLockDigest,
      auditedAt,
      releases,
    );
    const publishedLock = parseBunLock(readFileSync(lockPath, "utf8"));
    verifyCommittedReleaseEvidence(root, lockPath, lockedRegistryPackages(publishedLock));
  } else {
    verifyCommittedReleaseEvidence(root, lockPath, registryPackages);
  }
  return manifest;
}

function advisoryId(url: unknown): string {
  const value = String(url ?? "");
  return value.slice(value.lastIndexOf("/") + 1);
}

async function bunAuditReport(root: string): Promise<Record<string, unknown>> {
  let lastRetryableFailure = "unknown transient failure";
  for (let attempt = 0; attempt < ADVISORY_AUDIT_MAX_ATTEMPTS; attempt += 1) {
    const result = spawnSync(process.execPath, ["audit", "--json"], {
      cwd: root,
      encoding: "utf8",
      env: process.env,
      maxBuffer: ADVISORY_AUDIT_MAX_BUFFER_BYTES,
      timeout: ADVISORY_AUDIT_ATTEMPT_TIMEOUT_MS,
      windowsHide: true,
    });
    if (result.error) {
      const code = (result.error as NodeJS.ErrnoException).code;
      if (code !== "ETIMEDOUT") {
        fail("bun audit could not start: " + result.error.message);
      }
      lastRetryableFailure =
        "timed out after " + ADVISORY_AUDIT_ATTEMPT_TIMEOUT_MS + "ms";
    } else if (result.signal !== null) {
      fail("bun audit terminated by signal " + String(result.signal));
    } else if (result.status !== 0 && result.status !== 1) {
      lastRetryableFailure = "exited without an advisory report (code " + result.status + ")";
    } else {
      let parsed: unknown;
      try {
        parsed = JSON.parse(String(result.stdout ?? ""));
      } catch {
        lastRetryableFailure = "returned malformed or truncated JSON";
        parsed = undefined;
      }
      if (isRecord(parsed)) {
        const advisoryLists = Object.values(parsed);
        if (
          advisoryLists.every(
            (advisories) =>
              Array.isArray(advisories) && advisories.every((advisory) => isRecord(advisory)),
          ) &&
          (result.status === 0 ||
            advisoryLists.some(
              (advisories) => Array.isArray(advisories) && advisories.length > 0,
            ))
        ) {
          return parsed;
        }
      }
      if (parsed !== undefined) lastRetryableFailure = "returned an invalid advisory report";
    }
    if (attempt + 1 < ADVISORY_AUDIT_MAX_ATTEMPTS) {
      await new Promise((resolve) =>
        setTimeout(resolve, ADVISORY_AUDIT_RETRY_BASE_DELAY_MS * 2 ** attempt),
      );
    }
  }
  fail(
    "bun audit failed after " +
      ADVISORY_AUDIT_MAX_ATTEMPTS +
      " attempts: " +
      lastRetryableFailure,
  );
}

const root = realpathSync(process.cwd());
const cliArguments = process.argv.slice(2);
if (
  cliArguments.length > 1 ||
  (cliArguments.length === 1 &&
    cliArguments[0] !== "--lock-only" &&
    cliArguments[0] !== "--refresh-lock-evidence")
) {
  fail("usage: bun scripts/audit-dependencies.ts [--lock-only|--refresh-lock-evidence]");
}
const refreshEvidence = cliArguments[0] === "--refresh-lock-evidence";
const lockOnly = cliArguments[0] === "--lock-only" || refreshEvidence;
const manifest = await verifyLockOnly(root, refreshEvidence);
if (lockOnly) {
  console.log(
    (refreshEvidence ? "Dependency lock evidence refreshed with a " : "Dependency lock audit passed with a ") +
      MINIMUM_RELEASE_AGE_SECONDS +
      "-second minimum release age",
  );
  process.exit(0);
}
if (HAS_IMAGE_SIZE_PATCH) verifyReviewedPatchInstalled(root, manifest);
if (HAS_OPENNEXT_PATCH) verifyOpenNextPatchInstalled(root, manifest);
const parsedReport = await bunAuditReport(root);
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
console.log("Dependency audit passed" + (reviewed > 0 ? " with " + reviewed + " exactly patched image-size advisories" : ""));
`;
}
