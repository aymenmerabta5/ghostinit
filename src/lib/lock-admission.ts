import { constants, type Stats } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { join, resolve } from "node:path";
import { LockError } from "./errors.js";

const JOURNAL_PATH = ".ghostinit/security-installation.json";
const MAX_JOURNAL_BYTES = 16 * 1024;

function sameFile(left: Stats, right: Stats): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

function canonicalPath(path: string): string {
  const resolved = resolve(path);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function unsafeJournal(): never {
  throw new LockError(
    `Project mutation blocked: ${JOURNAL_PATH} must be a contained regular recovery journal`,
  );
}

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | null)?.code === "ENOENT";
}

async function containedJournal(root: string): Promise<string | null> {
  let canonicalRoot: string;
  try {
    canonicalRoot = await realpath(root);
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
  const directory = join(root, ".ghostinit");
  let directoryBefore: Stats;
  try {
    directoryBefore = await lstat(directory);
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
  if (!directoryBefore.isDirectory() || directoryBefore.isSymbolicLink()) unsafeJournal();
  const expectedDirectory = canonicalPath(join(canonicalRoot, ".ghostinit"));
  if (canonicalPath(await realpath(directory)) !== expectedDirectory) unsafeJournal();
  const path = join(directory, "security-installation.json");
  let before: Stats;
  try {
    before = await lstat(path);
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
  if (
    !before.isFile() ||
    before.isSymbolicLink() ||
    before.nlink !== 1 ||
    before.size > MAX_JOURNAL_BYTES
  )
    unsafeJournal();
  const expectedPath = canonicalPath(join(canonicalRoot, JOURNAL_PATH));
  if (canonicalPath(await realpath(path)) !== expectedPath) unsafeJournal();
  // O_NOFOLLOW is used where provided. Identity and canonical-path checks on
  // both sides of the read also reject reparse/symlink swaps on Windows.
  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const opened = await handle.stat();
    if (
      !sameFile(opened, before) ||
      !opened.isFile() ||
      opened.nlink !== 1 ||
      opened.size !== before.size ||
      opened.mtimeMs !== before.mtimeMs ||
      opened.ctimeMs !== before.ctimeMs
    )
      unsafeJournal();
    const bytes = Buffer.alloc(MAX_JOURNAL_BYTES + 1);
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
    if (bytesRead > MAX_JOURNAL_BYTES) unsafeJournal();
    const [after, directoryAfter, canonicalAfter] = await Promise.all([
      lstat(path),
      lstat(directory),
      realpath(path),
    ]);
    if (
      bytesRead !== before.size ||
      !after.isFile() ||
      after.isSymbolicLink() ||
      after.nlink !== 1 ||
      !sameFile(before, after) ||
      before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs ||
      before.ctimeMs !== after.ctimeMs ||
      !directoryAfter.isDirectory() ||
      directoryAfter.isSymbolicLink() ||
      !sameFile(directoryBefore, directoryAfter) ||
      canonicalPath(canonicalAfter) !== expectedPath
    )
      unsafeJournal();
    return bytes.subarray(0, bytesRead).toString("utf8");
  } finally {
    await handle.close();
  }
}

/** No policy/compiler/runtime imports: this guard also protects non-security mutations. */
export async function assertProjectMutationAdmitted(root: string): Promise<void> {
  const content = await containedJournal(root);
  if (content === null) return;
  let journal: unknown;
  try {
    journal = JSON.parse(content);
  } catch {
    unsafeJournal();
  }
  if (journal === null || typeof journal !== "object" || Array.isArray(journal)) unsafeJournal();
  // JSON.parse accepts duplicate keys. Reject ambiguous root fields so an
  // escaped/repeated status cannot conceal CLEANUP_UNVERIFIED.
  const tokens = content.match(/"(?:[^"\\]|\\.)*"|[{}[\]:,]|[^\s{}[\]:,]+/g) ?? [];
  const keys = new Set<string>();
  let depth = 0;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === "{" || token === "[") depth += 1;
    else if (token === "}" || token === "]") depth -= 1;
    else if (depth === 1 && token.startsWith('"') && tokens[index + 1] === ":") {
      const key = JSON.parse(token) as string;
      if (keys.has(key)) unsafeJournal();
      keys.add(key);
    }
  }
  const status = (journal as { status?: unknown }).status;
  if (status === "CLEANUP_UNVERIFIED") {
    throw new LockError(
      `Project mutation blocked: a prior dependency installation has unverified cleanup. Independently verify cleanup and explicitly reconcile ${JOURNAL_PATH} before retrying; --force does not bypass this barrier.`,
    );
  }
  if (status !== "INSTALLING" && status !== "FAILED") unsafeJournal();
}
