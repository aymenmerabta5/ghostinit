import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, readFile, rm, symlink } from "node:fs/promises";
import { join } from "node:path";
import { acquireLock } from "../../src/lib/lock.js";
import { Logger } from "../../src/lib/logger.js";
import { FsTransaction } from "../../src/lib/fs.js";
import { securityLeaseContent } from "../../src/lib/dependency-security/journal.js";
import { validateManifestDependencies } from "../../src/lib/dependency-security/configuration.js";
import { runDependencySecurityWithDependencies } from "../../src/lib/dependency-security/runtime.js";
import {
  assertSecurityInputsUnchanged,
  snapshotSecurityWorkspace,
} from "../../src/lib/dependency-security/workspace.js";
import {
  securityProcessFixture,
  securityTestPolicy,
  securityTestRoot,
  writeSecurityTestFile,
} from "../helpers/dependency-security-runtime.js";

describe("dependency security input ownership", () => {
  let root: string;
  let outside: string;
  beforeEach(async () => {
    root = await securityTestRoot();
    outside = await securityTestRoot();
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  });

  it("rejects all ASCII control characters and whitespace in dependency declarations", () => {
    for (const character of [
      ...Array.from({ length: 32 }, (_, code) => String.fromCharCode(code)),
      " ",
      String.fromCharCode(160),
    ]) {
      expect(() =>
        validateManifestDependencies({ dependencies: { sample: `1.0.0${character}` } }),
      ).toThrow("dependency declarations");
    }
    expect(() =>
      validateManifestDependencies({ dependencies: { sample: "^1.0.0" } }),
    ).not.toThrow();
  });

  it("retains a caller-owned lease and rejects a mismatched token", async () => {
    const lease = await acquireLock(root, new Logger({ quiet: true }));
    try {
      await expect(
        securityLeaseContent(root, { ...lease.owner, token: "foreign-token" }),
      ).rejects.toThrow("owns");
      const fixture = securityProcessFixture();
      const result = await runDependencySecurityWithDependencies(
        { cwd: root, mode: "fix", policy: securityTestPolicy, leaseOwner: lease.owner },
        fixture.dependencies,
      );
      expect(result.installedVerified).toBe(true);
      expect(JSON.parse(await readFile(join(root, ".ghostinit.lock"), "utf8")).token).toBe(
        lease.owner.token,
      );
    } finally {
      await lease.release();
    }
  });

  it("detects newly declared workspace members before publication", async () => {
    await writeSecurityTestFile(
      root,
      "package.json",
      JSON.stringify({ name: "security-fixture", workspaces: ["packages/*"] }),
    );
    await writeSecurityTestFile(
      root,
      "packages/a/package.json",
      JSON.stringify({ name: "workspace-a" }),
    );
    const snapshot = await snapshotSecurityWorkspace(root, securityTestPolicy);
    await writeSecurityTestFile(
      root,
      "packages/b/package.json",
      JSON.stringify({ name: "workspace-b" }),
    );
    await expect(assertSecurityInputsUnchanged(new FsTransaction(root), snapshot)).rejects.toThrow(
      "membership changed",
    );
  });

  it("refuses linked workspaces and private registry files before any process runs", async () => {
    await writeSecurityTestFile(
      root,
      "package.json",
      JSON.stringify({ name: "security-fixture", workspaces: ["packages/*"] }),
    );
    await mkdir(join(root, "packages"));
    await symlink(
      outside,
      join(root, "packages", "linked"),
      process.platform === "win32" ? "junction" : "dir",
    );
    await expect(snapshotSecurityWorkspace(root, securityTestPolicy)).rejects.toThrow(
      "symbolic link",
    );
    await writeSecurityTestFile(
      outside,
      ".npmrc",
      "//registry.npmjs.org/:_authToken=private-test-sentinel\n",
    );
    const fixture = securityProcessFixture();
    await expect(
      runDependencySecurityWithDependencies(
        { cwd: outside, mode: "audit", policy: securityTestPolicy },
        fixture.dependencies,
      ),
    ).rejects.toThrow(".npmrc");
    expect(fixture.commands).toHaveLength(0);
  });

  it("rejects weakened age policy and a preload in Bun configuration", async () => {
    const content = await readFile(join(root, "bunfig.toml"), "utf8");
    await writeSecurityTestFile(root, "bunfig.toml", content.replace("604800", "0"));
    await expect(snapshotSecurityWorkspace(root, securityTestPolicy)).rejects.toThrow("policy");
    await writeSecurityTestFile(root, "bunfig.toml", `preload = ["./private.ts"]\n${content}`);
    await expect(snapshotSecurityWorkspace(root, securityTestPolicy)).rejects.toThrow(
      "unsupported",
    );
  });
});
