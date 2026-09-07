import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "bun:test";
import { removeUnicodeTestDirectory, verifyCliUnicode } from "../helpers/cli-unicode.js";

const cli = resolve(import.meta.dir, "../../dist/cli.js");

test("built CLI preserves multilingual content and Unicode paths under Bun and Node", async () => {
  const root = mkdtempSync(join(tmpdir(), "ghostinit-unicode-cli-"));
  try {
    await verifyCliUnicode(process.execPath, cli, root, "bun");
    await verifyCliUnicode("node", cli, root, "node");
  } finally {
    removeUnicodeTestDirectory(root);
  }
}, 150_000);
