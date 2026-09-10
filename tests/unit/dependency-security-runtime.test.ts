import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { readFile, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { FsTransaction } from "../../src/lib/fs.js";
import { runDependencySecurityWithDependencies } from "../../src/lib/dependency-security/runtime.js";
import {
  assertSecurityInputsUnchanged,
  snapshotSecurityWorkspace,
  SECURITY_JOURNAL_PATH,
} from "../../src/lib/dependency-security/workspace.js";
import { InstallerProcessTreeError } from "../../src/lib/process-supervisor.js";
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

describe("dependency security phase coordination", () => {
  let root: string;
  const retainedCandidates = new Set<string>();
  beforeEach(async () => {
    root = await securityTestRoot();
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
    for (const candidate of retainedCandidates)
      await rm(candidate, { recursive: true, force: true });
    retainedCandidates.clear();
  });

  it("previews actual compatible fixes without project bytes, locks, source copies, or installs", async () => {
    const before = await securityTreeBytes(root);
    const fixture = securityProcessFixture();
    fixture.beforeCommand = async (input) => {
      if (!sameSecurityRoot(input.cwd, root)) {
        const copied = await securityTreeBytes(input.cwd);
        expect(copied[".env.local"]).toBeUndefined();
        expect(copied["src/private.ts"]).toBeUndefined();
      }
      return undefined;
    };
    const preview = await runDependencySecurityWithDependencies(
      { cwd: root, mode: "fix", dryRun: true, policy: securityTestPolicy },
      fixture.dependencies,
    );
    expect(preview).toMatchObject({
      status: "fixed",
      dryRun: true,
      applied: false,
      installedVerified: false,
    });
    expect(preview.changes).toEqual([
      { package: "vulnerable-child", from: "1.0.0", to: "1.0.1", manifests: [] },
    ]);
    expect(await securityTreeBytes(root)).toEqual(before);
    expect(fixture.commands.every((input) => !input.argv.includes("--frozen-lockfile"))).toBe(true);
    const readGuards = new FsTransaction(root);
    await assertSecurityInputsUnchanged(
      readGuards,
      await snapshotSecurityWorkspace(root, securityTestPolicy),
    );
    expect(readGuards.getStagedFiles()).toEqual([]);
  });

  it("keeps audit read-only and reports vulnerable packages without fixing them", async () => {
    const before = await securityTreeBytes(root);
    const fixture = securityProcessFixture();
    const audit = await runDependencySecurityWithDependencies(
      { cwd: root, mode: "audit", policy: securityTestPolicy },
      fixture.dependencies,
    );
    expect(audit).toMatchObject({ status: "blocked", applied: false, installedVerified: false });
    expect(audit.remaining[0].package).toBe("vulnerable-child");
    expect(fixture.commands.some((input) => input.argv.includes("fix"))).toBe(false);
    expect(await securityTreeBytes(root)).toEqual(before);
  });

  it("publishes only after candidate verification and journals before target installation", async () => {
    const fixture = securityProcessFixture();
    const transactions: FsTransaction[] = [];
    fixture.beforeCommand = async (input, argv) => {
      if (sameSecurityRoot(input.cwd, root) && argv[0] === "install") {
        expect(argv).toEqual(["install", "--frozen-lockfile"]);
        expect(JSON.parse(await readFile(join(root, SECURITY_JOURNAL_PATH), "utf8")).status).toBe(
          "INSTALLING",
        );
        expect(await readFile(join(root, "bun.lock"), "utf8")).toBe(fixedSecurityLock);
        expect(
          fixture.commands.some(
            (previous) =>
              previous.cwd !== root &&
              previous.argv.includes("--ignore-scripts") &&
              previous.argv.includes("--frozen-lockfile"),
          ),
        ).toBe(true);
      }
      return undefined;
    };
    const repaired = await runDependencySecurityWithDependencies(
      {
        cwd: root,
        mode: "fix",
        policy: securityTestPolicy,
        onTransactionCommitted: (tx) => transactions.push(tx),
      },
      fixture.dependencies,
    );
    expect(repaired).toMatchObject({ status: "fixed", applied: true, installedVerified: true });
    await expect(readFile(join(root, SECURITY_JOURNAL_PATH))).rejects.toThrow();
    expect(transactions).toHaveLength(2);
    const serialized = JSON.stringify(repaired);
    expect(serialized).not.toContain("PRIVATE_UNIT_SENTINEL");
    expect(serialized).not.toContain("phase");
    // An enclosing create operation can compensate source writes in reverse order.
    for (const tx of transactions.toReversed()) expect((await tx.rollback()).success).toBe(true);
    expect(await readFile(join(root, "bun.lock"), "utf8")).toBe(oldSecurityLock);
  });

  it("preserves a racing configuration edit and refuses source publication", async () => {
    const fixture = securityProcessFixture();
    let changed = false;
    fixture.beforeCommand = async (_input, argv) => {
      if (argv[0] === "audit" && argv[1] === "fix" && !changed) {
        changed = true;
        const source = await readFile(join(root, "bunfig.toml"), "utf8");
        await writeSecurityTestFile(root, "bunfig.toml", `${source}# user edit while auditing\n`);
      }
      return undefined;
    };
    await expect(
      runDependencySecurityWithDependencies(
        { cwd: root, mode: "fix", policy: securityTestPolicy },
        fixture.dependencies,
      ),
    ).rejects.toThrow("changed");
    expect(await readFile(join(root, "bun.lock"), "utf8")).toBe(oldSecurityLock);
    expect(await readFile(join(root, "bunfig.toml"), "utf8")).toContain("user edit");
    await expect(readFile(join(root, SECURITY_JOURNAL_PATH))).rejects.toThrow();
  });

  it("runs explicitly requested quality checks in install mode while default install leaves them to its caller", async () => {
    const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
    await writeSecurityTestFile(
      root,
      "package.json",
      JSON.stringify({
        ...manifest,
        scripts: {
          typecheck: "typecheck-command",
          "lint:all": "lint-command",
          test: "test-command",
        },
      }),
    );
    const verifiedFixture = securityProcessFixture();
    const verified = await runDependencySecurityWithDependencies(
      { cwd: root, mode: "install", verifyProject: true, policy: securityTestPolicy },
      verifiedFixture.dependencies,
    );
    expect(verified.installedVerified).toBe(true);
    expect(
      verifiedFixture.commands
        .filter((input) => sameSecurityRoot(input.cwd, root) && input.argv.includes("run"))
        .map((input) => input.argv.at(-1)),
    ).toEqual(["typecheck", "lint:all", "test"]);
    const defaultFixture = securityProcessFixture();
    const installed = await runDependencySecurityWithDependencies(
      { cwd: root, mode: "install", policy: securityTestPolicy },
      defaultFixture.dependencies,
    );
    expect(installed.installedVerified).toBe(true);
    expect(defaultFixture.commands.some((input) => input.argv.includes("run"))).toBe(false);
  });

  it("retains a failed-install journal and completes recovery on the next fix", async () => {
    const fixture = securityProcessFixture();
    fixture.beforeCommand = async (input, argv) =>
      sameSecurityRoot(input.cwd, root) && argv[0] === "install"
        ? {
            exitCode: 1,
            signal: null,
            timedOut: false,
            cleanupVerified: true,
            error: new Error("install failed"),
          }
        : undefined;
    const failure = await runDependencySecurityWithDependencies(
      { cwd: root, mode: "fix", policy: securityTestPolicy },
      fixture.dependencies,
    );
    expect(failure).toMatchObject({
      status: "failed",
      applied: true,
      installedVerified: false,
      recoveryRequired: true,
    });
    expect(JSON.parse(await readFile(join(root, SECURITY_JOURNAL_PATH), "utf8")).status).toBe(
      "FAILED",
    );
    expect(await readFile(join(root, "bun.lock"), "utf8")).toBe(fixedSecurityLock);
    fixture.beforeCommand = undefined;
    const recovery = await runDependencySecurityWithDependencies(
      { cwd: root, mode: "fix", policy: securityTestPolicy },
      fixture.dependencies,
    );
    expect(recovery).toMatchObject({ status: "clean", installedVerified: true });
    await expect(readFile(join(root, SECURITY_JOURNAL_PATH))).rejects.toThrow();
  });

  it("does not overwrite a journal replaced during installation", async () => {
    const fixture = securityProcessFixture();
    fixture.beforeCommand = async (input, argv) => {
      if (sameSecurityRoot(input.cwd, root) && argv[0] === "install")
        await writeSecurityTestFile(root, SECURITY_JOURNAL_PATH, "foreign owner bytes\n");
      return undefined;
    };
    const failure = await runDependencySecurityWithDependencies(
      { cwd: root, mode: "fix", policy: securityTestPolicy },
      fixture.dependencies,
    );
    expect(failure).toMatchObject({ status: "failed", recoveryRequired: true });
    expect(await readFile(join(root, SECURITY_JOURNAL_PATH), "utf8")).toBe("foreign owner bytes\n");
  });

  it("propagates unverified descendant cleanup and retains the private candidate", async () => {
    const fixture = securityProcessFixture();
    const fatal = new InstallerProcessTreeError("test cleanup boundary failed");
    fixture.beforeCommand = async (input, argv) => {
      if (argv[0] === "audit") {
        retainedCandidates.add(resolve(dirname(input.cwd)));
        return { exitCode: 1, signal: null, timedOut: false, cleanupVerified: false, error: fatal };
      }
      return undefined;
    };
    await expect(
      runDependencySecurityWithDependencies(
        { cwd: root, mode: "fix", policy: securityTestPolicy },
        fixture.dependencies,
      ),
    ).rejects.toBe(fatal);
    expect(await readFile(join(root, "bun.lock"), "utf8")).toBe(oldSecurityLock);
    expect(await readFile(join([...fixture.candidates][0], "bun.lock"), "utf8")).toBe(
      oldSecurityLock,
    );
  });
});
