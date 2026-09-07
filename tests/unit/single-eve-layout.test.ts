import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { eve as eveVersions } from "../../packages/versions/src/index.js";
import type { ProjectConfig } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";
import { mapSingleEveApplicationFiles } from "../../src/templates/modes/single/eve.js";

function config(
  mode: "monorepo" | "single",
  framework: "nextjs" | "tanstack-start",
): ProjectConfig {
  return {
    name: `eve-layout-${mode}-${framework}`,
    runtime: "bun",
    version: "0.1.0",
    mode,
    preset: "custom",
    auth: true,
    api: true,
    email: false,
    analytics: false,
    eve: true,
    i18n: false,
    pdf: false,
    messaging: false,
    storage: false,
    notifications: false,
    featureFlags: "none",
    jobs: false,
    cache: "none",
    deploy: "none",
    billing: [],
    features: ["eve"],
    database: "postgres",
    framework,
    apps: ["web"],
  } as ProjectConfig;
}

describe("single-mode Eve application root", () => {
  for (const framework of ["nextjs", "tanstack-start"] as const) {
    test(`${framework} keeps the project root as the Eve app root`, () => {
      const files = generateProjectFiles(config("single", framework), {
        dryRun: true,
        validate: true,
      });
      const paths = new Set(files.map((file) => file.path));
      const manifest = JSON.parse(
        files.find((file) => file.path === "package.json")?.content ?? "{}",
      ) as {
        dependencies?: Record<string, string>;
        scripts?: Record<string, string>;
      };

      expect(paths).toContain("package.json");
      expect(paths).toContain("agent/agent.ts");
      expect(paths).toContain("agent/instructions.md");
      expect(paths).toContain("agent/channels/eve.ts");
      expect(paths).toContain("agent/tools/scaffold_module.ts");
      expect(paths).not.toContain("agent/package.json");
      expect(paths).not.toContain("agent/tsconfig.json");
      expect(paths).not.toContain("agent/README.md");
      expect(paths).not.toContain("agent/.gitignore");
      expect(paths).not.toContain("agent/.vercelignore");
      expect([...paths].some((path) => path.startsWith("agent/agent/"))).toBe(false);
      expect([...paths].some((path) => path.startsWith("apps/eve/"))).toBe(false);
      expect(manifest.dependencies?.eve).toBe(eveVersions.eve);
      expect(manifest.scripts?.["eve:build"]).toBe(
        framework === "tanstack-start" ? "bun scripts/eve-command.mjs build" : "eve build",
      );
      expect(manifest.scripts?.["eve:dev"]).toBe("node scripts/eve-dev.mjs");
      expect(manifest.scripts?.["eve:start"]).toBe(
        framework === "tanstack-start"
          ? "bun scripts/eve-command.mjs start"
          : "node .output/server/index.mjs",
      );

      const instructions = files.find((file) => file.path === "agent/instructions.md")?.content;
      const readme = files.find((file) => file.path === "README.md")?.content;
      const authoredEveSurface = files
        .filter(
          (file) =>
            file.path.startsWith("agent/") ||
            file.path.startsWith("evals/") ||
            file.path.startsWith("examples/") ||
            file.path.startsWith("lib/"),
        )
        .map((file) => file.content)
        .join("\n");
      expect(instructions).toBeDefined();
      expect(readme).toBeDefined();
      expect(instructions).not.toMatch(/apps\/eve|monorepo/i);
      expect(readme).not.toMatch(/apps\/eve|monorepo/i);
      expect(authoredEveSurface).not.toMatch(/apps\/eve|monorepo/i);
      expect(authoredEveSurface).not.toContain("packages/modules/src/");
      expect(authoredEveSurface).not.toContain("packages/api/src/");
      expect(authoredEveSurface).not.toContain("--env-file=../../.env.local");
      expect(instructions).toContain("project root is the Eve application root");
      expect(readme).toContain("project root is the Eve application root");

      if (framework === "nextjs") {
        const nextConfig = files.find((file) => file.path === "next.config.ts")?.content ?? "";
        const nitroConfig = files.find((file) => file.path === "nitro.config.mjs")?.content ?? "";
        expect(nextConfig).toContain("withEve(config)");
        expect(nextConfig).not.toContain("eveRoot");
        expect(nitroConfig).toContain("ghostinit:eve-import-resolver");
      } else {
        const viteConfig = files.find((file) => file.path === "vite.config.ts")?.content ?? "";
        const nitroConfig = files.find((file) => file.path === "nitro.config.ts")?.content ?? "";
        const eveCommand =
          files.find((file) => file.path === "scripts/eve-command.mjs")?.content ?? "";
        expect(viteConfig).not.toContain("withEve");
        expect(viteConfig).toMatch(/process\.env\.GHOSTINIT_EVE_RUNTIME === ["']1["']/);
        expect(viteConfig).toContain("if (isEveRuntime) return { plugins: [] }");
        expect(viteConfig).not.toContain(
          "import { tanstackStart } from '@tanstack/react-start/plugin/vite'",
        );
        expect(viteConfig).toContain("import('@tanstack/react-start/plugin/vite')");
        expect(paths).not.toContain("nitro.config.mjs");
        expect(nitroConfig).toContain("ghostinit:eve-import-resolver");
        expect(eveCommand).toContain('GHOSTINIT_EVE_RUNTIME: "1"');
        expect(eveCommand).toContain('resolve(ROOT, ".eve", "runtime-output")');
        expect(eveCommand).toContain('resolve(ROOT, "vite.config.ts")');
        expect(eveCommand).toContain('"vite-config-backup-" + randomUUID()');
        expect(eveCommand).toContain("assertInsideRoot(WEB_OUTPUT)");
        expect(eveCommand).toContain("renameSync(stagedEveOutput, EVE_OUTPUT)");
        expect(readme).toContain("standalone backend");
        expect(authoredEveSurface).toContain(
          "private backend for TanStack Start's authenticated /api/agent facade",
        );
        expect(authoredEveSurface).not.toContain("integrated bun run dev");
      }
    });
  }

  test("maps only Eve authored-root files and preserves root support directories", () => {
    const files = mapSingleEveApplicationFiles(
      [
        { path: "apps/eve/package.json", content: "{}" },
        { path: "apps/eve/tsconfig.json", content: "{}" },
        { path: "apps/eve/README.md", content: "ignored" },
        { path: "apps/eve/nitro.config.mjs", content: "nitro" },
        { path: "apps/eve/agent/agent.ts", content: "agent" },
        { path: "apps/eve/evals/smoke.ts", content: "eval" },
        { path: "apps/eve/examples/schedule.ts", content: "example" },
        { path: "apps/eve/lib/shared.ts", content: "lib" },
      ],
      "demo",
      "nextjs",
    );

    expect(files.map((file) => file.path)).toEqual([
      "nitro.config.mjs",
      "agent/agent.ts",
      "evals/smoke.ts",
      "examples/schedule.ts",
      "lib/shared.ts",
    ]);
  });

  test("leaves the monorepo Eve application layout unchanged", () => {
    const files = generateProjectFiles(config("monorepo", "nextjs"), {
      dryRun: true,
      validate: true,
    });
    const paths = new Set(files.map((file) => file.path));
    const nextConfig = files.find((file) => file.path === "apps/web/next.config.ts")?.content ?? "";

    expect(paths).toContain("apps/eve/package.json");
    expect(paths).toContain("apps/eve/tsconfig.json");
    expect(paths).toContain("apps/eve/README.md");
    expect(paths).toContain("apps/eve/nitro.config.mjs");
    expect(paths).toContain("apps/eve/agent/agent.ts");
    expect(paths).not.toContain("agent/agent.ts");
    expect(nextConfig).toContain('eveRoot: "../eve"');
  });
});

const evePackageRoot = resolve(import.meta.dir, "../../node_modules/eve");

test("Eve's real resolver recognizes the generated single application root", async () => {
  const packageJson = JSON.parse(readFileSync(join(evePackageRoot, "package.json"), "utf8")) as {
    version?: string;
  };
  expect(packageJson.version).toBe(eveVersions.eve);

  const projectModule = (await import(
    pathToFileURL(join(evePackageRoot, "dist/src/discover/project.js")).href
  )) as {
    resolveDiscoveryProject(
      startPath: string,
      options: { source: unknown },
    ): Promise<{ agentRoot: string; appRoot: string; layout: string }>;
  };
  const projectSourceModule = (await import(
    pathToFileURL(join(evePackageRoot, "dist/src/discover/project-source.js")).href
  )) as {
    createMemoryProjectSource(input: { files: Readonly<Record<string, string>> }): unknown;
  };

  for (const framework of ["nextjs", "tanstack-start"] as const) {
    const generated = generateProjectFiles(config("single", framework), {
      dryRun: true,
      validate: true,
    });
    const applicationRoot = resolve(`C:/ghostinit-eve-${framework}`);
    const source = projectSourceModule.createMemoryProjectSource({
      files: Object.fromEntries(
        generated.map((file) => [join(applicationRoot, file.path), file.content]),
      ),
    });
    for (const startPath of [applicationRoot, join(applicationRoot, "agent")]) {
      const resolved = await projectModule.resolveDiscoveryProject(startPath, { source });
      expect(resolved).toEqual({
        agentRoot: join(applicationRoot, "agent"),
        appRoot: applicationRoot,
        layout: "nested",
      });
    }
  }
});
