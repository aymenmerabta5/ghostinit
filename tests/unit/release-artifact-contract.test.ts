import { expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runtime } from "../../packages/versions/src/index.js";
import { renameWithRetry, replaceDist } from "../../scripts/build.js";
import { verifyBunReleaseCapabilities } from "../../scripts/release-artifact.js";
import {
  expectedDistFiles,
  PACKED_MANIFEST_FILES,
  STALE_DIST_SENTINEL,
  verifyPackedPackageClosure,
} from "../../scripts/package-contract.js";

const root = resolve(import.meta.dir, "../..");

test("Bun-only release prepares, verifies, and digests one exact tarball without publishing", () => {
  expect(Bun.version).toBe(runtime.bun);
  expect(verifyBunReleaseCapabilities()).toEqual({
    packDestination: true,
    publishExistingTarball: true,
    provenanceAttestation: false,
  });

  const manifest = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as {
    files: string[];
    publishConfig: Record<string, unknown>;
    scripts: Record<string, string>;
  };
  expect(manifest.files).toEqual(PACKED_MANIFEST_FILES);
  expect(manifest.publishConfig).toEqual({ access: "public" });
  expect(manifest.publishConfig.provenance).toBeUndefined();
  expect(manifest.scripts["release:artifact"]).toBe("bun run scripts/release-artifact.ts");
  expect(manifest.scripts.release).toBe("bun run test:ci && bun run release:artifact");

  const source = readFileSync(resolve(root, "scripts/release-artifact.ts"), "utf8");
  expect(source).toContain('["pm", "pack", "--help"]');
  expect(source).toContain('["publish", "--help"]');
  expect(source).toContain('"--destination"');
  expect(source).not.toContain('"--filename"');
  expect(source).toContain("GHOSTINIT_PACKED_TARBALL: tarball");
  expect(source).toContain("const digestBefore = sha256(tarball)");
  expect(source).toContain("const digestAfter = sha256(tarball)");
  expect(source).toContain("if (digestAfter !== digestBefore)");
  expect(source).toContain("let verified = false");
  expect(source).toContain("if (!verified)");
  expect(source).toContain("removeExactReleaseFile(tarball)");
  expect(source).toContain("removeExactReleaseFile(checksum)");
  expect(source).not.toMatch(/\brun\([^\n]*\["publish"/);
  expect(source).not.toMatch(/\b(?:npm|npx)\b/);

  const build = readFileSync(resolve(root, "scripts/build.ts"), "utf8");
  expect(build).toContain("const stageDir = managedPath(");
  expect(build).toContain("verifyStagedDist(stageDir)");
  expect(build).toContain("replaceDist(stageDir, backupDir)");
  expect(build.indexOf("verifyStagedDist(stageDir)")).toBeLessThan(
    build.indexOf("replaceDist(stageDir, backupDir)"),
  );
  expect(build).not.toContain("rmSync(DIST_DIR");

  const packedTest = readFileSync(resolve(root, "tests/integration/packed-cli.test.ts"), "utf8");
  expect(packedTest).not.toContain('[BUN_EXECUTABLE, "run", "build"]');
  expect(packedTest).toContain("verifyDistClosure(sourceRoot, distRoot");
  expect(packedTest).toContain('holdSharedDistReader(join(distRoot, "cli.js"), temp)');

  const contributing = readFileSync(resolve(root, "CONTRIBUTING.md"), "utf8");
  expect(contributing).toContain(".ghostinit-release/ghostinit-<version>.tgz");
  expect(contributing).toContain("GHOSTINIT_PACKED_TARBALL");
  expect(contributing).toMatch(/SHA-256 integrity record, not\s+registry provenance/);

  const gitignore = readFileSync(resolve(root, ".gitignore"), "utf8");
  for (const ignored of [
    ".ghostinit-release/",
    ".ghostinit-dist-stage-*/",
    ".ghostinit-dist-backup-*/",
  ]) {
    expect(gitignore).toContain(ignored);
  }
});

test("package closure is source-derived and rejects missing, stale, and leaked files", () => {
  const temp = mkdtempSync(join(tmpdir(), "ghostinit-package-contract-"));
  const source = join(temp, "src");
  const dist = join(temp, "dist");
  try {
    mkdirSync(join(source, "nested"), { recursive: true });
    mkdirSync(dist);
    writeFileSync(join(source, "cli.ts"), "export const main = () => undefined;\n");
    writeFileSync(join(source, "nested", "component.tsx"), "export const component = 1;\n");
    writeFileSync(join(source, "nested", "worker.mts"), "export const worker = 1;\n");
    writeFileSync(join(source, "nested", "legacy.cts"), "export const legacy = 1;\n");
    writeFileSync(join(source, "nested", "ambient.d.ts"), "declare const ambient: true;\n");
    writeFileSync(join(source, "nested", "asset.json"), "{}\n");

    const expected = expectedDistFiles(source);
    expect([...expected].sort()).toEqual(
      [
        "cli.d.ts",
        "cli.d.ts.map",
        "cli.js",
        "cli.js.map",
        "nested/component.d.ts",
        "nested/component.d.ts.map",
        "nested/legacy.d.cts",
        "nested/legacy.d.cts.map",
        "nested/worker.d.mts",
        "nested/worker.d.mts.map",
      ].sort(),
    );
    for (const path of expected) {
      const absolute = join(dist, ...path.split("/"));
      mkdirSync(resolve(absolute, ".."), { recursive: true });
      writeFileSync(absolute, "contract fixture\n");
    }
    writeFileSync(
      join(temp, "package.json"),
      JSON.stringify({ name: "ghostinit", version: "0.0.0", files: PACKED_MANIFEST_FILES }),
    );
    expect(verifyPackedPackageClosure(temp).distFiles).toEqual([...expected].sort());

    const stale = join(dist, ...STALE_DIST_SENTINEL.split("/"));
    mkdirSync(resolve(stale, ".."), { recursive: true });
    writeFileSync(stale, "stale\n");
    expect(() => verifyPackedPackageClosure(temp)).toThrow("Stale:");
    rmSync(stale);

    rmSync(join(dist, "cli.d.ts.map"));
    expect(() => verifyPackedPackageClosure(temp)).toThrow("Missing: cli.d.ts.map");
    writeFileSync(join(dist, "cli.d.ts.map"), "contract fixture\n");

    mkdirSync(join(temp, "scripts"));
    writeFileSync(join(temp, "scripts", "leak.ts"), "export {};\n");
    expect(() => verifyPackedPackageClosure(temp)).toThrow("outside the allowlist");
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test("atomic dist replacement publishes a complete stage and rolls back a failed rename", () => {
  const temp = mkdtempSync(join(tmpdir(), "ghostinit-dist-transaction-"));
  const dist = join(temp, "dist");
  const stage = join(temp, ".ghostinit-dist-stage-success");
  const backup = join(temp, ".ghostinit-dist-backup-success");
  try {
    mkdirSync(dist);
    mkdirSync(stage);
    writeFileSync(join(dist, "old.txt"), "old\n");
    const stale = join(dist, ...STALE_DIST_SENTINEL.split("/"));
    mkdirSync(resolve(stale, ".."), { recursive: true });
    writeFileSync(stale, "stale\n");
    writeFileSync(join(stage, "new.txt"), "new\n");

    replaceDist(stage, backup, dist, temp);
    expect(readFileSync(join(dist, "new.txt"), "utf8")).toBe("new\n");
    expect(existsSync(join(dist, "old.txt"))).toBe(false);
    expect(existsSync(stale)).toBe(false);
    expect(existsSync(stage)).toBe(false);
    expect(existsSync(backup)).toBe(false);

    const missingStage = join(temp, ".ghostinit-dist-stage-missing");
    const rollback = join(temp, ".ghostinit-dist-backup-rollback");
    expect(() => replaceDist(missingStage, rollback, dist, temp)).toThrow();
    expect(readFileSync(join(dist, "new.txt"), "utf8")).toBe("new\n");
    expect(existsSync(rollback)).toBe(false);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test("atomic rename waits out transient sharing locks and remains deadline-bounded", () => {
  let now = 0;
  let attempts = 0;
  renameWithRetry("stage", "dist", {
    timeoutMs: 1_000,
    now: () => now,
    sleep: (delayMs) => {
      now += delayMs;
    },
    rename: () => {
      attempts += 1;
      if (attempts < 3) throw Object.assign(new Error("sharing violation"), { code: "EPERM" });
    },
  });
  expect(attempts).toBe(3);
  expect(now).toBe(150);

  now = 0;
  attempts = 0;
  expect(() =>
    renameWithRetry("stage", "dist", {
      timeoutMs: 125,
      now: () => now,
      sleep: (delayMs) => {
        now += delayMs;
      },
      rename: () => {
        attempts += 1;
        throw Object.assign(new Error("sharing violation"), { code: "EBUSY" });
      },
    }),
  ).toThrow("sharing violation");
  expect(attempts).toBe(3);
  expect(now).toBe(125);

  attempts = 0;
  expect(() =>
    renameWithRetry("missing", "dist", {
      timeoutMs: 1_000,
      rename: () => {
        attempts += 1;
        throw Object.assign(new Error("missing"), { code: "ENOENT" });
      },
    }),
  ).toThrow("missing");
  expect(attempts).toBe(1);
});
