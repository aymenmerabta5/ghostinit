import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { upgradeRequiresLockReconciliation } from "../../src/commands/upgrade-lock.js";
import { upgradeCommand } from "../../src/commands/upgrade.js";
import { runProjectInstall } from "../../src/commands/create/installer.js";
import { FsTransaction } from "../../src/lib/fs.js";
import { Logger } from "../../src/lib/logger.js";
import { createManagedFileState, loadState, saveStateV2 } from "../../src/lib/state.js";
import type { ReconcileChange, ReconcilePlan } from "../../src/lib/reconcile.js";
import { installationPlan } from "../helpers/security-installation-fixture.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
const empty = (): Pick<ReconcilePlan, "creates" | "rewrites" | "moves" | "deletions"> => ({
  creates: [],
  rewrites: [],
  moves: [],
  deletions: [],
});
const rewrite = (path: string, value: object): ReconcileChange => ({
  action: "rewrite",
  path,
  content: JSON.stringify(value),
  beforeHash: null,
  afterHash: null,
});

describe("dependency-affecting upgrade lock reconciliation", () => {
  test("changed dependency versions require reconciliation while scripts/formatting do not", async () => {
    const root = mkdtempSync(join(tmpdir(), "ghostinit-upgrade-lock-projection-"));
    roots.push(root);
    const before = {
      name: "fixture",
      dependencies: { "@fixture/local": "1.0.0" },
      scripts: { dev: "old-command" },
    };
    const tx = new FsTransaction(root);
    await tx.write("package.json", JSON.stringify(before));
    await tx.commit();
    expect(
      await upgradeRequiresLockReconciliation(root, {
        ...empty(),
        rewrites: [rewrite("package.json", { ...before, scripts: { dev: "new-command" } })],
      }),
    ).toBe(false);
    expect(
      await upgradeRequiresLockReconciliation(root, {
        ...empty(),
        rewrites: [
          rewrite("package.json", { ...before, dependencies: { "@fixture/local": "1.0.1" } }),
        ],
      }),
    ).toBe(true);
    expect(await upgradeRequiresLockReconciliation(root, empty())).toBe(false);
  });

  test("removed workspaces and reviewed patch bindings require a new candidate graph", async () => {
    const root = mkdtempSync(join(tmpdir(), "ghostinit-upgrade-lock-removal-"));
    roots.push(root);
    const before = {
      workspaces: ["apps/*", "packages/*"],
      patchedDependencies: { "image-size@1.2.1": "patches/image-size@1.2.1.patch" },
    };
    const tx = new FsTransaction(root);
    await tx.write("package.json", JSON.stringify(before));
    await tx.commit();
    for (const next of [
      { ...before, workspaces: ["apps/*"] },
      { ...before, patchedDependencies: {} },
    ]) {
      expect(
        await upgradeRequiresLockReconciliation(root, {
          ...empty(),
          rewrites: [rewrite("package.json", next)],
        }),
      ).toBe(true);
    }
    for (const path of [
      "packages/removed/package.json",
      "patches/image-size@1.2.1.patch",
      "bunfig.toml",
    ]) {
      expect(
        await upgradeRequiresLockReconciliation(root, {
          ...empty(),
          deletions: [{ action: "delete", path, beforeHash: null, afterHash: null }],
        }),
      ).toBe(true);
    }
  });

  for (const mutation of [
    "local-version",
    "declared-version-range",
    "removed-workspace-and-patch",
    "scripts-only",
    "none",
  ] as const) {
    test(`real source reconciliation requests the correct lock phase for ${mutation}`, async () => {
      const parent = mkdtempSync(join(tmpdir(), "ghostinit-upgrade-lock-command-"));
      roots.push(parent);
      const root = join(parent, "project");
      const before = await installationPlan();
      const options = {
        cwd: root,
        json: false,
        yes: true,
        force: false,
        dryRun: false,
        noInstall: true,
        runtime: "bun" as const,
        logger: new Logger({ quiet: true }),
      };
      await runProjectInstall({
        projectName: before.desired.name,
        projectRoot: root,
        desiredConfig: before.desired,
        resolvedConfig: before.resolved,
        noInstall: true,
        requireAbsentTarget: true,
        options,
      });
      const state = (await loadState(root))!;
      const original = readFileSync(join(root, "package.json"), "utf8");
      const previous = JSON.parse(original);
      if (mutation === "local-version") previous.version = "0.0.0-previous-local-generation";
      if (mutation === "declared-version-range") {
        // Reuse the real catalog pin; only the prior declaration constraint is
        // different. This is no claim that an invented registry release exists.
        const current = previous.dependencies["@fontsource-variable/geist"] as string;
        previous.dependencies["@fontsource-variable/geist"] = current.startsWith("^")
          ? current.slice(1)
          : `^${current}`;
      }
      if (mutation === "scripts-only") previous.scripts.dev = "previous-generated-command";
      if (mutation === "removed-workspace-and-patch") {
        previous.workspaces = ["retired/*"];
        previous.patchedDependencies = { "image-size@1.2.1": "patches/image-size@1.2.1.patch" };
      }
      const oldContent = mutation === "none" ? original : `${JSON.stringify(previous, null, 2)}\n`;
      const oldLock = '{"fixture":"existing old graph; injected runtime never executes it"}\n';
      const tx = new FsTransaction(root);
      await tx.writeIfUnchanged("package.json", oldContent, original);
      await tx.write("bun.lock", oldLock);
      await tx.write("dependency-lock-evidence.json", '{"fixture":"existing old evidence"}\n');
      await tx.commit();
      await saveStateV2(root, state, {
        replaceFiles: {
          ...state.files,
          "package.json": createManagedFileState(
            "package.json",
            oldContent,
            state.files["package.json"],
          ),
        },
        desiredConfigAlreadyWritten: true,
      });
      let calls = 0;
      expect(
        await upgradeCommand(
          [],
          { ...options, noInstall: false },
          {
            runSecurity: async (input) => {
              calls += 1;
              expect(input.mode).toBe("install");
              expect(input.bootstrap).toBe(false);
              expect(input.reconcileLock).toBe(
                mutation === "local-version" ||
                  mutation === "declared-version-range" ||
                  mutation === "removed-workspace-and-patch",
              );
              expect(input.verifyProject).toBe(true);
              expect(readFileSync(join(root, "package.json"), "utf8")).toBe(original);
              expect(readFileSync(join(root, "bun.lock"), "utf8")).toBe(oldLock);
              return {
                status: "clean",
                dryRun: false,
                applied: false,
                installedVerified: true,
                changes: [],
                remaining: [],
                verifiedPatchAdvisories: [],
              };
            },
          },
        ),
      ).toBe(0);
      expect(calls).toBe(1);
    });
  }
});
