import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  mkdtempSync,
  rmSync,
  existsSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  copyFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createManagedFileState, loadState, saveState } from "../../src/lib/state";
import type { ProjectConfig } from "../../src/lib/config";
import { IncompatibleSchemaError } from "../../src/lib/errors";

describe("state", () => {
  let root: string;
  const config: ProjectConfig = {
    name: "demo",
    runtime: "bun",
    version: "0.1.0",
    mode: "monorepo",
    billing: [],
    features: [],
    database: "postgres",
    framework: "nextjs",
    generatedAt: new Date().toISOString(),
  };

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "ghostinit-state-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("saves and loads project state", async () => {
    writeFileSync(join(root, "generated.ts"), "export const generated = true;\n");
    await saveState(root, config, [], ["identity"], [], {
      managedFiles: [createManagedFileState("generated.ts", "export const generated = true;\n")],
    });
    const statePath = join(root, ".ghostinit", "state.json");
    expect(existsSync(statePath)).toBe(true);
    expect(existsSync(join(root, "ghostinit.config.json"))).toBe(true);
    const persisted = JSON.parse(readFileSync(statePath, "utf8"));
    expect(persisted.schemaVersion).toBe(2);
    expect(persisted.project).toBeUndefined();
    expect(persisted.checksums).toBeUndefined();
    expect(persisted.files["generated.ts"]).toEqual(
      expect.objectContaining({ path: "generated.ts", contentHash: expect.any(String) }),
    );
    const desired = JSON.parse(readFileSync(join(root, "ghostinit.config.json"), "utf8"));
    expect(desired.schemaVersion).toBe(2);
    const state = await loadState(root);
    expect(state).not.toBeUndefined();
    expect(state).toEqual(
      expect.objectContaining({
        project: expect.objectContaining({ name: "demo" }),
        modules: ["identity"],
      }),
    );
  });

  it("hydrates the frozen V1 state without mutating it", async () => {
    mkdirSync(join(root, ".ghostinit"), { recursive: true });
    copyFileSync(
      join(import.meta.dir, "..", "fixtures", "compatibility", "v1-state.json"),
      join(root, ".ghostinit", "state.json"),
    );
    const before = readFileSync(join(root, ".ghostinit", "state.json"), "utf8");
    const state = await loadState(root);
    expect(state?.sourceVersion).toBe(1);
    expect(state?.project.name).toBe("v1-fixture");
    expect(state?.files["packages/modules/src/index.ts"]?.contentHash).toHaveLength(64);
    expect(state?.files["packages/modules/src/index.ts"]?.provenance.capability).toBeNull();
    expect(readFileSync(join(root, ".ghostinit", "state.json"), "utf8")).toBe(before);
    expect(existsSync(join(root, "ghostinit.config.json"))).toBe(false);
  });

  it("does not infer legacy capability provenance from a filename", () => {
    const file = createManagedFileState(
      "packages/billing/src/webhooks/stripe.ts",
      "export const webhook = true;\n",
    );
    expect(file.provenance.capability).toBeNull();
    expect(file.provenance.acceptance).toEqual([]);
    expect(file.provenance.contribution).toEqual([]);
  });

  it("returns undefined when state does not exist", async () => {
    const state = await loadState(join(root, "missing"));
    expect(state).toBeUndefined();
  });

  it("reports an incompatible schema instead of treating invalid state as missing", async () => {
    const statePath = join(root, ".ghostinit", "state.json");
    mkdirSync(join(statePath, ".."), { recursive: true });
    writeFileSync(
      statePath,
      JSON.stringify({
        version: 1,
        project: config,
        checksums: { "a.ts": { algorithm: "sha256", hash: "bad", size: 1 } },
        generatedBy: "0.1.0",
        generatedAt: new Date().toISOString(),
        modules: [],
        procedures: [],
      }),
      "utf-8",
    );

    await expect(loadState(root)).rejects.toBeInstanceOf(IncompatibleSchemaError);
  });
});
