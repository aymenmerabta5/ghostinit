import { describe, it, expect } from "bun:test";
import { eveFiles } from "../../src/templates/eve";

describe("eve durable agent app template", () => {
  it("generates apps/eve/package.json with eve dep 0.24.6", () => {
    const files = eveFiles("demo-project");
    const pkg = files.find((f) => f.path === "apps/eve/package.json")?.content ?? "";
    expect(pkg).toContain("eve");
    expect(pkg).toContain("0.24.6");
    expect(pkg).toContain("ai");
    expect(pkg).toContain("@vercel/connect");
    expect(pkg).toContain("zod");
    expect(pkg).toContain("@repo/database");
    expect(pkg).toContain("@repo/workflows");
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
    expect(channel).toContain("vercelOidc");
  });

  it("generates schedules sync-check markdown with cron", () => {
    const files = eveFiles("demo");
    const scheduleMd =
      files.find((f) => f.path === "apps/eve/agent/schedules/sync-check.md")?.content ?? "";
    expect(scheduleMd).toContain("cron:");
    expect(scheduleMd).toContain("0 * * * *");
    expect(scheduleMd).toContain("sync --check");
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
    expect(readme).toContain("npx eve dev");
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
