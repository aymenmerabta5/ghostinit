import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "bun:test";
import { portableBundleSource } from "../../scripts/build.js";
import { removeUnicodeTestDirectory, UNICODE_SAMPLE } from "../helpers/cli-unicode.js";

test("portable Bun-built source preserves BMP, astral and combining literals on both runtimes", async () => {
  const root = mkdtempSync(join(tmpdir(), "ghostinit-unicode-bundle-"));
  try {
    const entrypoint = join(root, "entry.ts");
    writeFileSync(
      entrypoint,
      `#!/usr/bin/env bun\nconsole.log(JSON.stringify(${JSON.stringify(UNICODE_SAMPLE)}));\n`,
    );
    const output = await Bun.build({
      entrypoints: [entrypoint],
      outdir: join(root, "out"),
      target: "node",
      minify: false,
      sourcemap: "external",
    });
    expect(output.success).toBe(true);
    const bundle = join(root, "out/entry.js");
    const bundledSource = readFileSync(bundle, "utf8");
    const portableSource = portableBundleSource(bundledSource);
    expect(Buffer.byteLength(portableSource)).toBe(Buffer.byteLength(bundledSource));
    expect(portableSource.split("\n")).toHaveLength(bundledSource.split("\n").length);
    expect([...portableSource].filter((character) => character.codePointAt(0)! > 127)).toEqual(
      [...bundledSource].filter((character) => character.codePointAt(0)! > 127),
    );
    writeFileSync(bundle, portableSource);
    for (const executable of [process.execPath, "node"]) {
      const result = spawnSync(executable, [bundle], {
        cwd: root,
        encoding: "utf8",
        windowsHide: true,
        timeout: 10_000,
      });
      expect(result.error).toBeUndefined();
      expect(result.status, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toBe(UNICODE_SAMPLE);
    }
  } finally {
    removeUnicodeTestDirectory(root);
  }
});
