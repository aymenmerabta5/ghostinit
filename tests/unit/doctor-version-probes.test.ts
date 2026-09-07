import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runtime } from "../../packages/versions/src/index.js";
import {
  collectToolVersions,
  readInstalledTypeScriptVersion,
  runCommand,
  type ToolVersion,
} from "../../src/commands/doctor/versions.js";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map(async (root) => await rm(root, { recursive: true, force: true })),
  );
});

describe("doctor version probes", () => {
  test("returns a failed probe when an executable cannot be spawned", async () => {
    const missing = join(tmpdir(), `ghostinit-missing-command-${crypto.randomUUID()}`);
    await expect(runCommand(missing, ["--version"])).resolves.toEqual({ ok: false, version: "" });
  });

  test("reads installed TypeScript metadata without executing project code", async () => {
    const root = join(tmpdir(), `ghostinit-doctor-typescript-${crypto.randomUUID()}`);
    temporaryRoots.push(root);
    const manifestDirectory = join(root, "node_modules", "typescript");
    await mkdir(manifestDirectory, { recursive: true });
    await writeFile(join(manifestDirectory, "package.json"), JSON.stringify({ version: "7.0.2" }));
    expect(await readInstalledTypeScriptVersion(root)).toEqual({ ok: true, version: "7.0.2" });
    await writeFile(join(manifestDirectory, "package.json"), "not json");
    expect(await readInstalledTypeScriptVersion(root)).toEqual({ ok: false, version: "" });
  });

  test("uses canonical executable paths and never invokes bunx or a local tsc binary", async () => {
    const calls: Array<{ command: string; args: string[] }> = [];
    const run = async (command: string, args: string[]): Promise<ToolVersion> => {
      calls.push({ command, args });
      return { ok: true, version: command === "C:/tools/bun.exe" ? runtime.bun : "v24.19.0" };
    };
    const result = await collectToolVersions("C:/workspace", {
      findBun: () => "C:/tools/bun.exe",
      findNode: () => "C:/tools/node.exe",
      readTypeScriptVersion: async (cwd) => ({ ok: true, version: `${cwd}:7.0.2` }),
      run,
    });

    expect(calls).toEqual([
      { command: "C:/tools/bun.exe", args: ["--version"] },
      { command: "C:/tools/node.exe", args: ["--version"] },
    ]);
    expect(result).toEqual({
      bun: { ok: true, version: runtime.bun },
      node: { ok: true, version: "v24.19.0" },
      tsc: { ok: true, version: "C:/workspace:7.0.2" },
    });
    expect(calls.some(({ command }) => command === "bunx" || command.endsWith("/tsc"))).toBe(false);
  });
});
