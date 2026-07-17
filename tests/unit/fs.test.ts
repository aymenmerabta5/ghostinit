import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FsTransaction } from "../../src/lib/fs";

describe("FsTransaction", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "ghostinit-fs-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

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
    await tx.rollback();
    expect(existsSync(join(root, "deleteme.txt"))).toBe(false);
  });

  it("tracks staged paths", async () => {
    const tx = new FsTransaction(root);
    await tx.write("a/b.txt", "nested");
    expect(tx.stagedPaths).toEqual(["a/b.txt"]);
  });
});
