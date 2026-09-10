// @allow-long 380: Emitted integrity, runtime, path, and real linter controls share one isolated fixture boundary.
import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, realpathSync, symlinkSync } from "node:fs";
import { rm, rmdir } from "node:fs/promises";
import { createRequire, isBuiltin } from "node:module";
import { tmpdir } from "node:os";
import { basename, delimiter, dirname, join, resolve } from "node:path";
import { format } from "oxfmt";
import { runtime } from "../../packages/versions/src/index.js";
import { resolveCreateConfig } from "../../src/commands/create/resolution.js";
import { DEPENDENCY_SECURITY_RUNTIME } from "../../src/generation/embedded-dependency-security-runtime.js";
import { FsTransaction } from "../../src/lib/fs.js";
import {
  buildInstallEnv,
  resolveCanonicalBunExecutable,
} from "../../src/lib/process-supervisor.js";
import { buildProjectGenerationPlan } from "../../src/templates/default.js";
import { oxlintConfig, oxfmtConfig } from "../../src/templates/root/config.js";
import { integrateDependencyAuditManifest } from "../../src/templates/tooling/dependency-audit.js";
import { dependencySecurityFiles } from "../../src/templates/tooling/dependency-security.js";
import {
  DEPENDENCY_SECURITY_INTEGRITY_PATH,
  DEPENDENCY_SECURITY_RUNTIME_PATH,
  dependencySecurityIntegrityContent,
} from "../../src/templates/tooling/dependency-security-integrity.js";
import { createTemporaryWorkspace } from "../helpers/temporary-workspace.js";

const fixturePrefix = "ghostinit-security-integrity-";
const roots: string[] = [];
const repository = resolve(import.meta.dir, "../..");
const requirePackage = createRequire(import.meta.url);
const oxlint = join(dirname(requirePackage.resolve("oxlint/package.json")), "bin/oxlint");
const canonicalIgnore = "/scripts/lib/dependency-security.cjs";
const tamperCanary = "UNVERIFIED_RUNTIME_EXECUTED";
const helperProbe = [
  `const integrity = require("./${DEPENDENCY_SECURITY_INTEGRITY_PATH}");`,
  "integrity.verifyDependencySecurityRuntime();",
  "process.stdout.write(typeof integrity.loadDependencySecurityRuntime().runDependencySecurity);",
].join("\n");
const lintFailure = 'const unusedIntegrityControl = "authored code must remain linted";\n';

afterEach(async () => {
  for (const root of roots.splice(0)) {
    if (
      dirname(root) !== realpathSync.native(tmpdir()) ||
      !basename(root).startsWith(fixturePrefix)
    )
      throw new Error("Refusing unsafe integrity fixture cleanup");
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

async function write(root: string, files: Readonly<Record<string, string>>): Promise<void> {
  const transaction = new FsTransaction(root);
  for (const [path, content] of Object.entries(files)) await transaction.write(path, content);
  expect(transaction.getStagedFiles()).toHaveLength(Object.keys(files).length);
  await transaction.commit();
}

async function fixture(extra: Readonly<Record<string, string>> = {}): Promise<string> {
  const root = createTemporaryWorkspace(fixturePrefix);
  roots.push(root);
  await write(root, {
    "package.json": JSON.stringify({ name: "integrity-fixture", type: "module" }),
    ...Object.fromEntries(
      dependencySecurityFiles(false).map(({ path, content }) => [path, content]),
    ),
    "probe.cjs": helperProbe,
    ...extra,
  });
  return root;
}

function executable(name: "bun" | "node"): string {
  if (name === "bun") return resolveCanonicalBunExecutable(runtime.bun);
  const node = Bun.which("node");
  if (!node) throw new Error("Node is required for emitted integrity verification");
  return node;
}

function command(root: string, binary: string, args: readonly string[]) {
  const environment = buildInstallEnv(root);
  const pathKey = Object.keys(environment).find((key) => key.toLowerCase() === "path");
  const inheritedPath = pathKey ? environment[pathKey] : "";
  if (pathKey) delete environment[pathKey];
  environment.PATH = [
    dirname(executable("bun")),
    join(repository, "node_modules/.bin"),
    inheritedPath ?? "",
  ].join(delimiter);
  const result = spawnSync(binary, [...args], {
    cwd: root,
    env: environment,
    encoding: "utf8",
    timeout: 15_000,
    windowsHide: true,
  });
  expect(result.error, String(result.error)).toBeUndefined();
  return { code: result.status, output: `${result.stdout ?? ""}${result.stderr ?? ""}` };
}

function checkIntegrity(root: string, accepted: boolean): void {
  for (const name of ["node", "bun"] as const) {
    for (const script of [DEPENDENCY_SECURITY_INTEGRITY_PATH, "probe.cjs"]) {
      const result = command(root, executable(name), [script]);
      expect(result.code, `${name}/${script}: ${result.output}`).toBe(accepted ? 0 : 1);
      expect(result.output).not.toContain(tamperCanary);
      if (accepted && script === "probe.cjs") expect(result.output).toBe("function");
    }
  }
}

async function lintFixture(): Promise<string> {
  const manifest = integrateDependencyAuditManifest(
    {
      path: "package.json",
      content: JSON.stringify({
        name: "integrity-lint-fixture",
        type: "module",
        scripts: {
          lint: "oxlint --deny-warnings .",
          "lint:oxlint": "oxlint --deny-warnings .",
          "lint:all": "bun run lint",
        },
      }),
    },
    false,
  );
  return fixture({
    [manifest.path]: manifest.content,
    [oxlintConfig().path]: oxlintConfig().content,
    [oxfmtConfig().path]: oxfmtConfig().content,
    "src/control.ts": "export const authoredControl = 1;\n",
  });
}

describe("emitted dependency security integrity boundary", () => {
  test("only builtins are needed by the helper", () => {
    const imports = new Bun.Transpiler({ loader: "js", target: "node" }).scanImports(
      dependencySecurityIntegrityContent(),
    );
    expect(imports.length).toBeGreaterThan(0);
    expect(imports.every(({ path }) => isBuiltin(path))).toBe(true);
  });

  test("Node and Bun validate and load the real bundle in an ESM project without dependencies", async () => {
    const root = await fixture();
    checkIntegrity(root, true);
    expect(existsSync(join(root, "node_modules"))).toBe(false);
  });

  test("verification is anchored to the helper location, independently of the working directory", async () => {
    const root = await fixture();
    const unrelated = await fixture({ [DEPENDENCY_SECURITY_RUNTIME_PATH]: "invalid bundle\n" });
    for (const name of ["node", "bun"] as const) {
      const result = command(unrelated, executable(name), [join(root, "probe.cjs")]);
      expect(result.code, result.output).toBe(0);
      expect(result.output).toBe("function");
    }
  });

  test("loading executes verified bytes instead of an existing CommonJS cache entry", async () => {
    const root = await fixture({
      "cache-probe.cjs": [
        `const integrity = require("./${DEPENDENCY_SECURITY_INTEGRITY_PATH}");`,
        `const filename = require.resolve("./${DEPENDENCY_SECURITY_RUNTIME_PATH}");`,
        'require.cache[filename] = { exports: { runDependencySecurity: "unverified cache entry" } };',
        "process.stdout.write(typeof integrity.loadDependencySecurityRuntime().runDependencySecurity);",
      ].join("\n"),
    });
    for (const name of ["node", "bun"] as const) {
      const result = command(root, executable(name), ["cache-probe.cjs"]);
      expect(result.code, result.output).toBe(0);
      expect(result.output).toBe("function");
    }
  });

  test("modified bytes fail before executing a tamper canary through either public entrypoint", async () => {
    const root = await fixture({
      [DEPENDENCY_SECURITY_RUNTIME_PATH]: `process.stdout.write("${tamperCanary}");\n${DEPENDENCY_SECURITY_RUNTIME}`,
    });
    checkIntegrity(root, false);
    for (const name of ["node", "bun"] as const) {
      const result = command(root, executable(name), [
        "scripts/security-dependencies.cjs",
        "audit",
        "--json",
      ]);
      expect(result.code, result.output).toBe(1);
      expect(result.output).not.toContain(tamperCanary);
      expect(JSON.parse(result.output)).toMatchObject({
        status: "failed",
        applied: false,
        installedVerified: false,
      });
    }
  });

  test("same-length edits are rejected by the content digest", async () => {
    const index = DEPENDENCY_SECURITY_RUNTIME.indexOf("\n");
    expect(index).toBeGreaterThan(0);
    const edited = `${DEPENDENCY_SECURITY_RUNTIME.slice(0, index)} ${DEPENDENCY_SECURITY_RUNTIME.slice(index + 1)}`;
    expect(Buffer.byteLength(edited)).toBe(Buffer.byteLength(DEPENDENCY_SECURITY_RUNTIME));
    checkIntegrity(await fixture({ [DEPENDENCY_SECURITY_RUNTIME_PATH]: edited }), false);
  });

  test("missing bundles and directories at the bundle path fail closed", async () => {
    const root = await fixture();
    const transaction = new FsTransaction(root);
    await transaction.delete(DEPENDENCY_SECURITY_RUNTIME_PATH);
    await transaction.commit();
    checkIntegrity(root, false);
    mkdirSync(join(root, DEPENDENCY_SECURITY_RUNTIME_PATH));
    checkIntegrity(root, false);
  });

  test("a bundle file symlink is rejected even when its target has the exact accepted bytes", async () => {
    const root = await fixture({ "alternate.cjs": DEPENDENCY_SECURITY_RUNTIME });
    const transaction = new FsTransaction(root);
    await transaction.delete(DEPENDENCY_SECURITY_RUNTIME_PATH);
    await transaction.commit();
    symlinkSync(join(root, "alternate.cjs"), join(root, DEPENDENCY_SECURITY_RUNTIME_PATH), "file");
    checkIntegrity(root, false);
  });

  test("a linked scripts/lib directory cannot relocate the trusted helper and bundle", async () => {
    const root = await fixture();
    await write(root, {
      "scripts/actual-lib/dependency-security.cjs": DEPENDENCY_SECURITY_RUNTIME,
      "scripts/actual-lib/dependency-security-integrity.cjs": dependencySecurityIntegrityContent(),
    });
    const transaction = new FsTransaction(root);
    await transaction.delete(DEPENDENCY_SECURITY_RUNTIME_PATH);
    await transaction.delete(DEPENDENCY_SECURITY_INTEGRITY_PATH);
    await transaction.commit();
    await rmdir(join(root, "scripts/lib"));
    symlinkSync(
      join(root, "scripts/actual-lib"),
      join(root, "scripts/lib"),
      process.platform === "win32" ? "junction" : "dir",
    );
    checkIntegrity(root, false);
  });

  test("the bundled runtime already has the generation formatter's stable bytes", async () => {
    const result = await format(DEPENDENCY_SECURITY_RUNTIME_PATH, DEPENDENCY_SECURITY_RUNTIME);
    expect(result.errors).toEqual([]);
    expect(result.code).toBe(DEPENDENCY_SECURITY_RUNTIME);
  });
});

describe("exact emitted dependency runtime lint exclusion", () => {
  test("the exact accepted bundle passes actual authored lint and the integrated lint command", async () => {
    const root = await lintFixture();
    checkIntegrity(root, true);
    const authored = command(root, executable("node"), [oxlint, "--deny-warnings", "."]);
    expect(authored.code, authored.output).toBe(0);
    for (const script of ["lint", "lint:oxlint", "lint:all"]) {
      const guarded = command(root, executable("bun"), ["run", script]);
      expect(guarded.code, guarded.output).toBe(0);
    }
  });

  for (const path of [
    "scripts/lib/dependency-security-copy.cjs",
    "scripts/lib/nested/dependency-security.cjs",
    "nested/scripts/lib/dependency-security.cjs",
    "scripts/lib/dependency-security-integrity.cjs",
    "scripts/security-dependencies.cjs",
    "src/dependency-security.cjs",
    "apps/web/src/dependency-security.cjs",
  ]) {
    test(`the actual linter still checks ${path}`, async () => {
      const root = await lintFixture();
      await write(root, { [path]: lintFailure });
      const result = command(root, executable("node"), [oxlint, "--deny-warnings", "."]);
      expect(result.code, result.output).toBe(1);
      expect(result.output.replaceAll("\\", "/")).toContain(path);
      expect(result.output).toContain("unusedIntegrityControl");
    });
  }

  test("tampering with the exact ignored bundle fails each generated lint entrypoint", async () => {
    const root = await lintFixture();
    await write(root, {
      [DEPENDENCY_SECURITY_RUNTIME_PATH]: `process.stdout.write("${tamperCanary}");\n`,
    });
    const authored = command(root, executable("node"), [oxlint, "--deny-warnings", "."]);
    expect(authored.code, authored.output).toBe(0);
    for (const script of ["lint", "lint:oxlint", "lint:all"]) {
      const guarded = command(root, executable("bun"), ["run", script]);
      expect(guarded.code, guarded.output).toBe(1);
      expect(guarded.output).not.toContain(tamperCanary);
    }
  });

  test("formatting authored files leaves the canonical runtime bytes unchanged", async () => {
    const root = await lintFixture();
    const oxfmt = join(dirname(requirePackage.resolve("oxfmt/package.json")), "bin/oxfmt");
    const before = readFileSync(join(root, DEPENDENCY_SECURITY_RUNTIME_PATH));
    const result = command(root, executable("node"), [oxfmt, "--write", "."]);
    expect(result.code, result.output).toBe(0);
    expect(readFileSync(join(root, DEPENDENCY_SECURITY_RUNTIME_PATH)).equals(before)).toBe(true);
    checkIntegrity(root, true);
  });

  for (const [mode, framework, app] of [
    ["monorepo", "nextjs", "web"],
    ["monorepo", "tanstack-start", "web"],
    ["single", "nextjs", "web"],
    ["single", "tanstack-start", "web"],
    ["single", "nextjs", "mobile"],
    ["single", "nextjs", "desktop"],
  ] as const) {
    for (const executionRuntime of ["bun", "node"] as const) {
      test(`${mode}/${framework}/${app}/${executionRuntime} emits self-contained configs and guarded lint`, () => {
        const resolution = resolveCreateConfig({
          name: "integrity-config",
          mode,
          framework,
          runtime: executionRuntime,
          apps: [app],
          database: "none",
          databaseWasExplicit: true,
          preset: "frontend",
          billing: [],
          features: [],
          cache: "none",
          deploy: "none",
          withAuth: false,
          withApi: false,
        });
        if (!resolution.ok) throw new Error(resolution.message);
        const plan = buildProjectGenerationPlan(resolution.resolvedConfig);
        const files = new Map(
          plan.files.map(({ physicalPath, content }) => [physicalPath, content]),
        );
        for (const path of [".oxlintrc.json", ".oxfmtrc.json"]) {
          const config = JSON.parse(files.get(path) ?? "null") as {
            extends?: unknown;
            ignorePatterns: string[];
          };
          expect(config, path).not.toBeNull();
          expect(config.extends, path).toBeUndefined();
          expect(
            config.ignorePatterns.filter((pattern) => pattern.includes("dependency-security")),
          ).toEqual([canonicalIgnore]);
        }
        expect(files.get(DEPENDENCY_SECURITY_RUNTIME_PATH)).toBe(DEPENDENCY_SECURITY_RUNTIME);
        expect(files.get(DEPENDENCY_SECURITY_INTEGRITY_PATH)).toBe(
          dependencySecurityIntegrityContent(),
        );
        const manifest = JSON.parse(files.get("package.json") ?? "{}");
        expect(manifest.scripts.lint).toStartWith(`bun ${DEPENDENCY_SECURITY_INTEGRITY_PATH} && `);
        expect(manifest.scripts.lint).toContain("oxlint --deny-warnings .");
        if (manifest.scripts["lint:oxlint"] !== undefined)
          expect(manifest.scripts["lint:oxlint"]).toStartWith(
            `bun ${DEPENDENCY_SECURITY_INTEGRITY_PATH} && `,
          );
        expect(manifest.scripts["lint:all"]).toStartWith("bun run lint &&");
      });
    }
  }
});
