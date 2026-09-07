#!/usr/bin/env bun
/** Build, pack, verify, and digest one exact release artifact. Never publishes. */
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runtime } from "../packages/versions/src/index.js";

const REPO_ROOT = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), ".."));
const RELEASE_DIR = join(REPO_ROOT, ".ghostinit-release");

interface CommandResult {
  readonly exitCode: number;
  readonly output: string;
}

function capture(args: readonly string[]): CommandResult {
  const result = Bun.spawnSync({
    cmd: [process.execPath, ...args],
    cwd: REPO_ROOT,
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    exitCode: result.exitCode,
    output: `${new TextDecoder().decode(result.stdout)}${new TextDecoder().decode(result.stderr)}`,
  };
}

function run(label: string, args: readonly string[], env = process.env): void {
  console.log(`[release] ${label}`);
  const result = Bun.spawnSync({
    cmd: [process.execPath, ...args],
    cwd: REPO_ROOT,
    env,
    stdout: "inherit",
    stderr: "inherit",
  });
  if (result.exitCode !== 0) throw new Error(`${label} failed (exit ${result.exitCode})`);
}

export interface BunReleaseCapabilities {
  readonly packDestination: true;
  readonly publishExistingTarball: true;
  readonly provenanceAttestation: false;
}

/** Validate only documented, non-publishing Bun 1.4 capabilities used below. */
export function verifyBunReleaseCapabilities(): BunReleaseCapabilities {
  if (typeof Bun === "undefined" || Bun.version !== runtime.bun) {
    throw new Error(
      `Release artifacts require Bun ${runtime.bun}; received ${typeof Bun === "undefined" ? "a non-Bun runtime" : `Bun ${Bun.version}`}`,
    );
  }
  const packHelp = capture(["pm", "pack", "--help"]);
  if (packHelp.exitCode !== 0 || !packHelp.output.includes("--destination")) {
    throw new Error("Bun does not expose the required deterministic pack destination API");
  }
  const publishHelp = capture(["publish", "--help"]);
  if (
    publishHelp.exitCode !== 0 ||
    !publishHelp.output.includes("Publish a pre-existing package tarball")
  ) {
    throw new Error("Bun does not document publishing a pre-existing verified tarball");
  }
  if (publishHelp.output.includes("--provenance")) {
    throw new Error("Bun provenance capabilities changed; review the release contract explicitly");
  }
  return {
    packDestination: true,
    publishExistingTarball: true,
    provenanceAttestation: false,
  };
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function removeExactReleaseFile(path: string): void {
  if (dirname(resolve(path)) !== RELEASE_DIR) {
    throw new Error(`Refusing to remove a path outside ${RELEASE_DIR}: ${path}`);
  }
  rmSync(path, { force: true });
}

async function main(): Promise<void> {
  verifyBunReleaseCapabilities();
  const manifest = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")) as {
    name?: unknown;
    version?: unknown;
  };
  if (manifest.name !== "ghostinit" || typeof manifest.version !== "string") {
    throw new Error("Refusing to release an unverified package manifest");
  }

  mkdirSync(RELEASE_DIR, { recursive: true });
  if (lstatSync(RELEASE_DIR).isSymbolicLink()) {
    throw new Error(`Refusing to write release artifacts through a symlink: ${RELEASE_DIR}`);
  }
  const filename = `ghostinit-${manifest.version}.tgz`;
  const tarball = join(RELEASE_DIR, filename);
  const checksum = `${tarball}.sha256`;
  const checksumStage = `${checksum}.${process.pid}.tmp`;
  for (const path of [tarball, checksum, checksumStage]) removeExactReleaseFile(path);

  let verified = false;
  try {
    run("build verified dist closure", ["run", "build"]);
    const packed = capture([
      "pm",
      "pack",
      "--destination",
      RELEASE_DIR,
      "--ignore-scripts",
      "--quiet",
    ]);
    if (packed.exitCode !== 0) throw new Error(`bun pm pack failed:\n${packed.output}`);
    const reported = packed.output.trim().split(/\r?\n/).at(-1);
    if (!reported || basename(reported) !== filename || !existsSync(tarball)) {
      throw new Error(`bun pm pack did not produce the expected artifact ${tarball}`);
    }

    const digestBefore = sha256(tarball);
    run(
      "verify the exact packed tarball",
      ["test", "--timeout", "300000", "tests/integration/packed-cli.test.ts"],
      { ...process.env, GHOSTINIT_PACKED_TARBALL: tarball },
    );
    const digestAfter = sha256(tarball);
    if (digestAfter !== digestBefore) throw new Error("Verified tarball changed while under test");

    writeFileSync(checksumStage, `${digestAfter}  ${filename}\n`, "utf8");
    renameSync(checksumStage, checksum);
    verified = true;
    console.log(`[release] verified tarball: ${tarball}`);
    console.log(`[release] sha256: ${digestAfter}`);
    console.log("[release] no publish command was run");
  } finally {
    removeExactReleaseFile(checksumStage);
    if (!verified) {
      removeExactReleaseFile(tarball);
      removeExactReleaseFile(checksum);
    }
  }
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    console.error(`[release] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
