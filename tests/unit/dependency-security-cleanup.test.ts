import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { readFile, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { FsTransaction } from "../../src/lib/fs.js";
import { acquireLock } from "../../src/lib/lock.js";
import { Logger } from "../../src/lib/logger.js";
import {
  InstallerContainmentUnavailableError,
  InstallerInterruptedError,
  InstallerProcessTreeError,
} from "../../src/lib/process-supervisor.js";
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
  type SecurityProcessFixture,
} from "../helpers/dependency-security-runtime.js";

describe("unverified cleanup recovery barrier", () => {
  let root: string;
  const retainedCandidates = new Set<string>();
  beforeEach(async () => {
    root = await securityTestRoot();
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
    for (const path of retainedCandidates) await rm(path, { recursive: true, force: true });
    retainedCandidates.clear();
  });

  function retainCandidates(fixture: SecurityProcessFixture): void {
    for (const candidate of fixture.candidates) retainedCandidates.add(resolve(dirname(candidate)));
  }

  for (const completion of ["receipt", "rejection"] as const) {
    it(`does not infer safe cleanup from containment-unavailable with unsafe ${completion}`, async () => {
      const fixture = securityProcessFixture();
      const unavailable = new InstallerContainmentUnavailableError("injected containment failure");
      fixture.beforeCommand = async (_input, argv) => {
        if (argv[0] !== "audit") return undefined;
        if (completion === "rejection") throw unavailable;
        return {
          exitCode: null,
          signal: null,
          timedOut: false,
          cleanupVerified: false,
          error: unavailable,
        };
      };
      let failure: unknown;
      try {
        await runDependencySecurityWithDependencies(
          { cwd: root, mode: "fix", policy: securityTestPolicy },
          fixture.dependencies,
        );
      } catch (error) {
        failure = error;
      }
      retainCandidates(fixture);
      expect(failure).toBeInstanceOf(InstallerProcessTreeError);
      expect(failure).not.toBeInstanceOf(InstallerContainmentUnavailableError);
      if (!(failure instanceof InstallerProcessTreeError))
        throw new Error("Unsafe containment failure was not normalized");
      expect(failure.cause).toBe(unavailable);
      expect(JSON.parse(await readFile(join(root, SECURITY_JOURNAL_PATH), "utf8")).status).toBe(
        "CLEANUP_UNVERIFIED",
      );
      expect(JSON.parse(await readFile(join(root, ".ghostinit.lock"), "utf8")).token).toBeString();
    });
  }

  it("preserves safe containment-unavailable semantics only with a verified cleanup receipt", async () => {
    const fixture = securityProcessFixture();
    const unavailable = new InstallerContainmentUnavailableError(
      "injected safe containment failure",
    );
    fixture.beforeCommand = async (_input, argv) =>
      argv[0] === "audit"
        ? {
            exitCode: null,
            signal: null,
            timedOut: false,
            cleanupVerified: true,
            error: unavailable,
          }
        : undefined;
    await expect(
      runDependencySecurityWithDependencies(
        { cwd: root, mode: "fix", policy: securityTestPolicy },
        fixture.dependencies,
      ),
    ).rejects.toBe(unavailable);
    await expect(readFile(join(root, SECURITY_JOURNAL_PATH))).rejects.toThrow();
    await expect(readFile(join(root, ".ghostinit.lock"))).rejects.toThrow();
    await expect(readFile(join([...fixture.candidates][0], "bun.lock"))).rejects.toThrow();
  });

  for (const completion of ["receipt", "rejection"] as const) {
    it(`classifies a target interruption with unsafe ${completion} as an unsafe process-tree failure`, async () => {
      const fixture = securityProcessFixture();
      const interrupted = new InstallerInterruptedError("SIGINT");
      fixture.beforeCommand = async (input, argv) => {
        if (!sameSecurityRoot(root, input.cwd) || argv[0] !== "install") return undefined;
        if (completion === "rejection") throw interrupted;
        return {
          exitCode: null,
          signal: "SIGINT",
          timedOut: false,
          cleanupVerified: false,
          error: interrupted,
        };
      };
      let failure: unknown;
      try {
        await runDependencySecurityWithDependencies(
          { cwd: root, mode: "install", policy: securityTestPolicy },
          fixture.dependencies,
        );
      } catch (error) {
        failure = error;
      }
      retainCandidates(fixture);
      expect(failure).toBeInstanceOf(InstallerProcessTreeError);
      if (!(failure instanceof InstallerProcessTreeError))
        throw new Error("Unsafe cleanup did not reach the caller as a process-tree failure");
      expect(failure.cause).toBe(interrupted);
      expect(JSON.parse(await readFile(join(root, SECURITY_JOURNAL_PATH), "utf8")).status).toBe(
        "CLEANUP_UNVERIFIED",
      );
      expect(JSON.parse(await readFile(join(root, ".ghostinit.lock"), "utf8")).token).toBeString();
      expect(await readFile(join(root, "bun.lock"), "utf8")).toBe(fixedSecurityLock);
      expect(await readFile(join([...fixture.candidates][0], "bun.lock"), "utf8")).toBe(
        fixedSecurityLock,
      );
    });
  }

  it("preserves ordinary interruption semantics only after verified cleanup", async () => {
    const fixture = securityProcessFixture();
    const interrupted = new InstallerInterruptedError("SIGINT");
    fixture.beforeCommand = async (input, argv) =>
      sameSecurityRoot(root, input.cwd) && argv[0] === "install"
        ? {
            exitCode: null,
            signal: "SIGINT",
            timedOut: false,
            cleanupVerified: true,
            error: interrupted,
          }
        : undefined;
    await expect(
      runDependencySecurityWithDependencies(
        { cwd: root, mode: "install", policy: securityTestPolicy },
        fixture.dependencies,
      ),
    ).rejects.toBe(interrupted);
    expect(JSON.parse(await readFile(join(root, SECURITY_JOURNAL_PATH), "utf8")).status).toBe(
      "FAILED",
    );
    await expect(readFile(join(root, ".ghostinit.lock"))).rejects.toThrow();
    await expect(readFile(join([...fixture.candidates][0], "bun.lock"))).rejects.toThrow();
  });

  it("retains its lease and writes a durable barrier before source publication", async () => {
    const fixture = securityProcessFixture();
    const fatal = new InstallerProcessTreeError("injected missing cleanup proof");
    const committed: FsTransaction[] = [];
    fixture.beforeCommand = async (_input, argv) =>
      argv[0] === "audit"
        ? { exitCode: 1, signal: null, timedOut: false, cleanupVerified: false, error: fatal }
        : undefined;
    await expect(
      runDependencySecurityWithDependencies(
        {
          cwd: root,
          mode: "fix",
          policy: securityTestPolicy,
          onTransactionCommitted: (tx) => committed.push(tx),
        },
        fixture.dependencies,
      ),
    ).rejects.toBe(fatal);
    retainCandidates(fixture);
    const journal = JSON.parse(await readFile(join(root, SECURITY_JOURNAL_PATH), "utf8"));
    expect(journal).toMatchObject({ status: "CLEANUP_UNVERIFIED", recoveryRequired: true });
    expect(JSON.parse(await readFile(join(root, ".ghostinit.lock"), "utf8")).token).toBeString();
    expect(await readFile(join(root, "bun.lock"), "utf8")).toBe(oldSecurityLock);
    expect(committed).toHaveLength(1);
    expect(await readFile(join([...fixture.candidates][0], "bun.lock"), "utf8")).toBe(
      oldSecurityLock,
    );
  });

  it("blocks the next repair from its journal even after the lease is gone", async () => {
    const fixture = securityProcessFixture();
    const fatal = new InstallerProcessTreeError("injected rejected supervisor call");
    fixture.beforeCommand = async (_input, argv) => {
      if (argv[0] === "audit") throw fatal;
      return undefined;
    };
    await expect(
      runDependencySecurityWithDependencies(
        { cwd: root, mode: "fix", policy: securityTestPolicy },
        fixture.dependencies,
      ),
    ).rejects.toBe(fatal);
    retainCandidates(fixture);
    const journal = await readFile(join(root, SECURITY_JOURNAL_PATH), "utf8");
    const commandCount = fixture.commands.length;
    // This synthetic process boundary spawned no children. Removing its exact
    // lease models expiry/owner loss independently of the persistent barrier.
    const lease = await readFile(join(root, ".ghostinit.lock"), "utf8");
    const tx = new FsTransaction(root);
    await tx.deleteIfUnchanged(".ghostinit.lock", lease);
    await tx.commit();
    fixture.beforeCommand = undefined;
    await expect(
      runDependencySecurityWithDependencies(
        { cwd: root, mode: "fix", policy: securityTestPolicy },
        fixture.dependencies,
      ),
    ).rejects.toThrow("unverified cleanup");
    expect(fixture.commands).toHaveLength(commandCount);
    expect(await readFile(join(root, SECURITY_JOURNAL_PATH), "utf8")).toBe(journal);
    expect(await readFile(join(root, "bun.lock"), "utf8")).toBe(oldSecurityLock);
  });

  it("marks post-publication cleanup failure distinctly and preserves caller ownership", async () => {
    const fixture = securityProcessFixture();
    const fatal = new InstallerProcessTreeError("injected target cleanup failure");
    const committed: FsTransaction[] = [];
    const lease = await acquireLock(root, new Logger({ quiet: true }));
    try {
      fixture.beforeCommand = async (input, argv) =>
        sameSecurityRoot(root, input.cwd) && argv[0] === "install"
          ? { exitCode: 1, signal: null, timedOut: false, cleanupVerified: false, error: fatal }
          : undefined;
      await expect(
        runDependencySecurityWithDependencies(
          {
            cwd: root,
            mode: "fix",
            policy: securityTestPolicy,
            leaseOwner: lease.owner,
            onTransactionCommitted: (tx) => committed.push(tx),
          },
          fixture.dependencies,
        ),
      ).rejects.toBe(fatal);
      retainCandidates(fixture);
      expect(JSON.parse(await readFile(join(root, SECURITY_JOURNAL_PATH), "utf8")).status).toBe(
        "CLEANUP_UNVERIFIED",
      );
      expect(JSON.parse(await readFile(join(root, ".ghostinit.lock"), "utf8")).token).toBe(
        lease.owner.token,
      );
      expect(await readFile(join(root, "bun.lock"), "utf8")).toBe(fixedSecurityLock);
      expect(committed).toHaveLength(2);
    } finally {
      // Test-owned fake processes have no descendants; core never releases it.
      await lease.release();
    }
  });

  it("records an interrupted bootstrap even when the project has no lock yet", async () => {
    const removeLock = new FsTransaction(root);
    await removeLock.deleteIfUnchanged("bun.lock", oldSecurityLock);
    await removeLock.commit();
    const fixture = securityProcessFixture();
    const fatal = new InstallerProcessTreeError("injected bootstrap cleanup failure");
    fixture.beforeCommand = async (_input, argv) =>
      argv[0] === "install"
        ? { exitCode: 1, signal: null, timedOut: false, cleanupVerified: false, error: fatal }
        : undefined;
    await expect(
      runDependencySecurityWithDependencies(
        { cwd: root, mode: "install", bootstrap: true, policy: securityTestPolicy },
        fixture.dependencies,
      ),
    ).rejects.toBe(fatal);
    retainCandidates(fixture);
    expect(JSON.parse(await readFile(join(root, SECURITY_JOURNAL_PATH), "utf8"))).toMatchObject({
      status: "CLEANUP_UNVERIFIED",
      beforeLockSha256: null,
      afterLockSha256: null,
      recoveryRequired: true,
    });
    await expect(readFile(join(root, "bun.lock"))).rejects.toThrow();
  });

  it("keeps audit and dry-run project bytes unchanged after unverified cleanup", async () => {
    const before = await securityTreeBytes(root);
    for (const options of [{ mode: "audit" as const }, { mode: "fix" as const, dryRun: true }]) {
      const fixture = securityProcessFixture();
      const fatal = new InstallerProcessTreeError("injected read-only cleanup failure");
      fixture.beforeCommand = async (_input, argv) =>
        argv[0] === "audit"
          ? { exitCode: 1, signal: null, timedOut: false, cleanupVerified: false, error: fatal }
          : undefined;
      await expect(
        runDependencySecurityWithDependencies(
          { cwd: root, ...options, policy: securityTestPolicy },
          fixture.dependencies,
        ),
      ).rejects.toBe(fatal);
      retainCandidates(fixture);
      expect(await securityTreeBytes(root)).toEqual(before);
    }
  });

  it("still permits read-only inspection of a project with a cleanup barrier", async () => {
    const failedFixture = securityProcessFixture();
    const fatal = new InstallerProcessTreeError("injected cleanup barrier");
    failedFixture.beforeCommand = async (_input, argv) =>
      argv[0] === "audit"
        ? { exitCode: 1, signal: null, timedOut: false, cleanupVerified: false, error: fatal }
        : undefined;
    await expect(
      runDependencySecurityWithDependencies(
        { cwd: root, mode: "fix", policy: securityTestPolicy },
        failedFixture.dependencies,
      ),
    ).rejects.toBe(fatal);
    retainCandidates(failedFixture);
    const before = await securityTreeBytes(root);
    for (const options of [{ mode: "audit" as const }, { mode: "fix" as const, dryRun: true }]) {
      const fixture = securityProcessFixture();
      const inspected = await runDependencySecurityWithDependencies(
        { cwd: root, ...options, policy: securityTestPolicy },
        fixture.dependencies,
      );
      expect(inspected).toMatchObject({
        status: "blocked",
        recoveryRequired: true,
        applied: false,
        installedVerified: false,
      });
      expect(fixture.commands.some((input) => input.argv.includes("audit"))).toBe(true);
      expect(await securityTreeBytes(root)).toEqual(before);
    }
  });
});
