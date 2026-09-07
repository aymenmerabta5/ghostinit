/**
 * E2E Generated Project Tests — NO bun install required.
 * Validates file tree snapshot, turbo.json globalEnv, package.json deps,
 * and that analyzeProject (ghostinit check) passes on freshly generated projects.
 *
 * Fast: ~2-5s per project creation with --no-install.
 * Run: bun test --timeout 100000 tests/integration/e2e-generated.test.ts
 */
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { spawnSync } from "node:child_process";
import { cwd } from "node:process";

const CLI = join(cwd(), "dist", "cli.js");
const BUN_EXECUTABLE = process.execPath;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createProject(tmp: string, name: string, extraArgs: string[] = []): string {
  const result = spawnSync(
    BUN_EXECUTABLE,
    [
      CLI,
      "create",
      name,
      "--cwd",
      tmp,
      "--no-install",
      "--force",
      "--runtime",
      "bun",
      "--json",
      ...extraArgs,
    ],
    { encoding: "utf-8", maxBuffer: 16 * 1024 * 1024, shell: false },
  );
  if (result.status !== 0) {
    throw new Error(
      `create ${name} failed (status ${result.status}): stdout=${result.stdout} stderr=${result.stderr}`,
    );
  }
  return join(tmp, name);
}

function collectFilesRecursive(dir: string, base: string, out: string[] = []): string[] {
  let entries: ReturnType<typeof readdirSync>;
  try {
    entries = readdirSync(dir) as any;
  } catch {
    return out;
  }
  for (const entry of entries as any) {
    const full = join(dir, entry.name ?? entry);
    try {
      const st = statSync(full);
      if (st.isDirectory()) {
        collectFilesRecursive(full, base, out);
      } else {
        out.push(relative(base, full).replace(/\\/g, "/"));
      }
    } catch {
      // ignore broken symlink etc
    }
  }
  return out;
}

function readJson(filePath: string): any {
  return JSON.parse(readFileSync(filePath, "utf-8"));
}

// Minimal expected top-level files that MUST exist in every generated project (monorepo, no billing)
const EXPECTED_MINIMAL_FILES = [
  "package.json",
  "turbo.json",
  "bunfig.toml",
  ".env.example",
  ".env.local",
  "tsconfig.json",
  ".gitignore",
  ".oxlintrc.json",
  ".oxfmtrc.json",
  "docker-compose.yml",
  "start-database.sh",
  "AGENTS.md",
  "CLAUDE.md",
  "apps/web/package.json",
  "apps/web/tsconfig.json",
  "apps/web/src/app/layout.tsx",
  "apps/web/src/app/page.tsx",
  "apps/web/src/app/api/health/route.ts",
  "packages/auth/package.json",
  "packages/auth/src/index.ts",
  "packages/database/package.json",
  "packages/database/src/index.ts",
  "packages/api/package.json",
  "packages/ui/package.json",
  "packages/modules/package.json",
  "packages/config/package.json",
  "packages/kernel/package.json",
  "packages/observability/package.json",
  "packages/email/package.json",
  "packages/services/package.json",
  "packages/typescript-config/base.json",
  "packages/typescript-config/nextjs.json",
  ".github/workflows/ci.yml",
];

// ---------------------------------------------------------------------------

describe("e2e: generated project structure (no install)", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "gi-e2e-struct-"));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("generates all expected core files (minimal snapshot)", () => {
    const projectRoot = createProject(tmp, "demo");

    for (const rel of EXPECTED_MINIMAL_FILES) {
      const full = join(projectRoot, rel);
      expect(existsSync(full), `missing expected file: ${rel}`).toBe(true);
    }
  });

  it("generates expected packages/*/src layout", () => {
    const projectRoot = createProject(tmp, "demo");

    const projectFiles = collectFilesRecursive(projectRoot, projectRoot).sort();

    // At least 150 files for standard generation
    expect(projectFiles.length).toBeGreaterThan(100);

    // Snapshot: packages that must exist
    const expectedPackages = [
      "api",
      "auth",
      "config",
      "contracts",
      "database",
      "email",
      "kernel",
      "modules",
      "observability",
      "services",
      "ui",
      "analytics",
      "testing",
      "workflows",
    ];
    for (const pkg of expectedPackages) {
      const exists = projectFiles.some((f) => f.startsWith(`packages/${pkg}/`));
      expect(exists, `package ${pkg} should have files`).toBe(true);
    }

    // File tree does not include .env (secret leak), but includes .env.example/.env.local
    expect(projectFiles.includes(".env")).toBe(false);
    expect(projectFiles.includes(".env.example")).toBe(true);
    expect(projectFiles.includes(".env.local")).toBe(true);
  });

  it("sorted file list is stable (drift detection) — no unexpected deletions", () => {
    const projectRoot = createProject(tmp, "demo");
    const files = collectFilesRecursive(projectRoot, projectRoot)
      .map((f) => f.replace(/\\/g, "/"))
      .sort();

    // Persist drift guard: the count should not drop significantly without reason.
    // Known baseline for default bun+postgres generation (as of task date).
    // If this fails, investigate intentionally: missing template or new file filtered.
    // Minimum threshold prevents accidental mass deletion in templates.
    expect(files.length).toBeGreaterThanOrEqual(150);

    // Ensure critical paths are not accidentally renamed
    const critical = [
      "apps/web/src/lib/auth-client.ts",
      "packages/typescript-config/base.json",
      "packages/database/src/schema/index.ts",
    ];
    for (const rel of critical) {
      expect(files.includes(rel), `critical file lost: ${rel}`).toBe(true);
    }
  });

  it("turbo.json tracks every emitted environment key without duplicate cache inputs", () => {
    const projectRoot = createProject(tmp, "demo");
    const turbo = readJson(join(projectRoot, "turbo.json"));
    const globalEnv: string[] = turbo.globalEnv ?? [];
    const passThroughEnv: string[] = turbo.tasks?.start?.passThroughEnv ?? [];
    const emittedKeys = [".env.example", ".env.local"].flatMap((name) =>
      readFileSync(join(projectRoot, name), "utf8")
        .split(/\r?\n/)
        .map((line) => line.match(/^([A-Z][A-Z0-9_]*)=/)?.[1])
        .filter((key): key is string => key !== undefined),
    );

    expect(globalEnv.length).toBeGreaterThan(0);
    expect(new Set(globalEnv).size).toBe(globalEnv.length);
    for (const key of emittedKeys) {
      const coveredByWildcard = globalEnv.some(
        (candidate) => candidate.endsWith("*") && key.startsWith(candidate.slice(0, -1)),
      );
      expect(
        globalEnv.includes(key) || passThroughEnv.includes(key) || coveredByWildcard,
        `turbo.json does not track emitted environment key: ${key}`,
      ).toBe(true);
    }
    expect(globalEnv).toContain("NEXT_PUBLIC_*");
    expect(globalEnv.some((key) => key.startsWith("VITE_"))).toBe(false);
    expect(globalEnv.some((key) => key.startsWith("EXPO_PUBLIC_"))).toBe(false);
    expect(globalEnv.some((key) => key.startsWith("DESKTOP_"))).toBe(false);
    expect(globalEnv.some((key) => key.startsWith("ELECTRON_"))).toBe(false);
    for (const disabledKey of [
      "STRIPE_SECRET_KEY",
      "CHARGILY_API_KEY",
      "PADDLE_API_KEY",
      "POLAR_ACCESS_TOKEN",
      "STORAGE_DRIVER",
      "NEXT_PUBLIC_WS_URL",
      "NOTIFICATION_TOKEN_ENCRYPTION_KEY",
      "AI_GATEWAY_API_KEY",
      "JOB_WORKER_ID",
    ]) {
      expect(globalEnv, `disabled capability leaked ${disabledKey}`).not.toContain(disabledKey);
    }
  });

  it("turbo.json globalEnv includes every selected billing and analytics group", () => {
    const projectRoot = createProject(tmp, "demo", ["--billing", "all", "--with-analytics"]);
    const turbo = readJson(join(projectRoot, "turbo.json"));
    const env: string[] = turbo.globalEnv ?? [];

    const groups: Record<string, string[]> = {
      stripe: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"],
      chargily: ["CHARGILY_API_KEY", "CHARGILY_SECRET_KEY", "CHARGILY_MODE"],
      paddle: ["PADDLE_API_KEY", "PADDLE_WEBHOOK_SECRET", "NEXT_PUBLIC_PADDLE_CLIENT_TOKEN"],
      polar: ["POLAR_ACCESS_TOKEN", "POLAR_WEBHOOK_SECRET", "POLAR_ORG_ID"],
      posthog: ["POSTHOG_HOST", "POSTHOG_API_KEY", "NEXT_PUBLIC_POSTHOG_KEY"],
    };

    for (const [group, vars] of Object.entries(groups)) {
      for (const v of vars) {
        expect(env.includes(v), `[${group}] missing in globalEnv: ${v}`).toBe(true);
      }
    }
  });

  it("root and app package.json are parseable and have expected scripts", () => {
    const projectRoot = createProject(tmp, "demo");

    const rootPkg = readJson(join(projectRoot, "package.json"));
    expect(rootPkg.name).toBe("demo");
    expect(rootPkg.private).toBe(true);
    expect(rootPkg.scripts.build).toBeDefined();
    expect(rootPkg.scripts.dev).toBeDefined();
    expect(rootPkg.scripts.typecheck).toBeDefined();
    expect(rootPkg.workspaces).toContain("apps/*");
    expect(rootPkg.workspaces).toContain("packages/*");
    // Prepublication generation must not resolve an unpublished CLI from the registry.
    expect(rootPkg.dependencies?.ghostinit).toBeUndefined();
    expect(rootPkg.devDependencies?.ghostinit).toBeUndefined();

    const webPkg = readJson(join(projectRoot, "apps/web/package.json"));
    expect(webPkg.name).toBeDefined();
    expect(webPkg.scripts).toBeDefined();

    const authPkg = readJson(join(projectRoot, "packages/auth/package.json"));
    expect(authPkg.name).toContain("auth");

    // No missing dep that would be `undefined` after parse
    expect(() => JSON.stringify(rootPkg)).not.toThrow();
  });

  it("all package.json files are valid JSON with sorted deps", () => {
    const projectRoot = createProject(tmp, "demo");
    const files = collectFilesRecursive(projectRoot, projectRoot).filter((f) =>
      f.endsWith("package.json"),
    );

    expect(files.length).toBeGreaterThan(10);

    for (const rel of files) {
      const full = join(projectRoot, rel);
      let parsed: any;
      try {
        parsed = readJson(full);
      } catch (e) {
        throw new Error(`Invalid JSON in ${rel}: ${(e as Error).message}`);
      }
      expect(parsed.name, `${rel} missing name`).toBeDefined();
      expect(parsed.scripts, `${rel} missing scripts or empty`).toBeDefined();

      // Deps sorted check
      if (parsed.dependencies) {
        const keys = Object.keys(parsed.dependencies);
        const sorted = [...keys].sort((a, b) => a.localeCompare(b));
        expect(keys, `dependencies not sorted in ${rel}`).toEqual(sorted);
      }
    }
  });

  it("ghostinit check (analyzeProject) returns no HIGH/BLOCKER on freshly generated project", async () => {
    const projectRoot = createProject(tmp, "demo");

    // Dynamically import ESM analyzer to avoid CJS issues
    const { analyzeProject } = await import("../../src/lib/architecture/index.ts");
    const findings = await analyzeProject(projectRoot);

    const blocking = findings.filter((f) => f.severity === "HIGH" || f.severity === "BLOCKER");

    if (blocking.length > 0) {
      const msg = blocking.map((f) => `${f.severity} ${f.id} ${f.file}: ${f.message}`).join("\n");
      // Soft-fail with details rather than opaque count
      expect(blocking, `Unexpected HIGH/BLOCKER architecture findings:\n${msg}`).toEqual([]);
    }
  });

  it("ghostinit check via CLI --json reports no HIGH/BLOCKER", () => {
    const projectRoot = createProject(tmp, "demo");

    const result = spawnSync(BUN_EXECUTABLE, [CLI, "check", "--cwd", projectRoot, "--json"], {
      encoding: "utf-8",
      maxBuffer: 16 * 1024 * 1024,
      shell: false,
    });
    expect(result.error).toBeUndefined();
    expect(result.status, `check failed: ${result.stdout}\n${result.stderr}`).toBe(0);

    let parsed: {
      $schema?: unknown;
      schemaVersion?: unknown;
      success?: unknown;
      exitCode?: unknown;
      meta?: { command?: unknown; durationMs?: unknown };
      data?: { findings?: Array<{ severity?: unknown }>; summary?: Record<string, unknown> };
    };
    try {
      parsed = JSON.parse(result.stdout);
    } catch (error) {
      throw new Error(
        `check did not emit valid JSON: ${error instanceof Error ? error.message : String(error)}\n${result.stdout}`,
      );
    }

    expect(parsed).toMatchObject({
      $schema: "https://ghostinit.dev/schemas/json-envelope.schema.json",
      schemaVersion: 2,
      success: true,
      exitCode: 0,
      meta: { command: "check" },
    });
    expect(typeof parsed.meta?.durationMs).toBe("number");
    expect(Array.isArray(parsed.data?.findings)).toBe(true);
    expect(parsed.data?.summary).toMatchObject({ blockers: 0, highs: 0 });
    const highBlocker = (parsed.data?.findings ?? []).filter(
      (finding) => finding.severity === "HIGH" || finding.severity === "BLOCKER",
    );
    expect(highBlocker).toEqual([]);
  });

  it("create with --billing all includes billing package files", () => {
    const projectRoot = createProject(tmp, "billdemo", ["--billing", "all"]);

    // Billing package should exist when all providers selected
    const billingFiles = collectFilesRecursive(join(projectRoot, "packages/billing"), projectRoot);
    expect(billingFiles.length).toBeGreaterThan(0);

    const envExample = readFileSync(join(projectRoot, ".env.example"), "utf-8");
    // When billing=all, env.example should contain lines for each provider
    expect(envExample).toContain("STRIPE_SECRET_KEY");
    expect(envExample).toContain("CHARGILY_API_KEY");
    expect(envExample).toContain("PADDLE_API_KEY");
    expect(envExample).toContain("POLAR_ACCESS_TOKEN");
  });

  it("create with --features eve generates eve app", () => {
    const projectRoot = createProject(tmp, "evedemo", ["--features", "eve"]);

    expect(existsSync(join(projectRoot, "apps/eve/package.json"))).toBe(true);
    expect(existsSync(join(projectRoot, "apps/eve/agent/agent.ts"))).toBe(true);
  });
});
