import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BillingProviderName } from "../../src/lib/addons.js";
import type { ProjectConfig } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";

type GeneratedFile = { path: string; content: string };

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function generated(
  mode: "monorepo" | "single",
  options: {
    billing?: BillingProviderName[];
    deploy?: "none" | "docker" | "fly" | "vercel";
    eve?: boolean;
    jobs?: boolean;
    storage?: boolean;
  } = {},
): GeneratedFile[] {
  return generateProjectFiles({
    name: "eve-life",
    version: "0.1.0",
    runtime: "bun",
    mode,
    framework: "nextjs",
    database: "postgres",
    apps: ["web"],
    billing: options.billing ?? [],
    features: options.eve === false ? [] : ["eve"],
    eve: options.eve ?? true,
    auth: true,
    api: true,
    deploy: options.deploy ?? "none",
    jobs: options.jobs,
    storage: options.storage,
  } as ProjectConfig) as GeneratedFile[];
}

function content(files: readonly GeneratedFile[], path: string): string {
  const result = files.find((file) => file.path === path)?.content;
  if (result === undefined) throw new Error(`Missing generated file ${path}`);
  return result;
}

describe("Eve and Next lifecycle", () => {
  test("monorepo gives integrated dev/start ownership to web and retains explicit diagnostics", () => {
    const files = generated("monorepo");
    const root = JSON.parse(content(files, "package.json")) as {
      scripts: Record<string, string>;
    };
    const eve = JSON.parse(content(files, "apps/eve/package.json")) as {
      scripts: Record<string, string>;
    };

    expect(root.scripts.dev).toBe("turbo run dev");
    expect(root.scripts.start).toBe("bun --env-file=.env.local run start:production");
    expect(root.scripts["start:web"]).toBe("bun run --cwd apps/web start");
    expect(root.scripts["start:eve"]).toBe("node apps/eve/.output/server/index.mjs");
    expect(root.scripts["start:production"]).toBe("bun scripts/start-production.mjs");
    expect(root.scripts.build).toBe("bun scripts/build-with-eve.mjs");
    expect(root.scripts["eve:build"]).toBe("bun --env-file=.env.local run --cwd apps/eve build");
    expect(root.scripts["eve:dev"]).toBe(
      "bun --env-file=.env.local run --cwd apps/eve dev:diagnostic",
    );
    expect(root.scripts["eve:start"]).toBe(
      "bun --env-file=.env.local run --cwd apps/eve start:diagnostic",
    );
    expect(eve.scripts.dev).toBeUndefined();
    expect(eve.scripts.start).toBeUndefined();
    expect(eve.scripts["dev:diagnostic"]).toBe("node ../../scripts/eve-dev.mjs");
    expect(eve.scripts["start:diagnostic"]).toBe("node .output/server/index.mjs");

    const orchestrator = content(files, "scripts/build-with-eve.mjs");
    expect(orchestrator).toContain("if (!isVercel)");
    expect(orchestrator).toContain('"--filter=" + EVE_PACKAGE_NAME');
    expect(orchestrator).toContain('"--filter=!" + EVE_PACKAGE_NAME');
  });

  test("monorepo Bun cwd scripts execute their target and fail when it is missing", () => {
    const generatedRoot = JSON.parse(content(generated("monorepo"), "package.json")) as {
      scripts: Record<string, string>;
    };
    const root = mkdtempSync(join(tmpdir(), "ghostinit-eve-cwd-"));
    roots.push(root);
    mkdirSync(join(root, "apps", "web"), { recursive: true });
    mkdirSync(join(root, "apps", "eve"), { recursive: true });
    writeFileSync(
      join(root, "probe.mjs"),
      `const marker = process.env.MARKER;
if (!marker) throw new Error("MARKER is required");
await Bun.write(marker, process.argv[2] || "missing-label");
`,
    );
    const eveScripts = {
      build: "bun ../../probe.mjs eve-build",
      "dev:diagnostic": "bun ../../probe.mjs eve-dev",
      "start:diagnostic": "bun ../../probe.mjs eve-start",
    };
    writeFileSync(
      join(root, "apps", "web", "package.json"),
      JSON.stringify({ private: true, scripts: { start: "bun ../../probe.mjs web-start" } }),
    );
    writeFileSync(
      join(root, "apps", "eve", "package.json"),
      JSON.stringify({ private: true, scripts: eveScripts }),
    );
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({
        private: true,
        scripts: Object.fromEntries(
          ["start:web", "eve:build", "eve:dev", "eve:start"].map((name) => [
            name,
            generatedRoot.scripts[name],
          ]),
        ),
      }),
    );
    writeFileSync(join(root, ".env.local"), "");

    for (const [script, label] of [
      ["start:web", "web-start"],
      ["eve:build", "eve-build"],
      ["eve:dev", "eve-dev"],
      ["eve:start", "eve-start"],
    ] as const) {
      const marker = join(root, `${script.replace(":", "-")}.txt`);
      const result = spawnSync(process.execPath, ["run", script], {
        cwd: root,
        encoding: "utf8",
        env: { ...process.env, MARKER: marker },
        shell: false,
        timeout: 10_000,
        windowsHide: true,
      });
      expect(result.error, result.stderr).toBeUndefined();
      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
      expect(readFileSync(marker, "utf8")).toBe(label);
    }

    writeFileSync(
      join(root, "apps", "eve", "package.json"),
      JSON.stringify({ private: true, scripts: {} }),
    );
    const missingMarker = join(root, "missing.txt");
    const missing = spawnSync(process.execPath, ["run", "eve:build"], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, MARKER: missingMarker },
      shell: false,
      timeout: 10_000,
      windowsHide: true,
    });
    expect(missing.status).not.toBe(0);
    expect(`${missing.stdout}\n${missing.stderr}`).toContain('Script not found "build"');
    expect(existsSync(missingMarker)).toBe(false);
  });

  test("single builds Eve before Next and supervises one private production runtime", () => {
    const files = generated("single");
    const root = JSON.parse(content(files, "package.json")) as {
      scripts: Record<string, string>;
    };

    expect(root.scripts.build).toBe("bun scripts/build-with-eve.mjs");
    expect(root.scripts["build:web"]).toContain("next build");
    expect(root.scripts.dev).toBe("bun scripts/start-development.mjs");
    expect(root.scripts["dev:web"]).toContain("next dev");
    expect(root.scripts.start).toBe("bun --env-file=.env.local run start:production");
    expect(root.scripts["start:web"]).toContain("next start");
    expect(root.scripts["start:eve"]).toBe("node .output/server/index.mjs");
    expect(root.scripts["eve:build"]).toBe("eve build");
    expect(root.scripts["eve:dev"]).toBe("node scripts/eve-dev.mjs");
    expect(root.scripts["eve:start"]).toBe("node .output/server/index.mjs");

    const orchestrator = content(files, "scripts/build-with-eve.mjs");
    expect(orchestrator).toContain("else if (!isVercel)");
    expect(orchestrator).toContain('run(["run", "build:web"])');
  });

  test("discovers one file per schedule and gates Chargily renewal", () => {
    const withoutChargily = generated("monorepo");
    const withoutSchedulePaths = withoutChargily
      .map(({ path }) => path)
      .filter((path) => path.startsWith("apps/eve/agent/schedules/"));
    expect(withoutSchedulePaths).toEqual(["apps/eve/agent/schedules/sync-check.md"]);
    expect(withoutChargily.map(({ path }) => path)).toContain(
      "apps/eve/examples/schedules/sync-check.ts",
    );
    expect(withoutChargily.map(({ path }) => path)).not.toContain(
      "apps/eve/agent/schedules/sync-check.example.ts",
    );

    const withChargily = generated("monorepo", { billing: ["chargily"] });
    const schedulePaths = withChargily
      .map(({ path }) => path)
      .filter((path) => path.startsWith("apps/eve/agent/schedules/"));
    expect(schedulePaths.sort()).toEqual(
      [
        "apps/eve/agent/schedules/billing-renewal.md",
        "apps/eve/agent/schedules/sync-check.md",
      ].sort(),
    );
    expect(withChargily.map(({ path }) => path)).toContain(
      "apps/eve/examples/schedules/billing-renewal.ts",
    );
  });

  test("emits Eve server env contract only when Eve is selected", () => {
    const files = generated("monorepo");
    const example = content(files, ".env.example");
    const local = content(files, ".env.local");
    const turbo = content(files, "turbo.json");
    const schema = content(files, "packages/config/src/server-schema.ts");

    for (const key of [
      "AI_GATEWAY_API_KEY",
      "EVE_INTERNAL_AUTH_SECRET",
      "EVE_NEXT_PRODUCTION_ORIGIN",
      "EVE_NEXT_PRODUCTION_PORT",
    ]) {
      expect(example).toContain(`${key}=`);
      expect(local).toContain(`${key}=`);
      expect(turbo).toContain(`"${key}"`);
      expect(schema).toContain(`${key}:`);
    }
    expect(local).toMatch(/EVE_INTERNAL_AUTH_SECRET=[A-Za-z0-9_-]{43}/);

    const withoutEve = generated("monorepo", { eve: false });
    expect(content(withoutEve, ".env.example")).not.toContain("EVE_INTERNAL_AUTH_SECRET");
    expect(content(withoutEve, "turbo.json")).not.toContain("EVE_NEXT_PRODUCTION_PORT");
  });

  test("self-host targets persist Workflow data and document proxy routes", () => {
    const monorepoDocker = generated("monorepo", { deploy: "docker" });
    expect(content(monorepoDocker, "Dockerfile")).not.toContain("VOLUME [");
    expect(
      content(monorepoDocker, "Dockerfile")
        .split("\n")
        .find((line) => line.startsWith("RUN mkdir -p")),
    ).toContain("/app/apps/eve/.eve/.workflow-data");
    expect(content(monorepoDocker, "Dockerfile")).toContain("USER 1000:1000");
    expect(content(monorepoDocker, ".dockerignore")).toContain("**/.eve");
    const compose = Bun.YAML.parse(content(monorepoDocker, "compose.production.yml")) as {
      services: { app: { volumes: string[]; stop_grace_period: string } };
      volumes: { eve_workflow_data: { name: string } };
    };
    expect(compose.services.app.volumes).toEqual([
      "eve_workflow_data:/app/apps/eve/.eve/.workflow-data",
    ]);
    expect(compose.services.app.stop_grace_period).toBe("30s");
    expect(compose.volumes.eve_workflow_data.name).toContain("eve_workflow_data");
    expect(content(monorepoDocker, "docs/DOCKER_DEPLOYMENT.md")).toContain("docker stop --time 30");

    const singleFly = generated("single", { deploy: "fly" });
    expect(content(singleFly, "fly.toml")).toContain('source = "eve_workflow_data"');
    expect(content(singleFly, "fly.toml")).toContain('destination = "/app/.eve/.workflow-data"');
    expect(content(singleFly, "fly.toml")).toContain("auto_stop_machines = false");
    expect(content(singleFly, "fly.toml")).toContain("min_machines_running = 1");
    expect(() => Bun.TOML.parse(content(singleFly, "fly.toml"))).not.toThrow();
    const guide = content(singleFly, "docs/EVE_SELF_HOSTING.md");
    expect(guide).toContain("/.well-known/workflow/");
    expect(guide).toContain("AI_GATEWAY_API_KEY");
    expect(guide).toContain("one Eve/web replica");
  });

  test("Docker and Fly supervisors keep Eve under the integrated web owner", () => {
    const docker = generated("monorepo", { deploy: "docker", jobs: true, storage: true });
    const root = JSON.parse(content(docker, "package.json")) as {
      scripts: Record<string, string>;
    };
    expect(root.scripts["start:web"]).toBe("bun run --cwd apps/web start");
    const supervisor = content(docker, "scripts/start-production.mjs");
    expect(supervisor).toContain(
      '["start:web", "start:eve", "jobs:start", "storage:cleanup-worker"]',
    );
    expect(supervisor).toContain('const EVE_PROCESS_SCRIPT = "start:eve"');

    const fly = generated("monorepo", { deploy: "fly", jobs: true, storage: true });
    expect(content(fly, "fly.toml")).toContain('app = "bun run start:production"');
    expect(content(fly, "fly.toml")).not.toContain('jobs = "bun run jobs:start"');
  });

  test("Bun applications supply genuine Node for the private Eve runtime in containers", () => {
    for (const mode of ["monorepo", "single"] as const) {
      for (const framework of ["nextjs", "tanstack-start"] as const) {
        const files = generateProjectFiles({
          name: "eve-node-vendor",
          version: "0.1.0",
          runtime: "bun",
          mode,
          framework,
          database: "postgres",
          apps: ["web"],
          billing: [],
          features: ["eve"],
          eve: true,
          auth: true,
          api: true,
          deploy: "docker",
        } as ProjectConfig);
        const docker = content(files, "Dockerfile");
        expect(docker).toContain("FROM node:");
        expect(docker).toContain("-bookworm-slim");
        expect(docker).toContain("COPY --from=bun-runtime /usr/local/bin/bun /usr/local/bin/bun");
        const manifest = JSON.parse(content(files, "package.json")) as {
          scripts: Record<string, string>;
        };
        if (mode === "single" && framework === "tanstack-start") {
          expect(manifest.scripts["start:eve"]).toBe("bun scripts/eve-command.mjs start");
          expect(content(files, "scripts/eve-command.mjs")).toContain(
            'run([entrypoint], eveEnvironment, "node")',
          );
          expect(content(files, "nitro.config.ts")).toContain(
            "? (process.env.VERCEL ? 'vercel' : 'node-server') : 'bun'",
          );
        } else {
          expect(manifest.scripts["start:eve"]).toBe(
            mode === "single"
              ? "node .output/server/index.mjs"
              : "node apps/eve/.output/server/index.mjs",
          );
          expect(
            content(files, mode === "single" ? "nitro.config.mjs" : "apps/eve/nitro.config.mjs"),
          ).toContain('preset: process.env.VERCEL ? "vercel" : "node-server"');
        }
        if (framework === "tanstack-start") {
          const web =
            mode === "single"
              ? manifest
              : (JSON.parse(content(files, "apps/web/package.json")) as {
                  scripts: Record<string, string>;
                });
          expect(web.scripts[mode === "single" ? "start:web" : "start"]).toBe(
            "bun .output/server/index.mjs",
          );
        }
      }
    }
  });
});
