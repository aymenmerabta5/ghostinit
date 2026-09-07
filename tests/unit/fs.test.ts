import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  mkdtempSync,
  rmSync,
  existsSync,
  readFileSync,
  writeFileSync,
  symlinkSync,
  utimesSync,
  mkdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FsRollbackError, FsTransaction } from "../../src/lib/fs";

describe("FsTransaction", () => {
  let root: string;
  let cleanupRoots: string[];

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "ghostinit-fs-"));
    cleanupRoots = [root];
  });

  afterEach(() => {
    for (const path of cleanupRoots) rmSync(path, { recursive: true, force: true });
  });

  function linkedOutside(name = "linked"): { outside: string; link: string } {
    const outside = mkdtempSync(join(tmpdir(), "ghostinit-fs-outside-"));
    cleanupRoots.push(outside);
    const link = join(root, name);
    symlinkSync(outside, link, process.platform === "win32" ? "junction" : "dir");
    return { outside, link };
  }

  it("writes files on commit", async () => {
    const tx = new FsTransaction(root);
    await tx.write("hello.txt", "world");
    const { written } = await tx.commit();
    expect(written).toContain("hello.txt");
    expect(existsSync(join(root, "hello.txt"))).toBe(true);
    expect(readFileSync(join(root, "hello.txt"), "utf-8")).toBe("world");
  });

  it("does not write files on rollback", async () => {
    const tx = new FsTransaction(root);
    await tx.write("deleteme.txt", "x");
    expect(await tx.rollback()).toEqual({
      success: true,
      restored: [],
      removed: [],
      failures: [],
    });
    expect(existsSync(join(root, "deleteme.txt"))).toBe(false);
  });

  it("tracks staged paths", async () => {
    const tx = new FsTransaction(root);
    await tx.write("a/b.txt", "nested");
    expect(tx.stagedPaths).toEqual(["a/b.txt"]);
  });

  it("deletes transactionally and restores the file on rollback", async () => {
    writeFileSync(join(root, "owned.txt"), "before\n");
    const tx = new FsTransaction(root);
    await tx.delete("owned.txt");
    expect(tx.getStagedDeletes()).toEqual(["owned.txt"]);
    await tx.commit();
    expect(existsSync(join(root, "owned.txt"))).toBe(false);
    expect(await tx.rollback()).toEqual({
      success: true,
      restored: ["owned.txt"],
      removed: [],
      failures: [],
    });
    expect(readFileSync(join(root, "owned.txt"), "utf8")).toBe("before\n");
  });

  it("restores overwritten bytes only while transaction-written bytes still match", async () => {
    const path = join(root, "owned.txt");
    writeFileSync(path, "before\n");
    const tx = new FsTransaction(root);
    await tx.write("owned.txt", "generated\n");
    await tx.commit();

    expect(await tx.rollback()).toEqual({
      success: true,
      restored: ["owned.txt"],
      removed: [],
      failures: [],
    });
    expect(readFileSync(path, "utf8")).toBe("before\n");
  });

  it("removes a transaction-created file only while its bytes still match", async () => {
    const tx = new FsTransaction(root);
    await tx.write("created.txt", "generated\n");
    await tx.commit();

    expect(await tx.rollback()).toEqual({
      success: true,
      restored: [],
      removed: ["created.txt"],
      failures: [],
    });
    expect(existsSync(join(root, "created.txt"))).toBe(false);
  });

  it("preserves a concurrent edit to a transaction-created file and surfaces failure", async () => {
    const path = join(root, "created.txt");
    const tx = new FsTransaction(root);
    await tx.write("created.txt", "generated\n");
    await tx.commit();
    writeFileSync(path, "user edit\n");

    let error: unknown;
    try {
      await tx.rollback();
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(FsRollbackError);
    expect((error as FsRollbackError).result).toEqual({
      success: false,
      restored: [],
      removed: [],
      failures: [
        expect.objectContaining({
          path: "created.txt",
          action: "remove",
          reason: "content-changed",
        }),
      ],
    });
    expect(readFileSync(path, "utf8")).toBe("user edit\n");
    await expect(tx.rollback()).rejects.toBe(error);
  });

  it("preserves a concurrent edit to an overwritten file and surfaces failure", async () => {
    const path = join(root, "owned.txt");
    writeFileSync(path, "before\n");
    const tx = new FsTransaction(root);
    await tx.write("owned.txt", "generated\n");
    await tx.commit();
    writeFileSync(path, "user edit\n");

    await expect(tx.rollback()).rejects.toMatchObject({
      name: "FsRollbackError",
      result: {
        success: false,
        failures: [
          expect.objectContaining({
            path: "owned.txt",
            action: "restore",
            reason: "content-changed",
          }),
        ],
      },
    });
    expect(readFileSync(path, "utf8")).toBe("user edit\n");
  });

  it("does not overwrite a file that appears after a transactional deletion", async () => {
    const path = join(root, "owned.txt");
    writeFileSync(path, "before\n");
    const tx = new FsTransaction(root);
    await tx.delete("owned.txt");
    await tx.commit();
    writeFileSync(path, "replacement\n");

    await expect(tx.rollback()).rejects.toMatchObject({
      name: "FsRollbackError",
      result: {
        success: false,
        failures: [
          expect.objectContaining({
            path: "owned.txt",
            action: "restore",
            reason: "path-appeared",
          }),
        ],
      },
    });
    expect(readFileSync(path, "utf8")).toBe("replacement\n");
  });

  it("reports partial rollback while safely completing unaffected paths", async () => {
    const tx = new FsTransaction(root);
    await tx.write("safe.txt", "generated safe\n");
    await tx.write("edited.txt", "generated edited\n");
    await tx.commit();
    writeFileSync(join(root, "edited.txt"), "user edit\n");

    await expect(tx.rollback()).rejects.toMatchObject({
      name: "FsRollbackError",
      result: {
        success: false,
        removed: ["safe.txt"],
        failures: [expect.objectContaining({ path: "edited.txt" })],
      },
    });
    expect(existsSync(join(root, "safe.txt"))).toBe(false);
    expect(readFileSync(join(root, "edited.txt"), "utf8")).toBe("user edit\n");
  });

  it("compensates an applied commit prefix without deleting a peer staging file", async () => {
    const peerStaging = join(root, "blocked.txt.ghostinit-staging");
    writeFileSync(peerStaging, "peer transaction\n");
    const tx = new FsTransaction(root);
    await tx.write("first.txt", "first generated\n");
    await tx.write("blocked.txt", "blocked generated\n");

    await expect(tx.commit()).rejects.toMatchObject({ code: "EEXIST" });
    expect(existsSync(join(root, "first.txt"))).toBe(false);
    expect(existsSync(join(root, "blocked.txt"))).toBe(false);
    expect(readFileSync(peerStaging, "utf8")).toBe("peer transaction\n");
  });

  it("keeps canonical safety work linear across a deep batched commit and rollback", async () => {
    const tx = new FsTransaction(root);
    const fileCount = 24;
    for (let index = 0; index < fileCount; index += 1) {
      await tx.write(`deep/shared/generated/files/file-${index}.txt`, `content ${index}\n`);
    }

    await tx.commit();
    const afterCommit = tx.getSafetyDiagnostics();
    expect(afterCommit.pathValidations).toBeLessThanOrEqual(fileCount * 8 + 20);
    // Each path validation canonicalizes only its deepest existing component,
    // regardless of path depth. The extra call establishes the canonical root.
    expect(afterCommit.realpathCalls).toBeLessThanOrEqual(afterCommit.pathValidations + 1);

    await tx.rollback();
    const afterRollback = tx.getSafetyDiagnostics();
    expect(afterRollback.pathValidations - afterCommit.pathValidations).toBeLessThanOrEqual(
      fileCount * 8 + 20,
    );
    expect(afterRollback.realpathCalls - afterCommit.realpathCalls).toBeLessThanOrEqual(
      afterRollback.pathValidations - afterCommit.pathValidations,
    );
  });

  it("rejects writes through a symlink or Windows junction parent", async () => {
    const { outside } = linkedOutside();
    const tx = new FsTransaction(root);
    await expect(tx.write("linked/escaped.txt", "outside\n")).rejects.toThrow(
      /symbolic link or junction/,
    );
    expect(existsSync(join(outside, "escaped.txt"))).toBe(false);
  });

  it("rejects reads and deletes through a symlink or Windows junction parent", async () => {
    const { outside } = linkedOutside();
    writeFileSync(join(outside, "victim.txt"), "keep\n");
    const tx = new FsTransaction(root);
    await expect(tx.readText("linked/victim.txt")).rejects.toThrow(/symbolic link or junction/);
    await expect(tx.delete("linked/victim.txt")).rejects.toThrow(/symbolic link or junction/);
    expect(readFileSync(join(outside, "victim.txt"), "utf8")).toBe("keep\n");
  });

  it("never traverses linked directories while cleaning stale staging files", async () => {
    const { outside } = linkedOutside();
    const victim = join(outside, "victim.ghostinit-staging");
    writeFileSync(victim, "keep\n");
    const old = new Date(Date.now() - 2 * 60 * 60 * 1000);
    utimesSync(victim, old, old);

    const result = await new FsTransaction(root).cleanupStaleStaging();
    expect(result.removed).toEqual([]);
    expect(readFileSync(victim, "utf8")).toBe("keep\n");
  });

  it("cleans only exact regular-file staging names owned by FsTransaction", async () => {
    const old = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const owned = join(root, "owned.txt.ghostinit-staging");
    const containsSubstring = join(root, "notes.ghostinit-staging.keep");
    const startsWithMarker = join(root, ".ghostinit-staging-backup");
    const exactMarker = join(root, ".ghostinit-staging");
    const stagingLikeDirectory = join(root, "cache.ghostinit-staging");
    writeFileSync(owned, "remove\n");
    writeFileSync(containsSubstring, "keep substring\n");
    writeFileSync(startsWithMarker, "keep prefix\n");
    writeFileSync(exactMarker, "keep exact marker\n");
    mkdirSync(stagingLikeDirectory);
    writeFileSync(join(stagingLikeDirectory, "keep.txt"), "keep directory\n");
    const nestedStagingLikeFile = join(stagingLikeDirectory, "nested.txt.ghostinit-staging");
    writeFileSync(nestedStagingLikeFile, "keep nested staging-like file\n");
    for (const path of [
      owned,
      containsSubstring,
      startsWithMarker,
      exactMarker,
      stagingLikeDirectory,
      nestedStagingLikeFile,
    ]) {
      utimesSync(path, old, old);
    }

    const result = await new FsTransaction(root).cleanupStaleStaging();
    expect(result.removed).toEqual(["owned.txt.ghostinit-staging"]);
    expect(existsSync(owned)).toBe(false);
    expect(readFileSync(containsSubstring, "utf8")).toBe("keep substring\n");
    expect(readFileSync(startsWithMarker, "utf8")).toBe("keep prefix\n");
    expect(readFileSync(exactMarker, "utf8")).toBe("keep exact marker\n");
    expect(readFileSync(join(stagingLikeDirectory, "keep.txt"), "utf8")).toBe("keep directory\n");
    expect(readFileSync(nestedStagingLikeFile, "utf8")).toBe("keep nested staging-like file\n");
  });

  it("aborts when a staged write changes before commit", async () => {
    const path = join(root, "owned.txt");
    writeFileSync(path, "before\n");
    const tx = new FsTransaction(root);
    await tx.write("owned.txt", "generated\n");
    writeFileSync(path, "concurrent user edit\n");

    await expect(tx.commit()).rejects.toThrow(/changed after it was staged/);
    expect(readFileSync(path, "utf8")).toBe("concurrent user edit\n");
  });

  it("does not overwrite a file that appears after write validation", async () => {
    const path = join(root, "appeared.txt");
    const tx = new FsTransaction(root);
    await tx.write("appeared.txt", "generated\n");

    type WriteReadyHook = (...args: unknown[]) => Promise<void>;
    const internals = tx as unknown as { assertStagedWriteReady: WriteReadyHook };
    const validate = internals.assertStagedWriteReady.bind(tx);
    internals.assertStagedWriteReady = async (...args: unknown[]) => {
      await validate(...args);
      writeFileSync(path, "peer bytes\n");
    };

    await expect(tx.commit()).rejects.toMatchObject({ code: "EEXIST" });
    expect(readFileSync(path, "utf8")).toBe("peer bytes\n");
  });

  it("captures and restores an edit racing an overwrite after validation", async () => {
    const path = join(root, "owned.txt");
    writeFileSync(path, "before\n");
    const tx = new FsTransaction(root);
    await tx.write("owned.txt", "generated\n");

    type QuarantineHook = (...args: unknown[]) => Promise<unknown>;
    const internals = tx as unknown as { quarantineCurrentFile: QuarantineHook };
    const quarantine = internals.quarantineCurrentFile.bind(tx);
    internals.quarantineCurrentFile = async (...args: unknown[]) => {
      writeFileSync(path, "peer edit\n");
      return quarantine(...args);
    };

    await expect(tx.commit()).rejects.toThrow(/changed while the staged write was being applied/);
    expect(readFileSync(path, "utf8")).toBe("peer edit\n");
  });

  it("captures and restores an edit racing a deletion after validation", async () => {
    const path = join(root, "owned.txt");
    writeFileSync(path, "before\n");
    const tx = new FsTransaction(root);
    await tx.delete("owned.txt");

    type QuarantineHook = (...args: unknown[]) => Promise<unknown>;
    const internals = tx as unknown as { quarantineCurrentFile: QuarantineHook };
    const quarantine = internals.quarantineCurrentFile.bind(tx);
    internals.quarantineCurrentFile = async (...args: unknown[]) => {
      writeFileSync(path, "peer edit\n");
      return quarantine(...args);
    };

    await expect(tx.commit()).rejects.toThrow(
      /changed while the staged deletion was being applied/,
    );
    expect(readFileSync(path, "utf8")).toBe("peer edit\n");
  });
});
