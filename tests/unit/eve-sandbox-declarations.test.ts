import { afterEach, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { readFileSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { typescript } from "../../packages/versions/src/index.js";
import { FsTransaction } from "../../src/lib/fs.js";
import { eveSandboxFile } from "../../src/templates/eve/agent/core.js";
import { eveTsconfig } from "../../src/templates/eve/config.js";
import { createTemporaryWorkspace } from "../helpers/temporary-workspace.js";

const repository = resolve(import.meta.dir, "../..");
const require = createRequire(import.meta.url);
// An explicit local probe can select another installed copy of the catalog compiler.
// Normal host CI uses its own installed compiler; neither path installs anything.
const compiler = process.env.GHOSTINIT_EVE_DECLARATION_COMPILER
  ? resolve(process.env.GHOSTINIT_EVE_DECLARATION_COMPILER)
  : join(dirname(require.resolve("typescript/package.json")), "bin/tsc");
const compilerVersion = JSON.parse(
  readFileSync(join(dirname(compiler), "../package.json"), "utf8"),
) as { version: string };
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    if (!root.startsWith(realpathSync.native(tmpdir()) + sep))
      throw new Error("Unsafe test cleanup");
    rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
});

function typecheck(root: string, options: string[]) {
  const result = spawnSync(
    process.execPath,
    [compiler, "-p", "tsconfig.json", "--pretty", "false", ...options],
    {
      cwd: root,
      encoding: "utf8",
      windowsHide: true,
      timeout: 60_000,
    },
  );
  return { ...result, diagnostic: `${result.stdout ?? ""}${result.stderr ?? ""}` };
}

test(`Eve sandbox exports portable checked declarations with TypeScript ${compilerVersion.version}`, async () => {
  expect(compilerVersion.version).toBe(typescript.typescript);
  const root = createTemporaryWorkspace("ghostinit-eve-declarations-");
  roots.push(root);
  const source = eveSandboxFile().content;
  const tx = new FsTransaction(root);
  await tx.write("package.json", '{"private":true,"type":"module"}\n');
  await tx.write("agent/sandbox.ts", source);
  await tx.write("tsconfig.json", eveTsconfig().content);
  await tx.commit();
  symlinkSync(join(repository, "node_modules"), join(root, "node_modules"), "junction");

  // This is the generated Eve application's actual declaration-enabled noEmit gate.
  const noEmit = typecheck(root, ["--noEmit"]);
  expect(noEmit.error).toBeUndefined();
  expect(noEmit.status, noEmit.diagnostic).toBe(0);
  // Composite declaration emission additionally proves the exported type is portable.
  const configuration = JSON.parse(eveTsconfig().content);
  configuration.compilerOptions.composite = true;
  const composite = new FsTransaction(root);
  await composite.write("tsconfig.json", `${JSON.stringify(configuration, null, 2)}\n`);
  await composite.commit();
  const emitted = typecheck(root, ["--emitDeclarationOnly"]);
  expect(emitted.error).toBeUndefined();
  expect(emitted.status, emitted.diagnostic).toBe(0);
  const declaration = readFileSync(join(root, "dist/agent/sandbox.d.ts"), "utf8");
  expect(declaration).toContain('from "eve/sandbox"');
  expect(declaration).toContain('from "eve/sandbox/vercel"');
  expect(declaration).toContain("VercelSandboxBootstrapUseOptions");
  expect(declaration).toContain("VercelSandboxSessionUseOptions");
  expect(declaration).not.toMatch(/node_modules|\/compiled\/|NetworkPolicy|\bany\b/);

  // An annotation must not erase checking at either backend constructor boundary.
  expect(source).not.toMatch(/\bas\b|\bany\b/);
  expect(source).toContain("autoInstall: false");
  for (const [backend, invalidSource] of [
    ["just-bash", source.replace("autoInstall: false", 'autoInstall: "false"')],
    ["vercel", source.replace("vercel()", 'vercel({ resources: { vcpus: "two" } })')],
  ]) {
    const invalid = new FsTransaction(root);
    await invalid.write("agent/sandbox.ts", invalidSource!);
    await invalid.commit();
    const rejected = typecheck(root, ["--noEmit"]);
    expect(rejected.error, backend).toBeUndefined();
    expect(rejected.status, backend).not.toBe(0);
    expect(rejected.diagnostic, backend).toContain("TS2322");
  }
});
