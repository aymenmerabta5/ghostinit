import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FsTransaction } from "../../src/lib/fs.js";

type WriteReadyHook = (...args: unknown[]) => Promise<void>;
type RemoveStagingHook = (path: string) => Promise<void>;

describe("FsTransaction read dependencies", () => {
  let root: string;
  let cleanupRoots: string[];

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "ghostinit-fs-read-dependencies-"));
    cleanupRoots = [root];
  });

  afterEach(() => {
    for (const path of cleanupRoots) rmSync(path, { recursive: true, force: true });
  });

  async function writeFixture(files: Record<string, string>, target = root): Promise<void> {
    const tx = new FsTransaction(target);
    for (const [path, content] of Object.entries(files)) await tx.write(path, content);
    await tx.commit();
  }

  function afterPublication(
    tx: FsTransaction,
    path: string,
    edit: () => Promise<void>,
  ): () => boolean {
    const internals = tx as unknown as { removeStagingEntry: RemoveStagingHook };
    const remove = internals.removeStagingEntry.bind(tx);
    let published = false;
    internals.removeStagingEntry = async (stagingPath) => {
      await remove(stagingPath);
      if (stagingPath === `${path}.ghostinit-staging` && !published) {
        expect(existsSync(join(root, path))).toBe(true);
        published = true;
        await edit();
      }
    };
    return () => published;
  }

  for (const mode of ["dry run", "commit"] as const) {
    it(`keeps guard-only ${mode} free of staged files and byte mutations`, async () => {
      const original = "\uFEFFinput with CRLF\r\nnon-ASCII: café\r\n";
      await writeFixture({ "input.txt": original });
      const before = readFileSync(join(root, "input.txt"));
      const tx = new FsTransaction(root);
      await tx.assertUnchanged("input.txt", original);
      await tx.assertUnchanged("optional.txt", null);

      expect(tx.getStagedFiles()).toEqual([]);
      expect(tx.getStagedDeletes()).toEqual([]);
      expect(tx.getStagedContents().size).toBe(0);
      expect(tx.stagedPaths).toEqual([]);
      expect(readFileSync(join(root, "input.txt"))).toEqual(before);
      if (mode === "commit") {
        expect(await tx.commit()).toEqual({ written: [] });
      } else {
        expect(await tx.rollback()).toEqual({
          success: true,
          restored: [],
          removed: [],
          failures: [],
        });
      }
      expect(readFileSync(join(root, "input.txt"))).toEqual(before);
      expect(readdirSync(root)).toEqual(["input.txt"]);
    });
  }

  for (const original of ["original input\n", null]) {
    it(`rejects an input ${original === null ? "appearing" : "changing"} before any write begins`, async () => {
      await writeFixture({ "existing.txt": "before\n" });
      if (original !== null) await writeFixture({ "input.txt": original });
      const tx = new FsTransaction(root);
      await tx.assertUnchanged("input.txt", original);
      await tx.write("existing.txt", "generated existing\n");
      await tx.write("created.txt", "generated new\n");
      const internals = tx as unknown as { assertStagedWriteReady: WriteReadyHook };
      const ready = internals.assertStagedWriteReady.bind(tx);
      let writeAttempts = 0;
      internals.assertStagedWriteReady = async (...args) => {
        writeAttempts += 1;
        await ready(...args);
      };
      await writeFixture({ "input.txt": "peer input\n" });

      await expect(tx.commit()).rejects.toThrow(/input\.txt/);
      expect(writeAttempts).toBe(0);
      expect(readFileSync(join(root, "input.txt"), "utf8")).toBe("peer input\n");
      expect(readFileSync(join(root, "existing.txt"), "utf8")).toBe("before\n");
      expect(existsSync(join(root, "created.txt"))).toBe(false);
    });

    it(`rechecks an input ${original === null ? "appearing" : "changing"} after publication and compensates writes`, async () => {
      await writeFixture({ "existing.txt": "before\n" });
      if (original !== null) await writeFixture({ "input.txt": original });
      const tx = new FsTransaction(root);
      await tx.assertUnchanged("input.txt", original);
      await tx.write("existing.txt", "generated existing\n");
      await tx.write("created.txt", "generated new\n");
      const published = afterPublication(tx, "created.txt", async () => {
        expect(readFileSync(join(root, "existing.txt"), "utf8")).toBe("generated existing\n");
        expect(readFileSync(join(root, "created.txt"), "utf8")).toBe("generated new\n");
        await writeFixture({ "input.txt": "peer input\n" });
      });

      await expect(tx.commit()).rejects.toThrow(/input\.txt/);
      expect(published()).toBe(true);
      expect(readFileSync(join(root, "input.txt"), "utf8")).toBe("peer input\n");
      expect(readFileSync(join(root, "existing.txt"), "utf8")).toBe("before\n");
      expect(existsSync(join(root, "created.txt"))).toBe(false);
      expect(readdirSync(root).sort()).toEqual(["existing.txt", "input.txt"]);
    });

    it(`accepts transaction-written bytes for a guarded ${original === null ? "absent" : "existing"} path`, async () => {
      if (original !== null) await writeFixture({ "input.txt": original });
      const tx = new FsTransaction(root);
      await tx.assertUnchanged("input.txt", original);
      await tx.writeIfUnchanged("input.txt", "generated input\n", original);

      expect(await tx.commit()).toEqual({ written: ["input.txt"] });
      expect(readFileSync(join(root, "input.txt"), "utf8")).toBe("generated input\n");
    });
  }

  it("preserves a peer edit to a guarded output when final validation triggers rollback", async () => {
    await writeFixture({ "input.txt": "original input\n", "existing.txt": "before\n" });
    const tx = new FsTransaction(root);
    await tx.assertUnchanged("input.txt", "original input\n");
    await tx.write("existing.txt", "generated existing\n");
    await tx.write("created.txt", "generated new\n");
    await tx.writeIfUnchanged("input.txt", "generated input\n", "original input\n");
    const published = afterPublication(tx, "input.txt", async () => {
      expect(readFileSync(join(root, "input.txt"), "utf8")).toBe("generated input\n");
      await writeFixture({ "input.txt": "peer input\n" });
    });

    await expect(tx.commit()).rejects.toMatchObject({
      name: "FsRollbackError",
      cause: expect.objectContaining({ message: expect.stringContaining("input.txt") }),
      result: {
        success: false,
        restored: ["existing.txt"],
        removed: ["created.txt"],
        failures: [
          expect.objectContaining({
            path: "input.txt",
            action: "restore",
            reason: "content-changed",
          }),
        ],
      },
    });
    expect(published()).toBe(true);
    expect(readFileSync(join(root, "input.txt"), "utf8")).toBe("peer input\n");
    expect(readFileSync(join(root, "existing.txt"), "utf8")).toBe("before\n");
    expect(existsSync(join(root, "created.txt"))).toBe(false);
  });

  it("retains the guard when writeIfUnchanged has identical bytes and stages nothing", async () => {
    await writeFixture({ "input.txt": "original input\n" });
    const tx = new FsTransaction(root);
    await tx.assertUnchanged("input.txt", "original input\n");
    await tx.writeIfUnchanged("input.txt", "original input\n", "original input\n");
    expect(tx.getStagedFiles()).toEqual([]);
    expect(tx.getStagedDeletes()).toEqual([]);
    expect(tx.stagedPaths).toEqual([]);
    await writeFixture({ "input.txt": "peer input\n" });

    await expect(tx.commit()).rejects.toThrow(/input\.txt/);
    expect(readFileSync(join(root, "input.txt"), "utf8")).toBe("peer input\n");
    expect(readdirSync(root)).toEqual(["input.txt"]);
  });

  it("accepts a guarded deletion as the transaction's final state", async () => {
    await writeFixture({ "input.txt": "original input\n" });
    const tx = new FsTransaction(root);
    await tx.assertUnchanged("input.txt", "original input\n");
    await tx.deleteIfUnchanged("input.txt", "original input\n");

    expect(await tx.commit()).toEqual({ written: ["input.txt"] });
    expect(existsSync(join(root, "input.txt"))).toBe(false);
  });

  for (const path of [
    "../input.txt",
    "nested/../input.txt",
    "/input.txt",
    "C:/input.txt",
    "a\\b",
  ]) {
    it(`rejects unsafe guard path ${JSON.stringify(path)}`, async () => {
      const tx = new FsTransaction(root);
      await expect(tx.assertUnchanged(path, null)).rejects.toThrow(/unsafe|traversal|escapes/i);
      expect(tx.getStagedFiles()).toEqual([]);
      expect(readdirSync(root)).toEqual([]);
    });
  }

  it("rejects a guard through a symbolic link or Windows junction parent", async () => {
    const outside = mkdtempSync(join(tmpdir(), "ghostinit-fs-read-dependencies-outside-"));
    cleanupRoots.push(outside);
    await writeFixture({ "input.txt": "outside input\n" }, outside);
    symlinkSync(outside, join(root, "linked"), process.platform === "win32" ? "junction" : "dir");
    const tx = new FsTransaction(root);

    await expect(tx.assertUnchanged("linked/input.txt", "outside input\n")).rejects.toThrow(
      /symbolic link or junction/,
    );
    expect(tx.getStagedFiles()).toEqual([]);
    expect(readFileSync(join(outside, "input.txt"), "utf8")).toBe("outside input\n");
  });
});
