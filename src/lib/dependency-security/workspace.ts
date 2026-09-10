import { lstat, readdir, realpath } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { isSecurityManifestPath } from "../../domain/dependency-security/resolutions.js";
import { FsTransaction } from "../fs.js";
import { validateManifestDependencies, validateSecurityBunfig } from "./configuration.js";
import type { DependencySecurityPolicy } from "./runtime-types.js";
import { invalid, isRecord, parseJson, record } from "./validation.js";

export const SECURITY_JOURNAL_PATH = ".ghostinit/security-installation.json";
const FORBIDDEN = new Set([
  "node_modules",
  ".git",
  ".ghostinit",
  "__proto__",
  "constructor",
  "prototype",
]);
const MAX_INPUT_BYTES = 64 * 1024 * 1024;

export interface SecurityWorkspaceSnapshot {
  readonly root: string;
  readonly files: ReadonlyMap<string, string | null>;
  readonly manifests: ReadonlyMap<string, Record<string, unknown>>;
}

async function regularText(root: string, path: string): Promise<string | null> {
  try {
    const stat = await lstat(join(root, path));
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > MAX_INPUT_BYTES)
      invalid(`input must be a bounded regular unlinked file: ${path}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  return (await new FsTransaction(root).readText(path)) ?? null;
}

function patterns(manifest: Record<string, unknown>): string[] {
  if (manifest.workspaces === undefined) return [];
  const value = isRecord(manifest.workspaces) ? manifest.workspaces.packages : manifest.workspaces;
  if (
    !Array.isArray(value) ||
    value.length > 128 ||
    !value.every((item) => typeof item === "string")
  )
    invalid("workspaces must declare a bounded list of directory patterns");
  return value as string[];
}

export async function securityWorkspaceManifestPaths(
  root: string,
  manifest: Record<string, unknown>,
): Promise<string[]> {
  const result = new Set<string>(["package.json"]);
  let visited = 0;
  for (const pattern of patterns(manifest)) {
    const segments = pattern.split("/");
    if (
      segments.length > 24 ||
      !segments.every(
        (segment) =>
          /^[A-Za-z0-9._*-]+$/.test(segment) &&
          segment !== "." &&
          segment !== ".." &&
          !FORBIDDEN.has(segment.toLowerCase()) &&
          !segment.endsWith("."),
      )
    )
      invalid("unsafe or unsupported workspace pattern");
    const walk = async (parts: string[], index: number): Promise<void> => {
      if (++visited > 10_000 || parts.length > 24)
        invalid("workspace discovery exceeds its bounded directory budget");
      if (index === segments.length) {
        const path = [...parts, "package.json"].join("/");
        if (!isSecurityManifestPath(path)) invalid("workspace manifest path is unsafe");
        if ((await regularText(root, path)) !== null) result.add(path);
        return;
      }
      const part = segments[index];
      if (part === "**") await walk(parts, index + 1);
      const matcher = new RegExp(`^${part.replaceAll(".", "\\.").replaceAll("*", ".*")}$`);
      let entries;
      try {
        entries = await readdir(join(root, ...parts), { withFileTypes: true });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
        throw error;
      }
      for (const entry of entries) {
        if (!matcher.test(entry.name) || FORBIDDEN.has(entry.name.toLowerCase())) continue;
        if (entry.isSymbolicLink()) invalid("workspace discovery encountered a symbolic link");
        if (entry.isDirectory())
          await walk([...parts, entry.name], part === "**" ? index : index + 1);
      }
    };
    await walk([], 0);
  }
  return [...result].sort();
}

export async function snapshotSecurityWorkspace(
  cwd: string,
  policy: DependencySecurityPolicy,
): Promise<SecurityWorkspaceSnapshot> {
  const root = resolve(cwd);
  const info = await lstat(root);
  if (!info.isDirectory() || info.isSymbolicLink() || (await realpath(root)) !== root)
    invalid("project root must be a canonical directory");
  const files = new Map<string, string | null>();
  const read = async (path: string): Promise<string | null> => {
    if (!files.has(path)) files.set(path, await regularText(root, path));
    return files.get(path)!;
  };
  const source = await read("package.json");
  if (source === null) invalid("package.json is missing");
  const manifest = record(parseJson(source, "package.json"), "package.json");
  const manifests = new Map<string, Record<string, unknown>>();
  for (const path of await securityWorkspaceManifestPaths(root, manifest)) {
    const content = await read(path);
    if (content === null) invalid("workspace manifest disappeared while snapshotting");
    const parsed = record(parseJson(content, path), path);
    validateManifestDependencies(parsed);
    manifests.set(path, parsed);
    const parts = dirname(path).replaceAll("\\", "/").split("/");
    while (parts.length > 0 && parts[0] !== ".") {
      for (const name of [".npmrc", "bunfig.toml"]) {
        if ((await read([...parts, name].join("/"))) !== null)
          invalid("workspace-local registry/install configuration is not supported");
      }
      parts.pop();
    }
  }
  if ((await read(".npmrc")) !== null)
    invalid("project .npmrc is not supported by the public-registry policy");
  const bunfig = await read("bunfig.toml");
  if (bunfig === null) invalid("bunfig.toml is required");
  validateSecurityBunfig(bunfig, policy);
  if ((await read("bun.lockb")) !== null)
    invalid("binary lockfiles cannot be repaired automatically");
  for (const path of [
    "bun.lock",
    "dependency-lock-evidence.json",
    ".gitattributes",
    SECURITY_JOURNAL_PATH,
  ])
    await read(path);
  if (manifest.patchedDependencies !== undefined) {
    for (const value of Object.values(
      record(manifest.patchedDependencies, "patchedDependencies"),
    )) {
      if (
        typeof value !== "string" ||
        !/^patches\/[a-zA-Z0-9@%._+/-]+\.patch$/.test(value) ||
        value
          .split("/")
          .some((part) => [".", ".."].includes(part) || FORBIDDEN.has(part.toLowerCase()))
      )
        invalid("declared patches must be contained regular patch files");
      if ((await read(value)) === null) invalid("declared patch file is missing");
    }
  }
  return { root, files, manifests };
}

export async function assertSecurityInputsUnchanged(
  tx: FsTransaction,
  snapshot: SecurityWorkspaceSnapshot,
): Promise<void> {
  for (const [path, content] of snapshot.files) await tx.assertUnchanged(path, content);
  const paths = await securityWorkspaceManifestPaths(
    snapshot.root,
    snapshot.manifests.get("package.json")!,
  );
  if (JSON.stringify(paths) !== JSON.stringify([...snapshot.manifests.keys()]))
    invalid("workspace membership changed during dependency maintenance");
}

export async function copySecuritySnapshot(
  snapshot: SecurityWorkspaceSnapshot,
  destination: string,
  options: { readonly freshLock?: boolean } = {},
): Promise<void> {
  const tx = new FsTransaction(destination);
  for (const [path, content] of snapshot.files) {
    if (content === null || path === SECURITY_JOURNAL_PATH) continue;
    if (options.freshLock && (path === "bun.lock" || path === "dependency-lock-evidence.json"))
      continue;
    await tx.write(path, content);
  }
  await tx.commit();
}
