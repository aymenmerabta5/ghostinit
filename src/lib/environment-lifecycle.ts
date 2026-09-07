import { randomUUID } from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
  type Stats,
} from "node:fs";
import { join } from "node:path";
import { CLOUDFLARE_ENVIRONMENT_LOCK_FILE } from "./dotenv.js";
import { ConflictError } from "./errors.js";

const ENVIRONMENT_LIFECYCLE_PREFIX = ".dev.vars.ghostinit-";

function directoryExists(path: string): boolean {
  try {
    const metadata = lstatSync(path);
    if (metadata.isSymbolicLink()) {
      throw new ConflictError("Environment lifecycle directory is unsafe", { path });
    }
    return metadata.isDirectory();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

/** Inspect both possible roots even while desired deploy/mode is changing. */
export function listEnvironmentLifecyclePaths(root: string): string[] {
  const directories = [{ absolute: root, prefix: "" }];
  if (!directoryExists(root)) throw new ConflictError("Project root does not exist");
  if (directoryExists(join(root, "apps")) && directoryExists(join(root, "apps", "web"))) {
    directories.push({ absolute: join(root, "apps", "web"), prefix: "apps/web/" });
  }
  return directories
    .flatMap(({ absolute, prefix }) =>
      readdirSync(absolute)
        .filter((name) => name.toLowerCase().startsWith(ENVIRONMENT_LIFECYCLE_PREFIX))
        .map((name) => prefix + name),
    )
    .sort();
}

export function environmentLifecycleGuidance(paths: readonly string[]): string {
  return `Cloudflare environment lifecycle is active or requires recovery: ${paths.join(", ")}. Do not create, copy, or mint local mirrors. Verify the wrapper, recorded child PID, and entire process group/tree have stopped before explicit recovery. A dead wrapper PID alone does not establish safe cleanup. Preserve retained process-recovery and Convex temporary evidence; recover hidden values through the generated wrapper before retrying.`;
}

export interface EnvironmentLifecycleLease {
  assertIdle(): void;
  release(): void;
}

function sameIdentity(left: Stats, right: Stats): boolean {
  return left.dev === right.dev && left.ino === right.ino && left.birthtimeMs === right.birthtimeMs;
}

/**
 * Lock metadata uses exclusive filesystem primitives like lib/lock.ts. Project
 * content remains owned by FsTransaction; this lease fences its entire commit.
 */
export function acquireEnvironmentLifecycleLease(root: string): EnvironmentLifecycleLease {
  const existing = listEnvironmentLifecyclePaths(root);
  if (existing.length > 0) throw new ConflictError(environmentLifecycleGuidance(existing));
  const path = join(root, CLOUDFLARE_ENVIRONMENT_LOCK_FILE);
  const nonce = randomUUID();
  const owner =
    JSON.stringify({ version: 1, pid: process.pid, owner: nonce, mode: "cli-environment" }) + "\n";
  let descriptor: number;
  try {
    descriptor = openSync(path, "wx", 0o600);
  } catch (error) {
    throw new ConflictError("Another wrapper acquired the environment lifecycle lock", {
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  let identity: Stats;
  try {
    writeFileSync(descriptor, owner, "utf8");
    identity = fstatSync(descriptor);
  } catch (error) {
    closeSync(descriptor);
    // Retain uncertain metadata for explicit recovery rather than unlinking a
    // path whose publication may have been interrupted or replaced.
    throw error;
  }
  let released = false;
  let descriptorClosed = false;

  const verify = (candidate: string): void => {
    const entry = lstatSync(candidate);
    if (
      !entry.isFile() ||
      entry.isSymbolicLink() ||
      entry.size > 4096 ||
      !sameIdentity(entry, identity)
    ) {
      throw new ConflictError("Environment lifecycle lock identity changed; leaving it untouched");
    }
    const handle = openSync(candidate, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      if (!sameIdentity(fstatSync(handle), identity) || readFileSync(handle, "utf8") !== owner) {
        throw new ConflictError(
          "Environment lifecycle lock ownership changed; leaving it untouched",
        );
      }
    } finally {
      closeSync(handle);
    }
  };

  return {
    assertIdle() {
      verify(path);
      const appeared = listEnvironmentLifecyclePaths(root).filter(
        (entry) => entry !== CLOUDFLARE_ENVIRONMENT_LOCK_FILE,
      );
      if (appeared.length > 0) throw new ConflictError(environmentLifecycleGuidance(appeared));
    },
    release() {
      if (released) return;
      try {
        verify(path);
        const directory = join(
          root,
          `${ENVIRONMENT_LIFECYCLE_PREFIX}process-recovery-cli-release-${nonce}`,
        );
        const quarantined = join(directory, "owner");
        mkdirSync(directory, { mode: 0o700 });
        try {
          renameSync(path, quarantined);
          try {
            verify(quarantined);
          } catch (error) {
            // Do not erase even an identical-content replacement. Restore it
            // without replacing a new canonical owner, or retain its path.
            try {
              linkSync(quarantined, path);
              unlinkSync(quarantined);
            } catch {
              throw new ConflictError("Changed environment lock was retained for recovery", {
                path: quarantined,
              });
            }
            throw error;
          }
          unlinkSync(quarantined);
          released = true;
        } finally {
          try {
            rmdirSync(directory);
          } catch {
            /* A retained owner is recovery evidence. */
          }
        }
      } finally {
        if (!descriptorClosed) {
          closeSync(descriptor);
          descriptorClosed = true;
        }
      }
    },
  };
}
