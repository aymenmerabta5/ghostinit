import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { runtime } from "../../packages/versions/src/index.js";
import { deployFiles } from "../../src/templates/root/deploy.js";
import { DEPLOY_LOCKFILE_GUARD_PATH } from "../../src/templates/root/deploy-guides.js";

const guidance = `Deployment requires a regular root bun.lock; run bun install using Bun ${runtime.bun} before Vercel, Docker, or Fly.`;
const exactBun = `bunx bun@${runtime.bun}`;
const vercelGuard = `${exactBun} ${DEPLOY_LOCKFILE_GUARD_PATH}`;

function guardedVercelCommand(command: string): string {
  return `${vercelGuard} && ${exactBun} ${command}`;
}

function content(files: ReadonlyArray<{ path: string; content: string }>, path: string): string {
  const result = files.find((file) => file.path === path)?.content;
  if (result === undefined) throw new Error(`Missing generated file: ${path}`);
  return result;
}

function runBun(args: string[], cwd: string) {
  return spawnSync(process.execPath, args, {
    cwd,
    encoding: "utf8",
    env: process.env,
    shell: false,
    windowsHide: true,
  });
}

describe("deployment root lockfile admission", () => {
  test("emits one shared guard before Vercel install/build and every container install", () => {
    for (const mode of ["monorepo", "single"] as const) {
      for (const framework of ["nextjs", "tanstack-start"] as const) {
        for (const target of ["docker", "fly", "vercel"] as const) {
          for (const selectedRuntime of ["bun", "node"] as const) {
            const files = deployFiles("lock-guard", target, selectedRuntime, {
              mode,
              database: "postgres",
              framework,
              apps: ["web"],
              api: true,
              messaging: false,
              jobs: false,
              storage: false,
            });
            const guard = content(files, DEPLOY_LOCKFILE_GUARD_PATH);
            expect(files.filter(({ path }) => path === DEPLOY_LOCKFILE_GUARD_PATH)).toHaveLength(1);
            expect(guard).toContain(guidance);
            if (target === "vercel") {
              const config = JSON.parse(content(files, "vercel.json")) as {
                installCommand: string;
                buildCommand: string;
              };
              const build = mode === "monorepo" ? "scripts/build-deployment.mjs" : "run build";
              expect(config.installCommand).toBe(guardedVercelCommand("install --frozen-lockfile"));
              expect(config.buildCommand).toBe(guardedVercelCommand(build));
              for (const command of [config.installCommand, config.buildCommand]) {
                expect(command.split(" && ")[0]).toBe(vercelGuard);
              }
              if (selectedRuntime === "bun") {
                const guide = content(files, "docs/VERCEL_DEPLOYMENT.md");
                expect(guide).toContain("regular root `bun.lock`");
                expect(guide).toContain(DEPLOY_LOCKFILE_GUARD_PATH);
              }
            } else {
              const dockerfile = content(files, "Dockerfile");
              const guardInstruction = `RUN bun ${DEPLOY_LOCKFILE_GUARD_PATH}`;
              expect(dockerfile.indexOf(guardInstruction)).toBeGreaterThan(
                dockerfile.indexOf("COPY . ."),
              );
              const installs = [...dockerfile.matchAll(/^RUN bun install[^\r\n]*$/gm)].map(
                ([instruction]) => instruction,
              );
              expect(installs).toHaveLength(2);
              expect(
                installs.filter((instruction) => instruction.includes("--production")),
              ).toHaveLength(1);
              for (const instruction of installs) {
                expect(instruction).toContain("--frozen-lockfile");
                expect(dockerfile.indexOf(guardInstruction)).toBeLessThan(
                  dockerfile.indexOf(instruction),
                );
              }
              expect(content(files, ".dockerignore").split(/\r?\n/)).not.toContain("bun.lock");
              const guide = content(
                files,
                target === "docker" ? "docs/DOCKER_DEPLOYMENT.md" : "docs/FLY_DEPLOYMENT.md",
              );
              expect(guide).toContain("regular root `bun.lock`");
              expect(guide).toContain(`Bun \`${runtime.bun}\``);
            }
          }
        }
      }
    }

    expect(
      deployFiles("no-deploy", "none", "bun", {
        mode: "monorepo",
        database: "postgres",
        framework: "nextjs",
        apps: ["web"],
        messaging: false,
        jobs: false,
        storage: false,
      }).some(({ path }) => path === DEPLOY_LOCKFILE_GUARD_PATH),
    ).toBe(false);
  });

  test("Vercel's shared guard rejects wrong toolchains and non-regular locks before accepting a regular lock", () => {
    expect(Bun.version).toBe(runtime.bun);
    const temp = mkdtempSync(join(tmpdir(), "ghostinit-lock-guard-"));
    const script = join(temp, ...DEPLOY_LOCKFILE_GUARD_PATH.split("/"));
    const lockfile = join(temp, "bun.lock");
    try {
      mkdirSync(join(temp, "scripts"));
      const files = deployFiles("lock-guard", "vercel", "bun", {
        mode: "single",
        database: "postgres",
        framework: "nextjs",
        apps: ["web"],
        messaging: false,
        jobs: false,
        storage: false,
      });
      writeFileSync(script, content(files, DEPLOY_LOCKFILE_GUARD_PATH));

      const missing = runBun([script], temp);
      expect(missing.status).toBe(1);
      expect(missing.stderr.trim()).toBe(guidance);
      expect(existsSync(lockfile)).toBe(false);

      const node = Bun.which("node");
      expect(node).not.toBeNull();
      if (!node) throw new Error("Node is required to verify wrong-toolchain admission");
      const wrongBunShim = join(temp, "wrong-bun.mjs");
      writeFileSync(wrongBunShim, 'globalThis.Bun = { version: "0.0.0" };\n');
      const wrongToolchain = spawnSync(
        node,
        ["--import", pathToFileURL(wrongBunShim).href, script],
        {
          cwd: temp,
          encoding: "utf8",
          env: process.env,
          shell: false,
          windowsHide: true,
        },
      );
      expect(wrongToolchain.status).toBe(1);
      expect(wrongToolchain.stderr.trim()).toBe(
        `Deployment lock verification requires Bun ${runtime.bun}; received Bun 0.0.0`,
      );

      mkdirSync(lockfile);
      const directory = runBun([script], temp);
      expect(directory.status).toBe(1);
      expect(directory.stderr.trim()).toBe(guidance);
      rmSync(lockfile, { recursive: true });

      writeFileSync(lockfile, "regular lock admission is followed by Bun's frozen validation\n");
      const present = runBun([script], temp);
      expect(present.status, present.stderr).toBe(0);
      expect(present.stderr).toBe("");
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });
});
