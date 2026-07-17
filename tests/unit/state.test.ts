import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadState, saveState } from "../../src/lib/state";
import type { ProjectConfig } from "../../src/lib/config";

describe("state", () => {
  let root: string;
  const config: ProjectConfig = {
    name: "demo",
    runtime: "bun",
    version: "0.1.0",
    generatedAt: new Date().toISOString(),
  };

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "ghostinit-state-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("saves and loads project state", async () => {
    await saveState(root, config, [], ["identity"]);
    const statePath = join(root, ".ghostinit", "state.json");
    expect(existsSync(statePath)).toBe(true);
    const state = await loadState(root);
    expect(state).not.toBeUndefined();
    expect(state).toEqual(
      expect.objectContaining({
        project: expect.objectContaining({ name: "demo" }),
        modules: ["identity"],
      }),
    );
  });

  it("returns undefined when state does not exist", async () => {
    const state = await loadState(join(root, "missing"));
    expect(state).toBeUndefined();
  });

  it("rejects states with a non-hex hash", async () => {
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

    const state = await loadState(root);
    expect(state).toBeUndefined();
  });
});
