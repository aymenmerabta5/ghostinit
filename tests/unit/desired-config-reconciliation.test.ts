import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runProjectInstall } from "../../src/commands/create/installer.js";
import { resolveCreateConfig } from "../../src/commands/create/resolution.js";
import { hashContent } from "../../src/lib/checksum.js";
import { ConflictError, IncompatibleSchemaError } from "../../src/lib/errors.js";
import { FsTransaction } from "../../src/lib/fs.js";
import { Logger } from "../../src/lib/logger.js";
import { applyReconcilePlan, buildReconcilePlan } from "../../src/lib/reconcile.js";
import { loadState, saveStateV2 } from "../../src/lib/state.js";

const configPath = "ghostinit.config.json";
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

async function generatedProject(mode: "single" | "monorepo") {
  const parent = mkdtempSync(join(tmpdir(), "ghostinit-config-reconciliation-"));
  roots.push(parent);
  const root = join(parent, "example");
  const resolution = resolveCreateConfig({
    name: "example",
    runtime: "bun",
    mode,
    framework: "nextjs",
    billing: [],
    features: [],
    database: "none",
    databaseWasExplicit: true,
    apps: ["web"],
    preset: "frontend",
    cache: "none",
    deploy: "none",
  });
  if (!resolution.ok) throw new Error(resolution.message);
  await runProjectInstall({
    projectName: "example",
    projectRoot: root,
    desiredConfig: resolution.desiredConfig,
    resolvedConfig: resolution.resolvedConfig,
    noInstall: true,
    requireAbsentTarget: true,
    options: {
      cwd: parent,
      yes: true,
      noInstall: true,
      dryRun: false,
      force: false,
      json: false,
      runtime: "bun",
      check: false,
      logger: new Logger({ quiet: true }),
    },
  });
  return { root, state: (await loadState(root))! };
}

async function replaceFile(root: string, path: string, content: string): Promise<void> {
  const transaction = new FsTransaction(root);
  await transaction.writeIfUnchanged(path, content, readFileSync(join(root, path), "utf8"));
  await transaction.commit();
}

function reformat(content: string): string {
  const reordered = Object.fromEntries(Object.entries(JSON.parse(content)).reverse());
  return `${JSON.stringify(reordered, null, "\t")}\n`;
}

function enableI18n(content: string): string {
  const desired = JSON.parse(content);
  desired.capabilities.i18n = true;
  return `${JSON.stringify(desired, null, 2)}\n`;
}

describe("desired configuration reconciliation", () => {
  for (const mode of ["single", "monorepo"] as const) {
    test(`${mode} normalizes a reformatted validated config through sync and then becomes a no-op`, async () => {
      const { root, state } = await generatedProject(mode);
      const original = readFileSync(join(root, configPath), "utf8");
      const edited = reformat(original);
      expect(edited).not.toBe(original);
      await replaceFile(root, configPath, edited);
      const reformatted = (await loadState(root))!;
      expect(reformatted.configChanged).toBe(false);
      expect(reformatted.resolvedConfig).toEqual(state.resolvedConfig);
      const stateBefore = readFileSync(join(root, ".ghostinit/state.json"), "utf8");
      const plan = await buildReconcilePlan(root, reformatted, { operation: "sync" });
      expect(plan.conflicts).toEqual([]);
      expect(plan.rewrites.map(({ path }) => path)).toEqual([configPath]);
      expect(plan.rewrites[0].beforeHash).toBe(hashContent(edited));
      expect(readFileSync(join(root, configPath), "utf8")).toBe(edited);
      expect(readFileSync(join(root, ".ghostinit/state.json"), "utf8")).toBe(stateBefore);
      await applyReconcilePlan(root, reformatted, plan, "sync");
      const normalized = readFileSync(join(root, configPath), "utf8");
      expect(normalized).toBe(plan.targets[configPath].content);
      const updated = (await loadState(root))!;
      expect(updated.files[configPath].contentHash).toBe(hashContent(normalized));
      expect(updated.files[configPath].contentHash).not.toBe(hashContent(edited));
      const next = await buildReconcilePlan(root, updated, { operation: "sync" });
      expect(next.conflicts).toEqual([]);
      expect(next.rewrites).toEqual([]);
    });

    test(`${mode} rejects a semantic config edit made after state was loaded`, async () => {
      const { root, state } = await generatedProject(mode);
      const original = readFileSync(join(root, configPath), "utf8");
      const edited = enableI18n(original);
      await replaceFile(root, configPath, edited);
      const changed = (await loadState(root))!;
      expect(changed.configChanged).toBe(true);
      const plan = await buildReconcilePlan(root, state, { operation: "sync" });
      expect(plan.conflicts).toContainEqual(
        expect.objectContaining({ path: configPath, reason: "content-hash-mismatch" }),
      );
      expect(plan.rewrites.some(({ path }) => path === configPath)).toBe(false);
      expect(readFileSync(join(root, configPath), "utf8")).toBe(edited);

      // Restoring an older attested file is still a concurrent semantic change
      // relative to the newly loaded desired input.
      await replaceFile(root, configPath, original);
      expect(hashContent(original)).toBe(changed.files[configPath].contentHash);
      const reverted = await buildReconcilePlan(root, changed, { operation: "sync" });
      expect(reverted.conflicts).toContainEqual(
        expect.objectContaining({ path: configPath, reason: "content-hash-mismatch" }),
      );
      expect(reverted.rewrites.some(({ path }) => path === configPath)).toBe(false);
      expect(readFileSync(join(root, configPath), "utf8")).toBe(original);
    });

    test(`${mode} rejects a semantic edit after normalization planning without changing state`, async () => {
      const { root } = await generatedProject(mode);
      const formatted = reformat(readFileSync(join(root, configPath), "utf8"));
      await replaceFile(root, configPath, formatted);
      const state = (await loadState(root))!;
      const plan = await buildReconcilePlan(root, state, { operation: "sync" });
      expect(plan.conflicts).toEqual([]);
      expect(plan.rewrites.map(({ path }) => path)).toEqual([configPath]);
      const stateBefore = readFileSync(join(root, ".ghostinit/state.json"), "utf8");
      const edited = enableI18n(formatted);
      await replaceFile(root, configPath, edited);
      await expect(applyReconcilePlan(root, state, plan, "sync")).rejects.toBeInstanceOf(
        ConflictError,
      );
      expect(readFileSync(join(root, configPath), "utf8")).toBe(edited);
      expect(readFileSync(join(root, ".ghostinit/state.json"), "utf8")).toBe(stateBefore);
    });

    for (const invalid of ["{", '{"schemaVersion":3}']) {
      test(`${mode} rejects invalid current config ${invalid}`, async () => {
        const { root, state } = await generatedProject(mode);
        await replaceFile(root, configPath, invalid);
        await expect(loadState(root)).rejects.toBeInstanceOf(IncompatibleSchemaError);
        const plan = await buildReconcilePlan(root, state, { operation: "sync" });
        expect(plan.conflicts).toContainEqual(
          expect.objectContaining({ path: configPath, reason: "content-hash-mismatch" }),
        );
        expect(plan.rewrites.some(({ path }) => path === configPath)).toBe(false);
        expect(readFileSync(join(root, configPath), "utf8")).toBe(invalid);
      });
    }

    test(`${mode} rejects untracked desired config and unrelated reformatted managed files`, async () => {
      const { root, state } = await generatedProject(mode);
      const files = { ...state.files };
      delete files[configPath];
      await saveStateV2(root, state, { replaceFiles: files, desiredConfigAlreadyWritten: true });
      const editedConfig = reformat(readFileSync(join(root, configPath), "utf8"));
      const editedManifest = reformat(readFileSync(join(root, "package.json"), "utf8"));
      await replaceFile(root, configPath, editedConfig);
      await replaceFile(root, "package.json", editedManifest);
      const current = (await loadState(root))!;
      const plan = await buildReconcilePlan(root, current, { operation: "sync" });
      expect(plan.conflicts).toContainEqual(
        expect.objectContaining({ path: configPath, reason: "untracked-collision" }),
      );
      expect(plan.conflicts).toContainEqual(
        expect.objectContaining({ path: "package.json", reason: "content-hash-mismatch" }),
      );
      await expect(applyReconcilePlan(root, current, plan, "sync")).rejects.toBeInstanceOf(
        ConflictError,
      );
      expect(readFileSync(join(root, configPath), "utf8")).toBe(editedConfig);
      expect(readFileSync(join(root, "package.json"), "utf8")).toBe(editedManifest);
      expect((await loadState(root))!.files[configPath]).toBeUndefined();
    });
  }
});
