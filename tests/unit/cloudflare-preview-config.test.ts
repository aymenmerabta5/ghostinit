// @allow-long 660: preview metadata and generated wrapper lifecycle share ownership fixtures
import { afterAll, afterEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { cloudflarePreviewConfigContent } from "../../src/templates/root/cloudflare-preview-config.js";
import { createTemporaryWorkspace } from "../helpers/temporary-workspace.js";
import {
  cloudflarePlan,
  createWorkerFixture,
  destroyFixture,
  runFixture,
  testEnvironment,
  withFailureDiagnostics,
  type RuntimeFixture,
} from "../helpers/cloudflare-runtime-fixture.js";

interface Metadata {
  recoveryDirectory: string;
  restore(cleanupVerified: boolean): void;
}
interface Inputs {
  workspaceRoot: string;
  appRoot: string;
  localEntries: readonly (readonly string[])[];
  assertOwned: () => void;
  retain: () => void;
}
const moduleRoot = createTemporaryWorkspace("ghostinit-preview-metadata-module-");
writeFileSync(join(moduleRoot, "helper.mjs"), cloudflarePreviewConfigContent());
const helper = (await import(pathToFileURL(join(moduleRoot, "helper.mjs")).href)) as {
  stagePreviewConfig(options: Inputs): Metadata;
  assertNoPreviewConfigRecovery(root: string): void;
};
if (typeof helper.stagePreviewConfig !== "function")
  throw new Error("Generated helper export is missing");
afterAll(() => rmSync(moduleRoot, { recursive: true, force: true }));
const roots: string[] = [];
const fixtures: RuntimeFixture[] = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0)) destroyFixture(fixture);
  for (const root of roots.splice(0)) {
    if (!root.includes("ghostinit-preview-metadata-")) throw new Error("Unexpected test root");
    rmSync(root, { recursive: true, force: true });
  }
});
function make(
  config: unknown = {
    name: "worker",
    vars: { EMPTY: "original" },
    secrets: { required: ["EMPTY"] },
    keep_vars: true,
  },
) {
  const root = createTemporaryWorkspace("ghostinit-preview-metadata-");
  roots.push(root);
  const app = join(root, "apps/web");
  const path = join(app, "dist/server/wrangler.json");
  mkdirSync(dirname(path), { recursive: true });
  const bytes = JSON.stringify(config, null, 2) + "\n";
  writeFileSync(path, bytes);
  const original = lstatSync(path);
  const state = { retained: false };
  const inputs: Inputs = {
    workspaceRoot: root,
    appRoot: app,
    localEntries: [
      ["EMPTY", ""],
      ["APP_SECRET", "synthetic-local-value-that-must-stay-off-disk"],
    ],
    assertOwned() {},
    retain() {
      state.retained = true;
    },
  };
  return { root, app, path, bytes, original, state, inputs };
}
function identity(path: string, original: ReturnType<typeof lstatSync>) {
  const actual = lstatSync(path);
  expect([actual.dev, actual.ino, actual.birthtimeMs]).toEqual([
    original.dev,
    original.ino,
    original.birthtimeMs,
  ]);
}
function preserved(f: ReturnType<typeof make>) {
  expect(readFileSync(f.path, "utf8")).toBe(f.bytes);
  identity(f.path, f.original);
}

describe("TanStack preview name-only metadata", () => {
  test("rejects linked output parents before staging", () => {
    const f = make();
    const directory = dirname(f.path);
    const target = directory + "-physical";
    renameSync(directory, target);
    symlinkSync(target, directory, process.platform === "win32" ? "junction" : "dir");
    expect(() => helper.stagePreviewConfig(f.inputs)).toThrow("unsafe parent");
    expect(readFileSync(join(target, "wrangler.json"), "utf8")).toBe(f.bytes);
    expect(f.state.retained).toBe(false);
  });
  test("rejects an application root outside its canonical workspace", () => {
    const f = make();
    const other = make();
    expect(() => helper.stagePreviewConfig({ ...f.inputs, appRoot: other.app })).toThrow(
      "within its workspace",
    );
    preserved(f);
    preserved(other);
    expect(f.state.retained).toBe(false);
  });
  test("preserves fields and empty values, excludes local values, and restores original bytes/inode", () => {
    const f = make();
    const metadata = helper.stagePreviewConfig(f.inputs);
    const config = JSON.parse(readFileSync(f.path, "utf8"));
    expect(config).toEqual({
      name: "worker",
      vars: { EMPTY: "original" },
      secrets: { required: ["APP_SECRET", "EMPTY"] },
      keep_vars: true,
    });
    expect(readFileSync(join(metadata.recoveryDirectory, "original.json"), "utf8")).toBe(f.bytes);
    for (const name of readdirSync(metadata.recoveryDirectory))
      expect(readFileSync(join(metadata.recoveryDirectory, name), "utf8")).not.toContain(
        f.inputs.localEntries[1]![1]!,
      );
    expect(() => helper.assertNoPreviewConfigRecovery(f.root)).toThrow(
      "Retained Worker preview configuration",
    );
    metadata.restore(true);
    metadata.restore(true);
    preserved(f);
    expect(existsSync(metadata.recoveryDirectory)).toBe(false);
    expect(f.state.retained).toBe(false);
  });
  for (const config of [
    null,
    [],
    { vars: [] },
    { vars: { PATH: "" } },
    { secrets: [] },
    { secrets: { required: "EMPTY" } },
    { secrets: { required: [42] } },
    { secrets: { required: ["PATH"] } },
    { secrets: { unexpected: true } },
  ]) {
    test("rejects malformed or ambient-admitting configuration " + JSON.stringify(config), () => {
      const f = make(config);
      expect(() => helper.stagePreviewConfig(f.inputs)).toThrow();
      preserved(f);
      expect(readdirSync(f.root)).toEqual(["apps"]);
      expect(f.state.retained).toBe(false);
    });
  }
  test("requires unique exact local names and string values", () => {
    for (const entries of [
      [
        ["EMPTY", ""],
        ["EMPTY", "again"],
      ],
      [
        ["EMPTY", ""],
        ["empty", "again"],
      ],
      [["BAD-NAME", "value"]],
      [["EMPTY", null]],
    ]) {
      const f = make();
      expect(() =>
        helper.stagePreviewConfig({ ...f.inputs, localEntries: entries as unknown as string[][] }),
      ).toThrow("unique declared");
      preserved(f);
    }
  });
  test("preserves admitted lowercase and underscore-leading names", () => {
    const f = make({});
    const m = helper.stagePreviewConfig({
      ...f.inputs,
      localEntries: [
        ["lowercase", "value"],
        ["_LOCAL", ""],
      ],
    });
    expect(JSON.parse(readFileSync(f.path, "utf8")).secrets.required).toEqual([
      "_LOCAL",
      "lowercase",
    ]);
    m.restore(true);
    preserved(f);
  });
  test("does not permit a pre-existing recovery directory", () => {
    const f = make();
    mkdirSync(join(f.root, ".dev.vars.ghostinit-process-recovery-preview-existing"));
    expect(() => helper.stagePreviewConfig(f.inputs)).toThrow("Retained");
    preserved(f);
  });
  test("rejects symlink configs before modifying their target", () => {
    const f = make();
    renameSync(f.path, f.path + ".target");
    symlinkSync(f.path + ".target", f.path, "file");
    expect(() => helper.stagePreviewConfig(f.inputs)).toThrow("regular file");
    expect(readFileSync(f.path + ".target", "utf8")).toBe(f.bytes);
  });
  test("retains original and metadata when child cleanup is unverified", () => {
    const f = make();
    const m = helper.stagePreviewConfig(f.inputs);
    expect(() => m.restore(false)).toThrow("recovery is retained");
    expect(f.state.retained).toBe(true);
    identity(join(m.recoveryDirectory, "original.json"), f.original);
    expect(JSON.parse(readFileSync(f.path, "utf8")).secrets.required).toContain("APP_SECRET");
  });
  test("preserves a replacement config with identical bytes", () => {
    const f = make();
    const m = helper.stagePreviewConfig(f.inputs);
    const staged = readFileSync(f.path);
    renameSync(f.path, f.path + ".staged");
    writeFileSync(f.path, staged);
    const replacement = lstatSync(f.path);
    expect(() => m.restore(true)).toThrow("retained");
    identity(f.path, replacement);
    identity(join(m.recoveryDirectory, "original.json"), f.original);
    expect(f.state.retained).toBe(true);
  });
  test("preserves a replaced parent directory and original recovery", () => {
    const f = make();
    const m = helper.stagePreviewConfig(f.inputs);
    const parent = dirname(f.path);
    renameSync(parent, parent + "-original");
    mkdirSync(parent);
    writeFileSync(f.path, "replacement");
    expect(() => m.restore(true)).toThrow("retained");
    expect(readFileSync(f.path, "utf8")).toBe("replacement");
    identity(join(m.recoveryDirectory, "original.json"), f.original);
  });
  test("detects identical-byte replacement of the retained original", () => {
    const f = make();
    const m = helper.stagePreviewConfig(f.inputs);
    const original = join(m.recoveryDirectory, "original.json");
    renameSync(original, original + ".saved");
    writeFileSync(original, f.bytes);
    expect(() => m.restore(true)).toThrow("retained");
    identity(original + ".saved", f.original);
    expect(f.state.retained).toBe(true);
  });
  test("detects recovery directory replacement", () => {
    const f = make();
    const m = helper.stagePreviewConfig(f.inputs);
    renameSync(m.recoveryDirectory, m.recoveryDirectory + "-saved");
    mkdirSync(m.recoveryDirectory);
    expect(() => m.restore(true)).toThrow("retained");
    identity(join(m.recoveryDirectory + "-saved", "original.json"), f.original);
  });
  test("preserves a racing path created after original capture", () => {
    const f = make();
    let raced = false;
    f.inputs.assertOwned = () => {
      const recovery = readdirSync(f.root).find((n) =>
        n.startsWith(".dev.vars.ghostinit-process-recovery-preview-"),
      );
      if (
        !raced &&
        recovery &&
        existsSync(join(f.root, recovery, "original.json")) &&
        !existsSync(f.path)
      ) {
        raced = true;
        writeFileSync(f.path, "racing-stage-owner");
      }
    };
    expect(() => helper.stagePreviewConfig(f.inputs)).toThrow("retained");
    expect(raced).toBe(true);
    expect(readFileSync(f.path, "utf8")).toBe("racing-stage-owner");
    expect(f.state.retained).toBe(true);
  });
  test("preserves a racing path created after staged inode quarantine", () => {
    // The callback closes over a mutable switch while the helper retains its own reference.
    const g = make();
    let restoring = false;
    let replacement = false;
    g.inputs.assertOwned = () => {
      const recovery = readdirSync(g.root).find((n) =>
        n.startsWith(".dev.vars.ghostinit-process-recovery-preview-"),
      );
      if (
        restoring &&
        !replacement &&
        recovery &&
        existsSync(join(g.root, recovery, "captured.json")) &&
        !existsSync(g.path)
      ) {
        replacement = true;
        writeFileSync(g.path, "racing-restore-owner");
      }
    };
    const n = helper.stagePreviewConfig(g.inputs);
    restoring = true;
    expect(() => n.restore(true)).toThrow("retained");
    expect(replacement).toBe(true);
    expect(readFileSync(g.path, "utf8")).toBe("racing-restore-owner");
    identity(join(n.recoveryDirectory, "original.json"), g.original);
  });
  test("preserves an unexpected dangling capture symlink", () => {
    const f = make();
    const m = helper.stagePreviewConfig(f.inputs);
    const path = join(m.recoveryDirectory, "captured.json");
    symlinkSync(join(f.root, "nonexistent"), path, "file");
    expect(() => m.restore(true)).toThrow("retained");
    expect(lstatSync(path).isSymbolicLink()).toBe(true);
    identity(join(m.recoveryDirectory, "original.json"), f.original);
  });
  test("retains original on ownership callback failure", () => {
    const f = make();
    let valid = true;
    f.inputs.assertOwned = () => {
      if (!valid) throw new Error("lost lifecycle lease");
    };
    const m = helper.stagePreviewConfig(f.inputs);
    valid = false;
    expect(() => m.restore(true)).toThrow("retained");
    identity(join(m.recoveryDirectory, "original.json"), f.original);
    expect(f.state.retained).toBe(true);
  });
  test("recovery cleanup failure retains a recoverable original", () => {
    const f = make();
    const m = helper.stagePreviewConfig(f.inputs);
    writeFileSync(join(m.recoveryDirectory, "unowned"), "do-not-delete");
    expect(() => m.restore(true)).toThrow("retained");
    preserved(f);
    expect(readFileSync(join(m.recoveryDirectory, "unowned"), "utf8")).toBe("do-not-delete");
    identity(join(m.recoveryDirectory, "original.json"), f.original);
  });
  test("staging rollback cleanup failure retains the original inode", () => {
    const f = make();
    let injected = false;
    let recovery = "";
    f.inputs.assertOwned = () => {
      const name = readdirSync(f.root).find((n) =>
        n.startsWith(".dev.vars.ghostinit-process-recovery-preview-"),
      );
      if (
        !injected &&
        name &&
        existsSync(join(f.root, name, "original.json")) &&
        !existsSync(f.path)
      ) {
        injected = true;
        recovery = join(f.root, name);
        writeFileSync(join(recovery, "unowned"), "preserve");
        throw new Error("synthetic pre-install failure");
      }
    };
    expect(() => helper.stagePreviewConfig(f.inputs)).toThrow("retained");
    expect(injected).toBe(true);
    preserved(f);
    identity(join(recovery, "original.json"), f.original);
    expect(readFileSync(join(recovery, "unowned"), "utf8")).toBe("preserve");
  });
  test("canonical replacement during recovery cleanup cannot discard the original", () => {
    const f = make();
    let restoring = false;
    let replaced = false;
    let recovery = "";
    f.inputs.assertOwned = () => {
      if (
        restoring &&
        !replaced &&
        existsSync(f.path) &&
        readFileSync(f.path, "utf8") === f.bytes &&
        recovery &&
        !existsSync(join(recovery, "preview.json"))
      ) {
        replaced = true;
        renameSync(f.path, f.path + ".original-retained");
        writeFileSync(f.path, "concurrent-owner");
      }
    };
    const m = helper.stagePreviewConfig(f.inputs);
    recovery = m.recoveryDirectory;
    restoring = true;
    expect(() => m.restore(true)).toThrow("retained");
    expect(replaced).toBe(true);
    expect(readFileSync(f.path, "utf8")).toBe("concurrent-owner");
    identity(join(m.recoveryDirectory, "original.json"), f.original);
  });
});

describe("generated preview wrapper metadata lifecycle", () => {
  for (const mode of ["single", "monorepo"] as const) {
    for (const direct of [false, true]) {
      test(`${mode} supports a ${direct ? "workspace" : "workspace-parent"} junction cwd`, () => {
        const fixture = withFailureDiagnostics(
          createWorkerFixture({
            framework: "tanstack-start",
            plan: cloudflarePlan({ framework: "tanstack-start", mode }),
            waitForPreviewIdentity: true,
          }),
        );
        fixtures.push(fixture);
        const aliasRoot = createTemporaryWorkspace("ghostinit-preview-metadata-alias-");
        roots.push(aliasRoot);
        const alias = join(aliasRoot, "alias");
        symlinkSync(
          direct ? fixture.root : dirname(fixture.root),
          alias,
          process.platform === "win32" ? "junction" : "dir",
        );
        const aliasedWorkspace = direct ? alias : join(alias, basename(fixture.root));
        const cwd = mode === "monorepo" ? join(aliasedWorkspace, "apps/web") : aliasedWorkspace;
        const result = runFixture({ ...fixture, cwd }, ["preview"]);
        expect(result.status, result.stdout + result.stderr).toBe(0);
        const app = fixture.cwd ?? fixture.root;
        if (process.platform === "win32") {
          expect(existsSync(join(app, ".preview-identity-ready"))).toBe(true);
        }
        expect(
          JSON.parse(readFileSync(join(app, "dist/server/wrangler.json"), "utf8")).secrets,
        ).toBeUndefined();
        expect(
          readdirSync(fixture.root).some((name) =>
            name.startsWith(".dev.vars.ghostinit-process-recovery-preview-"),
          ),
        ).toBe(false);
      }, 60000);
    }
  }
  test("identical-byte replacement of the lifecycle lock preserves ownership evidence", () => {
    const fixture = createWorkerFixture({ framework: "tanstack-start" });
    fixtures.push(fixture);
    const adapter = join(fixture.root, "node_modules/vite/index.mjs");
    writeFileSync(
      adapter,
      readFileSync(adapter, "utf8") +
        `
if (action === "preview") {
  const fs = await import("node:fs");
  const path = ".dev.vars.ghostinit-build-lock";
  const bytes = fs.readFileSync(path);
  fs.renameSync(path, ".original-worker-lock");
  fs.writeFileSync(path, bytes);
  const stat = fs.lstatSync(path);
  fs.writeFileSync(".replacement-lock-identity", JSON.stringify([stat.dev, stat.ino, stat.birthtimeMs]));
}
`,
    );
    const result = runFixture(fixture, ["preview"]);
    expect(result.status).not.toBe(0);
    const lock = join(fixture.root, ".dev.vars.ghostinit-build-lock");
    const stat = lstatSync(lock);
    expect([stat.dev, stat.ino, stat.birthtimeMs]).toEqual(
      JSON.parse(readFileSync(join(fixture.root, ".replacement-lock-identity"), "utf8")),
    );
    expect(existsSync(join(fixture.root, ".original-worker-lock"))).toBe(true);
    const recovery = readdirSync(fixture.root).find((name) =>
      name.startsWith(".dev.vars.ghostinit-process-recovery-preview-"),
    );
    expect(recovery).toBeDefined();
    expect(existsSync(join(fixture.root, recovery!, "original.json"))).toBe(true);
  }, 60000);
  for (const mode of ["single", "monorepo"] as const)
    test(
      mode + " restores metadata after ordinary adapter exit",
      () => {
        const fixture = createWorkerFixture({
          framework: "tanstack-start",
          plan: cloudflarePlan({ framework: "tanstack-start", mode }),
          devVars: 'SERVER_SECRET="local-fixture-secret"\nAPP_NAME=""\n',
          waitForPreviewIdentity: true,
        });
        fixtures.push(fixture);
        const adapter = join(fixture.root, "node_modules/vite/index.mjs");
        writeFileSync(
          adapter,
          readFileSync(adapter, "utf8") +
            `\nif (action === "preview") {
      const config = JSON.parse(readFileSync("dist/server/wrangler.json", "utf8"));
      const names = config.secrets?.required ?? [];
      const verdict = { metadataPresent: names.includes("SERVER_SECRET"), emptyPresent: names.includes("APP_NAME") && process.env.APP_NAME === "", localWins: process.env.SERVER_SECRET === "local-fixture-secret", ambientSelected: names.includes("TERM") };
      writeFileSync(".preview-binding-verdict.json", JSON.stringify(verdict));
      if (!verdict.metadataPresent || !verdict.emptyPresent || !verdict.localWins || verdict.ambientSelected) process.exit(29);
    }\n`,
        );
        const result = runFixture(fixture, ["preview"], {
          SERVER_SECRET: "conflicting-host-secret",
          TERM: "synthetic-host-terminal",
        });
        expect(result.status).toBe(0);
        const app = fixture.cwd ?? fixture.root;
        if (process.platform === "win32") {
          expect(existsSync(join(app, ".preview-identity-ready"))).toBe(true);
        }
        expect(
          JSON.parse(readFileSync(join(app, ".preview-binding-verdict.json"), "utf8")),
        ).toEqual({
          metadataPresent: true,
          emptyPresent: true,
          localWins: true,
          ambientSelected: false,
        });
        const config = JSON.parse(readFileSync(join(app, "dist/server/wrangler.json"), "utf8"));
        expect(config.secrets).toBeUndefined();
        expect(
          readdirSync(fixture.root).some((n) =>
            n.startsWith(".dev.vars.ghostinit-process-recovery-preview-"),
          ),
        ).toBe(false);
      },
      60000,
    );
  test("early stdin EOF still joins cleanup before restoring config", async () => {
    const fixture = createWorkerFixture({ framework: "tanstack-start" });
    fixtures.push(fixture);
    const child = spawn(
      process.execPath,
      [join(fixture.root, fixture.script), "preview", "--ghostinit-stop-on-stdin-end"],
      {
        cwd: fixture.cwd ?? fixture.root,
        env: testEnvironment(fixture.environment),
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      },
    );
    let output = "";
    child.stdout?.on("data", (d) => (output += String(d)));
    child.stderr?.on("data", (d) => (output += String(d)));
    const result = new Promise<number | null>((res, rej) => {
      child.once("exit", res);
      child.once("error", rej);
    });
    child.stdin!.end();
    expect(await result).toBe(0);
    expect(output).not.toContain("recovery is retained");
    expect(
      readdirSync(fixture.root).some((n) =>
        n.startsWith(".dev.vars.ghostinit-process-recovery-preview-"),
      ),
    ).toBe(false);
  }, 60000);
  test("nonzero adapter exit restores after verified cleanup", () => {
    const fixture = createWorkerFixture({
      framework: "tanstack-start",
      waitForPreviewIdentity: true,
    });
    fixtures.push(fixture);
    const adapter = join(fixture.root, "node_modules/vite/index.mjs");
    writeFileSync(
      adapter,
      readFileSync(adapter, "utf8") + '\nif (action === "preview") process.exit(19);\n',
    );
    const result = runFixture(fixture, ["preview"]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("exit code 19");
    const config = JSON.parse(
      readFileSync(join(fixture.cwd ?? fixture.root, "dist/server/wrangler.json"), "utf8"),
    );
    expect(config.secrets).toBeUndefined();
    expect(
      readdirSync(fixture.root).some((n) =>
        n.startsWith(".dev.vars.ghostinit-process-recovery-preview-"),
      ),
    ).toBe(false);
  }, 60000);
  test("uncertain cleanup retains config and lock even after the child exited", () => {
    const fixture = createWorkerFixture({ framework: "tanstack-start" });
    fixtures.push(fixture);
    const path = join(fixture.root, fixture.script);
    const source = readFileSync(path, "utf8");
    const signature =
      'async function terminateSupervisedProcessTree(child, completion, signal = "SIGTERM") {';
    expect(source.split(signature)).toHaveLength(2);
    writeFileSync(
      path,
      source.replace(
        signature,
        'async function actualTerminateSupervisedProcessTree(child, completion, signal = "SIGTERM") {',
      ) +
        '\nasync function terminateSupervisedProcessTree(child, completion, signal) { await actualTerminateSupervisedProcessTree(child, completion, signal); writeFileSync(".diagnostic-cleanup-joined", "yes"); throw new Error("synthetic cleanup proof failure"); }\n',
    );
    const result = runFixture(fixture, ["preview"]);
    const app = fixture.cwd ?? fixture.root;
    if (!existsSync(join(app, ".diagnostic-cleanup-joined"))) {
      fixtures.splice(fixtures.indexOf(fixture), 1);
      throw new Error("Cleanup remains uncertain; retained fixture at " + fixture.root);
    }
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("cleanup could not be verified");
    expect(existsSync(join(fixture.root, ".dev.vars.ghostinit-build-lock"))).toBe(true);
    const recovery = readdirSync(fixture.root).find((n) =>
      n.startsWith(".dev.vars.ghostinit-process-recovery-preview-"),
    );
    expect(recovery).toBeDefined();
    expect(existsSync(join(fixture.root, recovery!, "original.json"))).toBe(true);
    expect(
      JSON.parse(readFileSync(join(app, "dist/server/wrangler.json"), "utf8")).secrets.required,
    ).toContain("SERVER_SECRET");
    expect(runFixture(fixture, ["dry-run"]).status).not.toBe(0);
  }, 60000);
});
