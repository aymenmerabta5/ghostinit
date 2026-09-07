// @allow-long 426: real filesystem races cover one binding staging and restoration lifecycle
import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import * as filesystem from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, parse, resolve } from "node:path";
import { FsTransaction } from "../../src/lib/fs.js";
import { stageWorkerBindingFiles } from "../helpers/worker-binding-files.js";
import * as workspaces from "../helpers/temporary-workspace.js";

const roots: string[] = [];
const prefix = "ghostinit-worker-bindings-";
const original =
  '# Original formatting\r\nSITE_URL="http://localhost:3000"\r\nAUTH_SECRET="original-test-value"\r\n';
const content = 'SITE_URL="https://fixture.example.test"\nAUTH_SECRET="fixture-test-value"\n';
const lockName = ".dev.vars.ghostinit-build-lock";
const recoveryPrefix = `${prefix}recovery-`;
let workspaceHook: ReturnType<typeof spyOn<typeof workspaces, "createTemporaryWorkspace">>;

beforeEach(() => {
  const create = workspaces.createTemporaryWorkspace;
  workspaceHook = spyOn(workspaces, "createTemporaryWorkspace").mockImplementation(
    (name, parent) => {
      const path = create(name, parent);
      if (name === recoveryPrefix) roots.push(path);
      return path;
    },
  );
});

function fixture() {
  const root = workspaces.createTemporaryWorkspace(prefix);
  roots.push(root);
  mkdirSync(join(root, "apps/web"), { recursive: true });
  const entries = [".dev.vars", "apps/web/.dev.vars"].map((path) => ({ path, original, content }));
  for (const entry of entries) writeFileSync(join(root, entry.path), entry.original);
  return { root, entries };
}

function mirrors(root: string): string[] {
  return [".dev.vars", "apps/web/.dev.vars"].map((path) => readFileSync(join(root, path), "utf8"));
}

afterEach(() => {
  workspaceHook.mockRestore();
  const temporaryParent = realpathSync.native(tmpdir());
  for (const path of roots.splice(0).reverse()) {
    if (dirname(resolve(path)) !== temporaryParent || !basename(path).startsWith(prefix)) {
      throw new Error("Unsafe Worker binding fixture cleanup");
    }
    let metadata;
    try {
      metadata = lstatSync(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    if (metadata.isSymbolicLink()) unlinkSync(path);
    else rmSync(path, { recursive: true, force: true, maxRetries: 5 });
  }
});

describe("temporary Worker binding files", () => {
  test.skipIf(process.platform !== "win32")(
    "accepts a real Windows project beneath a volume-root realpath",
    async () => {
      const { root, entries } = fixture();
      const volume = parse(root).root;
      expect(volume).toMatch(/^[A-Za-z]:\\$/);
      const resolvedVolume = await filesystem.realpath(volume);
      expect([volume.toLowerCase(), volume.slice(0, 2).toLowerCase()]).toContain(
        resolvedVolume.toLowerCase(),
      );
      const staged = await stageWorkerBindingFiles(root, entries);
      await staged.restore(true);
      expect(mirrors(root)).toEqual([original, original]);
    },
  );

  test("rejects drive-relative caller roots without touching the project", async () => {
    const { root, entries } = fixture();
    for (const unsafe of ["D:", "D:relative", "C:..\\relative"]) {
      await expect(stageWorkerBindingFiles(unsafe, entries)).rejects.toMatchObject({
        cleanupVerified: false,
      });
    }
    expect(mirrors(root)).toEqual([original, original]);
  });

  test("stages both mirrors and restores their exact original bytes after process cleanup", async () => {
    const { root, entries } = fixture();
    entries[1]!.original = original.replaceAll("\r\n", "\n");
    writeFileSync(join(root, entries[1]!.path), entries[1]!.original);
    const staged = await stageWorkerBindingFiles(root, entries);
    const recovery = roots.find((path) => basename(path).startsWith(recoveryPrefix))!;
    expect(recovery).toBeDefined();
    expect(
      entries.map((_, index) => readFileSync(join(recovery, `${index}.original`), "utf8")),
    ).toEqual(entries.map((entry) => entry.original));
    expect(lstatSync(recovery).isSymbolicLink()).toBe(false);
    if (process.platform !== "win32") {
      expect(lstatSync(recovery).mode & 0o777).toBe(0o700);
      expect(lstatSync(join(recovery, "0.original")).mode & 0o777).toBe(0o600);
    }
    expect(mirrors(root)).toEqual([content, content]);
    expect(existsSync(join(root, lockName))).toBe(false);
    await staged.restore(true);
    await staged.restore(true);
    expect(mirrors(root)).toEqual(entries.map((entry) => entry.original));
    expect(readdirSync(root).filter((name) => name.startsWith(".dev.vars.ghostinit-"))).toEqual([]);
    expect(existsSync(recovery)).toBe(false);
  });

  test("unverified process cleanup leaves every staged byte in place", async () => {
    const { root, entries } = fixture();
    const staged = await stageWorkerBindingFiles(root, entries);
    const recovery = roots.find((path) => basename(path).startsWith(recoveryPrefix))!;
    await expect(staged.restore(false)).rejects.toMatchObject({
      cleanupVerified: false,
      recoveryDirectory: recovery,
    });
    expect(readFileSync(join(recovery, "0.original"), "utf8")).toBe(original);
    expect(readFileSync(join(recovery, "1.original"), "utf8")).toBe(original);
    expect(mirrors(root)).toEqual([content, content]);
    await staged.restore(true);
    expect(mirrors(root)).toEqual([original, original]);
  });

  for (const marker of [lockName, ".DEV.VARS.GHOSTINIT-PROCESS-RECOVERY-existing"]) {
    test(`preserves an existing ${marker} during staging and restoration`, async () => {
      const { root, entries } = fixture();
      const markerPath = join(root, marker);
      writeFileSync(markerPath, "other owner");
      await expect(stageWorkerBindingFiles(root, entries)).rejects.toMatchObject({
        cleanupVerified: false,
      });
      expect(mirrors(root)).toEqual([original, original]);
      expect(readFileSync(markerPath, "utf8")).toBe("other owner");
      unlinkSync(markerPath);
      const staged = await stageWorkerBindingFiles(root, entries);
      writeFileSync(markerPath, "other owner");
      await expect(staged.restore(true)).rejects.toMatchObject({ cleanupVerified: false });
      expect(mirrors(root)).toEqual([content, content]);
      expect(readFileSync(markerPath, "utf8")).toBe("other owner");
    });
  }

  test("preflights every mirror before changing either when fixture bytes changed", async () => {
    const { root, entries } = fixture();
    const staged = await stageWorkerBindingFiles(root, entries);
    writeFileSync(join(root, "apps/web/.dev.vars"), "PEER=changed\n");
    await expect(staged.restore(true)).rejects.toMatchObject({ cleanupVerified: false });
    expect(mirrors(root)).toEqual([content, "PEER=changed\n"]);
    expect(existsSync(join(root, lockName))).toBe(false);
  });

  test("does not adopt an identical-byte replacement inode", async () => {
    const { root, entries } = fixture();
    const staged = await stageWorkerBindingFiles(root, entries);
    const path = join(root, ".dev.vars");
    renameSync(path, join(root, "former-fixture"));
    writeFileSync(path, content);
    const replacement = lstatSync(path);
    await expect(staged.restore(true)).rejects.toMatchObject({ cleanupVerified: false });
    expect(lstatSync(path).ino).toBe(replacement.ino);
    expect(mirrors(root)).toEqual([content, content]);
    expect(readFileSync(join(root, "former-fixture"), "utf8")).toBe(content);
  });

  test("preserves a linked binding path and its destination", async () => {
    const { root, entries } = fixture();
    const outside = fixture().root;
    const staged = await stageWorkerBindingFiles(root, entries);
    const path = join(root, "apps/web/.dev.vars");
    unlinkSync(path);
    symlinkSync(outside, path, process.platform === "win32" ? "junction" : "dir");
    await expect(staged.restore(true)).rejects.toMatchObject({ cleanupVerified: false });
    expect(lstatSync(path).isSymbolicLink()).toBe(true);
    expect(mirrors(outside)).toEqual([original, original]);
    expect(readFileSync(join(root, ".dev.vars"), "utf8")).toBe(content);
  });

  test("refuses a replaced source parent even when its mirror bytes match", async () => {
    const { root, entries } = fixture();
    const staged = await stageWorkerBindingFiles(root, entries);
    renameSync(join(root, "apps/web"), join(root, "apps/former-web"));
    mkdirSync(join(root, "apps/web"));
    writeFileSync(join(root, "apps/web/.dev.vars"), content);
    await expect(staged.restore(true)).rejects.toMatchObject({ cleanupVerified: false });
    expect(mirrors(root)).toEqual([content, content]);
    expect(readFileSync(join(root, "apps/former-web/.dev.vars"), "utf8")).toBe(content);
  });

  test("refuses a linked project root before staging", async () => {
    const { root, entries } = fixture();
    const moved = `${root}-moved`;
    renameSync(root, moved);
    roots.push(moved);
    symlinkSync(moved, root, process.platform === "win32" ? "junction" : "dir");
    await expect(stageWorkerBindingFiles(root, entries)).rejects.toMatchObject({
      cleanupVerified: false,
    });
    expect(mirrors(moved)).toEqual([original, original]);
    expect(existsSync(join(moved, lockName))).toBe(false);
  });

  test("compensates a failed second install before reporting cleanup as verified", async () => {
    const { root, entries } = fixture();
    type WriteReady = (this: FsTransaction, ...args: unknown[]) => Promise<void>;
    const internals = FsTransaction.prototype as unknown as { assertStagedWriteReady: WriteReady };
    const validate = internals.assertStagedWriteReady;
    let firstWasInstalled = false;
    const hook = spyOn(internals, "assertStagedWriteReady").mockImplementation(async function (
      this: FsTransaction,
      ...args: unknown[]
    ) {
      if ((this as unknown as { root: string }).root === root && args[0] === "apps/web/.dev.vars") {
        firstWasInstalled = readFileSync(join(root, ".dev.vars"), "utf8") === content;
        throw new Error("Injected second-file install failure");
      }
      return validate.apply(this, args);
    });
    try {
      await expect(stageWorkerBindingFiles(root, entries)).rejects.toMatchObject({
        cleanupVerified: true,
      });
    } finally {
      hook.mockRestore();
    }
    expect(firstWasInstalled).toBe(true);
    expect(mirrors(root)).toEqual([original, original]);
    expect(existsSync(join(root, lockName))).toBe(false);
  });

  for (const fault of ["read", "replacement", "link", "parent"] as const) {
    test(`retains private originals after a post-commit ${fault} failure`, async () => {
      const { root, entries } = fixture();
      const outside = fault === "link" ? fixture().root : undefined;
      const commit = FsTransaction.prototype.commit;
      const lstat = filesystem.lstat;
      let committed = false;
      let injected = false;
      let replacementIdentity: ReturnType<typeof lstatSync> | undefined;
      const commitHook = spyOn(FsTransaction.prototype, "commit").mockImplementation(
        async function (this: FsTransaction) {
          if ((this as unknown as { root: string }).root !== root) return commit.call(this);
          const recovery = roots.find((path) => basename(path).startsWith(recoveryPrefix))!;
          expect(readFileSync(join(recovery, "0.original"), "utf8")).toBe(original);
          expect(readFileSync(join(recovery, "1.original"), "utf8")).toBe(original);
          const result = await commit.call(this);
          committed = true;
          return result;
        },
      );
      const readHook = spyOn(filesystem, "lstat").mockImplementation(async (...args) => {
        if (committed && !injected && String(args[0]) === join(root, ".dev.vars")) {
          injected = true;
          if (fault === "parent") {
            renameSync(join(root, "apps/web"), join(root, "apps/former-web"));
            mkdirSync(join(root, "apps/web"));
            writeFileSync(join(root, "apps/web/.dev.vars"), content);
            replacementIdentity = lstatSync(join(root, "apps/web"));
          }
          if (fault === "replacement" || fault === "link") {
            renameSync(join(root, ".dev.vars"), join(root, "former-fixture"));
            if (fault === "link") {
              symlinkSync(
                outside!,
                join(root, ".dev.vars"),
                process.platform === "win32" ? "junction" : "dir",
              );
            } else {
              writeFileSync(join(root, ".dev.vars"), content);
            }
            replacementIdentity = lstatSync(join(root, ".dev.vars"));
          }
          if (fault !== "parent") {
            throw Object.assign(new Error("Injected post-commit read failure"), { code: "EACCES" });
          }
        }
        return lstat(...args);
      });
      let error: unknown;
      try {
        await stageWorkerBindingFiles(root, entries);
      } catch (failure) {
        error = failure;
      } finally {
        readHook.mockRestore();
        commitHook.mockRestore();
      }
      const recovery = roots.find((path) => basename(path).startsWith(recoveryPrefix))!;
      expect(injected).toBe(true);
      expect(error).toMatchObject({ cleanupVerified: false, recoveryDirectory: recovery });
      expect(readFileSync(join(recovery, "0.original"), "utf8")).toBe(original);
      expect(readFileSync(join(recovery, "1.original"), "utf8")).toBe(original);
      expect(JSON.parse(readFileSync(join(recovery, "bindings.json"), "utf8"))).toEqual({
        version: 1,
        root,
        paths: entries.map((entry) => entry.path),
      });
      expect(readFileSync(join(root, "apps/web/.dev.vars"), "utf8")).toBe(content);
      if (fault === "parent") {
        expect(lstatSync(join(root, "apps/web")).ino).toBe(replacementIdentity!.ino);
        expect(readFileSync(join(root, "apps/former-web/.dev.vars"), "utf8")).toBe(content);
        expect(readdirSync(root).sort()).toEqual([".dev.vars", "apps"]);
      } else {
        const marker = readdirSync(root).find((name) =>
          name.startsWith(".dev.vars.ghostinit-process-recovery-fixture-"),
        );
        expect(marker).toBeDefined();
        expect(JSON.parse(readFileSync(join(root, marker!, "recovery.json"), "utf8"))).toEqual({
          version: 1,
          originals: recovery,
        });
        expect(existsSync(join(root, lockName))).toBe(false);
      }
      if (fault === "link") {
        expect(lstatSync(join(root, ".dev.vars")).isSymbolicLink()).toBe(true);
        expect(mirrors(outside!)).toEqual([original, original]);
      } else {
        expect(mirrors(root)).toEqual([content, content]);
      }
      if (fault === "replacement" || fault === "link") {
        expect(lstatSync(join(root, ".dev.vars")).ino).toBe(replacementIdentity!.ino);
        expect(readFileSync(join(root, "former-fixture"), "utf8")).toBe(content);
      }
    });
  }

  test("preserves a replacement recovery inode after exact canonical restoration", async () => {
    const { root, entries } = fixture();
    const staged = await stageWorkerBindingFiles(root, entries);
    const recovery = roots.find((path) => basename(path).startsWith(recoveryPrefix))!;
    const path = join(recovery, "0.original");
    renameSync(path, join(recovery, "former-original"));
    writeFileSync(path, original);
    const replacement = lstatSync(path);
    await expect(staged.restore(true)).rejects.toMatchObject({
      cleanupVerified: false,
      recoveryDirectory: recovery,
    });
    expect(lstatSync(path).ino).toBe(replacement.ino);
    expect(readFileSync(path, "utf8")).toBe(original);
    expect(readFileSync(join(recovery, "former-original"), "utf8")).toBe(original);
    expect(mirrors(root)).toEqual([original, original]);
  });

  test("retains recovery snapshots and preserves a file racing restoration", async () => {
    const { root, entries } = fixture();
    const staged = await stageWorkerBindingFiles(root, entries);
    const write = FsTransaction.prototype.writeIfUnchanged;
    const hook = spyOn(FsTransaction.prototype, "writeIfUnchanged").mockImplementation(
      async function (this: FsTransaction, path: string, value: string, expected: string | null) {
        if (
          (this as unknown as { root: string }).root === root &&
          path === ".dev.vars" &&
          expected === null
        ) {
          writeFileSync(join(root, path), "PEER=racing\n", { flag: "wx" });
        }
        return write.call(this, path, value, expected);
      },
    );
    try {
      await expect(staged.restore(true)).rejects.toMatchObject({ cleanupVerified: false });
    } finally {
      hook.mockRestore();
    }
    expect(readFileSync(join(root, ".dev.vars"), "utf8")).toBe("PEER=racing\n");
    const recoveryName = readdirSync(root).find((name) =>
      name.startsWith(".dev.vars.ghostinit-process-recovery-fixture-"),
    );
    expect(recoveryName).toBeDefined();
    const recovery = join(root, recoveryName!);
    expect(readFileSync(join(recovery, "0.original"), "utf8")).toBe(original);
    expect(readFileSync(join(recovery, "1.original"), "utf8")).toBe(original);
    expect(readFileSync(join(recovery, "0.fixture"), "utf8")).toBe(content);
    expect(readFileSync(join(recovery, "1.fixture"), "utf8")).toBe(content);
    expect(existsSync(join(root, lockName))).toBe(false);
  });

  test("retains an identical-byte replacement racing the capture rename", async () => {
    const { root, entries } = fixture();
    const staged = await stageWorkerBindingFiles(root, entries);
    const source = join(root, ".dev.vars");
    const rename = filesystem.rename;
    let replacementIdentity: ReturnType<typeof lstatSync> | undefined;
    const hook = spyOn(filesystem, "rename").mockImplementation(async (from, to) => {
      if (String(from) === source && String(to).endsWith("0.fixture")) {
        renameSync(source, join(root, "former-fixture"));
        writeFileSync(source, content);
        replacementIdentity = lstatSync(source);
      }
      return rename(from, to);
    });
    try {
      await expect(staged.restore(true)).rejects.toMatchObject({ cleanupVerified: false });
    } finally {
      hook.mockRestore();
    }
    expect(replacementIdentity).toBeDefined();
    const recoveryName = readdirSync(root).find((name) =>
      name.startsWith(".dev.vars.ghostinit-process-recovery-fixture-"),
    );
    expect(recoveryName).toBeDefined();
    const captured = join(root, recoveryName!, "0.fixture");
    expect(lstatSync(captured).ino).toBe(replacementIdentity!.ino);
    expect(readFileSync(captured, "utf8")).toBe(content);
    expect(readFileSync(join(root, "former-fixture"), "utf8")).toBe(content);
    expect(readFileSync(join(root, "apps/web/.dev.vars"), "utf8")).toBe(content);
    expect(existsSync(source)).toBe(false);
  });
});
