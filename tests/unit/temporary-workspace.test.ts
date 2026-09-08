import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { FsTransaction } from "../../src/lib/fs.js";
import { createTemporaryWorkspace } from "../helpers/temporary-workspace.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    if (
      dirname(root) !== realpathSync.native(tmpdir()) ||
      !basename(root).startsWith("ghostinit-canonical-temp-")
    ) {
      throw new Error("Refusing unowned temporary-workspace cleanup");
    }
    rmSync(root, { recursive: true, force: true });
  }
});

function createRoot(): string {
  const root = createTemporaryWorkspace("ghostinit-canonical-temp-");
  roots.push(root);
  return root;
}

describe("canonical temporary workspaces", () => {
  test("Worker fixture cleanup accepts a canonical temp child while rejecting links and escaped roots", () => {
    const root = createRoot();
    const physical = join(root, "cleanup-parent");
    const alias = join(root, "cleanup-alias");
    mkdirSync(physical);
    symlinkSync(physical, alias, process.platform === "win32" ? "junction" : "dir");
    const fixturesUrl = pathToFileURL(
      resolve(import.meta.dir, "../helpers/cloudflare-runtime-fixture.ts"),
    ).href;
    const temporaryUrl = pathToFileURL(
      resolve(import.meta.dir, "../helpers/temporary-workspace.ts"),
    ).href;
    const source = `import { existsSync, lstatSync, mkdirSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { destroyFixture } from ${JSON.stringify(fixturesUrl)};
import { createTemporaryWorkspace } from ${JSON.stringify(temporaryUrl)};
const owned = createTemporaryWorkspace("ghostinit-cloudflare-cleanup-");
destroyFixture({ root: owned, script: "unused.mjs" });
const target = join(tmpdir(), "preserve-unrelated");
const link = join(tmpdir(), "ghostinit-cloudflare-link");
const nested = join(tmpdir(), "nested", "ghostinit-cloudflare-not-direct");
mkdirSync(target);
mkdirSync(nested, { recursive: true });
symlinkSync(target, link, process.platform === "win32" ? "junction" : "dir");
let rejected = 0;
for (const root of [link, nested, target]) {
  try { destroyFixture({ root, script: "unused.mjs" }); }
  catch { rejected += 1; }
}
console.log(JSON.stringify({ removed: !existsSync(owned), rejected,
  linkPreserved: lstatSync(link).isSymbolicLink(), targetPreserved: existsSync(target), nestedPreserved: existsSync(nested) }));
`;
    const result = Bun.spawnSync([process.execPath, "-e", source], {
      cwd: resolve(import.meta.dir, "../.."),
      env: { ...process.env, TEMP: alias, TMP: alias, TMPDIR: alias, NO_COLOR: "1" },
      stdout: "pipe",
      stderr: "pipe",
      timeout: 10_000,
    });
    expect(result.exitCode, result.stderr.toString()).toBe(0);
    expect(JSON.parse(result.stdout.toString())).toEqual({
      removed: true,
      rejected: 3,
      linkPreserved: true,
      targetPreserved: true,
      nestedPreserved: true,
    });
  });

  test("Worker binding callers handle a fixture created through a temp-directory alias", () => {
    const root = createRoot();
    const physical = join(root, "binding-parent");
    const alias = join(root, "binding-alias");
    mkdirSync(physical);
    symlinkSync(physical, alias, process.platform === "win32" ? "junction" : "dir");
    const result = Bun.spawnSync(
      [
        process.execPath,
        "test",
        resolve(import.meta.dir, "worker-fixture-bindings.test.ts"),
        "--test-name-pattern",
        "monorepo/nextjs stages declared audiences once and restores exact originals|generated preview receives the staged bindings even when inherited values conflict",
        "--timeout",
        "100000",
      ],
      {
        cwd: resolve(import.meta.dir, "../.."),
        env: { ...process.env, TEMP: alias, TMP: alias, TMPDIR: alias, NO_COLOR: "1" },
        stdout: "pipe",
        stderr: "pipe",
        timeout: 100_000,
      },
    );
    // Keep any private fixture diagnostics out of an assertion's rendered value.
    expect(result.exitCode).toBe(0);
    const output = result.stdout.toString() + result.stderr.toString();
    expect(/\b2 pass\b/.test(output)).toBe(true);
    expect(/\b0 fail\b/.test(output)).toBe(true);
  });

  test("creates the directory and resolves links in its parent before tool execution", () => {
    const root = createRoot();
    const physical = join(root, "physical");
    const alias = join(root, "alias");
    mkdirSync(physical);
    symlinkSync(physical, alias, process.platform === "win32" ? "junction" : "dir");
    const workspace = createTemporaryWorkspace("project-", alias);
    expect(workspace).toBe(realpathSync.native(workspace));
    expect(dirname(workspace)).toBe(physical);
  });

  test.skipIf(process.platform !== "win32")(
    "keeps real workspace imports consistent when TEMP has different filesystem casing",
    async () => {
      const root = createRoot();
      const physicalParent = join(root, "CaseParent");
      const aliasedParent = join(root, "caseparent");
      mkdirSync(physicalParent);
      const workspace = createTemporaryWorkspace("project-", aliasedParent);
      expect(dirname(workspace)).toBe(physicalParent);
      const transaction = new FsTransaction(workspace);
      await transaction.write("convex/api.ts", "export const marker = 1;\n");
      await transaction.write(
        "packages/auth/index.ts",
        'import { marker } from "../../convex/api"; export const value = marker;\n',
      );
      await transaction.write(
        "packages/auth/package.json",
        JSON.stringify({ name: "@repo/auth", types: "./index.ts" }),
      );
      await transaction.write(
        "apps/mobile/index.ts",
        'import { value } from "@repo/auth"; import { marker } from "../../convex/api"; export const result = value + marker;\n',
      );
      await transaction.write(
        "tsconfig.json",
        JSON.stringify({
          compilerOptions: {
            target: "ES2022",
            module: "ESNext",
            moduleResolution: "bundler",
            noEmit: true,
            strict: true,
            forceConsistentCasingInFileNames: true,
            types: [],
          },
          include: ["apps/mobile/index.ts"],
        }),
      );
      await transaction.commit();
      mkdirSync(join(workspace, "node_modules/@repo"), { recursive: true });
      symlinkSync(
        join(workspace, "packages/auth"),
        join(workspace, "node_modules/@repo/auth"),
        "junction",
      );
      const compiler = resolve(import.meta.dir, "../../node_modules/typescript/bin/tsc");
      const node = Bun.which("node");
      if (!node) throw new Error("Node is required for installed TypeScript acceptance");
      const runCompiler = (cwd: string) =>
        Bun.spawnSync([node, compiler, "--noEmit", "--pretty", "false"], {
          cwd,
          stdout: "pipe",
          stderr: "pipe",
          timeout: 30_000,
        });
      const aliased = runCompiler(join(aliasedParent, basename(workspace)));
      expect(aliased.exitCode).not.toBe(0);
      expect(aliased.stdout.toString()).toContain("TS1149");
      const canonical = runCompiler(workspace);
      expect(canonical.exitCode, canonical.stdout.toString() + canonical.stderr.toString()).toBe(0);
    },
  );
});
