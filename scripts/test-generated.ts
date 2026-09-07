/**
 * Generate real projects, install them, and run their own typecheck + lint.
 *
 * This is the gate that the unit suite structurally cannot be. Templates are
 * assembled as string arrays, so `bun run check` on the host never sees the
 * OUTPUT: the host build stayed green while generated projects failed to
 * install (invented dependency versions), failed to typecheck (`baseUrl` on
 * TS6, packages with no `exports`, UI components that were never emitted) and
 * failed to lint (an `.oxlintrc.json` extending a file that did not exist).
 *
 * `tests/unit/generation-matrix.test.ts` catches the cheap structural classes in
 * milliseconds. This catches everything that only a real dependency resolution
 * and a real `tsc` can see. It is slow — each corner is a full `bun install`.
 *
 *   bun run test:generated              # default corners (see DEFAULT_CORNERS)
 *   bun run test:generated -- --all     # every corner
 *   bun run test:generated -- --workers # Cloudflare Worker build + dry-run corners
 *   bun run test:generated -- --only next-monorepo,single-next
 *   bun run test:generated -- --keep    # leave the temp projects on disk
 */

import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  rmSync,
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

interface Corner {
  id: string;
  args: string[];
  /** Corners with known, documented failures — reported but not fatal. */
  expectedFailures?: Array<"typecheck" | "lint">;
  note?: string;
  worker?: "next" | "tanstack";
}

const CORNERS: Corner[] = [
  { id: "next-monorepo", args: ["--database", "postgres", "--billing", "stripe,chargily"] },
  {
    id: "single-next",
    args: ["--mode", "single", "--database", "postgres", "--billing", "stripe"],
  },
  {
    id: "next-convex",
    args: ["--database", "convex", "--billing", "stripe,chargily,paddle,polar"],
  },
  { id: "single-convex", args: ["--mode", "single", "--database", "convex", "--billing", "polar"] },
  {
    id: "tanstack",
    args: ["--framework", "tanstack-start", "--database", "postgres", "--billing", "stripe"],
  },
  {
    id: "no-billing",
    args: ["--database", "postgres", "--billing", "none", "--features", "eve,i18n"],
  },
  { id: "mobile", args: ["--apps", "web,mobile", "--database", "postgres", "--billing", "stripe"] },
  {
    id: "desktop",
    args: ["--apps", "web,desktop", "--database", "postgres", "--billing", "stripe"],
  },
  {
    id: "single-tanstack",
    args: ["--mode", "single", "--framework", "tanstack-start", "--database", "postgres"],
  },
  {
    id: "features",
    args: [
      "--database",
      "postgres",
      "--billing",
      "none",
      "--with-eve",
      "--with-i18n",
      "--with-pdf",
      "--with-messaging",
      "--deploy",
      "docker",
    ],
  },
  {
    id: "cloudflare-next",
    args: ["--database", "convex", "--billing", "none", "--deploy", "cloudflare"],
    worker: "next",
  },
  {
    id: "cloudflare-tanstack",
    args: [
      "--framework",
      "tanstack-start",
      "--database",
      "convex",
      "--billing",
      "none",
      "--deploy",
      "cloudflare",
    ],
    worker: "tanstack",
  },
  {
    id: "cloudflare-single-next",
    args: [
      "--mode",
      "single",
      "--database",
      "convex",
      "--billing",
      "none",
      "--deploy",
      "cloudflare",
    ],
    worker: "next",
  },
  {
    id: "cloudflare-single-tanstack",
    args: [
      "--mode",
      "single",
      "--framework",
      "tanstack-start",
      "--database",
      "convex",
      "--billing",
      "none",
      "--deploy",
      "cloudflare",
    ],
    worker: "tanstack",
  },
];

/** Kept small on purpose: CI blocks on these, the rest are opt-in via --all. */
const DEFAULT_CORNERS = ["next-monorepo", "single-next"];

const CLI = resolve(import.meta.dirname ?? ".", "../dist/cli.js");

function parseArgs(argv: string[]): { ids: string[]; keep: boolean } {
  const keep = argv.includes("--keep");
  if (argv.includes("--all")) return { ids: CORNERS.map((c) => c.id), keep };
  if (argv.includes("--workers")) {
    return { ids: CORNERS.filter((c) => c.worker).map((c) => c.id), keep };
  }
  const onlyIdx = argv.indexOf("--only");
  if (onlyIdx !== -1 && argv[onlyIdx + 1]) {
    return {
      ids: argv[onlyIdx + 1]
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      keep,
    };
  }
  return { ids: DEFAULT_CORNERS, keep };
}

function run(
  cmd: string,
  args: string[],
  cwd: string,
  extraEnv: Record<string, string> = {},
): { ok: boolean; output: string } {
  try {
    const output = execFileSync(cmd, args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      shell: true,
      timeout: 20 * 60 * 1000,
      env: { ...process.env, ...extraEnv },
    });
    return { ok: true, output };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    return { ok: false, output: `${e.stdout ?? ""}\n${e.stderr ?? ""}\n${e.message ?? ""}` };
  }
}

function readDevVars(projectDir: string): Record<string, string> {
  const path = join(projectDir, ".dev.vars");
  if (!existsSync(path)) return {};
  const values: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
    if (match) values[match[1]] = match[2];
  }
  return values;
}

function findSecretInWorkerArtifacts(appDir: string, secret: string): string | undefined {
  if (!secret) return undefined;
  const roots = [".open-next", "dist", ".output"]
    .map((name) => join(appDir, name))
    .filter(existsSync);
  const visit = (dir: string): string | undefined => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        const found = visit(path);
        if (found) return found;
      } else if (entry.isFile() && statSync(path).size <= 64 * 1024 * 1024) {
        if (readFileSync(path).includes(Buffer.from(secret))) return path;
      }
    }
    return undefined;
  };
  for (const root of roots) {
    const found = visit(root);
    if (found) return found;
  }
  return undefined;
}

function firstErrors(output: string, limit = 8): string {
  const lines = output
    .split("\n")
    .filter((l) => /error TS|error:|invalid config|Failed:/.test(l))
    .slice(0, limit);
  return lines.length
    ? lines.map((l) => `      ${l.trim()}`).join("\n")
    : "      (no error lines captured)";
}

async function main(): Promise<void> {
  if (!existsSync(CLI)) {
    console.error(`dist/cli.js not found at ${CLI} — run \`bun run build\` first.`);
    process.exit(1);
  }

  const { ids, keep } = parseArgs(process.argv.slice(2));
  const selected = CORNERS.filter((c) => ids.includes(c.id));
  const missing = ids.filter((id) => !CORNERS.some((c) => c.id === id));
  if (missing.length) {
    console.error(`Unknown corner(s): ${missing.join(", ")}`);
    console.error(`Available: ${CORNERS.map((c) => c.id).join(", ")}`);
    process.exit(1);
  }

  const root = mkdtempSync(join(tmpdir(), "ghostinit-generated-"));
  console.log(`Verifying ${selected.length} corner(s) in ${root}\n`);

  const results: Array<{
    id: string;
    step: string;
    ok: boolean;
    expected: boolean;
    detail: string;
  }> = [];
  let hardFailures = 0;

  for (const corner of selected) {
    console.log(`── ${corner.id} ${corner.note ? `(${corner.note})` : ""}`);
    const gen = run(
      "node",
      [CLI, "create", corner.id, "--yes", "--no-install", "--cwd", root, ...corner.args],
      root,
    );
    if (!gen.ok) {
      console.log("   generate: FAIL");
      results.push({
        id: corner.id,
        step: "generate",
        ok: false,
        expected: false,
        detail: gen.output,
      });
      hardFailures++;
      continue;
    }
    console.log("   generate: ok");

    const dir = join(root, corner.id);

    const install = run("bun", ["install"], dir);
    console.log(`   install:   ${install.ok ? "ok" : "FAIL"}`);
    if (!install.ok) {
      results.push({
        id: corner.id,
        step: "install",
        ok: false,
        expected: false,
        detail: install.output,
      });
      hardFailures++;
      continue;
    }

    for (const step of ["typecheck", "lint"] as const) {
      const res = run("bun", ["run", step], dir);
      const expected = corner.expectedFailures?.includes(step) ?? false;
      const label = res.ok ? "ok" : expected ? "FAIL (known gap)" : "FAIL";
      console.log(`   ${step.padEnd(9)} ${label}`);
      if (!res.ok) {
        results.push({ id: corner.id, step, ok: false, expected, detail: res.output });
        if (!expected) hardFailures++;
      }
    }

    if (corner.worker) {
      const appDir = existsSync(join(dir, "apps", "web")) ? join(dir, "apps", "web") : dir;
      const buildScript = corner.worker === "next" ? "build:worker" : "build";
      const buildEnv = readDevVars(appDir);
      const workerBuild = run("bun", ["run", buildScript], appDir, buildEnv);
      console.log(`   worker build: ${workerBuild.ok ? "ok" : "FAIL"}`);
      if (!workerBuild.ok) {
        results.push({
          id: corner.id,
          step: "worker-build",
          ok: false,
          expected: false,
          detail: workerBuild.output,
        });
        hardFailures++;
        continue;
      }

      const secret = buildEnv.BETTER_AUTH_SECRET ?? buildEnv.POSTGRES_PASSWORD ?? "";
      const leakedArtifact = findSecretInWorkerArtifacts(appDir, secret);
      console.log(`   secret scan:  ${leakedArtifact ? "FAIL" : "ok"}`);
      if (leakedArtifact) {
        results.push({
          id: corner.id,
          step: "worker-secret-scan",
          ok: false,
          expected: false,
          detail: `Secret-like local build value was embedded in ${leakedArtifact}`,
        });
        hardFailures++;
        continue;
      }

      const dryRun = run("bunx", ["wrangler", "deploy", "--dry-run"], appDir);
      console.log(`   worker dry:   ${dryRun.ok ? "ok" : "FAIL"}`);
      if (!dryRun.ok) {
        results.push({
          id: corner.id,
          step: "worker-dry-run",
          ok: false,
          expected: false,
          detail: dryRun.output,
        });
        hardFailures++;
      }
    }
  }

  console.log("\n──────── summary ────────");
  if (results.length === 0) {
    console.log("All checked corners generated, installed, typechecked and linted cleanly.");
  }
  for (const r of results) {
    console.log(`${r.expected ? "KNOWN" : "FAIL "}  ${r.id} :: ${r.step}`);
    console.log(firstErrors(r.detail));
  }

  if (!keep) rmSync(root, { recursive: true, force: true });
  else console.log(`\nLeft projects in ${root}`);

  if (hardFailures > 0) {
    console.error(`\n${hardFailures} unexpected failure(s).`);
    process.exit(1);
  }
  console.log("\nNo unexpected failures.");
}

await main();
