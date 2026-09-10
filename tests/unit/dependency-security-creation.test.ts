import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { runtime } from "../../packages/versions/src/index.js";
import { buildGenerationPlan } from "../../src/domain/generation/plan-builder.js";
import type { GenerationPlan, PlannedFileInput } from "../../src/domain/generation/types.js";
import {
  PROJECT_CONFIG_SCHEMA_URI,
  type DesiredProjectConfig,
} from "../../src/domain/project/config.js";
import { STATE_SCHEMA_URI } from "../../src/lib/config.js";
import { FsTransaction } from "../../src/lib/fs.js";
import { acquireLock } from "../../src/lib/lock.js";
import { Logger } from "../../src/lib/logger.js";
import {
  resolveDesiredProjectConfig,
  serializeDesiredProjectConfig,
} from "../../src/lib/project-config.js";
import { createGenerationPlanState, createManagedFileStateFromPlan } from "../../src/lib/state.js";
import { runDependencySecurityWithDependencies } from "../../src/lib/dependency-security/runtime.js";
import type { DependencySecurityCreatePublication } from "../../src/lib/dependency-security/runtime-types.js";
import { SECURITY_JOURNAL_PATH } from "../../src/lib/dependency-security/workspace.js";
import {
  sameSecurityRoot,
  securityProcessFixture,
  securityTestPolicy,
  securityTestRoot,
  writeSecurityTestFile,
} from "../helpers/dependency-security-runtime.js";

const desired: DesiredProjectConfig = {
  $schema: PROJECT_CONFIG_SCHEMA_URI,
  schemaVersion: 2,
  name: "security-fixture",
  mode: "monorepo",
  runtime: "bun",
  packageManager: { name: "bun", version: runtime.bun },
  apps: [{ id: "web", target: "nextjs", deploy: "none" }],
  backend: false,
  capabilities: {},
};

describe("creation-owned dependency completion", () => {
  let root: string;
  let lease: Awaited<ReturnType<typeof acquireLock>>;
  beforeEach(async () => {
    root = await securityTestRoot();
    await writeSecurityTestFile(
      root,
      "ghostinit.config.json",
      serializeDesiredProjectConfig(desired),
    );
    const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
    await writeSecurityTestFile(
      root,
      "package.json",
      JSON.stringify({ ...manifest, workspaces: ["packages/*"] }),
    );
    await writeSecurityTestFile(
      root,
      "packages/shared/package.json",
      JSON.stringify({ name: "shared", private: true }),
    );
    await writeSecurityTestFile(root, "src/generated.ts", "export const configured = true;\n");
    lease = await acquireLock(root, new Logger({ quiet: true }));
  });
  afterEach(async () => {
    await lease.release();
    await rm(root, { recursive: true, force: true });
  });

  async function install() {
    const fixture = securityProcessFixture();
    let publication: DependencySecurityCreatePublication | undefined;
    fixture.beforeCommand = async (input, argv) => {
      if (sameSecurityRoot(input.cwd, root) && argv[0] === "install")
        expect(publication).toBeDefined();
      return undefined;
    };
    const result = await runDependencySecurityWithDependencies(
      {
        cwd: root,
        mode: "install",
        bootstrap: true,
        leaseOwner: lease.owner,
        policy: securityTestPolicy,
        createLifecycle: {
          kind: "existing-empty-root",
          beforeProjectInstall: async (published) => {
            publication = published;
            expect(published.workspaceRoots).toEqual([join(root, "packages", "shared")]);
            expect(published.manifestPaths).toEqual([
              "package.json",
              "packages/shared/package.json",
            ]);
            expect(
              JSON.parse(await readFile(join(root, SECURITY_JOURNAL_PATH), "utf8")).operationId,
            ).toBe(published.journalOperationId);
            await expect(published.completion.complete(await finalState())).rejects.toThrow(
              "verified installation",
            );
          },
        },
      },
      fixture.dependencies,
    );
    if (!publication) throw new Error("Creation callback was not invoked");
    expect(result.installedVerified).toBe(true);
    expect(JSON.parse(await readFile(join(root, SECURITY_JOURNAL_PATH), "utf8")).status).toBe(
      "INSTALLING",
    );
    expect(JSON.stringify(result)).not.toContain("completion");
    return publication;
  }

  async function finalState(
    transform?: (path: string, source: string) => string,
  ): Promise<{ plan: GenerationPlan; stateContent: string }> {
    const paths = [
      "package.json",
      "packages/shared/package.json",
      "ghostinit.config.json",
      ".env.local",
      "src/generated.ts",
    ];
    const files: PlannedFileInput[] = [];
    for (const path of paths) {
      const original =
        path === ".env.local"
          ? "AUTH_SECRET=REPLACE_WITH_SECRET\n"
          : await readFile(join(root, path), "utf8");
      const formatted = path.endsWith(".json")
        ? `${JSON.stringify(JSON.parse(original), null, 4)}\n`
        : original;
      files.push({
        logicalPath: path,
        physicalPath: path,
        content: transform?.(path, formatted) ?? formatted,
        owner: "root",
        lifecycle: "structured-merge",
        provenance: {
          renderer: "fixture",
          source: "fixture",
          capability: null,
          acceptance: [],
          contribution: [],
        },
      });
    }
    const plan = buildGenerationPlan({
      projectConfigHash: resolveDesiredProjectConfig(desired).configHash,
      files,
      secrets: [
        {
          kind: "generate-self-issued",
          reference: "auth-secret",
          environmentKey: "AUTH_SECRET",
          bytes: 32,
          encoding: "base64url",
          destinations: [{ physicalPath: ".env.local", field: "AUTH_SECRET", format: "dotenv" }],
        },
      ],
    });
    const stateFiles = Object.fromEntries(
      plan.files.map((file) => [
        file.physicalPath,
        createManagedFileStateFromPlan(
          file,
          file.physicalPath === ".env.local"
            ? "AUTH_SECRET=self-issued-unit-value\n"
            : file.content,
        ),
      ]),
    );
    const stateContent = `${JSON.stringify({ $schema: STATE_SCHEMA_URI, schemaVersion: 2, version: 2, configHash: plan.projectConfigHash, generationPlan: createGenerationPlanState(plan), generatedBy: "fixture", generatedAt: new Date().toISOString(), files: stateFiles, modules: [], procedures: [], pendingOperation: null, migrationHistory: [] }, null, 2)}\n`;
    return { plan, stateContent };
  }

  async function publishFinalState(final: Awaited<ReturnType<typeof finalState>>): Promise<void> {
    const tx = new FsTransaction(root);
    for (const file of final.plan.files)
      await tx.write(
        file.physicalPath,
        file.physicalPath === ".env.local" ? "AUTH_SECRET=self-issued-unit-value\n" : file.content,
      );
    await tx.write(".ghostinit/state.json", final.stateContent);
    await tx.commit();
  }

  it("retains the journal through formatting and secret/state finalization, then clears by lease and CAS", async () => {
    const publication = await install();
    const final = await finalState();
    await publishFinalState(final);
    await publication.completion.complete(final);
    await expect(readFile(join(root, SECURITY_JOURNAL_PATH))).rejects.toThrow();
    expect(await readFile(join(root, ".env.local"), "utf8")).toBe(
      "AUTH_SECRET=self-issued-unit-value\n",
    );
    expect(JSON.parse(await readFile(join(root, ".ghostinit.lock"), "utf8")).token).toBe(
      lease.owner.token,
    );
  });

  it("refuses semantic dependency edits even when the caller supplies a self-consistent new plan/state", async () => {
    const publication = await install();
    const final = await finalState((path, source) => {
      if (path !== "package.json") return source;
      const value = JSON.parse(source);
      value.dependencies["parent-package"] = "2.0.0";
      return JSON.stringify(value);
    });
    await publishFinalState(final);
    await expect(publication.completion.complete(final)).rejects.toThrow("semantics");
    expect(JSON.parse(await readFile(join(root, SECURITY_JOURNAL_PATH), "utf8")).status).toBe(
      "INSTALLING",
    );
  });

  it("keeps exact lock guards and refuses incomplete state attestation", async () => {
    const publication = await install();
    const final = await finalState();
    await publishFinalState(final);
    await expect(
      publication.completion.complete({
        ...final,
        stateContent: final.stateContent.replace(final.plan.planHash, "a".repeat(64)),
      }),
    ).rejects.toThrow("known final plan");
    await writeSecurityTestFile(root, "bun.lock", "racing lock edit\n");
    await expect(publication.completion.complete(final)).rejects.toThrow("changed");
    expect(JSON.parse(await readFile(join(root, SECURITY_JOURNAL_PATH), "utf8")).status).toBe(
      "INSTALLING",
    );
  });

  it("rejects ordinary-file and materialized-secret races after state attestation", async () => {
    const publication = await install();
    const final = await finalState();
    await publishFinalState(final);
    await writeSecurityTestFile(root, "src/generated.ts", "export const configured = false;\n");
    await expect(publication.completion.complete(final)).rejects.toThrow("changed");
    await writeSecurityTestFile(
      root,
      "src/generated.ts",
      final.plan.files.find((file) => file.physicalPath === "src/generated.ts")!.content,
    );
    await writeSecurityTestFile(root, ".env.local", "AUTH_SECRET=racing-change\n");
    await expect(publication.completion.complete(final)).rejects.toThrow(
      "attest final generated file bytes",
    );
    expect(JSON.parse(await readFile(join(root, SECURITY_JOURNAL_PATH), "utf8")).status).toBe(
      "INSTALLING",
    );
  });

  it("records a verified-cleanup finalization failure without claiming an unknown process tree", async () => {
    const publication = await install();
    await publication.completion.fail({ cleanupVerified: true, reason: "creation-finalization" });
    expect(JSON.parse(await readFile(join(root, SECURITY_JOURNAL_PATH), "utf8"))).toMatchObject({
      status: "FAILED",
      cleanupReason: "creation-finalization",
    });
    await expect(publication.completion.complete(await finalState())).rejects.toThrow(
      "verified installation",
    );
  });

  it("escalates late unverified process cleanup and never downgrades its barrier", async () => {
    const publication = await install();
    await publication.completion.fail({ cleanupVerified: false });
    await publication.completion.fail({ cleanupVerified: true, reason: "creation-finalization" });
    expect(JSON.parse(await readFile(join(root, SECURITY_JOURNAL_PATH), "utf8"))).toMatchObject({
      status: "CLEANUP_UNVERIFIED",
      cleanupReason: "process-tree",
    });
  });

  it("rejects deferred creation for an existing state or a non-create invocation", async () => {
    const fixture = securityProcessFixture();
    const createLifecycle = {
      kind: "existing-empty-root" as const,
      beforeProjectInstall: async () => {
        throw new Error("must not enter creation hook");
      },
    };
    await expect(
      runDependencySecurityWithDependencies(
        { cwd: root, mode: "fix", policy: securityTestPolicy, createLifecycle },
        fixture.dependencies,
      ),
    ).rejects.toThrow("limited to a live bootstrap");
    await writeSecurityTestFile(root, ".ghostinit/state.json", "{}\n");
    await expect(
      runDependencySecurityWithDependencies(
        {
          cwd: root,
          mode: "install",
          bootstrap: true,
          leaseOwner: lease.owner,
          policy: securityTestPolicy,
          createLifecycle,
        },
        fixture.dependencies,
      ),
    ).rejects.toThrow("no previous state");
    expect(fixture.commands).toHaveLength(0);
  });
});
