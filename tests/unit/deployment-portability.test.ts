import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { runtime } from "../../packages/versions/src/index.js";
import type { ProjectConfig } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";
import {
  DEPLOY_WEB_RUNTIME_GUARD_PATH,
  deployFiles,
  vercelBunRuntimeSelector,
} from "../../src/templates/root/deploy.js";

function content(files: ReadonlyArray<{ path: string; content: string }>, path: string): string {
  const value = files.find((file) => file.path === path)?.content;
  if (value === undefined) throw new Error(`Missing generated file: ${path}`);
  return value;
}

function runBun(script: string, cwd: string) {
  return spawnSync(process.execPath, [script], {
    cwd,
    encoding: "utf8",
    env: process.env,
    shell: false,
    windowsHide: true,
  });
}

function writeInstalledPackage(
  root: string,
  storeEntry: string,
  name: string,
  workspace?: string,
): void {
  const nodeModules = workspace
    ? join(root, workspace, "node_modules")
    : join(root, "node_modules");
  const packageRoot = name.startsWith("@")
    ? join(nodeModules, ".bun", storeEntry, "node_modules", ...name.split("/"))
    : join(nodeModules, ".bun", storeEntry, "node_modules", name);
  mkdirSync(packageRoot, { recursive: true });
  writeFileSync(join(packageRoot, "package.json"), `${JSON.stringify({ name })}\n`);
}

function frontendConfig(
  mode: "monorepo" | "single",
  framework: "nextjs" | "tanstack-start",
  deploy: "docker" | "fly",
): ProjectConfig {
  return {
    name: `portable-${mode}-${framework}`,
    version: "0.1.0",
    runtime: "bun",
    mode,
    preset: "frontend",
    framework,
    database: "none",
    apps: ["web"],
    billing: [],
    features: [],
    auth: false,
    api: false,
    email: false,
    analytics: false,
    deploy,
  } as ProjectConfig;
}

describe("production deployment portability", () => {
  test("keeps Vercel on its valid managed Bun line and exact build toolchain", () => {
    const files = deployFiles("vercel-bun", "vercel", "bun", {
      mode: "monorepo",
      database: "postgres",
      framework: "nextjs",
      apps: ["web"],
      api: true,
      messaging: false,
      jobs: false,
      storage: false,
    });
    const vercel = JSON.parse(content(files, "vercel.json")) as {
      bunVersion: string;
      installCommand: string;
      buildCommand: string;
    };

    expect(vercelBunRuntimeSelector(runtime.bun)).toBe("1.4.x");
    expect(vercel).toMatchObject({
      bunVersion: "1.4.x",
      installCommand: `bunx bun@${runtime.bun} scripts/require-bun-lock.mjs && bunx bun@${runtime.bun} run audit:lock && bunx bun@${runtime.bun} install --frozen-lockfile`,
      buildCommand: `bunx bun@${runtime.bun} scripts/require-bun-lock.mjs && bunx bun@${runtime.bun} scripts/build-deployment.mjs`,
    });
    const guide = content(files, "docs/VERCEL_DEPLOYMENT.md");
    expect(guide).toContain("manages its patch version automatically");
    expect(guide).toContain(`exact Bun \`${runtime.bun}\``);
    expect(guide).toContain("Docker and Fly remain the targets for a byte-exact runtime");
  });

  for (const selectedRuntime of ["bun", "node"] as const) {
    test(`${selectedRuntime} image builds with ephemeral configuration and runs readably as uid 1000`, () => {
      const files = deployFiles("container-app", "docker", selectedRuntime, {
        mode: "monorepo",
        database: "postgres",
        framework: "nextjs",
        apps: ["web"],
        api: true,
        messaging: false,
        jobs: true,
        storage: true,
      });
      const dockerfile = content(files, "Dockerfile");

      expect(dockerfile).toContain(`FROM oven/bun:${runtime.bun}`);
      expect(dockerfile).toContain("--mount=type=secret,id=ghostinit_env,required=false");
      expect(dockerfile).toContain("--mount=type=secret,id=ghostinit_env_b64,required=false");
      expect(dockerfile).toContain(
        "bun --env-file=/run/secrets/ghostinit_env scripts/build-deployment.mjs",
      );
      expect(dockerfile).toContain("await Bun.write(process.argv[1]");
      expect(dockerfile).not.toContain("base64 -d");
      expect(dockerfile).toContain("COPY --from=base --chown=1000:1000 /app ./");
      expect(dockerfile).toContain(
        "RUN bun install --production --frozen-lockfile --filter='./' --filter='web...' --filter='@repo/jobs-runtime...' --filter='@repo/api...'",
      );
      expect(dockerfile).toContain("RUN bun pm pkg delete scripts.prepare");
      expect(dockerfile).not.toContain(
        "bun install --production --frozen-lockfile --ignore-scripts",
      );
      expect(dockerfile).toContain(`RUN bun ${DEPLOY_WEB_RUNTIME_GUARD_PATH}`);
      expect(dockerfile).toContain("USER 1000:1000");
      expect(dockerfile).not.toMatch(/COPY[^\n]*\.env/);
      expect(dockerfile).not.toContain("BETTER_AUTH_SECRET=");
      expect(dockerfile).not.toContain("POSTGRES_PASSWORD=");
      expect(dockerfile).not.toContain("REPLACE_WITH");
    });
  }

  test("multi-app web deploys build only the web dependency closure", () => {
    const profile = {
      mode: "monorepo" as const,
      database: "postgres" as const,
      framework: "nextjs" as const,
      apps: ["web", "mobile", "desktop"] as const,
      api: true,
      messaging: false,
      jobs: false,
      storage: false,
      eve: false,
    };

    for (const target of ["docker", "fly", "vercel"] as const) {
      const files = deployFiles("multi-app", target, "bun", profile);
      const script = content(files, "scripts/build-deployment.mjs");
      expect(script, target).toContain('const filters = ["--filter=web..."]');
      expect(script, target).not.toContain('"--filter=mobile');
      expect(script, target).not.toContain('"--filter=desktop');

      const invocations: string[][] = [];
      const executable = script.replace(
        /^import \{ spawnSync \} from "node:child_process";\r?\n/,
        "",
      );
      new Function("spawnSync", "Bun", "process", executable)(
        (_executable: string, args: string[]) => {
          invocations.push(args);
          return { status: 0 };
        },
        { version: runtime.bun },
        {
          cwd: () => "/workspace",
          env: {},
          execPath: "/bin/bun",
          exit(code: number) {
            throw new Error(`unexpected exit ${code}`);
          },
        },
      );
      expect(invocations, target).toEqual([
        ["x", "--no-install", "turbo", "run", "build", "--filter=web..."],
      ]);

      if (target === "vercel") {
        const vercel = JSON.parse(content(files, "vercel.json")) as {
          buildCommand: string;
        };
        expect(vercel.buildCommand).toBe(
          `bunx bun@${runtime.bun} scripts/require-bun-lock.mjs && bunx bun@${runtime.bun} scripts/build-deployment.mjs`,
        );
      } else {
        const dockerfile = content(files, "Dockerfile");
        expect(dockerfile, target).toContain(
          "bun --env-file=/run/secrets/ghostinit_env scripts/build-deployment.mjs",
        );
        const build = dockerfile.indexOf(
          "bun --env-file=/run/secrets/ghostinit_env scripts/build-deployment.mjs",
        );
        const discardBuildDependencies = dockerfile.indexOf(
          "RUN rm -rf node_modules apps/*/node_modules packages/*/node_modules tooling/*/node_modules",
        );
        const removePrepareHook = dockerfile.indexOf("RUN bun pm pkg delete scripts.prepare");
        const productionInstall = dockerfile.indexOf(
          "RUN bun install --production --frozen-lockfile --filter='./' --filter='web...'",
        );
        const dependencyGuard = dockerfile.indexOf(`RUN bun ${DEPLOY_WEB_RUNTIME_GUARD_PATH}`);
        const nativeRoots = dockerfile.indexOf("RUN rm -rf apps/mobile apps/desktop");
        const runtimeCopy = dockerfile.indexOf("COPY --from=base --chown=1000:1000 /app ./");
        expect(build, target).toBeGreaterThanOrEqual(0);
        expect(discardBuildDependencies, target).toBeGreaterThan(build);
        expect(removePrepareHook, target).toBeGreaterThan(discardBuildDependencies);
        expect(productionInstall, target).toBeGreaterThan(removePrepareHook);
        expect(dependencyGuard, target).toBeGreaterThan(productionInstall);
        expect(nativeRoots, target).toBeGreaterThan(dependencyGuard);
        expect(runtimeCopy, target).toBeGreaterThan(nativeRoots);
        expect(dockerfile, target).toContain("RUN rm -rf apps/mobile apps/desktop");
        const dockerignore = content(files, ".dockerignore").split(/\r?\n/);
        expect(dockerignore, target).toContain("out");
        expect(dockerignore, target).toContain("apps/*/out");
        expect(dockerignore, target).not.toContain("**/out");
        expect(dockerignore, target).toContain("dist");
        expect(dockerignore, target).toContain("apps/*/dist");
        expect(dockerignore, target).toContain("packages/*/dist");
        expect(dockerignore, target).toContain("tooling/*/dist");
        expect(dockerignore, target).not.toContain("**/dist");
        expect(dockerignore, target).toContain("**/.expo");
      }
    }
  });

  test("keeps every supervised runtime workspace in the production install", () => {
    const profiles = [
      {
        name: "jobs-runtime",
        profile: {
          mode: "monorepo" as const,
          database: "postgres" as const,
          framework: "nextjs" as const,
          apps: ["web"] as const,
          api: false,
          messaging: false,
          jobs: true,
          storage: false,
          eve: false,
        },
        filters: ["--filter='@repo/jobs-runtime...'"],
      },
      {
        name: "storage-runtime",
        profile: {
          mode: "monorepo" as const,
          database: "postgres" as const,
          framework: "nextjs" as const,
          apps: ["web"] as const,
          api: false,
          messaging: false,
          jobs: false,
          storage: true,
          eve: false,
        },
        filters: ["--filter='@repo/api...'"],
      },
      {
        name: "eve-runtime",
        profile: {
          mode: "monorepo" as const,
          database: "postgres" as const,
          framework: "nextjs" as const,
          apps: ["web"] as const,
          api: true,
          messaging: false,
          jobs: false,
          storage: false,
          eve: true,
        },
        filters: ["--filter='eve-runtime-eve...'"],
      },
    ];

    for (const { name, profile, filters } of profiles) {
      const dockerfile = content(deployFiles(name, "docker", "bun", profile), "Dockerfile");
      const productionInstall = dockerfile
        .split(/\r?\n/)
        .find((line) => line.startsWith("RUN bun install --production"));
      expect(productionInstall, name).toBeDefined();
      expect(productionInstall, name).toContain("--filter='./'");
      expect(productionInstall, name).toContain("--filter='web...'");
      for (const filter of filters) expect(productionInstall, name).toContain(filter);
    }

    const single = content(
      deployFiles("single-runtime", "docker", "bun", {
        mode: "single",
        database: "postgres",
        framework: "nextjs",
        apps: ["web"],
        api: true,
        messaging: false,
        jobs: false,
        storage: false,
      }),
      "Dockerfile",
    );
    expect(single).toContain("RUN bun install --production --frozen-lockfile\n");
    expect(
      single.split(/\r?\n/).find((line) => line.startsWith("RUN bun install --production")),
    ).not.toContain("--filter=");
  });

  test("generated runtime guard detects native packages inside Bun's store", () => {
    const files = deployFiles("boundary-app", "docker", "bun", {
      mode: "monorepo",
      database: "postgres",
      framework: "nextjs",
      apps: ["web", "mobile", "desktop"],
      api: true,
      messaging: false,
      jobs: false,
      storage: false,
    });
    const temp = mkdtempSync(join(tmpdir(), "ghostinit-web-runtime-boundary-"));
    const script = join(temp, ...DEPLOY_WEB_RUNTIME_GUARD_PATH.split("/"));
    try {
      mkdirSync(dirname(script), { recursive: true });
      writeFileSync(script, content(files, DEPLOY_WEB_RUNTIME_GUARD_PATH));
      writeInstalledPackage(temp, "next@16.2.10", "next");
      const accepted = runBun(script, temp);
      expect(accepted.status, accepted.stderr).toBe(0);
      expect(accepted.stderr).toBe("");

      writeInstalledPackage(temp, "expo@57.0.16", "expo", "apps/web");
      writeInstalledPackage(temp, "@electron+get@3.1.0", "@electron/get");
      writeInstalledPackage(temp, "uniwind@1.11.0", "uniwind");
      const rejected = runBun(script, temp);
      expect(rejected.status).toBe(1);
      expect(rejected.stderr).toContain(
        "Web runtime dependency boundary contains native-only packages: @electron/get, expo, uniwind",
      );
    } finally {
      rmSync(temp, { force: true, recursive: true });
    }
  });

  test("ships a secret-free health probe and an effective Compose stop grace", () => {
    const files = deployFiles("healthy-app", "docker", "bun", {
      mode: "monorepo",
      database: "postgres",
      framework: "nextjs",
      apps: ["web"],
      api: true,
      messaging: false,
      jobs: true,
      storage: false,
    });
    const dockerfile = content(files, "Dockerfile");
    const compose = Bun.YAML.parse(content(files, "compose.production.yml")) as {
      services: {
        app: {
          build: { secrets: string[] };
          env_file: string[];
          environment: { STORAGE_DRIVER: string };
          stop_grace_period: string;
        };
      };
      secrets: { ghostinit_env: { file: string } };
    };

    expect(dockerfile).toContain(
      "HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3",
    );
    expect(dockerfile).toContain("fetch('http://127.0.0.1:3000/api/health')");
    expect(dockerfile).not.toContain("Authorization");
    expect(dockerfile).toContain("STOPSIGNAL SIGTERM");
    expect(dockerfile).toContain("does not extend Docker's 10-second default");
    expect(compose.services.app.stop_grace_period).toBe("30s");
    expect(compose.services.app.build.secrets).toEqual(["ghostinit_env"]);
    expect(compose.services.app.env_file).toEqual([".env.local"]);
    expect(compose.services.app.environment.STORAGE_DRIVER).toBe("s3");
    expect(compose.secrets.ghostinit_env.file).toBe(".env.local");
    expect(content(files, "docs/DOCKER_DEPLOYMENT.md")).toContain("docker stop --time 30");
  });

  test("uses a reusable named Eve volume instead of an anonymous image volume", () => {
    const files = deployFiles("eve-app", "docker", "bun", {
      mode: "single",
      database: "postgres",
      framework: "nextjs",
      apps: ["web"],
      api: true,
      messaging: false,
      jobs: false,
      storage: false,
      eve: true,
    });
    const compose = Bun.YAML.parse(content(files, "compose.production.yml")) as {
      services: { app: { volumes: string[] } };
      volumes: { eve_workflow_data: { name: string } };
    };

    expect(content(files, "Dockerfile")).not.toContain("VOLUME [");
    expect(compose.services.app.volumes).toEqual(["eve_workflow_data:/app/.eve/.workflow-data"]);
    expect(compose.volumes.eve_workflow_data.name).toBe(
      "${COMPOSE_PROJECT_NAME:-eve-app}_eve_workflow_data",
    );
    const guide = content(files, "docs/DOCKER_DEPLOYMENT.md");
    expect(guide).toContain(
      "--mount type=volume,src=eve-app_eve_workflow_data,dst=/app/.eve/.workflow-data",
    );
    expect(guide).toContain("never use `down -v`");
  });

  test("aligns Fly health gating and graceful termination", () => {
    const files = deployFiles("fly-health", "fly", "bun", {
      mode: "monorepo",
      database: "postgres",
      framework: "nextjs",
      apps: ["web"],
      api: true,
      messaging: false,
      jobs: false,
      storage: false,
    });
    const fly = Bun.TOML.parse(content(files, "fly.toml")) as {
      kill_signal: string;
      kill_timeout: string;
      http_service: { checks: Array<Record<string, string>> };
    };

    expect(fly.kill_signal).toBe("SIGTERM");
    expect(fly.kill_timeout).toBe("30s");
    expect(fly.http_service.checks).toEqual([
      {
        grace_period: "30s",
        interval: "30s",
        method: "GET",
        path: "/api/health",
        protocol: "http",
        timeout: "5s",
      },
    ]);
    expect(content(files, "docs/FLY_DEPLOYMENT.md")).toContain("ghostinit_env_b64");
  });

  for (const mode of ["monorepo", "single"] as const) {
    for (const framework of ["nextjs", "tanstack-start"] as const) {
      for (const deploy of ["docker", "fly"] as const) {
        test(`${mode}/${framework}/${deploy} emits health even when the API addon is off`, () => {
          const files = generateProjectFiles(frontendConfig(mode, framework, deploy), {
            dryRun: true,
          });
          const root = mode === "single" ? "" : "apps/web/";
          const healthPath =
            framework === "nextjs"
              ? `${root}src/app/api/health/route.ts`
              : `${root}src/routes/api/health.ts`;
          expect(files.filter(({ path }) => path === healthPath)).toHaveLength(1);
          expect(content(files, healthPath)).toContain("status");
        });
      }
    }
  }
});
