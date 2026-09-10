// @allow-long 350: shared installed-state fixture covers repair persistence, reconciliation ownership, and source conflict controls
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { nextStack, runtime } from "../../packages/versions/src/index.js";
import type {
  DependencySecurityRepairPlan,
  DependencySecurityResolution,
} from "../../src/domain/dependency-security/types.js";
import {
  PROJECT_CONFIG_SCHEMA_URI,
  type DesiredProjectConfig,
} from "../../src/domain/project/config.js";
import { resolveProjectConfig } from "../../src/domain/project/resolve.js";
import { formatGenerationText } from "../../src/generation/plan-formatter.js";
import { FsTransaction } from "../../src/lib/fs.js";
import { hashContent } from "../../src/lib/checksum.js";
import { ConflictError } from "../../src/lib/errors.js";
import { Logger } from "../../src/lib/logger.js";
import { createManagedFileState, loadState } from "../../src/lib/state.js";
import { applyReconcilePlan, buildReconcilePlan } from "../../src/lib/reconcile.js";
import {
  snapshotDependencySecurityMaintenance,
  stageDependencySecurityMaintenance,
} from "../../src/lib/dependency-security-maintenance.js";
import { runProjectInstall } from "../../src/commands/create/installer.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function resolution(
  overrides: Partial<DependencySecurityResolution> = {},
): DependencySecurityResolution {
  return {
    manifestPath: "package.json",
    field: ["dependencies", "sample"],
    package: "sample",
    originalSpec: "1.2.3",
    version: "1.2.4",
    integrity: `sha512-${"A".repeat(86)}==`,
    publishedAt: "2026-01-01T00:00:00.000Z",
    auditedAt: "2026-01-08T00:00:00.000Z",
    advisories: ["GHSA-2345-6789-cfgh"],
    ...overrides,
  };
}
const document = (item = resolution()) => ({ schemaVersion: 1 as const, resolutions: [item] });

function desired(): DesiredProjectConfig {
  return {
    $schema: PROJECT_CONFIG_SCHEMA_URI,
    schemaVersion: 2,
    name: "security-test",
    mode: "single",
    runtime: "bun",
    packageManager: { name: "bun", version: runtime.bun },
    apps: [{ id: "web", target: "nextjs", deploy: "none" }],
    backend: false,
    capabilities: {},
  };
}

async function fixture(input: DesiredProjectConfig = desired()) {
  const parent = mkdtempSync(join(tmpdir(), "ghostinit-security-state-"));
  roots.push(parent);
  const root = join(parent, "project");
  const resolved = resolveProjectConfig(input);
  if (!resolved.ok) throw new Error("fixture resolution failed");
  await runProjectInstall({
    projectName: input.name,
    projectRoot: root,
    desiredConfig: input,
    resolvedConfig: resolved.config,
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
  const lock = "test lock before\n";
  const tx = new FsTransaction(root);
  await tx.write("bun.lock", lock);
  await tx.commit();
  const before = readFileSync(join(root, "package.json"), "utf8");
  const parts = nextStack.react.split(".").map(Number);
  const item = resolution({
    field: ["dependencies", "react"],
    package: "react",
    originalSpec: nextStack.react,
    version: `${parts[0]}.${parts[1]}.${parts[2] + 1}`,
  });
  const afterManifest = JSON.parse(before);
  afterManifest.dependencies.react = item.version;
  const after = await formatGenerationText(
    "package.json",
    `${JSON.stringify(afterManifest, null, 2)}\n`,
  );
  const afterLock = "test lock after\n";
  const repair: DependencySecurityRepairPlan = {
    schemaVersion: 1,
    beforeLockSha256: hashContent(lock),
    afterLockSha256: hashContent(afterLock),
    changes: [
      { package: "react", from: item.originalSpec, to: item.version, manifests: ["package.json"] },
    ],
    resolutions: document(item),
    files: [
      { path: "package.json", before, after },
      { path: "bun.lock", before: lock, after: afterLock },
    ],
  };
  return { root, before, repair, item };
}

describe("dependency security state transactions", () => {
  test("stages the first lock and matching evidence without inventing absent state", async () => {
    const root = mkdtempSync(join(tmpdir(), "ghostinit-security-bootstrap-"));
    roots.push(root);
    const before = JSON.stringify({ dependencies: { sample: "1.2.3" } });
    const after = JSON.stringify({ dependencies: { sample: "1.2.4" } });
    const seed = new FsTransaction(root);
    await seed.write("ghostinit.config.json", `${JSON.stringify(desired(), null, 2)}\n`);
    await seed.write("package.json", before);
    await seed.commit();
    const lock = "first verified lock\n";
    const repair: DependencySecurityRepairPlan = {
      schemaVersion: 1,
      beforeLockSha256: null,
      afterLockSha256: hashContent(lock),
      changes: [],
      resolutions: document(),
      files: [
        { path: "package.json", before, after },
        { path: "bun.lock", before: null, after: lock },
        {
          path: "dependency-lock-evidence.json",
          before: null,
          after: JSON.stringify({ lockSha256: hashContent(lock) }),
        },
      ],
    };
    const tx = new FsTransaction(root);
    const snapshot = await snapshotDependencySecurityMaintenance(root);
    expect(snapshot.stateContent).toBeNull();
    await stageDependencySecurityMaintenance(tx, root, snapshot, repair);
    expect(tx.getStagedFiles().some(({ path }) => path === ".ghostinit/state.json")).toBe(false);
    await tx.commit();
    expect((await snapshotDependencySecurityMaintenance(root)).stateContent).toBeNull();
    expect(readFileSync(join(root, "bun.lock"), "utf8")).toBe(lock);
  });

  test("rejects lock evidence for a different repaired lock", async () => {
    const { root, repair } = await fixture();
    await expect(
      stageDependencySecurityMaintenance(
        new FsTransaction(root),
        root,
        await snapshotDependencySecurityMaintenance(root),
        {
          ...repair,
          files: [
            ...repair.files,
            {
              path: "dependency-lock-evidence.json",
              before: null,
              after: JSON.stringify({ lockSha256: "f".repeat(64) }),
            },
          ],
        },
      ),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  test("previews staged paths without writes, persists portable floors, and upgrade does not revert them", async () => {
    const { root, before, repair, item } = await fixture();
    const snapshot = await snapshotDependencySecurityMaintenance(root);
    const tx = new FsTransaction(root);
    const staged = await stageDependencySecurityMaintenance(tx, root, snapshot, repair);
    expect(staged.managedManifestPaths).toEqual(["package.json"]);
    expect(
      tx
        .getStagedFiles()
        .map(({ path }) => path)
        .sort(),
    ).toEqual([".ghostinit/state.json", "bun.lock", "ghostinit.config.json", "package.json"]);
    expect(readFileSync(join(root, "package.json"), "utf8")).toBe(before);
    expect((await snapshotDependencySecurityMaintenance(root)).stateContent).toBe(
      snapshot.stateContent,
    );
    await tx.commit();
    const state = (await loadState(root))!;
    expect(state.desiredConfig.dependencySecurity?.resolutions[0].version).toBe(item.version);
    expect(state.resolvedConfig.dependencySecurity).toEqual(state.desiredConfig.dependencySecurity);
    expect(state.generationPlan).toBeNull();
    const next = await buildReconcilePlan(root, state, { operation: "upgrade" });
    expect(next.conflicts).toEqual([]);
    expect(next.rewrites.some(({ path }) => path === "package.json")).toBe(false);
    await applyReconcilePlan(root, state, next, "upgrade");
    const repeated = await buildReconcilePlan(root, (await loadState(root))!, {
      operation: "upgrade",
    });
    expect(repeated.rewrites).toEqual([]);
    expect(repeated.conflicts).toEqual([]);
  });

  for (const edited of [false, true]) {
    test(`invalidated security attestations retain base ownership and ${edited ? "reject user edits" : "remove disabled files on the first sync"}`, async () => {
      const { root, repair } = await fixture({ ...desired(), capabilities: { i18n: true } });
      const maintenance = new FsTransaction(root);
      await stageDependencySecurityMaintenance(
        maintenance,
        root,
        await snapshotDependencySecurityMaintenance(root),
        repair,
      );
      await maintenance.commit();
      const secured = (await loadState(root))!;
      expect(secured.generationPlan).toBeNull();
      const routingPath = "src/i18n/routing.ts";
      const requestPath = "src/i18n/request.ts";
      const addonPath = "src/custom-addon.ts";
      const addonContent = "export const customAddon = true;\n";
      const configPath = "ghostinit.config.json";
      const configBefore = readFileSync(join(root, configPath), "utf8");
      const statePath = ".ghostinit/state.json";
      const stateBefore = readFileSync(join(root, statePath), "utf8");
      const persisted = JSON.parse(stateBefore);
      persisted.files[addonPath] = createManagedFileState(addonPath, addonContent, {
        lifecycle: "generator-owned",
        provenance: { ...secured.files[routingPath].provenance, renderer: "ghostinit-add.v2" },
      });
      const change = new FsTransaction(root);
      await change.writeIfUnchanged(
        configPath,
        JSON.stringify({ ...JSON.parse(configBefore), capabilities: { i18n: false } }),
        configBefore,
      );
      await change.writeIfUnchanged(statePath, JSON.stringify(persisted), stateBefore);
      await change.write(addonPath, addonContent);
      if (edited) {
        const before = readFileSync(join(root, routingPath), "utf8");
        await change.writeIfUnchanged(routingPath, before + "// user customization\n", before);
      }
      await change.commit();
      const disabled = (await loadState(root))!;
      const plan = await buildReconcilePlan(root, disabled, { operation: "sync" });
      expect(plan.deletions.some(({ path }) => path === requestPath)).toBe(true);
      expect(plan.retired).toContain("src/i18n/README.md");
      expect(plan.preserved).toContain(addonPath);
      expect(plan.preserved).not.toContain(requestPath);
      expect(plan.deletions.some(({ path }) => path === addonPath)).toBe(false);
      if (edited) {
        expect(plan.conflicts).toContainEqual(
          expect.objectContaining({ path: routingPath, reason: "content-hash-mismatch" }),
        );
        expect(plan.deletions.some(({ path }) => path === routingPath)).toBe(false);
      } else {
        expect(plan.conflicts).toEqual([]);
        expect(plan.deletions.some(({ path }) => path === routingPath)).toBe(true);
        await applyReconcilePlan(root, disabled, plan, "sync");
        expect(existsSync(join(root, requestPath))).toBe(false);
        expect(existsSync(join(root, routingPath))).toBe(false);
        expect(readFileSync(join(root, addonPath), "utf8")).toBe(addonContent);
      }
    });
  }

  test("preserves pre-existing user manifest drift instead of adopting it", async () => {
    const { root, before, repair } = await fixture();
    const initial = (await loadState(root))!;
    const user = JSON.parse(before);
    user.scripts.custom = "echo custom";
    const edited = `${JSON.stringify(user, null, 2)}\n`;
    user.dependencies.react = repair.resolutions.resolutions[0].version;
    const after = `${JSON.stringify(user, null, 2)}\n`;
    const edit = new FsTransaction(root);
    await edit.writeIfUnchanged("package.json", edited, before);
    await edit.commit();
    const tx = new FsTransaction(root);
    const result = await stageDependencySecurityMaintenance(
      tx,
      root,
      await snapshotDependencySecurityMaintenance(root),
      { ...repair, files: [{ path: "package.json", before: edited, after }, repair.files[1]] },
    );
    expect(result.managedManifestPaths).toEqual([]);
    await tx.commit();
    const state = (await loadState(root))!;
    expect(state.files["package.json"].contentHash).toBe(initial.files["package.json"].contentHash);
    expect(JSON.parse(readFileSync(join(root, "package.json"), "utf8")).scripts.custom).toBe(
      "echo custom",
    );
    const next = await buildReconcilePlan(root, state, { operation: "upgrade" });
    expect(next.conflicts).toContainEqual(
      expect.objectContaining({ path: "package.json", reason: "content-hash-mismatch" }),
    );
  });

  test("rejects unrelated manifest rewrites and dependency additions", async () => {
    const { root, repair } = await fixture();
    const changed = JSON.parse(repair.files[0].after);
    changed.scripts.dev = "malicious side effect";
    await expect(
      stageDependencySecurityMaintenance(
        new FsTransaction(root),
        root,
        await snapshotDependencySecurityMaintenance(root),
        {
          ...repair,
          files: [{ ...repair.files[0], after: JSON.stringify(changed) }, repair.files[1]],
        },
      ),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  for (const path of [
    "package.json",
    "ghostinit.config.json",
    ".ghostinit/state.json",
    "bun.lock",
  ]) {
    test(`rejects concurrent ${path} changes after staging`, async () => {
      const { root, repair } = await fixture();
      const tx = new FsTransaction(root);
      await stageDependencySecurityMaintenance(
        tx,
        root,
        await snapshotDependencySecurityMaintenance(root),
        repair,
      );
      const original = readFileSync(join(root, path), "utf8");
      const edit = new FsTransaction(root);
      await edit.writeIfUnchanged(path, `${original}\n`, original);
      await edit.commit();
      await expect(tx.commit()).rejects.toThrow();
      expect(readFileSync(join(root, path), "utf8")).toBe(`${original}\n`);
    });
  }
});
