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
