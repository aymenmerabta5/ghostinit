import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runtime as toolchainRuntime } from "../../packages/versions/src/index.js";
import type { ProjectConfig } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function content(files: ReadonlyArray<{ path: string; content: string }>, path: string): string {
  const result = files.find((file) => file.path === path)?.content;
  if (result === undefined) throw new Error(`Missing generated file: ${path}`);
  return result;
}

describe("Next deployment runtime commands", () => {
  for (const mode of ["monorepo", "single"] as const) {
    for (const runtime of ["bun", "node"] as const) {
      test(`${mode}/${runtime} keeps Bun package management and the selected Next execution runtime`, () => {
        const files = generateProjectFiles({
          name: `next-${mode}-${runtime}`,
          version: "0.1.0",
          runtime,
          mode,
          framework: "nextjs",
          database: "postgres",
          apps: ["web"],
          billing: [],
          features: [],
          deploy: "vercel",
        } as ProjectConfig);
        const rootPackage = JSON.parse(content(files, "package.json")) as {
          engines: Record<string, string>;
          packageManager: string;
          scripts: Record<string, string>;
        };
        const webPackage =
          mode === "monorepo"
            ? (JSON.parse(content(files, "apps/web/package.json")) as {
                scripts: Record<string, string>;
              })
            : rootPackage;
        const vercel = JSON.parse(content(files, "vercel.json")) as {
          bunVersion?: string;
          buildCommand: string;
          installCommand: string;
        };

        expect(rootPackage.packageManager).toBe(`bun@${toolchainRuntime.bun}`);
        expect(rootPackage.engines.bun).toBe(toolchainRuntime.bun);
        expect(rootPackage.engines.node).toBe(
          runtime === "node" ? `${toolchainRuntime.node.split(".")[0]}.x` : undefined,
        );
        expect(webPackage.scripts).toMatchObject(
          runtime === "bun"
            ? {
                dev: "bun ./node_modules/next/dist/bin/next dev --webpack",
                build: "bun ./node_modules/next/dist/bin/next build --webpack",
                start: "bun ./node_modules/next/dist/bin/next start",
              }
            : { dev: "next dev", build: "next build", start: "next start" },
        );
        expect(vercel.installCommand).toBe(
          `bunx bun@${toolchainRuntime.bun} scripts/require-bun-lock.mjs && bunx bun@${toolchainRuntime.bun} run audit:lock && bunx bun@${toolchainRuntime.bun} install --frozen-lockfile`,
        );
        expect(vercel.buildCommand).toBe(
          `bunx bun@${toolchainRuntime.bun} scripts/require-bun-lock.mjs && bunx bun@${toolchainRuntime.bun} ${
            mode === "monorepo" ? "scripts/build-deployment.mjs" : "run build"
          }`,
        );
        expect(vercel.bunVersion).toBe(
          runtime === "bun"
            ? `${toolchainRuntime.bun.split(".").slice(0, 2).join(".")}.x`
            : undefined,
        );
      });
    }
  }

  test("Bun command shape keeps framework Node children free of --bun NODE_OPTIONS", () => {
    const files = generateProjectFiles({
      name: "next-command-probe",
      version: "0.1.0",
      runtime: "bun",
      mode: "single",
      framework: "nextjs",
      database: "postgres",
      apps: ["web"],
      billing: [],
      features: [],
      deploy: "none",
    } as ProjectConfig);
    const generated = JSON.parse(content(files, "package.json")) as {
      scripts: Record<string, string>;
    };
    const root = mkdtempSync(join(tmpdir(), "ghostinit-next-command-"));
    roots.push(root);
    const binDirectory = join(root, "node_modules", "next", "dist", "bin");
    mkdirSync(binDirectory, { recursive: true });
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({ private: true, type: "module", scripts: { dev: generated.scripts.dev } }),
    );
    writeFileSync(
      join(binDirectory, "next"),
      `import { spawnSync } from "node:child_process";
const child = spawnSync("node", ["-e", "process.stdout.write(process.env.NODE_OPTIONS || '')"], {
  encoding: "utf8",
  shell: false,
});
console.log(JSON.stringify({
  args: process.argv.slice(2),
  bunVersion: process.versions.bun || null,
  nodeOptions: process.env.NODE_OPTIONS || "",
  childNodeOptions: child.stdout || "",
  childStatus: child.status,
  childStderr: child.stderr || "",
}));
if (child.status !== 0) process.exit(child.status ?? 1);
`,
    );

    const result = spawnSync(process.execPath, ["run", "dev"], {
      cwd: root,
      encoding: "utf8",
      shell: false,
      timeout: 10_000,
      windowsHide: true,
    });
    expect(result.error, result.stderr).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    const lastLine = result.stdout.trim().split(/\r?\n/).at(-1);
    if (!lastLine) throw new Error("Next command probe did not return a result");
    const probe = JSON.parse(lastLine) as {
      args: string[];
      bunVersion: string | null;
      nodeOptions: string;
      childNodeOptions: string;
      childStatus: number | null;
      childStderr: string;
    };
    expect(probe).toMatchObject({
      args: ["dev", "--webpack"],
      bunVersion: toolchainRuntime.bun,
      childStatus: 0,
      childStderr: "",
    });
    expect(probe.nodeOptions).not.toContain("--bun");
    expect(probe.childNodeOptions).not.toContain("--bun");
  });
});
