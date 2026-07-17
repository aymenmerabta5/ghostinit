import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { cwd } from "node:process";

const CLI = join(cwd(), "dist", "cli.js");

describe("ghostinit CLI", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "ghostinit-cli-"));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("prints version", () => {
    const result = spawnSync("node", [CLI, "--version"], { encoding: "utf-8" });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("ghostinit");
  });

  it("prints version as JSON envelope", () => {
    const result = spawnSync("node", [CLI, "--version", "--json"], { encoding: "utf-8" });
    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.success).toBe(true);
    expect(parsed.data).toEqual(expect.objectContaining({ name: "ghostinit" }));
  });

  it("prints help", () => {
    const result = spawnSync("node", [CLI, "--help"], { encoding: "utf-8" });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("create");
  });

  it("prints help as JSON envelope", () => {
    const result = spawnSync("node", [CLI, "--help", "--json"], { encoding: "utf-8" });
    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.success).toBe(true);
    expect(parsed.data).toHaveProperty("help");
  });

  it("rejects invalid project names", () => {
    const result = spawnSync(
      "node",
      [CLI, "create", "_bad", "--cwd", tmp, "--no-install", "--force", "--json"],
      {
        encoding: "utf-8",
      },
    );
    expect(result.status).not.toBe(0);
    expect(result.stdout).toContain("success");
  });

  it("rejects reserved module names with INVALID_ARGUMENTS", () => {
    spawnSync("node", [CLI, "create", "smoke", "--cwd", tmp, "--no-install", "--force"], {
      encoding: "utf-8",
    });
    const projectRoot = join(tmp, "smoke");
    const result = spawnSync(
      "node",
      [CLI, "add", "module", "api", "--cwd", projectRoot, "--json"],
      { encoding: "utf-8" },
    );
    expect(result.status).toBe(2);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.success).toBe(false);
    expect(parsed.error?.code).toBe("INVALID_ARGUMENTS");
  });

  it("creates a project with --no-install", () => {
    const result = spawnSync(
      "node",
      [CLI, "create", "smoke", "--cwd", tmp, "--no-install", "--force", "--json"],
      {
        encoding: "utf-8",
      },
    );
    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.data.projectName).toBe("smoke");
    const projectRoot = join(tmp, "smoke");
    expect(existsSync(join(projectRoot, "package.json"))).toBe(true);
    expect(existsSync(join(projectRoot, "apps", "web", "package.json"))).toBe(true);
    expect(existsSync(join(projectRoot, "packages", "auth", "src", "index.ts"))).toBe(true);
    expect(existsSync(join(projectRoot, ".env.example"))).toBe(true);
    expect(existsSync(join(projectRoot, ".env.local"))).toBe(true);
    expect(existsSync(join(projectRoot, ".env"))).toBe(false);
  });

  it("dry-run does not write real secrets to files", () => {
    const result = spawnSync(
      "node",
      [
        CLI,
        "create",
        "dryrunsecret",
        "--cwd",
        tmp,
        "--no-install",
        "--force",
        "--dry-run",
        "--json",
      ],
      { encoding: "utf-8" },
    );
    expect(result.status).toBe(0);
    if (existsSync(join(tmp, "dryrunsecret"))) {
      // Dry-run may leave directory if rollback is not fully possible; validate contents.
      const projectRoot = join(tmp, "dryrunsecret");
      const local = join(projectRoot, ".env.local");
      if (existsSync(local)) {
        const fs = require("node:fs");
        const content = fs.readFileSync(local, "utf-8");
        expect(content).toContain("REPLACE_WITH_A_STRONG_SECRET_AT_LEAST_32_CHARS");
        expect(content).toContain("REPLACE_WITH_A_STRONG_POSTGRES_PASSWORD");
      }
    }
  });

  it(" dry-run does not leave a project directory", () => {
    const result = spawnSync(
      "node",
      [CLI, "create", "dryruntest", "--cwd", tmp, "--no-install", "--force", "--dry-run", "--json"],
      { encoding: "utf-8" },
    );
    expect(result.status).toBe(0);
    expect(existsSync(join(tmp, "dryruntest"))).toBe(false);
  });

  it("adds a module to an existing project", () => {
    spawnSync("node", [CLI, "create", "smoke", "--cwd", tmp, "--no-install", "--force"], {
      encoding: "utf-8",
    });
    const projectRoot = join(tmp, "smoke");
    const result = spawnSync(
      "node",
      [CLI, "add", "module", "billing", "--cwd", projectRoot, "--json"],
      {
        encoding: "utf-8",
      },
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("success");
    expect(
      existsSync(join(projectRoot, "packages", "modules", "src", "billing", "domain", "types.ts")),
    ).toBe(true);
  });

  it("sync --check returns in-sync on a freshly created project", () => {
    spawnSync("node", [CLI, "create", "smoke", "--cwd", tmp, "--no-install", "--force"], {
      encoding: "utf-8",
    });
    const projectRoot = join(tmp, "smoke");
    const result = spawnSync("node", [CLI, "sync", "--cwd", projectRoot, "--check", "--json"], {
      encoding: "utf-8",
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("inSync");
  });

  it("sync --check detects external file edits", () => {
    spawnSync("node", [CLI, "create", "smoke", "--cwd", tmp, "--no-install", "--force"], {
      encoding: "utf-8",
    });
    const projectRoot = join(tmp, "smoke");
    const modulesIndex = join(projectRoot, "packages", "modules", "src", "index.ts");
    const fs = require("node:fs");
    fs.writeFileSync(modulesIndex, "// externally modified\n", "utf-8");
    const result = spawnSync("node", [CLI, "sync", "--cwd", projectRoot, "--check", "--json"], {
      encoding: "utf-8",
    });
    expect(result.status).not.toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.success).toBe(false);
    const drift = parsed.error?.drift ?? parsed.error?.details?.drift;
    expect(drift).toEqual(
      expect.arrayContaining([
        expect.stringContaining("packages/modules/src/index.ts: modified externally"),
      ]),
    );
  });

  it("sync no-op preserves generatedAt", () => {
    spawnSync("node", [CLI, "create", "smoke", "--cwd", tmp, "--no-install", "--force"], {
      encoding: "utf-8",
    });
    const projectRoot = join(tmp, "smoke");
    const statePath = join(projectRoot, ".ghostinit", "state.json");
    const fs = require("node:fs");
    const beforeGeneratedAt = JSON.parse(fs.readFileSync(statePath, "utf-8")).generatedAt;
    const result = spawnSync("node", [CLI, "sync", "--cwd", projectRoot, "--json"], {
      encoding: "utf-8",
    });
    expect(result.status).toBe(0);
    const afterGeneratedAt = JSON.parse(fs.readFileSync(statePath, "utf-8")).generatedAt;
    expect(afterGeneratedAt).toBe(beforeGeneratedAt);
  });

  it("duplicate add module is idempotent", () => {
    spawnSync("node", [CLI, "create", "smoke", "--cwd", tmp, "--no-install", "--force"], {
      encoding: "utf-8",
    });
    const projectRoot = join(tmp, "smoke");
    const result1 = spawnSync(
      "node",
      [CLI, "add", "module", "billing", "--cwd", projectRoot, "--json"],
      { encoding: "utf-8" },
    );
    expect(result1.status).toBe(0);
    expect(JSON.parse(result1.stdout).data?.noop).toBe(false);

    const result2 = spawnSync(
      "node",
      [CLI, "add", "module", "billing", "--cwd", projectRoot, "--json"],
      { encoding: "utf-8" },
    );
    expect(result2.status).toBe(0);
    expect(JSON.parse(result2.stdout).data?.noop).toBe(true);
  });

  it("creates a node-runnable project with --runtime node", () => {
    const result = spawnSync(
      "node",
      [
        CLI,
        "create",
        "nodeapp",
        "--cwd",
        tmp,
        "--no-install",
        "--force",
        "--runtime",
        "node",
        "--json",
      ],
      { encoding: "utf-8" },
    );
    expect(result.status).toBe(0);
    const projectRoot = join(tmp, "nodeapp");
    const fs = require("node:fs");
    const rootPackage = JSON.parse(fs.readFileSync(join(projectRoot, "package.json"), "utf-8"));
    expect(rootPackage.packageManager).toContain("npm@10");
    expect(rootPackage.scripts.dev).toContain("turbo run dev");
    const webPackage = JSON.parse(
      fs.readFileSync(join(projectRoot, "apps", "web", "package.json"), "utf-8"),
    );
    expect(webPackage.scripts.test).toContain("npm run");
  });
});
