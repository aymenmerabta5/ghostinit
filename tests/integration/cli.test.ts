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
    expect(result.status).toBe(17);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.success).toBe(false);
    expect(parsed.error?.code).toBe("VALIDATION_ERROR");
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
      [CLI, "add", "module", "posts", "--cwd", projectRoot, "--json"],
      {
        encoding: "utf-8",
      },
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("success");
    expect(
      existsSync(join(projectRoot, "packages", "modules", "src", "posts", "domain", "types.ts")),
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
      [CLI, "add", "module", "notifications", "--cwd", projectRoot, "--json"],
      { encoding: "utf-8" },
    );
    expect(result1.status).toBe(0);
    expect(JSON.parse(result1.stdout).data?.noop).toBe(false);

    const result2 = spawnSync(
      "node",
      [CLI, "add", "module", "notifications", "--cwd", projectRoot, "--json"],
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

  it("creates agentic files and eve app", () => {
    const result = spawnSync(
      "node",
      [
        CLI,
        "create",
        "agentic-smoke",
        "--cwd",
        tmp,
        "--no-install",
        "--force",
        "--json",
        "--features",
        "eve",
      ],
      { encoding: "utf-8" },
    );
    expect(result.status).toBe(0);
    const projectRoot = join(tmp, "agentic-smoke");
    const fs = require("node:fs");

    // AGENTS.md + CLAUDE.md (no CURSOR.md per user)
    expect(existsSync(join(projectRoot, "AGENTS.md"))).toBe(true);
    expect(existsSync(join(projectRoot, "CLAUDE.md"))).toBe(true);
    expect(existsSync(join(projectRoot, "CURSOR.md"))).toBe(false);

    const agents = fs.readFileSync(join(projectRoot, "AGENTS.md"), "utf-8");
    expect(agents).toContain("Package Roles");
    expect(agents).toContain("Quality Gates");
    expect(agents).toContain("agentic-smoke");
    expect(agents).toContain("ghostinit check");
    expect(agents).toContain("apps/eve");

    // Cursor + windsurf
    expect(existsSync(join(projectRoot, ".cursor", "rules", "ghostinit.mdc"))).toBe(true);
    expect(existsSync(join(projectRoot, ".windsurf", "rules", "ghostinit.md"))).toBe(true);

    const cursorMdc = fs.readFileSync(
      join(projectRoot, ".cursor", "rules", "ghostinit.mdc"),
      "utf-8",
    );
    expect(cursorMdc).toContain("description:");
    expect(cursorMdc).toContain("globs:");
    expect(cursorMdc).toContain("alwaysApply:");

    // start-database.sh
    expect(existsSync(join(projectRoot, "start-database.sh"))).toBe(true);
    const startDb = fs.readFileSync(join(projectRoot, "start-database.sh"), "utf-8");
    expect(startDb).toContain("#!/usr/bin/env bash");
    expect(startDb).toContain("docker");

    // Eve app — real framework apps/eve/ not packages/eve
    expect(existsSync(join(projectRoot, "apps", "eve", "package.json"))).toBe(true);
    expect(existsSync(join(projectRoot, "apps", "eve", "agent", "agent.ts"))).toBe(true);
    expect(existsSync(join(projectRoot, "apps", "eve", "agent", "instructions.md"))).toBe(true);
    expect(
      existsSync(join(projectRoot, "apps", "eve", "agent", "tools", "scaffold_module.ts")),
    ).toBe(true);
    expect(
      existsSync(join(projectRoot, "apps", "eve", "agent", "skills", "ghostinit-workflow.md")),
    ).toBe(true);
    expect(existsSync(join(projectRoot, "apps", "eve", "agent", "channels", "eve.ts"))).toBe(true);
    expect(
      existsSync(join(projectRoot, "apps", "eve", "agent", "schedules", "sync-check.md")),
    ).toBe(true);

    const evePkg = JSON.parse(
      fs.readFileSync(join(projectRoot, "apps", "eve", "package.json"), "utf-8"),
    );
    expect(evePkg.dependencies.eve).toContain("0.24.6");

    const agentTs = fs.readFileSync(join(projectRoot, "apps", "eve", "agent", "agent.ts"), "utf-8");
    expect(agentTs).toContain("defineAgent");
    expect(agentTs).toContain("claude-sonnet-5");
  });
});

/**
 * Create-only flags must be rejected on every other command.
 *
 * `--apps` was missing from the gate, so `ghostinit sync --apps mobile` exited 0
 * having silently ignored the flag. An agent reading exit 0 concludes the app was
 * added. The gate is now driven by one list; this test pins every entry so the
 * list and the flags cannot drift apart again.
 */
describe("create-only flag gate", () => {
  const CREATE_ONLY: Array<[string, string]> = [
    ["--mode", "single"],
    ["--framework", "tanstack-start"],
    ["--billing", "stripe"],
    ["--features", "eve"],
    ["--database", "convex"],
    ["--apps", "mobile"],
  ];

  for (const command of ["sync", "add", "status", "check"]) {
    for (const [flag, value] of CREATE_ONLY) {
      it(`rejects ${flag} on '${command}'`, () => {
        const result = spawnSync("node", [CLI, command, flag, value, "--json"], {
          encoding: "utf-8",
        });
        expect(result.status).not.toBe(0);
        const parsed = JSON.parse(result.stdout);
        expect(parsed.success).toBe(false);
        expect(parsed.error.message).toContain(flag);
        expect(parsed.error.message).toContain("only be used with 'create'");
      });
    }
  }

  it("still accepts every create-only flag on 'create'", () => {
    const result = spawnSync(
      "node",
      [
        CLI,
        "create",
        "gate-demo",
        "--yes",
        "--no-install",
        "--dry-run",
        "--json",
        "--mode",
        "single",
        "--framework",
        "nextjs",
        "--billing",
        "stripe",
        "--features",
        "eve",
        "--database",
        "postgres",
        "--apps",
        "web",
      ],
      { encoding: "utf-8" },
    );
    expect(result.status).toBe(0);
  });
});
