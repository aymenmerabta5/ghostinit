import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { upgradeCommand } from "../../src/commands/upgrade.js";
import type { GlobalOptions } from "../../src/commands/types.js";
import type { DependencySecurityResult } from "../../src/domain/dependency-security/types.js";
import { ConflictError, ExitCode, LockError } from "../../src/lib/errors.js";
import { FsTransaction } from "../../src/lib/fs.js";
import { acquireLock } from "../../src/lib/lock.js";
import { Logger } from "../../src/lib/logger.js";
import { createManagedFileState, loadState, saveStateV2 } from "../../src/lib/state.js";

function options(root: string, overrides: Partial<GlobalOptions> = {}): GlobalOptions {
  return {
    cwd: root,
    json: true,
    yes: true,
    force: false,
    dryRun: false,
    noInstall: false,
    runtime: "bun",
    check: false,
    logger: new Logger({ quiet: true }),
    ...overrides,
  };
}

function securityResult(
  status: DependencySecurityResult["status"] = "clean",
  installedVerified = true,
): DependencySecurityResult {
  return {
    status,
    dryRun: false,
    applied: false,
    installedVerified,
    changes: [],
    remaining: [],
    verifiedPatchAdvisories: [],
  };
}

async function captureJson(operation: () => Promise<number>) {
  const originalWrite = process.stdout.write;
  let output = "";
  process.stdout.write = ((chunk: string | Uint8Array) => {
    output += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
    return true;
  }) as typeof process.stdout.write;
  try {
    const exitCode = await operation();
    const lines = output.trim().split("\n");
    expect(lines).toHaveLength(1);
    return { exitCode, payload: JSON.parse(lines[0]!), output };
  } finally {
    process.stdout.write = originalWrite;
  }
}

function treeHash(root: string): string {
  const hash = createHash("sha256");
  const visit = (directory: string): void => {
    for (const name of readdirSync(directory).toSorted()) {
      const absolute = join(directory, name);
      if (statSync(absolute).isDirectory()) visit(absolute);
      else {
        hash.update(relative(root, absolute).replaceAll("\\", "/"));
        hash.update(readFileSync(absolute));
      }
    }
  };
  visit(root);
  return hash.digest("hex");
}

async function expectCompletedUpgrade(root: string): Promise<void> {
  const state = await loadState(root);
  expect(state?.sourceVersion).toBe(2);
  expect(state?.pendingOperation).toBeNull();
  expect(state?.migrationHistory.at(-1)).toMatchObject({
    kind: "upgrade",
    fromVersion: 1,
    toVersion: 2,
    status: "completed",
  });
  expect(existsSync(join(root, "ghostinit.config.json"))).toBe(true);
  expect(existsSync(join(root, "package.json"))).toBe(true);
}

describe("upgrade dependency security integration", () => {
  let root: string;

  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), "ghostinit-upgrade-security-"));
    const transaction = new FsTransaction(root);
    await transaction.write(
      ".ghostinit/state.json",
      readFileSync(join(import.meta.dir, "../fixtures/compatibility/v1-state.json"), "utf8"),
    );
    await transaction.write("packages/modules/src/index.ts", "");
    await transaction.commit();
    expect((await loadState(root))?.sourceVersion).toBe(1);
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  test("runs security after reconciliation under the same live project lease", async () => {
    let calls = 0;
    const captured = await captureJson(() =>
      upgradeCommand([], options(root), {
        runSecurity: async (input) => {
          calls += 1;
          await expectCompletedUpgrade(root);
          expect(input).toMatchObject({
            cwd: root,
            mode: "install",
            bootstrap: true,
            verifyProject: true,
          });
          expect(input.leaseOwner).toEqual(
            JSON.parse(readFileSync(join(root, ".ghostinit.lock"), "utf8")),
          );
          expect(input.leaseOwner?.token).toBeString();
          await expect(acquireLock(root, new Logger({ quiet: true }))).rejects.toBeInstanceOf(
            LockError,
          );
          expect(input.policy.minimumReleaseAgeSeconds).toBe(7 * 24 * 60 * 60);
          const bunfig = Bun.TOML.parse(readFileSync(join(root, "bunfig.toml"), "utf8"));
          expect(bunfig).toMatchObject({
            install: { minimumReleaseAge: 604800, minimumReleaseAgeExcludes: [] },
          });
          return { ...securityResult(), internalSource: "private dependency source bytes" };
        },
      }),
    );
    expect(calls).toBe(1);
    expect(captured.exitCode).toBe(ExitCode.OK);
    expect(captured.payload).toMatchObject({
      success: true,
      exitCode: ExitCode.OK,
      data: {
        upgraded: true,
        sourceStateVersion: 1,
        targetStateVersion: 2,
        dependencySecurity: securityResult(),
      },
      meta: { command: "upgrade" },
    });
    expect(captured.payload.error).toBeUndefined();
    expect(captured.output).not.toContain("internalSource");
    expect(captured.output).not.toContain("private dependency source bytes");
    expect(existsSync(join(root, ".ghostinit.lock"))).toBe(false);
  });

  test("--no-install completes the source upgrade and explicitly skips security", async () => {
    let calls = 0;
    const captured = await captureJson(() =>
      upgradeCommand([], options(root, { noInstall: true }), {
        runSecurity: async () => {
          calls += 1;
          return securityResult();
        },
      }),
    );
    expect(calls).toBe(0);
    expect(captured.exitCode).toBe(ExitCode.OK);
    expect(captured.payload.data).toMatchObject({
      upgraded: true,
      dependencySecurity: { status: "not-run", reason: "no-install" },
    });
    await expectCompletedUpgrade(root);
    expect(existsSync(join(root, ".ghostinit.lock"))).toBe(false);
  });

  test("dry-run does not invoke security or change any project bytes", async () => {
    const before = treeHash(root);
    let calls = 0;
    const captured = await captureJson(() =>
      upgradeCommand([], options(root, { dryRun: true }), {
        runSecurity: async () => {
          calls += 1;
          return securityResult();
        },
      }),
    );
    expect(calls).toBe(0);
    expect(captured.exitCode).toBe(ExitCode.OK);
    expect(captured.payload.data).toMatchObject({
      upgraded: false,
      dryRun: true,
      dependencySecurity: { status: "not-run", reason: "dry-run" },
    });
    expect(treeHash(root)).toBe(before);
    expect((await loadState(root))?.sourceVersion).toBe(1);
    expect(existsSync(join(root, ".ghostinit.lock"))).toBe(false);
  });

  for (const [status, installedVerified, exitCode] of [
    ["blocked", false, ExitCode.DRIFT],
    ["failed", false, ExitCode.GENERAL_ERROR],
    ["clean", false, ExitCode.GENERAL_ERROR],
    ["partial", true, ExitCode.OK],
  ] as const) {
    test(`${status} with installedVerified=${installedVerified} reports the completed source upgrade honestly`, async () => {
      const result = {
        ...securityResult(status, installedVerified),
        message: "Dependency verification result from the injected security port.",
        ...(status === "failed" ? { recoveryRequired: true } : {}),
      };
      const captured = await captureJson(() =>
        upgradeCommand([], options(root), {
          runSecurity: async () => result,
        }),
      );
      expect(captured.exitCode).toBe(exitCode);
      expect(captured.payload).toMatchObject({
        success: exitCode === ExitCode.OK,
        exitCode,
        data: { upgraded: true, dryRun: false, dependencySecurity: result },
        meta: { command: "upgrade" },
      });
      if (exitCode !== ExitCode.OK) {
        expect(captured.payload.error.message).toContain("Project files were upgraded");
        expect(captured.payload.error.message).toContain(result.message);
      } else expect(captured.payload.error).toBeUndefined();
      await expectCompletedUpgrade(root);
      expect(existsSync(join(root, ".ghostinit.lock"))).toBe(false);
    });
  }

  test("a thrown security error leaves the completed upgrade and releases its lease", async () => {
    const failure = new Error("Injected dependency security failure");
    const captured = await captureJson(() =>
      upgradeCommand([], options(root), {
        runSecurity: async () => {
          throw failure;
        },
      }),
    );
    expect(captured.exitCode).toBe(ExitCode.GENERAL_ERROR);
    expect(captured.payload).toMatchObject({
      success: false,
      data: {
        upgraded: true,
        dependencySecurity: {
          status: "failed",
          installedVerified: false,
          outcomeUnknown: true,
          recoveryRequired: true,
          message: failure.message,
        },
      },
    });
    expect(captured.payload.error.message).toContain("Project files were upgraded");
    await expectCompletedUpgrade(root);
    expect(existsSync(join(root, ".ghostinit.lock"))).toBe(false);
  });

  test("a customized user manifest remains a conflict and never reaches security", async () => {
    await upgradeCommand([], options(root, { noInstall: true, json: false }));
    const state = (await loadState(root))!;
    const original = readFileSync(join(root, "package.json"), "utf8");
    const previous = JSON.parse(original);
    previous.scripts.dev = "bun previous-generated-entry.ts";
    const previousContent = `${JSON.stringify(previous, null, 2)}\n`;
    const oldGeneration = new FsTransaction(root);
    await oldGeneration.writeIfUnchanged("package.json", previousContent, original);
    await oldGeneration.commit();
    await saveStateV2(root, state, {
      replaceFiles: {
        ...state.files,
        "package.json": createManagedFileState(
          "package.json",
          previousContent,
          state.files["package.json"],
        ),
      },
      desiredConfigAlreadyWritten: true,
    });
    previous.scripts.dev = "bun user-owned-entry.ts";
    const customized = new FsTransaction(root);
    await customized.writeIfUnchanged(
      "package.json",
      `${JSON.stringify(previous, null, 2)}\n`,
      previousContent,
    );
    await customized.commit();
    const before = treeHash(root);
    let calls = 0;
    await expect(
      upgradeCommand([], options(root, { force: true, json: false }), {
        runSecurity: async () => {
          calls += 1;
          return securityResult();
        },
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(calls).toBe(0);
    expect(treeHash(root)).toBe(before);
    expect(existsSync(join(root, ".ghostinit.lock"))).toBe(false);
  });
});
