/**
 * Deterministic file checksum tracking.
 *
 * Each entry records the SHA-256 hash and size of a generated/scaffolded file
 * so GhostInit can detect drift, skip unnecessary writes, and warn the user
 * about external modifications.
 */

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

export interface ChecksumEntry {
  path: string;
  algorithm: "sha256";
  hash: string;
  size: number;
}

export function hashContent(content: string | Buffer): string {
  const hasher = createHash("sha256");
  hasher.update(typeof content === "string" ? Buffer.from(content, "utf-8") : content);
  return hasher.digest("hex");
}

export async function checksumFile(absPath: string): Promise<ChecksumEntry> {
  const buffer = await readFile(absPath);
  return {
    path: absPath,
    algorithm: "sha256",
    hash: hashContent(buffer),
    size: buffer.length,
  };
}

export function relativeChecksum(baseDir: string, relPath: string, content: string): ChecksumEntry {
  const normalized = relPath.replace(/\\/g, "/");
  return {
    path: normalized,
    algorithm: "sha256",
    hash: hashContent(content),
    size: Buffer.byteLength(content, "utf-8"),
  };
}

export function checksumRegistry(entries: ChecksumEntry[]): Record<string, ChecksumEntry> {
  const map: Record<string, ChecksumEntry> = {};
  for (const entry of entries) {
    map[entry.path] = entry;
  }
  return map;
}

/**
 * Files whose drift genuinely blocks a mutation.
 *
 * `sync` regenerates exactly these four registries, so they are the only files
 * where a user edit actually conflicts with what GhostInit is about to write.
 *
 * State used to checksum EVERY generated file (256 of them, including
 * `.env.local`). Adding a real STRIPE_SECRET_KEY — the mandatory first step in
 * the generated README — therefore made `add` and `sync` exit 23 INVALID_STATE
 * with no CLI path back, turning GhostInit into a one-shot generator instead of
 * a lifecycle tool. Editing your own page or schema did the same.
 */
const DRIFT_TRACKED_PATHS = new Set([
  "packages/modules/src/index.ts",
  "packages/api/src/contract.ts",
  "packages/api/src/router.ts",
  "packages/database/src/schema/index.ts",
]);

/** True when drift in this file should block `add`/`sync`. */
export function isDriftTracked(relPath: string): boolean {
  return DRIFT_TRACKED_PATHS.has(relPath.split("\\").join("/"));
}
