import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runProjectInstall } from "../../src/commands/create/installer.js";
import { resolveCreateConfig } from "../../src/commands/create/resolution.js";
import { ConflictError } from "../../src/lib/errors.js";
import { FsTransaction } from "../../src/lib/fs.js";
import { Logger } from "../../src/lib/logger.js";
import { serializeDesiredProjectConfig } from "../../src/lib/project-config.js";
import { applyReconcilePlan, buildReconcilePlan } from "../../src/lib/reconcile.js";
import { createManagedFileState, loadState, saveStateV2 } from "../../src/lib/state.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

async function previousGeneration(mode: "single" | "monorepo", billing = false, i18n = false) {
  const parent = mkdtempSync(join(tmpdir(), "ghostinit-manifest-upgrade-"));
  roots.push(parent);
  const root = join(parent, "example");
  const resolution = resolveCreateConfig({
    name: "example",
    runtime: "bun",
    mode,
    framework: "nextjs",
    billing: billing ? ["stripe"] : [],
    features: i18n ? ["i18n"] : [],
    database: billing ? "postgres" : "none",
    databaseWasExplicit: true,
    apps: ["web"],
    preset: billing ? "saas" : "frontend",
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
  const state = (await loadState(root))!;
  const path = "package.json";
  const current = readFileSync(join(root, path), "utf8");
  const previous = JSON.parse(current);
  previous.scripts.dev = "bun previous-generated-entry.ts";
  const previousContent = `${JSON.stringify(previous, null, 2)}\n`;
  const transaction = new FsTransaction(root);
  await transaction.writeIfUnchanged(path, previousContent, current);
  await transaction.commit();
  await saveStateV2(root, state, {
    replaceFiles: {
      ...state.files,
      [path]: createManagedFileState(path, previousContent, state.files[path]),
    },
    desiredConfigAlreadyWritten: true,
  });
  return { root, current, previousContent, state: (await loadState(root))! };
}

describe("unchanged generated manifest upgrades", () => {
  for (const mode of ["single", "monorepo"] as const) {
    test(`${mode} rejects an untracked managed file even when it matches the new template`, async () => {
      const { root, state } = await previousGeneration(mode);
      const files = { ...state.files };
      delete files[".gitignore"];
      await saveStateV2(root, state, { replaceFiles: files, desiredConfigAlreadyWritten: true });
      const plan = await buildReconcilePlan(root, (await loadState(root))!, {
        operation: "upgrade",
      });
      expect(plan.conflicts).toContainEqual(
        expect.objectContaining({
          path: ".gitignore",
          reason: "untracked-collision",
        }),
      );
    });

    test(`${mode} never adopts an unchanged file edited after planning`, async () => {
      const { root, state } = await previousGeneration(mode);
      const path = ".gitignore";
      const original = readFileSync(join(root, path), "utf8");
      const plan = await buildReconcilePlan(root, state, { operation: "upgrade" });
      expect(plan.unchanged).toContain(path);
      const edited = `${original}\n# User-owned deployment artifact\nlocal-artifacts/\n`;
      const transaction = new FsTransaction(root);
      await transaction.writeIfUnchanged(path, edited, original);
      await transaction.commit();
      await applyReconcilePlan(root, state, plan, "upgrade");
      expect(readFileSync(join(root, path), "utf8")).toBe(edited);
      const current = (await loadState(root))!;
      expect(current.files[path].contentHash).toBe(state.files[path].contentHash);
      const next = await buildReconcilePlan(root, current, { operation: "upgrade" });
      expect(next.conflicts).toContainEqual(
        expect.objectContaining({ path, reason: "content-hash-mismatch" }),
      );
    });

    test(`${mode} preserves a user's seed edit without adopting it as a generated baseline`, async () => {
      const { root, state } = await previousGeneration(mode);
      const path = `${mode === "single" ? "src" : "apps/web/src"}/app/page.tsx`;
      const original = readFileSync(join(root, path), "utf8");
      const edited = `${original}\n// Product-specific customization\n`;
      const transaction = new FsTransaction(root);
      await transaction.writeIfUnchanged(path, edited, original);
      await transaction.commit();
      const plan = await buildReconcilePlan(root, state, { operation: "upgrade" });
      expect(plan.preserved).toContain(path);
      await applyReconcilePlan(root, state, plan, "upgrade");
      expect(readFileSync(join(root, path), "utf8")).toBe(edited);
      expect((await loadState(root))!.files[path].contentHash).toBe(state.files[path].contentHash);
    });

    for (const priorLifecycle of ["seed-once", "generator-owned"] as const) {
      test(`${mode} preserves relocated page edits previously tracked as ${priorLifecycle}`, async () => {
        const { root, state, current } = await previousGeneration(mode, true, true);
        const app = mode === "single" ? "src/app" : "apps/web/src/app";
        const path = `${app}/sign-in/page.client.tsx`;
        const original = readFileSync(join(root, path), "utf8");
        expect(state.files[path].lifecycle).toBe("seed-once");
        await saveStateV2(root, state, {
          replaceFiles: {
            ...state.files,
            [path]: { ...state.files[path], lifecycle: priorLifecycle },
          },
          desiredConfigAlreadyWritten: true,
        });
        const previous = (await loadState(root))!;
        const edited = `${original}\n// Product-specific sign-in customization\n`;
        const transaction = new FsTransaction(root);
        await transaction.writeIfUnchanged(path, edited, original);
        await transaction.commit();
        const plan = await buildReconcilePlan(root, previous, { operation: "upgrade" });
        expect(plan.conflicts).toEqual([]);
        expect(plan.preserved).toContain(path);
        expect(plan.rewrites.some((change) => change.path === "package.json")).toBe(true);
        expect(plan.targets[`${app}/billing/hooks/use-billing-page.ts`].lifecycle).toBe(
          "generator-owned",
        );
        await applyReconcilePlan(root, previous, plan, "upgrade");
        expect(readFileSync(join(root, path), "utf8")).toBe(edited);
        expect(readFileSync(join(root, "package.json"), "utf8")).toBe(current);
        const upgraded = (await loadState(root))!;
        expect(upgraded.files[path].lifecycle).toBe("seed-once");
        expect(upgraded.files[path].contentHash).toBe(previous.files[path].contentHash);
        expect(upgraded.files[path].size).toBe(previous.files[path].size);
        expect(upgraded.files[path].owner).toBe(previous.files[path].owner);
        expect(upgraded.files[path].provenance).toEqual(previous.files[path].provenance);
        const next = await buildReconcilePlan(root, upgraded, { operation: "upgrade" });
        expect(next.conflicts).toEqual([]);
        expect(next.rewrites).toEqual([]);
        expect(next.preserved).toContain(path);

        const configPath = "ghostinit.config.json";
        const configContent = readFileSync(join(root, configPath), "utf8");
        expect(configContent).toContain('"i18n": true');
        const disableI18n = new FsTransaction(root);
        await disableI18n.writeIfUnchanged(
          configPath,
          serializeDesiredProjectConfig({
            ...upgraded.desiredConfig,
            capabilities: { ...upgraded.desiredConfig.capabilities, i18n: false },
          }),
          configContent,
        );
        await disableI18n.commit();
        const disabled = (await loadState(root))!;
        const removal = await buildReconcilePlan(root, disabled, { operation: "sync" });
        expect(removal.conflicts).toEqual([]);
        expect(removal.retired).toContain(path);
        expect(removal.deletions.some((change) => change.path === path)).toBe(false);
        await applyReconcilePlan(root, disabled, removal, "sync");
        expect(readFileSync(join(root, path), "utf8")).toBe(edited);
        expect((await loadState(root))!.files[path]).toBeUndefined();
      });
    }

    test(`${mode} migrates an untouched misclassified hook while keeping real pages seed-once`, async () => {
      const { root, state } = await previousGeneration(mode, true);
      const app = mode === "single" ? "src/app" : "apps/web/src/app";
      const path = `${app}/billing/hooks/use-billing-page.ts`;
      const current = readFileSync(join(root, path), "utf8");
      expect(state.files[path].lifecycle).toBe("generator-owned");
      expect(state.files[`${app}/billing/page.tsx`].lifecycle).toBe("seed-once");
      const previousContent = "export const oldGeneratedHook = true;\n";
      const transaction = new FsTransaction(root);
      await transaction.writeIfUnchanged(path, previousContent, current);
      await transaction.commit();
      await saveStateV2(root, state, {
        replaceFiles: {
          ...state.files,
          [path]: createManagedFileState(path, previousContent, {
            ...state.files[path],
            lifecycle: "seed-once",
          }),
        },
        desiredConfigAlreadyWritten: true,
      });
      const previous = (await loadState(root))!;
      const plan = await buildReconcilePlan(root, previous, { operation: "upgrade" });
      expect(plan.conflicts).toEqual([]);
      expect(plan.rewrites.some((change) => change.path === path)).toBe(true);
      await applyReconcilePlan(root, previous, plan, "upgrade");
      expect(readFileSync(join(root, path), "utf8")).toBe(current);
      expect((await loadState(root))!.files[path].lifecycle).toBe("generator-owned");
    });

    test(`${mode} upgrades a tracked unchanged structured manifest and then becomes a no-op`, async () => {
      const { root, state, current } = await previousGeneration(mode);
      const beforeState = readFileSync(join(root, ".ghostinit/state.json"), "utf8");
      const plan = await buildReconcilePlan(root, state, { operation: "upgrade" });
      expect(plan.conflicts).toEqual([]);
      expect(plan.rewrites.some(({ path }) => path === "package.json")).toBe(true);
      expect(readFileSync(join(root, ".ghostinit/state.json"), "utf8")).toBe(beforeState);
      await applyReconcilePlan(root, state, plan, "upgrade");
      expect(readFileSync(join(root, "package.json"), "utf8")).toBe(current);
      const next = await buildReconcilePlan(root, (await loadState(root))!, {
        operation: "upgrade",
      });
      expect(next.conflicts).toEqual([]);
      expect(next.rewrites).toEqual([]);
    });

    test(`${mode} rejects both existing edits and edits after planning`, async () => {
      const { root, state, previousContent } = await previousGeneration(mode);
      const plan = await buildReconcilePlan(root, state, { operation: "upgrade" });
      const beforeState = readFileSync(join(root, ".ghostinit/state.json"), "utf8");
      const edited = JSON.parse(previousContent);
      edited.scripts.dev = "bun user-owned-entry.ts";
      const editedContent = `${JSON.stringify(edited, null, 2)}\n`;
      const transaction = new FsTransaction(root);
      await transaction.writeIfUnchanged("package.json", editedContent, previousContent);
      await transaction.commit();
      await expect(applyReconcilePlan(root, state, plan, "upgrade")).rejects.toBeInstanceOf(
        ConflictError,
      );
      const conflict = await buildReconcilePlan(root, (await loadState(root))!, {
        operation: "upgrade",
      });
      expect(conflict.conflicts).toContainEqual(
        expect.objectContaining({
          path: "package.json",
          reason: "content-hash-mismatch",
        }),
      );
      expect(readFileSync(join(root, "package.json"), "utf8")).toBe(editedContent);
      expect(readFileSync(join(root, ".ghostinit/state.json"), "utf8")).toBe(beforeState);
    });
  }
});
