import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { hashContent } from "../../src/lib/checksum.js";
import { FsTransaction } from "../../src/lib/fs.js";
import { runDependencySecurityWithDependencies } from "../../src/lib/dependency-security/runtime.js";
import { SECURITY_JOURNAL_PATH } from "../../src/lib/dependency-security/workspace.js";
import {
  fixedSecurityLock,
  oldSecurityLock,
  sameSecurityRoot,
  securityProcessFixture,
  securityTestPolicy,
  securityTestRoot,
  securityTreeBytes,
  writeSecurityTestFile,
} from "../helpers/dependency-security-runtime.js";

const staleLock =
  '{"packages":{"obsolete":["obsolete@git+file:///unvalidated-old-source"]},"patchedDependencies":{"obsolete@1.0.0":"patches/removed.patch"}}\n';
const staleEvidence =
  '{"registry":"https://unvalidated-old-registry.invalid","lockSha256":"obsolete"}\n';

describe("fresh dependency-lock reconciliation", () => {
  let root: string;
  beforeEach(async () => {
    root = await securityTestRoot();
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  async function staleTarget(): Promise<void> {
    await writeSecurityTestFile(root, "bun.lock", staleLock);
    await writeSecurityTestFile(root, "dependency-lock-evidence.json", staleEvidence);
    const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
    await writeSecurityTestFile(
      root,
      "package.json",
      JSON.stringify({
        ...manifest,
        patchedDependencies: { "parent-package@1.0.0": "patches/current.patch" },
      }),
    );
    await writeSecurityTestFile(root, "patches/current.patch", "CURRENT_PATCH_BYTES\n");
  }

  for (const trigger of ["bootstrap", "reconcileLock"] as const) {
    it(`${trigger} resolves from current metadata before Bun can see an old lock or evidence`, async () => {
      await staleTarget();
      const fixture = securityProcessFixture();
      let first = true;
      fixture.beforeCommand = async (input, argv) => {
        const reader = new FsTransaction(input.cwd);
        if (first) {
          first = false;
          expect(sameSecurityRoot(input.cwd, root)).toBe(false);
          expect(argv).toEqual(["install", "--lockfile-only", "--ignore-scripts"]);
          expect(await reader.readText("bun.lock")).toBeUndefined();
          expect(await reader.readText("dependency-lock-evidence.json")).toBeUndefined();
          expect(await reader.readText("patches/current.patch")).toBe("CURRENT_PATCH_BYTES\n");
          expect(await reader.readText("patches/removed.patch")).toBeUndefined();
          expect(await readFile(join(root, "bun.lock"), "utf8")).toBe(staleLock);
        } else if (!sameSecurityRoot(input.cwd, root)) {
          expect(await reader.readText("bun.lock")).not.toBe(staleLock);
          expect(await reader.readText("dependency-lock-evidence.json")).not.toBe(staleEvidence);
        }
        return undefined;
      };
      const result = await runDependencySecurityWithDependencies(
        { cwd: root, mode: "install", [trigger]: true, policy: securityTestPolicy },
        fixture.dependencies,
      );
      expect(result).toMatchObject({ status: "fixed", applied: true, installedVerified: true });
      expect(await readFile(join(root, "bun.lock"), "utf8")).toBe(fixedSecurityLock);
      expect(
        JSON.parse(await readFile(join(root, "dependency-lock-evidence.json"), "utf8")).lockSha256,
      ).toBe(hashContent(fixedSecurityLock));
      expect(
        fixture.commands.some(
          (input) =>
            input.argv.includes("--frozen-lockfile") && input.argv.includes("--ignore-scripts"),
        ),
      ).toBe(true);
      expect(
        fixture.commands.some(
          (input) => sameSecurityRoot(input.cwd, root) && input.argv.includes("--frozen-lockfile"),
        ),
      ).toBe(true);
      await expect(readFile(join(root, SECURITY_JOURNAL_PATH))).rejects.toThrow();
    });
  }

  it("preserves target bytes when fresh metadata resolution fails", async () => {
    await staleTarget();
    const before = await securityTreeBytes(root);
    const fixture = securityProcessFixture();
    fixture.beforeCommand = async (_input, argv) => {
      expect(argv).toEqual(["install", "--lockfile-only", "--ignore-scripts"]);
      return {
        exitCode: 1,
        signal: null,
        timedOut: false,
        cleanupVerified: true,
        error: new Error("registry resolution failed"),
      };
    };
    await expect(
      runDependencySecurityWithDependencies(
        { cwd: root, mode: "install", reconcileLock: true, policy: securityTestPolicy },
        fixture.dependencies,
      ),
    ).rejects.toThrow("failed");
    expect(fixture.commands).toHaveLength(1);
    expect(await securityTreeBytes(root)).toEqual(before);
  });

  it("retains the old lock as a CAS input even though it was omitted from the candidate", async () => {
    await staleTarget();
    const fixture = securityProcessFixture();
    let raced = false;
    fixture.beforeCommand = async (_input, argv) => {
      if (!raced && argv[0] === "install" && argv.includes("--lockfile-only")) {
        raced = true;
        await writeSecurityTestFile(root, "bun.lock", "independent lock edit\n");
      }
      return undefined;
    };
    await expect(
      runDependencySecurityWithDependencies(
        { cwd: root, mode: "install", reconcileLock: true, policy: securityTestPolicy },
        fixture.dependencies,
      ),
    ).rejects.toThrow("changed");
    expect(await readFile(join(root, "bun.lock"), "utf8")).toBe("independent lock edit\n");
    expect(await readFile(join(root, "dependency-lock-evidence.json"), "utf8")).toBe(staleEvidence);
    await expect(readFile(join(root, SECURITY_JOURNAL_PATH))).rejects.toThrow();
  });

  for (const mode of ["audit", "fix", "install"] as const) {
    it(`default ${mode} keeps the existing lock seed, including a no-op upgrade installation`, async () => {
      const fixture = securityProcessFixture();
      let first = true;
      fixture.beforeCommand = async (input, argv) => {
        if (first) {
          first = false;
          expect(argv).toContain("--refresh-lock-evidence");
          expect(await readFile(join(input.cwd, "bun.lock"), "utf8")).toBe(oldSecurityLock);
        }
        return undefined;
      };
      await runDependencySecurityWithDependencies(
        { cwd: root, mode, reconcileLock: false, policy: securityTestPolicy },
        fixture.dependencies,
      );
    });
  }

  it("a bootstrap preview resolves fresh metadata while keeping every target byte unchanged", async () => {
    await staleTarget();
    const before = await securityTreeBytes(root);
    const fixture = securityProcessFixture();
    const result = await runDependencySecurityWithDependencies(
      { cwd: root, mode: "install", bootstrap: true, dryRun: true, policy: securityTestPolicy },
      fixture.dependencies,
    );
    expect(result).toMatchObject({ dryRun: true, applied: false, installedVerified: false });
    expect(fixture.commands[0].argv).toContain("--lockfile-only");
    expect(fixture.commands.every((input) => !input.argv.includes("--frozen-lockfile"))).toBe(true);
    expect(await securityTreeBytes(root)).toEqual(before);
  });
});
