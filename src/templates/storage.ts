// @allow-long 665: one renderer keeps the local and S3 blob implementations behaviorally identical
import { file, packageJson, tsconfig, type TemplateFile } from "./shared.js";
import type { ProjectMode } from "../lib/addons.js";
import * as v from "./versions.js";

function storageImplementationContent(mode: ProjectMode): string {
  const envImport = mode === "monorepo" ? "@repo/config/server" : "@/lib/env/server";
  return `// @allow-long 615: hardened local/S3 blob adapter with handle-bound filesystem validation
import { constants, existsSync, realpathSync } from "node:fs";
import { lstat, mkdir, open, realpath, rename, unlink } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, sep } from "node:path";
import { randomUUID } from "node:crypto";
import { env } from "${envImport}";

const MAX_FILE_BYTES = 10 * 1024 * 1024;

function generatedProjectRoot(): string {
  const start = realpathSync.native(process.cwd());
  let current = start;
  for (;;) {
    // Root package scripts and app-local scripts execute with different cwd
    // values in monorepos. The desired-state file is the stable generated-root
    // marker shared by the web process and background cleanup workers.
    if (existsSync(join(current, "ghostinit.config.json"))) return current;
    const parent = dirname(current);
    if (parent === current) return start;
    current = parent;
  }
}

const PROJECT_ROOT = generatedProjectRoot();
const LOCAL_DATA_ROOT =
  PROJECT_ROOT.endsWith(sep) ? \`\${PROJECT_ROOT}data\` : \`\${PROJECT_ROOT}\${sep}data\`;
const READ_NO_FOLLOW_FLAGS =
  constants.O_RDONLY | (typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0);
const WRITE_EXCLUSIVE_NO_FOLLOW_FLAGS =
  constants.O_WRONLY |
  constants.O_CREAT |
  constants.O_EXCL |
  (typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0);
const OPAQUE_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
  "text/csv",
  "text/markdown",
]);

export interface StoredFile {
  storageKey: string;
  mimeType: string;
  byteSize: number;
  originalName: string;
}

type StorageDriver = "local" | "s3";
type OpenFileHandle = Awaited<ReturnType<typeof open>>;

interface FileIdentity {
  dev: bigint;
  ino: bigint;
}

interface OpenedUploadsRoot {
  handle: OpenFileHandle;
  identity: FileIdentity;
  path: string;
}

interface ConfiguredUploadsRoot {
  path: string;
  scopedToData: boolean;
}

interface OpenedLocalFile {
  byteSize: bigint;
  candidate: string;
  handle: OpenFileHandle;
  identity: FileIdentity;
  root: OpenedUploadsRoot;
}

function storageDriver(): StorageDriver {
  return env.STORAGE_DRIVER === "s3" ? "s3" : "local";
}

function normalizedOriginalName(value: string): string {
  let leafStart = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code === 0x2f || code === 0x5c) leafStart = index + 1;
  }
  const leaf = Array.from(value.slice(leafStart), (character) => {
    const code = character.codePointAt(0) ?? 0;
    return code <= 0x1f || code === 0x7f ? "_" : character;
  }).join("").trim();
  return Array.from(leaf || "attachment").slice(0, 255).join("");
}

function repeatedlyDecode(value: string): string {
  let current = value;
  for (let index = 0; index < 4; index += 1) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(current);
    } catch {
      throw new Error("Invalid encoded storage key");
    }
    if (decoded === current) return current;
    current = decoded;
  }
  return current;
}

/** Storage keys are generated server-side and never accepted as route IDs. */
export function assertSafeStorageKey(storageKey: string): string {
  const decoded = repeatedlyDecode(storageKey);
  if (
    decoded !== storageKey ||
    isAbsolute(decoded) ||
    decoded.includes("/") ||
    decoded.includes("\\\\") ||
    decoded === "." ||
    decoded === ".." ||
    !OPAQUE_KEY.test(decoded)
  ) {
    throw new Error("Invalid storage key");
  }
  return decoded;
}

function isContained(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

function isSameOrContained(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === "" || (rel !== ".." && !rel.startsWith(".." + sep) && !isAbsolute(rel));
}

function isPathSeparator(code: number): boolean {
  return code === 0x2f || code === 0x5c;
}

function hasUnsupportedPathControl(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

function withoutTrailingSeparators(value: string, minimumLength: number): string {
  let end = value.length;
  while (end > minimumLength && isPathSeparator(value.charCodeAt(end - 1))) end -= 1;
  return value.slice(0, end);
}

function assertAllowedAbsoluteUploadsRoot(candidate: string): void {
  const containsProject = isSameOrContained(candidate, PROJECT_ROOT);
  const insideProject = isSameOrContained(PROJECT_ROOT, candidate);
  const insideData = isSameOrContained(LOCAL_DATA_ROOT, candidate);
  if (containsProject || (insideProject && !insideData)) {
    throw new Error("UPLOADS_DIR cannot contain application files; use ./data/<directory>");
  }
}

function configuredUploadsRoot(): ConfiguredUploadsRoot {
  const raw = env.UPLOADS_DIR || "./data/uploads";
  if (raw !== raw.trim() || hasUnsupportedPathControl(raw)) {
    throw new Error("UPLOADS_DIR contains unsupported control or surrounding whitespace");
  }
  if (isPathSeparator(raw.charCodeAt(0)) && isPathSeparator(raw.charCodeAt(1))) {
    throw new Error("UPLOADS_DIR cannot use a UNC, device, or double-root path");
  }

  const drivePrefixed = /^[A-Za-z]:/.test(raw);
  const driveAbsolute = /^[A-Za-z]:[\\\\/]/.test(raw);
  const firstCode = raw.charCodeAt(0);
  let absolute = false;
  if (drivePrefixed) {
    if (!driveAbsolute) throw new Error("UPLOADS_DIR cannot use a drive-relative path");
    if (process.platform !== "win32") throw new Error("UPLOADS_DIR uses a foreign absolute path");
    absolute = true;
  } else if (firstCode === 0x2f) {
    if (process.platform === "win32") {
      throw new Error("UPLOADS_DIR cannot use a drive-less rooted path on Windows");
    }
    absolute = true;
  } else if (firstCode === 0x5c) {
    throw new Error("UPLOADS_DIR cannot use a drive-less rooted path");
  }

  const minimumLength = driveAbsolute ? 3 : absolute ? 1 : 0;
  const configured = withoutTrailingSeparators(raw, minimumLength);
  const segments = configured.split(/[\\\\/]+/);
  if (segments.includes("..")) throw new Error("UPLOADS_DIR cannot traverse parent directories");

  if (absolute) {
    if (configured === "/" || /^[A-Za-z]:[\\\\/]$/.test(configured)) {
      throw new Error("UPLOADS_DIR cannot be a filesystem root");
    }
    if (segments.includes(".")) throw new Error("UPLOADS_DIR must be canonical without dot segments");
    assertAllowedAbsoluteUploadsRoot(configured);
    return { path: configured, scopedToData: false };
  }

  const relativeSegments = configured.replaceAll("\\\\", "/").split("/");
  if (relativeSegments[0] === ".") relativeSegments.shift();
  if (
    relativeSegments.length < 2 ||
    relativeSegments[0] !== "data" ||
    relativeSegments.some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    throw new Error("Relative UPLOADS_DIR must be a descendant of ./data");
  }
  return { path: LOCAL_DATA_ROOT + sep + relativeSegments.slice(1).join(sep), scopedToData: true };
}

function containedChildPath(root: string, fileName: string): string {
  return root.endsWith(sep) ? root + fileName : root + sep + fileName;
}

function sameFileIdentity(left: FileIdentity, right: FileIdentity): boolean {
  return left.ino !== 0n && left.dev === right.dev && left.ino === right.ino;
}

function errorCode(error: unknown): string {
  if (!error || typeof error !== "object") return "";
  const candidate = error as { code?: unknown; name?: unknown };
  if (typeof candidate.code === "string") return candidate.code;
  return typeof candidate.name === "string" ? candidate.name : "";
}

function isNotFoundError(error: unknown): boolean {
  const code = errorCode(error);
  if (code === "ENOENT" || code === "NoSuchKey" || code === "NotFound") return true;
  if (!error || typeof error !== "object") return false;
  const metadata = (error as { $metadata?: { httpStatusCode?: unknown } }).$metadata;
  return metadata?.httpStatusCode === 404;
}

function symlinkError(message: string, cause?: unknown): Error {
  return cause === undefined ? new Error(message) : new Error(message, { cause });
}

async function openUploadsRoot(): Promise<OpenedUploadsRoot> {
  const configured = configuredUploadsRoot();
  if (configured.scopedToData) {
    await mkdir(LOCAL_DATA_ROOT, { recursive: true });
    const dataInfo = await lstat(LOCAL_DATA_ROOT);
    if (dataInfo.isSymbolicLink() || !dataInfo.isDirectory()) {
      throw new Error("Local data directory cannot be a symlink or reparse point");
    }
  }
  await mkdir(configured.path, { recursive: true });
  let handle: OpenFileHandle;
  try {
    handle = await open(configured.path, READ_NO_FOLLOW_FLAGS);
  } catch (error) {
    if (errorCode(error) === "ELOOP") {
      throw symlinkError("Uploads directory cannot be a symlink or reparse point", error);
    }
    throw error;
  }
  try {
    const [handleInfo, pathInfo, canonicalPath] = await Promise.all([
      handle.stat({ bigint: true }),
      lstat(configured.path, { bigint: true }),
      realpath(configured.path),
    ]);
    if (
      !handleInfo.isDirectory() ||
      pathInfo.isSymbolicLink() ||
      !pathInfo.isDirectory() ||
      !sameFileIdentity(handleInfo, pathInfo)
    ) {
      throw new Error("Uploads directory cannot be a symlink or reparse point");
    }
    const canonicalInfo = await lstat(canonicalPath, { bigint: true });
    if (!canonicalInfo.isDirectory() || !sameFileIdentity(handleInfo, canonicalInfo)) {
      throw new Error("Uploads directory changed while it was being opened");
    }
    if (configured.scopedToData && !isContained(LOCAL_DATA_ROOT, canonicalPath)) {
      throw new Error("Relative UPLOADS_DIR escaped the local data directory");
    }
    assertAllowedAbsoluteUploadsRoot(canonicalPath);
    return { handle, identity: handleInfo, path: canonicalPath };
  } catch (error) {
    await handle.close();
    throw error;
  }
}

async function closeLocalFile(opened: OpenedLocalFile): Promise<void> {
  await Promise.all([opened.handle.close(), opened.root.handle.close()]);
}

async function assertCurrentLocalFile(opened: OpenedLocalFile): Promise<void> {
  const [rootInfo, pathInfo, canonicalPath] = await Promise.all([
    lstat(opened.root.path, { bigint: true }),
    lstat(opened.candidate, { bigint: true }),
    realpath(opened.candidate),
  ]);
  if (
    rootInfo.isSymbolicLink() ||
    !rootInfo.isDirectory() ||
    !sameFileIdentity(opened.root.identity, rootInfo)
  ) {
    throw new Error("Uploads directory changed during storage access");
  }
  if (
    pathInfo.isSymbolicLink() ||
    !pathInfo.isFile() ||
    !sameFileIdentity(opened.identity, pathInfo) ||
    !isContained(opened.root.path, canonicalPath)
  ) {
    throw new Error("Storage object changed or is not a regular file contained by uploads");
  }
}

async function openRegularContainedName(fileName: string): Promise<OpenedLocalFile> {
  const root = await openUploadsRoot();
  const candidate = containedChildPath(root.path, fileName);
  if (!isContained(root.path, candidate)) {
    await root.handle.close();
    throw new Error("Storage path escapes uploads directory");
  }
  let handle: OpenFileHandle;
  try {
    handle = await open(candidate, READ_NO_FOLLOW_FLAGS);
  } catch (error) {
    await root.handle.close();
    if (errorCode(error) === "ELOOP") {
      throw symlinkError("Storage object is not a regular file", error);
    }
    throw error;
  }
  const opened: OpenedLocalFile = {
    byteSize: 0n,
    candidate,
    handle,
    identity: { dev: 0n, ino: 0n },
    root,
  };
  try {
    const handleInfo = await handle.stat({ bigint: true });
    if (!handleInfo.isFile()) throw new Error("Storage object is not a regular file");
    opened.byteSize = handleInfo.size;
    opened.identity = handleInfo;
    await assertCurrentLocalFile(opened);
    return opened;
  } catch (error) {
    await closeLocalFile(opened);
    throw error;
  }
}

async function openRegularContainedFile(storageKey: string): Promise<OpenedLocalFile> {
  return await openRegularContainedName(assertSafeStorageKey(storageKey));
}

async function writeLocalFile(storageKey: string, data: Uint8Array): Promise<void> {
  const key = assertSafeStorageKey(storageKey);
  const root = await openUploadsRoot();
  const candidate = containedChildPath(root.path, key);
  if (!isContained(root.path, candidate)) {
    await root.handle.close();
    throw new Error("Storage path escapes uploads directory");
  }
  let handle: OpenFileHandle;
  try {
    handle = await open(candidate, WRITE_EXCLUSIVE_NO_FOLLOW_FLAGS, 0o600);
  } catch (error) {
    await root.handle.close();
    throw error;
  }
  const opened: OpenedLocalFile = {
    byteSize: 0n,
    candidate,
    handle,
    identity: { dev: 0n, ino: 0n },
    root,
  };
  try {
    await handle.writeFile(data);
    const handleInfo = await handle.stat({ bigint: true });
    if (!handleInfo.isFile() || handleInfo.size !== BigInt(data.byteLength)) {
      throw new Error("Storage object changed while it was being written");
    }
    opened.byteSize = handleInfo.size;
    opened.identity = handleInfo;
    await assertCurrentLocalFile(opened);
  } catch (error) {
    // The handle may refer to a file created through a raced parent path. Wipe
    // the handle-bound bytes before closing rather than deleting an unchecked path.
    await handle.truncate(0).catch(() => undefined);
    throw error;
  } finally {
    await closeLocalFile(opened);
  }
}

function localTrashName(storageKey: string): string {
  return \`.ghostinit-delete-\${assertSafeStorageKey(storageKey)}\`;
}

async function unlinkOpenedLocalFile(opened: OpenedLocalFile): Promise<void> {
  try {
    await assertCurrentLocalFile(opened);
    await unlink(opened.candidate);
  } finally {
    await closeLocalFile(opened);
  }
}

function requireS3Config(): {
  bucket: string;
  client: {
    region: string;
    endpoint?: string;
    forcePathStyle?: boolean;
    credentials?: { accessKeyId: string; secretAccessKey: string };
  };
} {
  const bucket = env.STORAGE_BUCKET;
  if (!bucket || bucket.startsWith("REPLACE_WITH")) throw new Error("STORAGE_BUCKET is not configured");
  const accessKeyId = env.S3_ACCESS_KEY_ID;
  const secretAccessKey = env.S3_SECRET_ACCESS_KEY;
  if (accessKeyId?.startsWith("REPLACE_WITH") || secretAccessKey?.startsWith("REPLACE_WITH")) {
    throw new Error("S3 credentials still contain placeholders");
  }
  if (Boolean(accessKeyId) !== Boolean(secretAccessKey)) {
    throw new Error("S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY must be configured together");
  }
  const configuredEndpoint = env.S3_ENDPOINT?.trim();
  let endpoint: string | undefined;
  if (configuredEndpoint) {
    let parsed: URL;
    try {
      parsed = new URL(configuredEndpoint);
    } catch {
      throw new Error("S3_ENDPOINT must be a valid HTTPS or loopback URL");
    }
    const loopback = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
    if (
      configuredEndpoint !== env.S3_ENDPOINT ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash ||
      (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && loopback.has(parsed.hostname)))
    ) {
      throw new Error("S3_ENDPOINT must use HTTPS, except for credential-free loopback development URLs");
    }
    endpoint = parsed.toString();
  }
  return {
    bucket,
    client: {
      region: env.S3_REGION || "us-east-1",
      ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
      ...(accessKeyId && secretAccessKey ? { credentials: { accessKeyId, secretAccessKey } } : {}),
    },
  };
}

export function isAllowedMime(mimeType: string): boolean {
  return ALLOWED_MIME.has(mimeType.toLowerCase());
}

export function validateFile(mimeType: string, size: number): { valid: boolean; reason?: string } {
  if (!Number.isSafeInteger(size) || size <= 0) return { valid: false, reason: "Empty file" };
  if (size > MAX_FILE_BYTES) return { valid: false, reason: "File too large (max 10MB)" };
  if (!isAllowedMime(mimeType)) return { valid: false, reason: \`Unsupported mime type: \${mimeType}\` };
  return { valid: true };
}

export async function putFile(
  data: Uint8Array,
  originalName: string,
  mimeType: string,
  reservedStorageKey?: string,
  signal?: AbortSignal,
): Promise<StoredFile> {
  signal?.throwIfAborted();
  const validation = validateFile(mimeType, data.byteLength);
  if (!validation.valid) throw new Error(validation.reason);
  const storageKey = reservedStorageKey === undefined ? randomUUID() : assertSafeStorageKey(reservedStorageKey);
  const safeOriginalName = normalizedOriginalName(originalName);
  if (storageDriver() === "s3") {
    const { bucket, client: clientConfig } = requireS3Config();
    const { PutObjectCommand, S3Client } = await import("@aws-sdk/client-s3");
    const client = new S3Client(clientConfig);
    await client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: storageKey,
      Body: data,
      ContentLength: data.byteLength,
      ContentType: mimeType,
      ServerSideEncryption: "AES256",
      ...(reservedStorageKey === undefined ? {} : { IfNoneMatch: "*" }),
    }), { abortSignal: signal });
  } else {
    await writeLocalFile(storageKey, data);
  }
  signal?.throwIfAborted();
  return { storageKey, mimeType, byteSize: data.byteLength, originalName: safeOriginalName };
}

export async function getFile(storageKey: string, signal?: AbortSignal): Promise<Uint8Array | null> {
  signal?.throwIfAborted();
  const key = assertSafeStorageKey(storageKey);
  try {
    if (storageDriver() === "s3") {
      const { bucket, client: clientConfig } = requireS3Config();
      const { GetObjectCommand, S3Client } = await import("@aws-sdk/client-s3");
      const output = await new S3Client(clientConfig).send(new GetObjectCommand({ Bucket: bucket, Key: key }), { abortSignal: signal });
      if (typeof output.ContentLength === "number" && output.ContentLength > MAX_FILE_BYTES) {
        throw new Error("Stored object exceeds the 10MB limit");
      }
      if (!output.Body) return null;
      const data = await output.Body.transformToByteArray();
      signal?.throwIfAborted();
      if (data.byteLength > MAX_FILE_BYTES) throw new Error("Stored object exceeds the 10MB limit");
      return data;
    }
    const opened = await openRegularContainedFile(key);
    try {
      if (opened.byteSize > BigInt(MAX_FILE_BYTES)) {
        throw new Error("Stored object exceeds the 10MB limit");
      }
      // Read from the verified handle, never by path after lstat/realpath.
      const data = await opened.handle.readFile();
      signal?.throwIfAborted();
      return data;
    } finally {
      await closeLocalFile(opened);
    }
  } catch (error) {
    if (isNotFoundError(error)) return null;
    throw error;
  }
}

export async function deleteFile(storageKey: string, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  const key = assertSafeStorageKey(storageKey);
  try {
    if (storageDriver() === "s3") {
      const { bucket, client: clientConfig } = requireS3Config();
      const { DeleteObjectCommand, S3Client } = await import("@aws-sdk/client-s3");
      await new S3Client(clientConfig).send(new DeleteObjectCommand({ Bucket: bucket, Key: key }), { abortSignal: signal });
      return;
    }
    const trashName = localTrashName(key);
    let opened: OpenedLocalFile;
    try {
      opened = await openRegularContainedFile(key);
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
      // A crash or backend failure may leave an atomically renamed object in
      // private trash. The original opaque key deterministically finds it, so
      // retries finish the same idempotent deletion.
      const pending = await openRegularContainedName(trashName);
      await unlinkOpenedLocalFile(pending);
      return;
    }
    let cleanupOwnsHandles = true;
    try {
      const trashPath = containedChildPath(opened.root.path, trashName);
      if (!isContained(opened.root.path, trashPath)) throw new Error("Storage trash path escapes uploads directory");
      try {
        await lstat(trashPath);
        throw new Error("A pending storage deletion must be retried before this object");
      } catch (error) {
        if (!isNotFoundError(error)) throw error;
      }
      // Revalidate immediately before an atomic same-directory rename. Reads
      // can use a handle directly; Node/Bun expose no portable unlink-by-handle.
      // Moving the verified entry to a private deterministic name closes the
      // attacker-controlled-key window and makes an interrupted unlink retryable.
      await assertCurrentLocalFile(opened);
      await rename(opened.candidate, trashPath);
      opened.candidate = trashPath;
      cleanupOwnsHandles = false;
      await unlinkOpenedLocalFile(opened);
    } catch (error) {
      if (cleanupOwnsHandles) await closeLocalFile(opened).catch(() => undefined);
      throw error;
    }
  } catch (error) {
    if (!isNotFoundError(error)) throw error;
  }
}

export async function fileExists(storageKey: string): Promise<boolean> {
  const key = assertSafeStorageKey(storageKey);
  try {
    if (storageDriver() === "s3") {
      const { bucket, client: clientConfig } = requireS3Config();
      const { HeadObjectCommand, S3Client } = await import("@aws-sdk/client-s3");
      await new S3Client(clientConfig).send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      return true;
    }
    const opened = await openRegularContainedFile(key);
    try {
      return true;
    } finally {
      await closeLocalFile(opened);
    }
  } catch (error) {
    if (isNotFoundError(error)) return false;
    throw error;
  }
}
`;
}

/**
 * Monorepo emits a standalone package. Single mode maps the same hardened
 * implementation into the application's server tree and never emits packages/*.
 */
export function storagePackage(mode: ProjectMode = "monorepo"): TemplateFile[] {
  const implementation = storageImplementationContent(mode);
  if (mode === "single") {
    return [file("src/server/storage/index.ts", implementation)];
  }
  return [
    file(
      "packages/storage/package.json",
      packageJson({
        name: "@repo/storage",
        exports: { ".": "./src/index.ts" },
        scripts: {
          typecheck: "tsc --noEmit",
          lint: "oxlint --deny-warnings .",
          format: "oxfmt --write .",
          "format:check": "oxfmt --check .",
        },
        dependencies: {
          "@aws-sdk/client-s3": `^${v.storage["@aws-sdk/client-s3"]}`,
          "@repo/config": "workspace:*",
        },
        devDependencies: {
          "@types/node": `^${v.runtime["@types/node"]}`,
          typescript: `^${v.typescript.typescript}`,
        },
      }),
    ),
    file(
      "packages/storage/tsconfig.json",
      tsconfig({
        compilerOptions: { types: ["node"], outDir: "./dist", rootDir: "./src", declaration: true },
        include: ["src/**/*"],
      }),
    ),
    file("packages/storage/src/index.ts", implementation),
  ];
}
