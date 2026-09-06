import { describe, expect, test } from "bun:test";
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { runInNewContext } from "node:vm";
import { OPENNEXT_AWS_WINDOWS_PATCH_CONTENT } from "../../src/templates/root/cloudflare.js";

function addedPatchCode(): string {
  return OPENNEXT_AWS_WINDOWS_PATCH_CONTENT.split("\n")
    .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
    .map((line) => line.slice(1))
    .join("\n");
}

function addedLinkCode(): string {
  const hunk = OPENNEXT_AWS_WINDOWS_PATCH_CONTENT.split("\n@@").find((value) =>
    value.includes("if (symlink)"),
  );
  if (!hunk) throw new Error("The reviewed OpenNext link-copy patch is missing");
  return hunk
    .split("\n")
    .filter((line) => line.startsWith("+"))
    .map((line) => line.slice(1))
    .join("\n");
}

describe("OpenNext traced-copy source preservation", () => {
  test("the patch adds only a read and a destination link write", () => {
    const added = addedPatchCode();
    const filesystemCalls = [...added.matchAll(/\b([A-Za-z]+Sync)\s*\(/g)].map((match) => match[1]);
    expect(filesystemCalls).toEqual(["statSync", "symlinkSync"]);
    expect(added).not.toMatch(
      /\b(?:unlink|rename|rm|rmdir|writeFile|copyFile|cp|truncate|chmod|chown|link)(?:Sync)?\s*\(/,
    );
    expect(added).toContain("symlinkSync(destinationTarget, to, type)");
  });

  for (const platform of ["win32", "linux", "darwin"] as const) {
    for (const directory of [true, false]) {
      test(`${platform} ${directory ? "directory" : "file"} links write only the destination`, () => {
        const paths = platform === "win32" ? path.win32 : path.posix;
        const root = platform === "win32" ? "C:\\fixture" : "/fixture";
        const from = paths.join(root, "source", "dependency");
        const to = paths.join(root, "output", "dependency");
        const symlink = "../store/dependency";
        const writes: unknown[][] = [];
        const reads: string[] = [];
        runInNewContext(addedLinkCode(), {
          path: paths,
          process: { platform },
          from,
          to,
          symlink,
          statSync: (target: string) => {
            reads.push(target);
            return { isDirectory: () => directory };
          },
          symlinkSync: (...args: unknown[]) => writes.push(args),
        });
        expect(reads).toEqual(
          platform === "win32" ? [paths.resolve(paths.dirname(from), symlink)] : [],
        );
        expect(writes).toEqual([
          [
            platform === "win32" && directory ? paths.resolve(paths.dirname(to), symlink) : symlink,
            to,
            platform === "win32" && directory ? "junction" : undefined,
          ],
        ]);
      });
    }
  }

  test("copying a real directory link preserves the source link and target bytes", () => {
    const root = mkdtempSync(path.join(tmpdir(), "ghostinit-opennext-source-"));
    try {
      const store = path.join(root, "store");
      const source = path.join(root, "source");
      const output = path.join(root, "output");
      for (const directory of [store, source, output]) mkdirSync(directory);
      const payload = path.join(store, "index.js");
      writeFileSync(payload, "export const preserved = true;\n");
      const from = path.join(source, "dependency");
      const to = path.join(output, "dependency");
      symlinkSync(
        process.platform === "win32" ? store : "../store",
        from,
        process.platform === "win32" ? "junction" : "dir",
      );
      const snapshot = () => ({
        link: readlinkSync(from),
        inode: lstatSync(from).ino,
        modified: lstatSync(from).mtimeMs,
        target: realpathSync(from),
        payload: readFileSync(payload, "utf8"),
      });
      const before = snapshot();
      runInNewContext(addedLinkCode(), {
        path,
        process: { platform: process.platform },
        from,
        to,
        symlink: readlinkSync(from),
        statSync,
        symlinkSync,
      });
      expect(snapshot()).toEqual(before);
      expect(lstatSync(to).isSymbolicLink()).toBe(true);
      expect(realpathSync(to)).toBe(realpathSync(store));
      expect(readFileSync(path.join(to, "index.js"), "utf8")).toBe(before.payload);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
