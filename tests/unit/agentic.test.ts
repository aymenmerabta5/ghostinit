import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as v from "../../packages/versions/src/index.js";
import { agenticFiles } from "../../src/templates/agentic";

describe("agentic template files", () => {
  it("generates AGENTS.md, CLAUDE.md, .cursor/rules/ghostinit.mdc, .windsurf/rules/ghostinit.md", () => {
    const files = agenticFiles("demo-app");
    const paths = files.map((f) => f.path);
    expect(paths).toContain("AGENTS.md");
    expect(paths).toContain("CLAUDE.md");
    expect(paths).toContain(".cursor/rules/ghostinit.mdc");
    expect(paths).toContain(".windsurf/rules/ghostinit.md");
    expect(paths).not.toContain("CURSOR.md");
  });

  it("AGENTS.md contains project name and package roles", () => {
    const files = agenticFiles("my-cool-project");
    const agents = files.find((f) => f.path === "AGENTS.md")?.content ?? "";
    expect(agents).toContain("my-cool-project");
    expect(agents).toContain("Package Roles");
    expect(agents).toContain("apps/web");
    expect(agents).toContain("apps/eve");
    expect(agents).toContain("packages/api");
    expect(agents).toContain("packages/auth");
    expect(agents).toContain("packages/database");
    expect(agents).toContain("packages/modules");
  });

  it("AGENTS.md contains quality gates", () => {
    const files = agenticFiles("demo");
    const content = files.find((f) => f.path === "AGENTS.md")?.content ?? "";
    expect(content).toContain("typecheck");
    expect(content).toContain("ghostinit check");
    expect(content).toContain("ghostinit sync --check");
    expect(content).toContain("Quality Gates");
  });

  it("AGENTS.md contains generators and architecture rules", () => {
    const files = agenticFiles("demo");
    const content = files.find((f) => f.path === "AGENTS.md")?.content ?? "";
    expect(content).toContain("add module");
    expect(content).toContain("add use-case");
    expect(content).toContain("add procedure");
    expect(content).toContain("add action");
    expect(content).toContain("Architecture Rules");
    expect(content).toContain("domain-purity");
    expect(content).toContain("module-isolation");
  });

  it("AGENTS.md contains eve durable agent section", () => {
    const files = agenticFiles("demo");
    const content = files.find((f) => f.path === "AGENTS.md")?.content ?? "";
    expect(content).toContain("eve");
    expect(content).toContain("apps/eve");
    expect(content).toContain("defineAgent");
    expect(content).toContain("defineTool");
  });

  it("CLAUDE.md identical to AGENTS.md", () => {
    const files = agenticFiles("demo");
    const agents = files.find((f) => f.path === "AGENTS.md")?.content ?? "";
    const claude = files.find((f) => f.path === "CLAUDE.md")?.content ?? "";
    expect(claude).toBe(agents);
  });

  it(".cursor/rules/ghostinit.mdc is MDC format with frontmatter", () => {
    const files = agenticFiles("demo");
    const mdc = files.find((f) => f.path === ".cursor/rules/ghostinit.mdc")?.content ?? "";
    expect(mdc).toContain("---");
    expect(mdc).toContain("description:");
    expect(mdc).toContain("globs:");
    expect(mdc).toContain("alwaysApply:");
    expect(mdc).toContain("GhostInit");
  });

  it("does not generate CURSOR.md", () => {
    const files = agenticFiles("demo");
    const paths = files.map((f) => f.path);
    expect(paths).not.toContain("CURSOR.md");
    expect(paths).not.toContain("CURSOR.md");
  });

  it("pins shadcn to the catalog and never recommends floating or non-Bun installers", () => {
    const files = agenticFiles("demo");
    const expectedCommand = `bunx --bun shadcn@${v.ui.shadcn} add`;

    for (const { path, content } of files) {
      expect(content, path).toContain(expectedCommand);
      expect(content, path).not.toContain("@latest");
      expect(content, path).not.toMatch(/\b(?:npm|npx)\b/);
      const pins = [...content.matchAll(/\bbunx --bun shadcn@([^\s]+) add\b/g)].map(
        (match) => match[1],
      );
      expect(pins.length, path).toBeGreaterThan(0);
      expect(new Set(pins), path).toEqual(new Set([v.ui.shadcn]));
    }
  });

  it("renders stack claims from the version catalog instead of stale literals", () => {
    const files = agenticFiles("demo");
    const claims = [
      `Turborepo ${v.tooling.turbo}`,
      `Bun ${v.runtime.bun}`,
      `Next.js ${v.nextStack.next}`,
      `React ${v.nextStack.react}`,
      `TS ${v.typescript.typescriptNext}`,
      `Drizzle ${v.database["drizzle-orm"]}`,
      v.postgresDocker.image,
      `Better Auth ${v.auth["better-auth"]}`,
      `oRPC ${v.orpc["@orpc/server"]}`,
      `Zod ${v.validation.zod}`,
      `TanStack Query ${v.tanstack["@tanstack/react-query"]}`,
      `Form ${v.tanstack["@tanstack/react-form"]}`,
      `Tailwind ${v.styling.tailwindcss}`,
      `Base UI ${v.ui["@base-ui/react"]}`,
      `shadcn CLI ${v.ui.shadcn}`,
      `oxlint ${v.tooling.oxlint}`,
      `oxfmt ${v.tooling.oxfmt}`,
      `eve ${v.eve.eve}`,
    ];
    for (const { path, content } of files) {
      for (const claim of claims) expect(content, `${path}: ${claim}`).toContain(claim);
    }

    const source = readFileSync(resolve(import.meta.dir, "../../src/templates/agentic.ts"), "utf8");
    expect(source).not.toContain("shadcn@latest");
    for (const hardcodedClaim of [
      /\boRPC \d+\.\d+\.\d+/,
      /\bZod \d+\.\d+\.\d+/,
      /\bTanStack Query \d+\.\d+\.\d+/,
      /\bTailwind \d+\.\d+\.\d+/,
      /\bBase UI \d+\.\d+\.\d+/,
      /\bResend \d+\.\d+\.\d+/,
      /\bPlaywright \d+\.\d+\.\d+/,
    ]) {
      expect(source).not.toMatch(hardcodedClaim);
    }
  });
});
