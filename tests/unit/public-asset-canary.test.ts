import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
});
