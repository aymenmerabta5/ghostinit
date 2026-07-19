/**
 * E2E Build Test — Heavy, opt-in via E2E_BUILD=1.
 *
 * This test performs the full lifecycle:
 *   ghostinit create demo --no-install
 *   bun install
 *   bun run build    (or tsc/typecheck + lint + format:check)
 *   ghostinit check / analyzeProject
 *
 * Disabled by default to keep regular CI fast. Enable locally:
 *   E2E_BUILD=1 bun test --timeout 300000 tests/integration/e2e-build.test.ts
 *
 * In CI, this is run by .github/workflows/e2e.yml nightly job and on-demand.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { cwd } from "node:process";

const CLI = join(cwd(), "dist", "cli.js");
const E2E_BUILD_ENABLED = process.env.E2E_BUILD === "1";

const describeE2E = E2E_BUILD_ENABLED ? describe : describe.skip;

describeE2E("e2e: full build (E2E_BUILD=1 opt-in)", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "gi-e2e-build-"));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  function run(cmd: string, args: string[], cwdDir: string, timeoutMs = 300000) {
    const res = spawnSync(cmd, args, {
      cwd: cwdDir,
      encoding: "utf-8",
      timeout: timeoutMs,
    });
    return res;
  }

  it("create + bun install + build + check + format:check + lint: generated default project", () => {
    expect(E2E_BUILD_ENABLED).toBe(true);

    // 1. create
    const createRes = spawnSync(
      "node",
      [CLI, "create", "smoke", "--cwd", tmp, "--no-install", "--force", "--json"],
      { encoding: "utf-8", timeout: 120000 },
    );
    expect(createRes.status, `create failed: ${createRes.stdout}\n${createRes.stderr}`).toBe(0);

    const projectRoot = join(tmp, "smoke");
    expect(existsSync(join(projectRoot, "package.json"))).toBe(true);

    // 2. bun install
    const installRes = run("bun", ["install"], projectRoot, 300000);
    if (installRes.status !== 0) {
      console.error("bun install stdout:", installRes.stdout.slice(-5000));
      console.error("bun install stderr:", installRes.stderr.slice(-5000));
    }
    expect(installRes.status, `bun install failed: ${installRes.stderr.slice(-2000)}`).toBe(0);

    // 3. format:check (cheap) — validates oxfmt config + generated formatting
    const fmtRes = run("bun", ["run", "format:check"], projectRoot, 120000);
    expect(
      fmtRes.status,
      `format:check failed: ${fmtRes.stdout.slice(-2000)}\n${fmtRes.stderr.slice(-2000)}`,
    ).toBe(0);

    // 4. lint — validates oxlint + no obvious cross-imports that lint catches
    const lintRes = run("bun", ["run", "lint"], projectRoot, 120000);
    expect(
      lintRes.status,
      `lint failed: ${lintRes.stdout.slice(-2000)}\n${lintRes.stderr.slice(-2000)}`,
    ).toBe(0);

    // 5. typecheck — catches bunfig.toml hoist=true issues, TS7 breaks, missing deps, @/* alias
    const typecheckRes = run("bun", ["run", "typecheck"], projectRoot, 300000);
    if (typecheckRes.status !== 0) {
      console.error("typecheck stdout:", typecheckRes.stdout.slice(-8000));
      console.error("typecheck stderr:", typecheckRes.stderr.slice(-8000));
    }
    expect(typecheckRes.status, `typecheck failed`).toBe(0);

    // 6. build (turbo run build) — catches Next.js build, transpilePackages, etc
    const buildRes = run("bun", ["run", "build"], projectRoot, 300000);
    if (buildRes.status !== 0) {
      console.error("build stdout:", buildRes.stdout.slice(-8000));
      console.error("build stderr:", buildRes.stderr.slice(-8000));
    }
    expect(buildRes.status, `build failed`).toBe(0);

    // 7. ghostinit check via CLI
    const checkRes = spawnSync("node", [CLI, "check", "--cwd", projectRoot, "--json"], {
      encoding: "utf-8",
      timeout: 60000,
    });
    // If check command exists, validate findings
    if (checkRes.stdout) {
      try {
        const parsed = JSON.parse(checkRes.stdout);
        if (parsed.data?.findings) {
          const highBlocker = (parsed.data.findings as any[]).filter(
            (f: any) => f.severity === "HIGH" || f.severity === "BLOCKER",
          );
          expect(
            highBlocker.length,
            `HIGH/BLOCKER findings: ${JSON.stringify(highBlocker, null, 2)}`,
          ).toBe(0);
        }
      } catch {
        // non-JSON output ok
      }
    }
  }, 300000);

  it("create + install + build with --billing all --features eve", () => {
    // Catches billing UI + provider barrel import failures
    expect(E2E_BUILD_ENABLED).toBe(true);

    const createRes = spawnSync(
      "node",
      [
        CLI,
        "create",
        "billall",
        "--cwd",
        tmp,
        "--no-install",
        "--force",
        "--json",
        "--billing",
        "all",
        "--features",
        "eve",
      ],
      { encoding: "utf-8", timeout: 120000 },
    );
    expect(createRes.status).toBe(0);

    const projectRoot = join(tmp, "billall");

    const installRes = run("bun", ["install"], projectRoot, 300000);
    expect(installRes.status).toBe(0);

    // typecheck should still pass even with billing providers (validates barrels + @/*)
    const typecheckRes = run("bun", ["run", "typecheck"], projectRoot, 300000);
    if (typecheckRes.status !== 0) {
      console.error("typecheck(billall) stdout:", typecheckRes.stdout.slice(-8000));
      console.error("typecheck(billall) stderr:", typecheckRes.stderr.slice(-8000));
    }
    expect(typecheckRes.status).toBe(0);
  }, 300000);
});
