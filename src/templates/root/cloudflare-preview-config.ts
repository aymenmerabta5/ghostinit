/** Runtime-only binding names let Vite preview consume its filtered environment. */
export function cloudflarePreviewConfigContent(): string {
  return String.raw`import { lstatSync, realpathSync, readFileSync, writeFileSync, mkdirSync, readdirSync, renameSync, linkSync, unlinkSync, rmdirSync, openSync, fstatSync, closeSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";

const RECOVERY_PREFIX = ".dev.vars.ghostinit-process-recovery-preview-";
const MAX_CONFIG_BYTES = 1024 * 1024;
const identity = (a, b) => a.dev === b.dev && a.ino === b.ino && a.birthtimeMs === b.birthtimeMs;
const canonical = (path) => {
  const value = realpathSync.native(path);
  return /^[A-Za-z]:$/.test(value) ? value + sep : value;
};
const normalized = (path) => process.platform === "win32" ? resolve(path).toLowerCase() : resolve(path);
const record = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const pathExists = (path) => {
  try { lstatSync(path); return true; }
  catch (error) { if (error?.code === "ENOENT") return false; throw error; }
};

export function assertNoPreviewConfigRecovery(workspaceRoot) {
  if (readdirSync(workspaceRoot).some((name) => name.toLowerCase().startsWith(RECOVERY_PREFIX))) {
    throw new Error("Retained Worker preview configuration exists; verify its recorded wrapper and descendants stopped, then restore the original configuration before retrying");
  }
}

function captureParents(path, parents) {
  let directory = dirname(path);
  while (!parents.has(directory)) {
    const before = lstatSync(directory);
    if (!before.isDirectory() || before.isSymbolicLink() || normalized(canonical(directory)) !== normalized(directory)) {
      throw new Error("Worker preview configuration has an unsafe parent directory");
    }
    if (!identity(before, lstatSync(directory))) throw new Error("Worker preview configuration parent changed");
    parents.set(directory, before);
    const next = dirname(directory);
    if (next === directory) break;
    directory = next;
  }
}

function verifyParents(parents) {
  for (const [path, expected] of parents) {
    const actual = lstatSync(path);
    if (!actual.isDirectory() || actual.isSymbolicLink() || !identity(actual, expected) || normalized(canonical(path)) !== normalized(path)) {
      throw new Error("Worker preview configuration parent ownership changed");
    }
  }
}

function snapshot(path) {
  const before = lstatSync(path);
  if (!before.isFile() || before.isSymbolicLink() || before.size > MAX_CONFIG_BYTES) throw new Error("Worker preview configuration must be a bounded regular file");
  const fd = openSync(path, "r");
  try {
    const opened = fstatSync(fd);
    if (!identity(before, opened)) throw new Error("Worker preview configuration changed while opening");
    const bytes = readFileSync(fd);
    const after = fstatSync(fd);
    if (!identity(opened, after) || opened.size !== after.size || opened.mtimeMs !== after.mtimeMs || bytes.length !== after.size || !identity(after, lstatSync(path))) {
      throw new Error("Worker preview configuration changed while reading");
    }
    return { metadata: after, bytes };
  } finally { closeSync(fd); }
}

function verifyFile(path, expected) {
  const actual = snapshot(path);
  if (!identity(actual.metadata, expected.metadata) || actual.metadata.mtimeMs !== expected.metadata.mtimeMs || !actual.bytes.equals(expected.bytes)) {
    throw new Error("Worker preview configuration file ownership changed");
  }
}

function metadataBytes(original, entries) {
  const names = new Set();
  const normalizedNames = new Set();
  for (const entry of entries) {
    if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== "string" || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(entry[0]) || typeof entry[1] !== "string" || normalizedNames.has(entry[0].toUpperCase())) {
      throw new Error("Worker preview requires unique declared local string bindings");
    }
    names.add(entry[0]);
    normalizedNames.add(entry[0].toUpperCase());
  }
  let config;
  try { config = JSON.parse(original.toString("utf8")); }
  catch { throw new Error("Worker preview output configuration is not valid JSON"); }
  if (!record(config)) throw new Error("Worker preview output configuration must be an object");
  if (config.vars !== undefined && !record(config.vars)) throw new Error("Worker preview config.vars must be an object");
  const existing = config.secrets;
  if (existing !== undefined && (!record(existing) || Object.keys(existing).some((key) => key !== "required") || (existing.required !== undefined && (!Array.isArray(existing.required) || existing.required.some((name) => typeof name !== "string"))))) {
    throw new Error("Worker preview config.secrets must contain only a required string-name array");
  }
  for (const name of [...Object.keys(config.vars ?? {}), ...(existing?.required ?? [])]) {
    if (!names.has(name)) throw new Error("Worker preview configuration names a binding absent from the local snapshot: " + name);
  }
  config.secrets = { ...existing, required: [...names].sort() };
  return Buffer.from(JSON.stringify(config) + "\n");
}

/** Values are never serialized. Keep the original inode until all recovery steps verify. */
export function stagePreviewConfig({ workspaceRoot, appRoot, localEntries, assertOwned, retain }) {
  if (!isAbsolute(workspaceRoot) || !isAbsolute(appRoot)) throw new Error("Worker preview roots must be absolute");
  const root = resolve(workspaceRoot);
  const app = resolve(appRoot);
  const offset = relative(root, app);
  if (offset === ".." || offset.startsWith(".." + sep) || isAbsolute(offset)) throw new Error("Worker preview app must stay within its workspace");
  const entries = Object.freeze(localEntries.map((entry) => Object.freeze([...entry])));
  const configPath = resolve(app, "dist/server/wrangler.json");
  const parents = new Map();
  captureParents(configPath, parents);
  captureParents(resolve(root, "placeholder"), parents);
  const verify = () => { verifyParents(parents); assertOwned(); };
  verify();
  assertNoPreviewConfigRecovery(root);
  const original = snapshot(configPath);
  const preparedBytes = metadataBytes(original.bytes, entries);
  const recovery = resolve(root, RECOVERY_PREFIX + randomUUID());
  const originalPath = resolve(recovery, "original.json");
  const preparedPath = resolve(recovery, "preview.json");
  const capturedPath = resolve(recovery, "captured.json");
  const ownedFiles = new Map();
  let movedOriginal = false;
  let completed = false;
  let recoveryCreated = false;
  let installed;
  const retainedFailure = (cause) => {
    // A cleanup error after canonical restoration must retain a private link to
    // the verified original inode for both staging rollback and normal stop.
    try {
      verify();
      if (recoveryCreated && movedOriginal && !pathExists(originalPath)) {
        verifyFile(configPath, original);
        linkSync(configPath, originalPath);
        verifyFile(originalPath, original);
        ownedFiles.set(originalPath, original);
      }
    } catch { /* Preserve remaining evidence when ownership cannot be re-established. */ }
    retain();
    return new Error("Worker preview configuration recovery is retained at " + recovery + "; verify process cleanup and original ownership before recovery", { cause });
  };
  const writeOwned = (path, bytes) => {
    verify();
    const fd = openSync(path, "wx", 0o600);
    try {
      const created = fstatSync(fd);
      writeFileSync(fd, bytes);
      const value = snapshot(path);
      if (!identity(created, value.metadata) || !identity(created, fstatSync(fd)) || !value.bytes.equals(Buffer.from(bytes))) throw new Error("Worker preview metadata write did not verify");
      ownedFiles.set(path, value);
      return value;
    } finally { closeSync(fd); }
  };
  const removeRecovery = () => {
    const removalOrder = [...ownedFiles].sort(([left], [right]) => Number(left === originalPath) - Number(right === originalPath));
    for (const [path, expected] of removalOrder) {
      verify();
      if (movedOriginal) verifyFile(configPath, original);
      verifyFile(path, expected);
      unlinkSync(path);
      ownedFiles.delete(path);
    }
    verify();
    rmdirSync(recovery);
    parents.delete(recovery);
    recoveryCreated = false;
  };
  const recover = () => {
    verify();
    if (movedOriginal) {
      verifyFile(originalPath, original);
      if (pathExists(configPath)) {
        if (!installed) throw new Error("A replacement appeared at the Worker preview config path");
        verifyFile(configPath, installed);
        if (pathExists(capturedPath)) throw new Error("Worker preview capture path already exists");
        renameSync(configPath, capturedPath);
        ownedFiles.set(capturedPath, installed);
        verifyFile(capturedPath, installed);
      }
      verify();
      verifyFile(originalPath, original);
      // link is atomic create-if-absent; rename would overwrite a racing file on POSIX.
      linkSync(originalPath, configPath);
      verifyFile(configPath, original);
    } else {
      verifyFile(configPath, original);
    }
    removeRecovery();
    verify();
    verifyFile(configPath, original);
    if (pathExists(originalPath)) throw new Error("Worker preview original recovery path already exists");
    completed = true;
  };
  try {
    verify();
    mkdirSync(recovery, { mode: 0o700 });
    recoveryCreated = true;
    captureParents(originalPath, parents);
    writeOwned(resolve(recovery, "manifest.json"), JSON.stringify({ version: 1, configPath, originalPath, preparedPath, capturedPath }) + "\n");
    installed = writeOwned(preparedPath, preparedBytes);
    verify();
    verifyFile(configPath, original);
    renameSync(configPath, originalPath);
    movedOriginal = true;
    ownedFiles.set(originalPath, original);
    verifyFile(originalPath, original);
    verify();
    linkSync(preparedPath, configPath);
    verifyFile(configPath, installed);
  } catch (error) {
    if (!recoveryCreated) throw error;
    try { recover(); }
    catch (rollback) { throw retainedFailure(new AggregateError([error, rollback], "Worker preview metadata staging and recovery failed")); }
    throw error;
  }
  return {
    recoveryDirectory: recovery,
    restore(cleanupVerified) {
      if (completed) return;
      if (!cleanupVerified) throw retainedFailure(new Error("Worker preview child cleanup is unverified"));
      try { recover(); }
      catch (error) { throw retainedFailure(error); }
    },
  };
}
`;
}
