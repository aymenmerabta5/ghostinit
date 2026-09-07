import { describe, it, expect } from "bun:test";
import * as v from "../../packages/versions/src/index.js";
import { generateProjectFiles } from "../../src/templates/default.js";

const guidancePaths = [
  "AGENTS.md",
  "CLAUDE.md",
  ".cursor/rules/ghostinit.mdc",
  ".windsurf/rules/ghostinit.md",
] as const;

for (const framework of ["nextjs", "tanstack-start"] as const) {
  for (const hasEve of [false, true]) {
    describe(`generated contributor guidance: ${framework}, eve=${hasEve}`, () => {
      const files = generateProjectFiles(
        {
          name: "guidance-app",
          runtime: "bun",
          version: v.ghostinitVersion,
          mode: "monorepo",
          preset: "saas",
          billing: [],
          features: hasEve ? ["eve"] : [],
          database: "postgres",
          framework,
          apps: ["web"],
        },
        { dryRun: true },
      );
      const guidance = files.filter(({ path }) =>
        guidancePaths.some((guidancePath) => guidancePath === path),
      );
      const agents = guidance.find(({ path }) => path === "AGENTS.md")?.content ?? "";

      it("emits one instruction file per supported tool with the same project rules", () => {
        expect(guidance.map(({ path }) => path).toSorted()).toEqual([...guidancePaths].sort());
        expect(files.some(({ path }) => path === "CURSOR.md")).toBe(false);
        expect(agents).toContain("guidance-app");
        for (const path of ["CLAUDE.md", ".windsurf/rules/ghostinit.md"]) {
          expect(guidance.find((file) => file.path === path)?.content).toBe(agents);
        }
        const cursor = guidance.find(({ path }) => path === ".cursor/rules/ghostinit.mdc");
        expect(cursor?.content).toStartWith("---\ndescription:");
        expect(cursor?.content).toContain("globs:");
        expect(cursor?.content).toContain("alwaysApply: true\n---\n");
        expect(cursor?.content).toEndWith(agents);
      });

      it("documents the emitted application packages and selected Eve capability", () => {
        for (const packagePath of [
          "apps/web",
          "packages/api",
          "packages/auth",
          "packages/database",
          "packages/modules",
        ]) {
          expect(agents).toContain(`\`${packagePath}\``);
          expect(files.some(({ path }) => path === `${packagePath}/package.json`)).toBe(true);
        }
        expect(agents.includes("`apps/eve`")).toBe(hasEve);
        expect(files.some(({ path }) => path === "apps/eve/package.json")).toBe(hasEve);
      });

      it("keeps repository quality gates in every tool's instructions", () => {
        for (const { content, path } of guidance) {
          for (const command of [
            "bun run install:verified",
            "bun run typecheck",
            "bun run lint",
            "bun run format:check",
            "bun run test",
            "bun run build",
            "ghostinit check",
          ]) {
            expect(content, path).toContain(command);
          }
        }
      });

      it("derives stack and shadcn versions from the active catalog", () => {
        const frameworkVersion =
          framework === "nextjs"
            ? `Next.js ${v.nextStack.next}`
            : `TanStack Start ${v.tanstackStart["@tanstack/react-start"]}`;
        for (const { content, path } of guidance) {
          expect(content, path).toContain(`Bun ${v.runtime.bun}`);
          expect(content, path).toContain(frameworkVersion);
          expect(content, path).toContain(`TypeScript: ${v.typescript.typescript}`);
          expect(content, path).toContain(`bunx --bun shadcn@${v.ui.shadcn} add`);
          expect(content, path).not.toContain("@latest");
          expect(content, path).not.toContain("oRPC for RSC zero latency");
        }
      });
    });
  }
}
