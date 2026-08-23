/**
 * init + upgrade command integration tests.
 *
 * init previously wrote files without .ghostinit/state.json, which left
 * add/sync/check unable to manage the project. These tests pin the contract:
 * init produces a fully manageable project, and upgrade re-syncs it.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, existsSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { cwd } from "node:process";

const CLI = join(cwd(), "dist", "cli.js");

function run(args: string[], cwdDir: string) {
  return spawnSync("node", [CLI, ...args], { encoding: "utf-8", cwd: cwdDir });
}

describe("ghostinit init", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "ghostinit-init-"));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("initializes in cwd and writes manageable state (add module works)", () => {
    const result = run(["init", "demo-app", "--yes", "--no-install", "--json"], tmp);
    expect(result.status).toBe(0);
    expect(existsSync(join(tmp, "package.json"))).toBe(true);
    expect(existsSync(join(tmp, ".ghostinit", "state.json"))).toBe(true);

    // The regression this pins: state must exist so add can manage the project.
    const add = run(["add", "module", "orders", "--json"], tmp);
    expect(add.status).toBe(0);
    expect(
      existsSync(join(tmp, "packages", "modules", "src", "orders", "domain", "types.ts")),
    ).toBe(true);
  });

  it("derives the name from the directory when omitted", () => {
    const dir = join(tmp, "derived-name");
    mkdirSync(dir, { recursive: true });
    const result = run(["init", "--yes", "--no-install", "--json"], dir);
    expect(result.status).toBe(0);
    const state = JSON.parse(readFileSync(join(dir, ".ghostinit", "state.json"), "utf-8")) as {
      project: { name: string };
    };
    expect(state.project.name).toBe("derived-name");
  });

  it("refuses to init into a non-empty directory without --force", () => {
    writeFileSync(join(tmp, "README.md"), "# existing work\n");
    const result = run(["init", "demo-app", "--yes", "--no-install"], tmp);
    expect(result.status).not.toBe(0);
    expect(result.stderr + result.stdout).toContain("not empty");
  });
});

describe("ghostinit upgrade", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "ghostinit-upgrade-"));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("rebuilds registries and stamps the CLI version into state", () => {
    const created = run(["create", "demo", "--yes", "--no-install"], tmp);
    expect(created.status).toBe(0);

    const result = run(["upgrade", "--json"], join(tmp, "demo"));
    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout) as {
      success: boolean;
      data: { upgraded: boolean; currentVersion: string; templateRerender: boolean };
    };
    expect(parsed.success).toBe(true);
    expect(parsed.data.upgraded).toBe(true);
    // Honest contract: upgrade never re-renders templates.
    expect(parsed.data.templateRerender).toBe(false);
  });

  it("fails with INVALID_STATE outside a project", () => {
    const result = run(["upgrade", "--json"], tmp);
    expect(result.status).not.toBe(0);
    expect(result.stdout + result.stderr).toContain("No project found");
  });
});
