import { describe, expect, test } from "bun:test";
import { runtime as toolchainRuntime } from "../../packages/versions/src/index.js";
import type { ProjectConfig } from "../../src/lib/config.js";
import { buildProjectGenerationPlan, generateProjectFiles } from "../../src/templates/default.js";
import { resolveCreateConfig } from "../../src/commands/create/resolution.js";
import {
  deployFiles,
  vercelBunRuntimeSelector,
  type DeploymentProfile,
} from "../../src/templates/root/deploy.js";
import { rootPackageJson } from "../../src/templates/root/package.js";
import {
  singlePackageJson,
  singlePackageJsonTanstack,
} from "../../src/templates/modes/single/package.js";

type GeneratedPackage = {
  packageManager?: string;
  engines?: Record<string, string>;
  scripts: Record<string, string>;
};

const postgresJobsMessaging: DeploymentProfile = {
  mode: "monorepo",
  database: "postgres",
  framework: "nextjs",
  apps: ["web"],
  messaging: true,
  jobs: true,
  storage: false,
};

const vercelBunSelector = `${toolchainRuntime.bun.split(".").slice(0, 2).join(".")}.x`;

function content(files: ReadonlyArray<{ path: string; content: string }>, path: string): string {
  const value = files.find((file) => file.path === path)?.content;
  if (value === undefined) throw new Error(`Missing generated file: ${path}`);
  return value;
}

function plannedContent(
  files: ReadonlyArray<{ physicalPath: string; content: string }>,
  path: string,
): string {
  const value = files.find((file) => file.physicalPath === path)?.content;
  if (value === undefined) throw new Error(`Missing planned file: ${path}`);
  return value;
}

describe("jobs and messaging deployment integration", () => {
  for (const mode of ["monorepo", "single"] as const) {
    for (const runtime of ["bun", "node"] as const) {
      for (const database of ["postgres", "convex"] as const) {
        test(`composes ${mode}/${runtime}/${database} process artifacts end to end`, () => {
          const files = generateProjectFiles({
            name: "demo",
            version: "0.1.0",
            mode,
            runtime,
            database,
            framework: "nextjs",
            apps: ["web"],
            billing: [],
            features: [],
            messaging: true,
            jobs: true,
            deploy: "fly",
          } as ProjectConfig);
          const pkg = JSON.parse(content(files, "package.json")) as GeneratedPackage;

          expect(pkg.packageManager).toBe(`bun@${toolchainRuntime.bun}`);
          expect(files.some(({ path }) => path === "bunfig.toml")).toBe(true);
          const dockerfile = content(files, "Dockerfile");
          expect(dockerfile).toContain(`oven/bun:${toolchainRuntime.bun}`);
          expect(dockerfile).toContain("COPY . .");
          expect(dockerfile).toContain("bunfig.toml");
          expect(dockerfile).not.toContain("COPY --parents");
          expect(dockerfile).not.toContain("npm");
          expect(dockerfile).toContain("ENV BUN_RUNTIME_TRANSPILER_CACHE_PATH=0");
          expect(dockerfile).toContain("USER 1000:1000");
          expect(dockerfile.match(/^USER 1000:1000$/gm)).toHaveLength(1);
          expect(dockerfile).not.toContain("USER root");
          expect(dockerfile.lastIndexOf("USER 1000:1000")).toBeGreaterThan(
            dockerfile.lastIndexOf("FROM "),
          );
          expect(dockerfile.indexOf("CMD ")).toBeGreaterThan(
            dockerfile.lastIndexOf("USER 1000:1000"),
          );
          expect(() => Bun.TOML.parse(content(files, "fly.toml"))).not.toThrow();

          if (database === "postgres") {
            const server = mode === "monorepo" ? "apps/web/server.ts" : "server.ts";
            expect(files.some(({ path }) => path === server)).toBe(true);
            expect(pkg.scripts.start).toContain(
              mode === "monorepo" && runtime === "bun" ? "--cwd apps/web" : server,
            );
            expect(pkg.scripts["jobs:worker"]).toBeDefined();
            expect(pkg.scripts["jobs:scheduler"]).toBeDefined();
            expect(files.some(({ path }) => path === "scripts/start-jobs.mjs")).toBe(true);
            expect(files.some(({ path }) => path === "scripts/typescript-worker-loader.mjs")).toBe(
              true,
            );
            expect(files.some(({ path }) => path === "scripts/start-production.mjs")).toBe(true);
            expect(content(files, "fly.toml")).toContain('jobs = "bun run jobs:start"');
            expect(content(files, "fly.toml")).toContain(
              'storage_cleanup = "bun run storage:cleanup-worker"',
            );
            if (runtime === "node") {
              expect(pkg.scripts.start).toContain("typescript-runtime-loader.mjs");
              expect(
                files.some(({ path }) => path === "scripts/typescript-runtime-loader.mjs"),
              ).toBe(true);
            }
          } else {
            expect(pkg.scripts["jobs:deploy"]).toBe("bun x --no-install convex deploy");
            expect(files.some(({ path }) => path === "convex/crons.ts")).toBe(true);
            expect(pkg.scripts["jobs:start"]).toBeUndefined();
            expect(files.some(({ path }) => path === "scripts/start-production.mjs")).toBe(false);
            expect(content(files, "fly.toml")).not.toContain("jobs =");
            expect(content(files, "fly.toml")).not.toContain("storage_cleanup =");
          }
        });
      }
    }
  }

  test("monorepo Bun starts the Next custom server and supervises persistent jobs", () => {
    const pkg = JSON.parse(
      rootPackageJson("demo", "bun", undefined, postgresJobsMessaging).content,
    ) as GeneratedPackage;
    const docker = deployFiles("demo", "docker", "bun", postgresJobsMessaging);
    const fly = deployFiles("demo", "fly", "bun", postgresJobsMessaging);

    expect(pkg.packageManager).toBe(`bun@${toolchainRuntime.bun}`);
    expect(pkg.engines?.bun).toBe(toolchainRuntime.bun);
    expect(pkg.engines?.node).toBeUndefined();
    expect(pkg.scripts.start).toBe("bun --cwd apps/web --conditions=react-server server.ts");
    expect(pkg.scripts["start:web"]).toBe(pkg.scripts.start);
    expect(pkg.scripts["jobs:worker"]).toContain("packages/api/src/workers/jobs/worker.ts");
    expect(pkg.scripts["jobs:scheduler"]).toContain("packages/api/src/workers/jobs/scheduler.ts");
    expect(pkg.scripts["jobs:start"]).toBe("bun scripts/start-jobs.mjs --runtime=bun");
    expect(pkg.scripts["start:production"]).toBe("bun scripts/start-production.mjs");

    const dockerfile = content(docker, "Dockerfile");
    expect(dockerfile).toContain(`FROM oven/bun:${toolchainRuntime.bun}`);
    expect(dockerfile).toContain("RUN bun install");
    expect(dockerfile).toContain("ENV STORAGE_DRIVER=s3");
    expect(dockerfile).toContain("STOPSIGNAL SIGTERM");
    expect(dockerfile).not.toContain("COPY --parents");
    expect(dockerfile).toContain('CMD ["bun", "scripts/start-production.mjs"]');
    expect(dockerfile).not.toContain("npm");
    const supervisor = content(docker, "scripts/start-production.mjs");
    expect(supervisor).toContain('["start:web", "jobs:start"]');
    expect(supervisor).toContain('spawn(process.execPath, ["run", script]');
    expect(supervisor).toContain('await import("bun:ffi")');
    expect(supervisor).toContain("AssignProcessToJobObject");
    expect(supervisor).toContain("TerminateJobObject");
    expect(supervisor).toContain('const SCOPE_ENV = "GHOSTINIT_PROCESS_SCOPE_ID"');
    expect(supervisor).toContain('readdirSync("/proc"');
    expect(supervisor).toContain('"/bin/ps"');
    expect(supervisor).toContain('signalProcessGroup(pid, "SIGKILL")');
    expect(supervisor).not.toMatch(/process\.kill\([^,]+,\s*0\)/);
    expect(supervisor).not.toContain("taskkill");
    expect(supervisor).not.toContain("bash");

    const flyToml = content(fly, "fly.toml");
    expect(flyToml).toContain('app = "bun run start:web"');
    expect(flyToml).toContain('jobs = "bun run jobs:start"');
    expect(flyToml).toContain('processes = ["app"]');
    expect(flyToml).toContain("[http_service.concurrency]");
    expect(flyToml).not.toContain("[[services]]");
    expect(flyToml).toContain('kill_timeout = "30s"');
    expect(flyToml).toContain('STORAGE_DRIVER = "s3"');
    expect(flyToml).not.toContain("npm");
  });

  for (const mode of ["monorepo", "single"] as const) {
    for (const runtime of ["bun", "node"] as const) {
      test(`${mode}/${runtime} schedules the Postgres storage cleanup lifecycle`, () => {
        const files = generateProjectFiles({
          name: "storage-deploy",
          version: "0.1.0",
          mode,
          runtime,
          database: "postgres",
          framework: "nextjs",
          apps: ["web"],
          billing: [],
          features: [],
          storage: true,
          deploy: "fly",
        } as ProjectConfig);
        const pkg = JSON.parse(content(files, "package.json")) as GeneratedPackage;
        const supervisor = content(files, "scripts/start-production.mjs");
        const dockerfile = content(files, "Dockerfile");
        const flyToml = content(files, "fly.toml");

        expect(pkg.scripts["storage:cleanup-worker"]).toBeDefined();
        expect(pkg.scripts["start:production"]).toBe("bun scripts/start-production.mjs");
        expect(pkg.engines?.bun).toBe(toolchainRuntime.bun);
        expect(pkg.engines?.node).toBe(
          runtime === "node" ? `${toolchainRuntime.node.split(".")[0]}.x` : undefined,
        );
        expect(supervisor).toContain('["start", "storage:cleanup-worker"]');
        expect(supervisor).not.toContain('"jobs:start"');
        expect(dockerfile).toContain('CMD ["bun", "scripts/start-production.mjs"]');
        expect(dockerfile).toContain("ENV STORAGE_DRIVER=s3");
        expect(dockerfile).toContain("ENV UPLOADS_DIR=/app/data/uploads");
        expect(dockerfile).toContain("RUN mkdir -p");
        expect(dockerfile).toContain("/app/data/uploads");
        expect(dockerfile).toContain("USER 1000:1000");
        expect(flyToml).toContain('app = "bun run start"');
        expect(flyToml).toContain('storage_cleanup = "bun run storage:cleanup-worker"');
        expect(flyToml).not.toContain('jobs = "bun run jobs:start"');
        expect(() => Bun.TOML.parse(flyToml)).not.toThrow();
      });
    }
  }

  test("Node remains execution-only while Bun installs and launches package scripts", () => {
    const pkg = JSON.parse(
      rootPackageJson("demo", "node", undefined, postgresJobsMessaging).content,
    ) as GeneratedPackage;
    const files = deployFiles("demo", "docker", "node", postgresJobsMessaging);

    expect(pkg.packageManager).toBe(`bun@${toolchainRuntime.bun}`);
    expect(pkg.engines).toEqual({
      bun: toolchainRuntime.bun,
      node: `${toolchainRuntime.node.split(".")[0]}.x`,
    });
    expect(pkg.scripts.start).toContain("node --import ./scripts/typescript-runtime-loader.mjs");
    expect(pkg.scripts.start).toContain("apps/web/server.ts");
    expect(pkg.scripts["jobs:worker"]).toContain(
      "node --import ./scripts/typescript-worker-loader.mjs",
    );
    expect(pkg.scripts["jobs:start"]).toBe("bun scripts/start-jobs.mjs --runtime=node");

    const dockerfile = content(files, "Dockerfile");
    expect(dockerfile).toContain(`FROM oven/bun:${toolchainRuntime.bun} AS bun-runtime`);
    expect(dockerfile).toContain(`FROM node:${toolchainRuntime.node}-bookworm-slim`);
    expect(dockerfile).toContain("RUN bun install");
    expect(dockerfile).toContain('CMD ["bun", "scripts/start-production.mjs"]');
    expect(dockerfile).not.toContain("npm");
    const loader = content(files, "scripts/typescript-runtime-loader.mjs");
    expect(loader).toContain('specifier.startsWith("@/")');
    expect(loader).toContain("specifier.slice(2)");
  });

  test("single Next uses its flat custom server and flat Docker manifest", () => {
    const pkg = JSON.parse(
      singlePackageJson("demo", "node", [], false, false, false, true, true, true, true, true),
    ) as GeneratedPackage;
    const profile = { ...postgresJobsMessaging, mode: "single" as const };
    const files = deployFiles("demo", "docker", "node", profile);

    expect(pkg.packageManager).toBe(`bun@${toolchainRuntime.bun}`);
    expect(pkg.scripts.start).toContain("typescript-runtime-loader.mjs");
    expect(pkg.scripts.start).toMatch(/ server\.ts$/);
    expect(pkg.scripts.start).not.toContain("apps/web/server.ts");
    expect(content(files, "Dockerfile")).toContain("COPY . .");
    expect(content(files, "Dockerfile")).toContain("bunfig.toml");
    expect(content(files, "Dockerfile")).not.toContain("COPY --parents");
  });

  test("TanStack does not pretend to have a Next custom server", () => {
    const pkg = JSON.parse(
      singlePackageJsonTanstack(
        "demo",
        "bun",
        [],
        false,
        false,
        false,
        true,
        true,
        true,
        true,
        true,
      ),
    ) as GeneratedPackage;

    expect(pkg.packageManager).toBe(`bun@${toolchainRuntime.bun}`);
    expect(pkg.scripts.start).toBe("bun .output/server/index.mjs");
    expect(pkg.scripts.start).not.toContain("server.ts");
    expect(pkg.scripts["jobs:start"]).toBe("bun scripts/start-jobs.mjs --runtime=bun");

    const nodePackage = JSON.parse(
      singlePackageJsonTanstack("demo", "node", [], false, false),
    ) as GeneratedPackage;
    expect(nodePackage.packageManager).toBe(`bun@${toolchainRuntime.bun}`);
    expect(nodePackage.scripts.start).toBe("node .output/server/index.mjs");
  });

  test("single web modes retain the monorepo fail-closed lint policy", () => {
    const profile: DeploymentProfile = {
      ...postgresJobsMessaging,
      messaging: false,
      jobs: false,
    };
    const monorepo = JSON.parse(rootPackageJson("demo", "bun", undefined, profile).content) as {
      scripts: Record<string, string>;
    };
    const singleNext = JSON.parse(
      singlePackageJson("demo", "bun", [], false, false),
    ) as GeneratedPackage;
    const singleTanstack = JSON.parse(
      singlePackageJsonTanstack("demo", "bun", [], false, false),
    ) as GeneratedPackage;

    for (const single of [singleNext, singleTanstack]) {
      expect(single.scripts["lint:all"]).toBe(monorepo.scripts["lint:all"]);
      expect(single.scripts["lint:all"]).toContain("bun run lint:architecture");
      expect(single.scripts["lint:all"]).toContain("bun run typecheck");
      expect(single.scripts["lint:all"]).not.toMatch(/\|\||;\s*true/);
    }
  });

  test("Convex jobs register through deploy instead of emitting persistent processes", () => {
    const pkg = JSON.parse(
      singlePackageJson("demo", "bun", [], false, false, true, false, true, true, true, true),
    ) as GeneratedPackage;
    const profile: DeploymentProfile = {
      ...postgresJobsMessaging,
      mode: "single",
      database: "convex",
      messaging: false,
    };
    const files = deployFiles("demo", "fly", "bun", profile);

    expect(pkg.scripts["jobs:deploy"]).toBe("bun x --no-install convex deploy");
    expect(pkg.scripts["jobs:worker"]).toBeUndefined();
    expect(pkg.scripts["jobs:scheduler"]).toBeUndefined();
    expect(pkg.scripts["jobs:start"]).toBeUndefined();
    expect(files.some(({ path }) => path === "scripts/start-production.mjs")).toBe(false);
    expect(content(files, "fly.toml")).not.toContain("jobs =");
  });

  test("Vercel output remains Bun-managed and uses the selected project layout", () => {
    const monorepo = JSON.parse(
      content(deployFiles("demo", "vercel", "node", postgresJobsMessaging), "vercel.json"),
    ) as Record<string, string | null>;
    const single = JSON.parse(
      content(
        deployFiles("demo", "vercel", "node", {
          ...postgresJobsMessaging,
          mode: "single",
        }),
        "vercel.json",
      ),
    ) as Record<string, string | null>;
    const tanstackMonorepo = JSON.parse(
      content(
        deployFiles("demo", "vercel", "bun", {
          ...postgresJobsMessaging,
          framework: "tanstack-start",
          messaging: false,
          jobs: false,
        }),
        "vercel.json",
      ),
    ) as Record<string, string | null>;
    const tanstackSingle = JSON.parse(
      content(
        deployFiles("demo", "vercel", "bun", {
          ...postgresJobsMessaging,
          mode: "single",
          framework: "tanstack-start",
          messaging: false,
          jobs: false,
        }),
        "vercel.json",
      ),
    ) as Record<string, string | null>;

    expect(monorepo.installCommand).toBe(
      `bunx bun@${toolchainRuntime.bun} scripts/require-bun-lock.mjs && bunx bun@${toolchainRuntime.bun} install --frozen-lockfile`,
    );
    expect(monorepo.buildCommand).toBe(
      `bunx bun@${toolchainRuntime.bun} scripts/require-bun-lock.mjs && bunx bun@${toolchainRuntime.bun} scripts/build-deployment.mjs`,
    );
    expect(monorepo.bunVersion).toBeUndefined();
    expect(monorepo.outputDirectory).toBe("apps/web/.next");
    expect(single.bunVersion).toBeUndefined();
    expect(single.buildCommand).toBe(
      `bunx bun@${toolchainRuntime.bun} scripts/require-bun-lock.mjs && bunx bun@${toolchainRuntime.bun} run build`,
    );
    expect(single.outputDirectory).toBe(".next");
    expect(tanstackMonorepo.bunVersion).toBe(vercelBunSelector);
    expect(tanstackMonorepo.buildCommand).toBe(
      `bunx bun@${toolchainRuntime.bun} scripts/require-bun-lock.mjs && bunx bun@${toolchainRuntime.bun} scripts/build-deployment.mjs`,
    );
    expect(tanstackMonorepo.framework).toBeNull();
    expect(tanstackMonorepo.outputDirectory).toBe("apps/web/.vercel/output");
    expect(tanstackSingle.bunVersion).toBe(vercelBunSelector);
    expect(tanstackSingle.buildCommand).toBe(
      `bunx bun@${toolchainRuntime.bun} scripts/require-bun-lock.mjs && bunx bun@${toolchainRuntime.bun} run build`,
    );
    expect(tanstackSingle.outputDirectory).toBe(".vercel/output");
    expect(JSON.stringify({ monorepo, single, tanstackMonorepo, tanstackSingle })).not.toContain(
      "npm",
    );
  });

  test("Vercel Bun runtime selection is canonical and fails closed on unsupported lines", () => {
    expect(vercelBunRuntimeSelector(toolchainRuntime.bun)).toBe(vercelBunSelector);
    expect(() => vercelBunRuntimeSelector("invalid")).toThrow("Invalid canonical Bun version");
    const [major, minor] = toolchainRuntime.bun.split(".").map(Number);
    const unsupported = `${major}.${minor + 1}.0`;
    expect(() => vercelBunRuntimeSelector(unsupported)).toThrow("Vercel does not declare support");
  });

  test("Docker context excludes secrets and state while retaining Convex generated modules", () => {
    const files = deployFiles("demo", "docker", "bun", {
      ...postgresJobsMessaging,
      database: "convex",
      messaging: false,
      jobs: false,
    });
    const ignore = content(files, ".dockerignore");

    for (const protectedPath of [
      ".env*",
      "**/.env*",
      ".ghostinit-staging",
      ".ghostinit.lock",
      ".npmrc",
      ".netrc",
    ]) {
      expect(ignore).toContain(protectedPath);
    }
    expect(ignore).not.toContain("convex/_generated");
    expect(ignore).not.toContain("bunfig.toml");
    expect(content(files, "Dockerfile")).toContain("ENV STORAGE_DRIVER=s3");
  });

  test("propagates deploy and runtime into each TanStack Nitro preset through the V2 plan", () => {
    for (const mode of ["monorepo", "single"] as const) {
      for (const runtime of ["bun", "node"] as const) {
        const dockerResolution = resolveCreateConfig({
          name: `docker-${mode}-${runtime}`,
          runtime,
          mode,
          framework: "tanstack-start",
          billing: [],
          features: [],
          database: "postgres",
          databaseWasExplicit: true,
          apps: ["web"],
          preset: "saas",
          cache: "none",
          deploy: "docker",
          withMessaging: true,
        });
        expect(dockerResolution.ok).toBe(true);
        if (!dockerResolution.ok) throw new Error(dockerResolution.message);
        const dockerPlan = buildProjectGenerationPlan(dockerResolution.resolvedConfig, {
          desiredConfig: dockerResolution.desiredConfig,
        });
        const storageRoot = mode === "monorepo" ? "apps/web/" : "";
        const storageRoute = dockerPlan.files.find(
          ({ physicalPath }) => physicalPath === `${storageRoot}src/routes/storage.tsx`,
        );
        const storageAdapter = dockerPlan.files.find(
          ({ physicalPath }) => physicalPath === `${storageRoot}src/features/storage/mutations.ts`,
        );
        expect(storageRoute?.provenance).toMatchObject({
          capability: "storage",
          appId: "web",
          target: "tanstack-start",
        });
        expect(storageRoute?.provenance.artifacts).toContain("route");
        expect(storageRoute?.provenance.acceptance).toContain("storage.authorized-read.v1");
        expect(storageAdapter?.provenance).toMatchObject({
          capability: "storage",
          appId: "web",
          target: "tanstack-start",
        });
        expect(storageAdapter?.provenance.artifacts).toContain("adapter");
        const nitroPath = mode === "monorepo" ? "apps/web/nitro.config.ts" : "nitro.config.ts";
        const dockerNitro = plannedContent(dockerPlan.files, nitroPath);
        expect(dockerNitro).toContain(`preset: '${runtime === "bun" ? "bun" : "node-server"}'`);
        expect(dockerNitro).toContain("experimental: { websocket: true }");
        const dockerfile = plannedContent(dockerPlan.files, "Dockerfile");
        expect(dockerfile).toContain("RUN bun install --frozen-lockfile");
        expect(dockerfile).toContain("COPY . .");
        expect(dockerfile).toContain("bunfig.toml");
        expect(dockerfile).not.toContain("COPY --parents");
        expect(dockerfile).not.toContain("|| bun install");

        const vercelResolution = resolveCreateConfig({
          name: `vercel-${mode}-${runtime}`,
          runtime,
          mode,
          framework: "tanstack-start",
          billing: [],
          features: [],
          database: "postgres",
          databaseWasExplicit: true,
          apps: ["web"],
          preset: "saas",
          cache: "none",
          deploy: "vercel",
        });
        expect(vercelResolution.ok).toBe(true);
        if (!vercelResolution.ok) throw new Error(vercelResolution.message);
        const vercelPlan = buildProjectGenerationPlan(vercelResolution.resolvedConfig, {
          desiredConfig: vercelResolution.desiredConfig,
        });
        expect(plannedContent(vercelPlan.files, nitroPath)).toContain("preset: 'vercel'");
        const vercel = JSON.parse(plannedContent(vercelPlan.files, "vercel.json")) as {
          bunVersion?: string;
          outputDirectory: string;
        };
        expect(vercel.bunVersion).toBe(runtime === "bun" ? vercelBunSelector : undefined);
        expect(vercel.outputDirectory).toBe(
          mode === "monorepo" ? "apps/web/.vercel/output" : ".vercel/output",
        );

        if (mode === "monorepo") {
          const turbo = JSON.parse(plannedContent(dockerPlan.files, "turbo.json")) as {
            tasks: { build: { outputs: string[] } };
          };
          expect(turbo.tasks.build.outputs).toContain(".output/**");
          expect(turbo.tasks.build.outputs).toContain(".vercel/output/**");
        }
      }
    }
  });
});
