import { describe, it, expect } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseSync } from "oxc-parser";
import { eve as eveVersions } from "../../packages/versions/src/index.js";
import { eveFiles } from "../../src/templates/eve";

describe("eve durable agent app template", () => {
  it("generates apps/eve/package.json with the catalog-pinned Eve stack", () => {
    const files = eveFiles("demo-project");
    const source = files.find((f) => f.path === "apps/eve/package.json")?.content ?? "{}";
    const pkg = JSON.parse(source) as {
      dependencies: Record<string, string>;
      scripts: Record<string, string>;
    };
    expect(pkg.dependencies.eve).toBe(eveVersions.eve);
    expect(pkg.dependencies.ai).toBe(eveVersions.ai);
    expect(pkg.dependencies["@vercel/connect"]).toBe(eveVersions["@vercel/connect"]);
    expect(pkg.dependencies.zod).toBeTruthy();
    expect(pkg.dependencies["@repo/database"]).toBe("workspace:*");
    expect(pkg.dependencies["@repo/workflows"]).toBe("workspace:*");
    expect(pkg.scripts.dev).toBeUndefined();
    expect(pkg.scripts.start).toBeUndefined();
    expect(pkg.scripts["dev:diagnostic"]).toBe("eve dev");
    expect(pkg.scripts["start:diagnostic"]).toBe("eve start");
  });

  it("emits paired Eve format write and check scripts for generated production gates", () => {
    const files = eveFiles("format-ready");
    const source = files.find((file) => file.path === "apps/eve/package.json")?.content ?? "{}";
    const pkg = JSON.parse(source) as { scripts?: Record<string, string> };

    expect(pkg.scripts?.format).toBe("oxfmt --write .");
    expect(pkg.scripts?.["format:check"]).toBe("oxfmt --check .");
  });

  it("emits the cross-platform Nitro import resolver required by Eve production builds", () => {
    const files = eveFiles("cross-platform-build");
    const config = files.find((file) => file.path === "apps/eve/nitro.config.mjs")?.content ?? "";
    const manifest = JSON.parse(
      files.find((file) => file.path === "apps/eve/package.json")?.content ?? "{}",
    ) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };

    expect(parseSync("nitro.config.mjs", config).errors).toEqual([]);
    expect(config).not.toContain("process.platform");
    expect(config).toContain("statSync(candidate).isFile()");
    expect(config).not.toContain("existsSync");
    expect(config).toContain("fileURLToPath(source)");
    expect(config).toContain("isAbsolute(source)");
    expect(config).toContain("/^[A-Za-z]:[\\\\/]/.test(source)");
    for (const extension of [
      ".mjs",
      ".js",
      ".mts",
      ".ts",
      ".json",
      ".cjs",
      ".cts",
      ".tsx",
      ".jsx",
      ".node",
      ".wasm",
    ]) {
      expect(config).toContain(JSON.stringify(extension));
    }
    expect(config).toContain('source === "eve" || source.startsWith("eve/")');
    expect(config).toContain("eveRequire.resolve(source)");
    expect(config).toContain("plugins.some(");
    expect(config).toContain("name: EVE_RESOLVER_PLUGIN_NAME");
    expect(manifest.dependencies?.rollup).toBeUndefined();
    expect(manifest.dependencies?.vite).toBeUndefined();
    expect(manifest.devDependencies?.rollup).toBeUndefined();
    expect(manifest.devDependencies?.vite).toBeUndefined();
  });

  it("resolves only real absolute files and public Eve packages, idempotently", async () => {
    const root = mkdtempSync(join(tmpdir(), "ghostinit-eve-nitro-resolver-"));
    try {
      const files = eveFiles("cross-platform-resolver-behavior");
      const source = files.find((file) => file.path === "apps/eve/nitro.config.mjs")?.content ?? "";
      const configPath = join(root, "nitro.config.mjs");
      const extensionlessPath = join(root, "entry");
      const entryPath = `${extensionlessPath}.ts`;
      const directoryPath = join(root, "directory");
      const evePackage = join(root, "node_modules", "eve");
      writeFileSync(configPath, source);
      writeFileSync(entryPath, "export const value = true;\n");
      mkdirSync(directoryPath);
      mkdirSync(evePackage, { recursive: true });
      writeFileSync(
        join(evePackage, "package.json"),
        `${JSON.stringify({ name: "eve", version: "0.0.0-test", exports: "./index.js" })}\n`,
      );
      writeFileSync(join(evePackage, "index.js"), "export {};\n");

      const loaded = (await import(
        `${pathToFileURL(configPath).href}?run=${crypto.randomUUID()}`
      )) as {
        default: {
          hooks: {
            "rollup:before"(
              nitro: unknown,
              config: {
                plugins?: Array<{ name?: string; resolveId?(source: string): string | null }>;
              },
            ): void;
          };
        };
      };
      const bundler: {
        plugins?: Array<{ name?: string; resolveId?(source: string): string | null }>;
      } = { plugins: [] };
      loaded.default.hooks["rollup:before"]({}, bundler);
      loaded.default.hooks["rollup:before"]({}, bundler);
      expect(bundler.plugins).toHaveLength(1);
      const resolveId = bundler.plugins?.[0]?.resolveId;
      expect(resolveId).toBeFunction();
      if (!resolveId) throw new Error("Missing generated resolver");
      expect(resolveId(extensionlessPath)).toBe(entryPath);
      expect(resolveId(pathToFileURL(extensionlessPath).href)).toBe(entryPath);
      expect(resolveId(entryPath)).toBe(entryPath);
      expect(resolveId(directoryPath)).toBeNull();
      expect(resolveId(pathToFileURL(directoryPath).href)).toBeNull();
      expect(resolveId(join(root, "missing"))).toBeNull();
      expect(resolveId("file://%invalid")).toBeNull();
      expect(resolveId("eve")).toBe(join(evePackage, "index.js"));
      expect(resolveId("react")).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("generates agent/agent.ts with defineAgent", () => {
    const files = eveFiles("demo");
    const agent = files.find((f) => f.path === "apps/eve/agent/agent.ts")?.content ?? "";
    expect(agent).toContain("defineAgent");
    expect(agent).toContain("eve");
    expect(agent).toContain("anthropic/claude-sonnet-5");
  });

  it("generates agent/instructions.md with project name", () => {
    const files = eveFiles("my-app");
    const instr = files.find((f) => f.path === "apps/eve/agent/instructions.md")?.content ?? "";
    expect(instr).toContain("my-app");
    expect(instr).toContain("Identity");
    expect(instr).toContain("eve");
  });

  it("generates tools with defineTool and zod inputSchema", () => {
    const files = eveFiles("demo");
    const scaffold =
      files.find((f) => f.path === "apps/eve/agent/tools/scaffold_module.ts")?.content ?? "";
    expect(scaffold).toContain("defineTool");
    expect(scaffold).toContain("eve/tools");
    expect(scaffold).toContain("inputSchema");
    expect(scaffold).toContain("zod");

    const check =
      files.find((f) => f.path === "apps/eve/agent/tools/check_architecture.ts")?.content ?? "";
    expect(check).toContain("defineTool");
    expect(check).toContain("ghostinit check");

    const sync =
      files.find((f) => f.path === "apps/eve/agent/tools/sync_registries.ts")?.content ?? "";
    expect(sync).toContain("defineTool");
    expect(sync).toContain("sync");
  });

  it("generates skills with SKILL.md markdown and description frontmatter", () => {
    const files = eveFiles("demo");
    const workflow =
      files.find((f) => f.path === "apps/eve/agent/skills/ghostinit-workflow.md")?.content ?? "";
    expect(workflow).toContain("description:");
    expect(workflow).toContain("GhostInit Workflow");
    expect(workflow).toContain("add module");
    expect(workflow).toContain("add use-case");

    const design =
      files.find((f) => f.path === "apps/eve/agent/skills/module-design.md")?.content ?? "";
    expect(design).toContain("description:");
    expect(design).toContain("DDD");
    expect(design).toContain("domain");
  });

  it("generates channels/eve.ts with eveChannel and auth", () => {
    const files = eveFiles("demo");
    const channel = files.find((f) => f.path === "apps/eve/agent/channels/eve.ts")?.content ?? "";
    expect(channel).toContain("eveChannel");
    expect(channel).toContain("eve/channels/eve");
    expect(channel).toContain("localDev");
    expect(channel).toContain("placeholderAuth");
    expect(channel).not.toContain("vercelOidc");
  });

  it("generates schedules sync-check markdown with cron", () => {
    const files = eveFiles("demo");
    const scheduleMd =
      files.find((f) => f.path === "apps/eve/agent/schedules/sync-check.md")?.content ?? "";
    expect(scheduleMd).toContain("cron:");
    expect(scheduleMd).toContain("0 * * * *");
    expect(scheduleMd).toContain("sync --check");
    expect(files.some((f) => f.path.includes("billing-renewal"))).toBe(false);
    expect(files.map((f) => f.path)).toContain("apps/eve/examples/schedules/sync-check.ts");
    expect(files.map((f) => f.path)).not.toContain(
      "apps/eve/agent/schedules/sync-check.example.ts",
    );
  });

  it("generates tsconfig, README, gitignore, vercelignore", () => {
    const files = eveFiles("demo");
    const paths = files.map((f) => f.path);
    expect(paths).toContain("apps/eve/tsconfig.json");
    expect(paths).toContain("apps/eve/README.md");
    expect(paths).toContain("apps/eve/.gitignore");
    expect(paths).toContain("apps/eve/.vercelignore");

    const tsconfig = files.find((f) => f.path === "apps/eve/tsconfig.json")?.content ?? "";
    expect(tsconfig).toContain("#*");
    expect(tsconfig).toContain("agent");

    const readme = files.find((f) => f.path === "apps/eve/README.md")?.content ?? "";
    expect(readme).toContain("eve");
    expect(readme).toContain("bun run eve:dev");
    expect(readme).toContain("node_modules/eve/docs");
  });

  it("contains 4+ tools", () => {
    const files = eveFiles("demo");
    const toolFiles = files.filter((f) => f.path.includes("agent/tools/"));
    expect(toolFiles.length).toBeGreaterThanOrEqual(4);
  });

  it("contains 2+ skills", () => {
    const files = eveFiles("demo");
    const skillFiles = files.filter((f) => f.path.includes("agent/skills/"));
    expect(skillFiles.length).toBeGreaterThanOrEqual(2);
  });
});
