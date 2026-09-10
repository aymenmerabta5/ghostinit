import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FsTransaction } from "../../src/lib/fs.js";
import { analyzeProjectReport } from "../../src/lib/architecture/analyzer.js";
import { lintScriptFiles } from "../../src/templates/tooling/lint-scripts.js";
import { DEFAULT_MAX_SOURCE_FILE_BYTES } from "../../src/lib/architecture/analyzer-helpers.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
const CLIENT =
  '"use client"; import { api } from "../../../convex/_generated/api"; export const query = () => api;';
const PROXY = readFileSync(
  new URL("../fixtures/architecture/convex-api.generated.js", import.meta.url),
  "utf8",
);
async function fixture(api: string) {
  const root = mkdtempSync(join(tmpdir(), "ghostinit-convex-client-protocol-"));
  roots.push(root);
  const transaction = new FsTransaction(root);
  const entries = {
    "package.json": JSON.stringify({
      name: "protocol",
      dependencies: { convex: "1", "server-only": "1" },
    }),
    "src/features/messages/queries.ts": CLIENT,
    "convex/_generated/api.js": api,
    "src/server/secret.ts": 'import "server-only"; export const secret = {};',
  };
  for (const [path, source] of Object.entries(entries)) await transaction.write(path, source);
  for (const entry of lintScriptFiles().filter(({ path }) =>
    ["scripts/check-server-only.cjs", "scripts/lib/oxc.cjs"].includes(path),
  ))
    await transaction.write(entry.path, entry.content);
  await transaction.commit();
  return root;
}
async function generated(root: string, runtime: "bun" | "node") {
  const child = Bun.spawn(
    [runtime === "bun" ? process.execPath : "node", "scripts/check-server-only.cjs"],
    {
      cwd: root,
      env: { ...process.env, NODE_PATH: join(process.cwd(), "node_modules") },
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { code, output: stdout + stderr };
}

describe("generated Convex client protocol coverage", () => {
  test("retained Convex 1.45 codegen remains client-safe in host and emitted checkers", async () => {
    const root = await fixture(PROXY);
    const host = await analyzeProjectReport(root);
    expect(host.complete).toBe(true);
    expect(host.findings).toEqual([]);
    for (const runtime of ["bun", "node"] as const) {
      const result = await generated(root, runtime);
      expect(result.code, result.output).toBe(0);
    }
  });
  test.each([
    [
      'import { secret } from "../../src/server/secret"; export const api = secret;',
      "local server code",
    ],
    [
      'import { mutationGeneric } from "convex/server"; export const api = mutationGeneric;',
      "server exports",
    ],
    ['const api = import("convex/server"); export { api };', "dynamic server imports"],
  ])("rejects %s (%s) in the otherwise approved filename", async (source) => {
    const root = await fixture(source);
    expect(
      (await analyzeProjectReport(root)).findings.some(
        ({ id }) => id === "client-transitive-server-import",
      ),
    ).toBe(true);
    for (const runtime of ["bun", "node"] as const) {
      const result = await generated(root, runtime);
      expect(result.code, result.output).not.toBe(0);
      expect(result.output).toContain("Client-reachable server runtime");
    }
  });
  test("the protocol cannot escape byte limits or the canonical project through a symlink", async () => {
    const oversized = await fixture(
      PROXY + "\n/*" + "x".repeat(DEFAULT_MAX_SOURCE_FILE_BYTES) + "*/",
    );
    const report = await analyzeProjectReport(oversized);
    expect(report.complete).toBe(false);
    expect(report.findings.some(({ rule }) => rule === "source-coverage")).toBe(true);
    const bounded = await generated(oversized, "node");
    expect(bounded.code).not.toBe(0);
    expect(bounded.output).toContain("source byte limit");
    const outside = await fixture(PROXY);
    const linked = await fixture(PROXY);
    const target = join(linked, "convex", "_generated", "api.js");
    rmSync(target);
    symlinkSync(join(outside, "convex", "_generated", "api.js"), target, "file");
    expect(
      (await analyzeProjectReport(linked)).findings.some(({ id }) => id === "path-traversal-risk"),
    ).toBe(true);
    const escaped = await generated(linked, "node");
    expect(escaped.code).not.toBe(0);
    expect(escaped.output).toContain("escapes project root");
  });
});
