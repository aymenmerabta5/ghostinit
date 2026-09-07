import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanPublicAssetsForCanary } from "../integration/e2e-build-process.js";

describe("public build artifact secret canary", () => {
  let root = "";

  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  test("reports missing roots and every nested client artifact containing the canary", () => {
    root = mkdtempSync(join(tmpdir(), "ghostinit-canary-"));
    const publicRoot = join(root, "apps", "web", ".next", "static");
    const nestedRoot = join(publicRoot, "chunks");
    mkdirSync(nestedRoot, { recursive: true });
    writeFileSync(join(publicRoot, "safe.js"), "export const publicValue = true;");
    writeFileSync(join(nestedRoot, "leaked.js"), "server-secret-canary");

    const result = scanPublicAssetsForCanary(
      root,
      ["apps/web/.next/static", "apps/mobile/dist"],
      "server-secret-canary",
    );

    expect(result.presentRoots).toEqual(["apps/web/.next/static"]);
    expect(result.missingRoots).toEqual(["apps/mobile/dist"]);
    expect(result.leakedFiles).toEqual([join(nestedRoot, "leaked.js")]);
  });

  test("rejects an empty canary instead of treating every file as a leak", () => {
    root = mkdtempSync(join(tmpdir(), "ghostinit-canary-"));
    expect(() => scanPublicAssetsForCanary(root, [], "")).toThrow(
      "A non-empty secret canary is required",
    );
  });

  test("fails closed on symbolic links instead of skipping unscanned public content", () => {
    root = mkdtempSync(join(tmpdir(), "ghostinit-canary-"));
    const publicRoot = join(root, "public");
    const outside = join(root, "outside");
    mkdirSync(publicRoot);
    mkdirSync(outside);
    writeFileSync(join(outside, "leaked.js"), "server-secret-canary");
    symlinkSync(
      outside,
      join(publicRoot, "linked"),
      process.platform === "win32" ? "junction" : "dir",
    );

    expect(() => scanPublicAssetsForCanary(root, ["public"], "server-secret-canary")).toThrow(
      "unscannable symbolic link",
    );
  });

  test("fails closed on special filesystem entries", async () => {
    if (process.platform === "win32") return;
    root = mkdtempSync(join(tmpdir(), "ghostinit-canary-"));
    const publicRoot = join(root, "public");
    const socketPath = join(publicRoot, "artifact.sock");
    mkdirSync(publicRoot);
    const server = createServer();
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(socketPath, resolve);
    });
    try {
      expect(() => scanPublicAssetsForCanary(root, ["public"], "server-secret-canary")).toThrow(
        "unsupported special entry",
      );
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
});
