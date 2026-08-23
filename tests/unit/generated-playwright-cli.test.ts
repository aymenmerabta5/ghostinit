import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { FsTransaction } from "../../src/lib/fs.js";
import { resolveLocalPlaywrightInvocation } from "../helpers/generated-playwright-cli.js";

describe("generated Playwright CLI resolution", () => {
  test("selects the package-declared Node CLI without Bun forcing or shell quoting", async () => {
    const webRoot = mkdtempSync(join(tmpdir(), "ghostinit-playwright-cli-"));
    const transaction = new FsTransaction(webRoot);
    try {
      await transaction.write(
        "node_modules/@playwright/test/package.json",
        JSON.stringify({ name: "@playwright/test", bin: { playwright: "cli.js" } }),
      );
      await transaction.write("node_modules/@playwright/test/cli.js", "console.log('fixture');\n");
      expect(transaction.getStagedFiles()).toHaveLength(2);
      await transaction.commit();

      const invocation = resolveLocalPlaywrightInvocation(webRoot, ["install", "chromium"]);
      expect(invocation.command).toBe(Bun.which("node"));
      expect(invocation.args).toEqual([
        resolve(webRoot, "node_modules/@playwright/test/cli.js"),
        "install",
        "chromium",
      ]);
      expect(invocation.args).not.toContain("--bun");
      expect(invocation.args).not.toContain("--no-install");
      expect(invocation.args).not.toContain("playwright");
      expect(invocation).not.toHaveProperty("shell");
    } finally {
      rmSync(webRoot, { recursive: true, force: true });
    }
  });

  test("rejects a package manifest that does not declare the exact local CLI", async () => {
    const webRoot = mkdtempSync(join(tmpdir(), "ghostinit-playwright-cli-"));
    const transaction = new FsTransaction(webRoot);
    try {
      await transaction.write(
        "node_modules/@playwright/test/package.json",
        JSON.stringify({ name: "@playwright/test", bin: { playwright: "other.js" } }),
      );
      await transaction.write("node_modules/@playwright/test/other.js", "");
      await transaction.commit();

      expect(() => resolveLocalPlaywrightInvocation(webRoot, ["test"])).toThrow(
        '@playwright/test must declare bin.playwright === "cli.js"',
      );
    } finally {
      rmSync(webRoot, { recursive: true, force: true });
    }
  });
});
