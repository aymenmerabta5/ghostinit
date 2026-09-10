import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { FsTransaction } from "../../src/lib/fs.js";
import { runDependencySecurityWithDependencies } from "../../src/lib/dependency-security/runtime.js";
import { SECURITY_JOURNAL_PATH } from "../../src/lib/dependency-security/workspace.js";
import type { DependencySecurityResult } from "../../src/domain/dependency-security/types.js";
import type { SupervisedCommandInput } from "../../src/lib/process-supervisor.js";
import {
  sameSecurityRoot,
  securityProcessFixture,
  securityTestPolicy,
  securityTestRoot,
  writeSecurityTestFile,
} from "../helpers/dependency-security-runtime.js";

const privateStdout = "PRIVATE_STDOUT_SENTINEL";
const privateStderr = "PRIVATE_STDERR_SENTINEL";
const privateError = "PRIVATE_ERROR_SENTINEL";
const privateScript = "PRIVATE_MANIFEST_SCRIPT_SENTINEL";

function commandFailure(input: SupervisedCommandInput) {
  input.onStdout?.(Buffer.from(privateStdout));
  input.onStderr?.(Buffer.from(privateStderr));
  return {
    exitCode: 1,
    signal: null,
    timedOut: false,
    cleanupVerified: true,
    error: new Error(privateError),
  } as const;
}

function expectSafeFailure(result: DependencySecurityResult, phase: string): void {
  expect(result).toMatchObject({
    status: "failed",
    applied: true,
    installedVerified: false,
    recoveryRequired: true,
  });
  expect(result.message).toContain(`but ${phase} failed`);
  const serialized = JSON.stringify(result);
  for (const sentinel of [
    privateStdout,
    privateStderr,
    privateError,
    privateScript,
    "PRIVATE_UNIT_SENTINEL",
  ])
    expect(serialized).not.toContain(sentinel);
}

describe("safe published dependency failure phases", () => {
  let root: string;
  beforeEach(async () => {
    root = await securityTestRoot();
    const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
    await writeSecurityTestFile(
      root,
      "package.json",
      JSON.stringify({
        ...manifest,
        scripts: { typecheck: privateScript, "lint:all": privateScript, test: privateScript },
      }),
    );
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  for (const script of ["typecheck", "lint:all", "test"] as const) {
    it(`identifies a failing ${script} check without exposing its output or script body`, async () => {
      const fixture = securityProcessFixture();
      fixture.beforeCommand = async (input, argv) =>
        sameSecurityRoot(input.cwd, root) && argv[0] === "run" && argv[1] === script
          ? commandFailure(input)
          : undefined;
      const result = await runDependencySecurityWithDependencies(
        { cwd: root, mode: "install", verifyProject: true, policy: securityTestPolicy },
        fixture.dependencies,
      );
      expectSafeFailure(result, `bun run ${script}`);
      const ran = fixture.commands
        .filter((input) => sameSecurityRoot(input.cwd, root) && input.argv.includes("run"))
        .map((input) => input.argv.at(-1));
      expect(ran.at(-1)).toBe(script);
    });
  }

  for (const phase of [
    "dependency lock verification",
    "project dependency installation",
    "installed dependency audit",
  ] as const) {
    it(`distinguishes ${phase} from a project check failure`, async () => {
      const fixture = securityProcessFixture();
      fixture.beforeCommand = async (input, argv) => {
        if (!sameSecurityRoot(input.cwd, root)) return undefined;
        const matches =
          phase === "project dependency installation"
            ? argv[0] === "install"
            : argv[0]?.endsWith("audit-dependencies.ts") &&
              (phase === "dependency lock verification"
                ? argv.includes("--lock-only")
                : argv.length === 1);
        return matches ? commandFailure(input) : undefined;
      };
      const result = await runDependencySecurityWithDependencies(
        { cwd: root, mode: "install", verifyProject: true, policy: securityTestPolicy },
        fixture.dependencies,
      );
      expectSafeFailure(result, phase);
    });
  }

  it("identifies initial source verification failure after publication", async () => {
    const fixture = securityProcessFixture();
    let published = false;
    const original = FsTransaction.prototype.assertUnchanged;
    const fault = spyOn(FsTransaction.prototype, "assertUnchanged").mockImplementation(
      async function (this: FsTransaction, path: string, expected: string | null) {
        if (published && path === "bun.lock") throw new Error(privateError);
        return original.call(this, path, expected);
      },
    );
    try {
      const result = await runDependencySecurityWithDependencies(
        {
          cwd: root,
          mode: "install",
          policy: securityTestPolicy,
          onTransactionCommitted: () => {
            published = true;
          },
        },
        fixture.dependencies,
      );
      expectSafeFailure(result, "published source verification");
    } finally {
      fault.mockRestore();
    }
  });

  for (const phase of ["installed source verification", "final source verification"] as const) {
    it(`identifies ${phase} when a completed command changes protected metadata`, async () => {
      const fixture = securityProcessFixture();
      fixture.beforeCommand = async (input, argv) => {
        const mutate =
          phase === "installed source verification"
            ? argv[0] === "install"
            : argv[0] === "run" && argv[1] === "test";
        if (sameSecurityRoot(input.cwd, root) && mutate) {
          const source = await readFile(join(root, "bunfig.toml"), "utf8");
          await writeSecurityTestFile(root, "bunfig.toml", `${source}# ${privateError}\n`);
        }
        return undefined;
      };
      const result = await runDependencySecurityWithDependencies(
        { cwd: root, mode: "install", verifyProject: true, policy: securityTestPolicy },
        fixture.dependencies,
      );
      expectSafeFailure(result, phase);
    });
  }

  it("identifies journal completion failure and keeps the original phase during failure recording", async () => {
    const fixture = securityProcessFixture();
    const original = FsTransaction.prototype.deleteIfUnchanged;
    const fault = spyOn(FsTransaction.prototype, "deleteIfUnchanged").mockImplementation(
      async function (this: FsTransaction, path: string, expected: string) {
        if (path === SECURITY_JOURNAL_PATH) throw new Error(privateError);
        return original.call(this, path, expected);
      },
    );
    try {
      const result = await runDependencySecurityWithDependencies(
        { cwd: root, mode: "install", policy: securityTestPolicy },
        fixture.dependencies,
      );
      expectSafeFailure(result, "installation journal completion");
      expect(JSON.parse(await readFile(join(root, SECURITY_JOURNAL_PATH), "utf8")).status).toBe(
        "FAILED",
      );
    } finally {
      fault.mockRestore();
    }
  });

  for (const change of ["removed", "replaced"] as const) {
    it(`does not claim journal retention when a racing actor ${change} it`, async () => {
      const fixture = securityProcessFixture();
      fixture.beforeCommand = async (input, argv) => {
        if (!sameSecurityRoot(input.cwd, root) || argv[0] !== "install") return undefined;
        const journal = await readFile(join(root, SECURITY_JOURNAL_PATH), "utf8");
        const tx = new FsTransaction(root);
        if (change === "removed") await tx.deleteIfUnchanged(SECURITY_JOURNAL_PATH, journal);
        else await tx.writeIfUnchanged(SECURITY_JOURNAL_PATH, privateError, journal);
        await tx.commit();
        return commandFailure(input);
      };
      const result = await runDependencySecurityWithDependencies(
        { cwd: root, mode: "install", policy: securityTestPolicy },
        fixture.dependencies,
      );
      expectSafeFailure(result, "project dependency installation");
      expect(result.message).toContain("Published sources require recovery");
      expect(result.message).toContain("Inspect any recovery journal");
      expect(result.message).not.toContain("journal was retained");
      if (change === "removed")
        await expect(readFile(join(root, SECURITY_JOURNAL_PATH))).rejects.toThrow();
      else expect(await readFile(join(root, SECURITY_JOURNAL_PATH), "utf8")).toBe(privateError);
    });
  }
});
