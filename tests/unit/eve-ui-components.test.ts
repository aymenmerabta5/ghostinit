import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { analyzeProject } from "../../src/lib/architecture/index.js";
import { projectConfigSchema } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";

function filesFor(
  mode: "monorepo" | "single",
  framework: "nextjs" | "tanstack-start",
  apps: Array<"web" | "mobile" | "desktop"> = ["web"],
) {
  return generateProjectFiles(
    projectConfigSchema.parse({
      name: `eve-ui-${mode}-${framework}`,
      runtime: "bun",
      version: "0.1.0",
      mode,
      framework,
      database: "postgres",
      billing: [],
      features: [],
      apps,
      preset: "custom",
      auth: true,
      api: true,
      email: false,
      analytics: false,
      eve: true,
      i18n: true,
      pdf: false,
      messaging: false,
      storage: false,
      notifications: false,
      featureFlags: "none",
      jobs: false,
      cache: "none",
      deploy: "none",
    }),
    { dryRun: true, validate: true },
  );
}

function source(files: ReturnType<typeof filesFor>, path: string): string {
  const content = files.find((entry) => entry.path === path)?.content;
  if (!content) throw new Error(`Missing generated Eve UI ${path}`);
  return content;
}

function formattedLineCount(path: string, content: string): number {
  const result = Bun.spawnSync([process.execPath, "x", "oxfmt", "--stdin-filepath", path], {
    stdin: new TextEncoder().encode(content),
    stdout: "pipe",
    stderr: "pipe",
  });
  expect(result.exitCode, `${path}: ${new TextDecoder().decode(result.stderr)}`).toBe(0);
  return new TextDecoder().decode(result.stdout).split(/\r?\n/).length;
}

function expectWebComponentInventory(content: string): void {
  expect(content).toMatch(/from ["']@\/components\/ui\/button["']/);
  expect(content).toMatch(/from ["']@\/components\/ui\/card["']/);
  expect(content).toMatch(/from ["']@\/components\/ui\/chat["']/);
  expect(content).toMatch(/from ["']@\/components\/ui\/input["']/);
  expect(content).toContain("<MessageScrollerProvider autoScroll>");
  expect(content).toContain("<MessageScrollerItem key={message.id}");
  expect(content).toContain("<Bubble align={message.role");
  expect(content).not.toContain("<Card key={message.id}");
  expect(content).not.toMatch(/<(?:button|input)\b/);
  expect(content).not.toContain("inline-block max-w-[80%] rounded-lg");
  expect(content).toContain('useSurfaceTranslations("agent")');
}

describe("Eve chat component inventory", () => {
  test("all web targets keep client Eve presentation outside server-only path segments", async () => {
    const temporaryBase = join(process.cwd(), "Temp");
    mkdirSync(temporaryBase, { recursive: true });
    const temporaryRoot = mkdtempSync(join(temporaryBase, "eve-client-architecture-"));
    try {
      for (const mode of ["monorepo", "single"] as const) {
        for (const framework of ["nextjs", "tanstack-start"] as const) {
          const files = filesFor(mode, framework);
          const projectRoot = join(temporaryRoot, `${mode}-${framework}`);
          for (const generated of files) {
            const target = join(projectRoot, ...generated.path.split("/"));
            mkdirSync(dirname(target), { recursive: true });
            writeFileSync(target, generated.content);
          }

          const findings = await analyzeProject(projectRoot);
          expect(
            findings.filter(({ id }) => id === "client-transitive-server-import"),
            `${mode}/${framework}`,
          ).toEqual([]);

          const sourceRoot = mode === "monorepo" ? "apps/web/src" : "src";
          const safeHeader = `${sourceRoot}/features/agent/agent-header.tsx`;
          const serverClassifiedHeader = `${sourceRoot}/features/eve/agent-header.tsx`;
          expect(files.some(({ path }) => path === serverClassifiedHeader)).toBe(false);
          expect(files.some(({ path }) => path === safeHeader)).toBe(
            framework === "tanstack-start",
          );
        }
      }
    } finally {
      rmSync(temporaryRoot, { force: true, recursive: true });
    }
  });

  for (const mode of ["monorepo", "single"] as const) {
    test(`${mode}/tanstack-start keeps the public agent route and header below 150 formatted lines`, () => {
      const files = filesFor(mode, "tanstack-start");
      const root = mode === "monorepo" ? "apps/web/src" : "src";
      const routePath = `${root}/routes/agent.tsx`;
      const headerPath = `${root}/features/agent/agent-header.tsx`;
      const route = source(files, routePath);
      const header = source(files, headerPath);

      expect(formattedLineCount(routePath, route), routePath).toBeLessThanOrEqual(150);
      expect(formattedLineCount(headerPath, header), headerPath).toBeLessThanOrEqual(150);
      expect(route).toContain('export const Route = createFileRoute("/agent")');
      expect(route).toContain('import { AgentHeader } from "@/features/agent/agent-header"');
      expect(route).toContain(
        `<AgentHeader agentRoot="${mode === "monorepo" ? "apps/eve/agent/" : "agent/"}" />`,
      );
      expect(header).toContain('useSurfaceTranslations("agent")');
      expect(header).toContain('t("webDescription", { agentRoot })');
    });
  }

  for (const mode of ["monorepo", "single"] as const) {
    for (const framework of ["nextjs", "tanstack-start"] as const) {
      test(`${mode}/${framework} web chat uses generated shadcn and Base UI primitives`, () => {
        const files = filesFor(mode, framework);
        const path =
          framework === "nextjs"
            ? mode === "monorepo"
              ? "apps/web/src/app/agent/page.tsx"
              : "src/app/agent/page.tsx"
            : mode === "monorepo"
              ? "apps/web/src/routes/agent.tsx"
              : "src/routes/agent.tsx";
        expectWebComponentInventory(source(files, path));
      });
    }
  }

  test("Electron uses the constrained preload client plus existing Base UI-backed controls", () => {
    const files = filesFor("monorepo", "tanstack-start", ["web", "desktop"]);
    const content = source(files, "apps/desktop/src/renderer/routes/agent.tsx");
    expect(content).toContain('from "@/components/ui/button"');
    expect(content).toContain('from "@/components/ui/card"');
    expect(content).toContain('from "@/components/ui/chat"');
    expect(content).toContain('from "@/components/ui/input"');
    expect(content).toContain("<MessageScrollerProvider autoScroll>");
    expect(content).toContain("<Bubble align={message.role");
    expect(content).not.toContain("<Card key={message.id}");
    expect(content).not.toMatch(/<(?:button|input)\b/);
    expect(content).not.toContain("rounded-lg bg-primary px-3 py-2");
  });

  test("Expo composes its chat from React Native Reusables controls and cards", () => {
    const files = filesFor("monorepo", "tanstack-start", ["web", "mobile"]);
    const content = source(files, "apps/mobile/app/agent.tsx");
    expect(content).toContain('from "@/components/ui/button"');
    expect(content).toContain('from "@/components/ui/card"');
    expect(content).toContain('from "@/components/ui/input"');
    expect(content).toContain('from "@/components/ui/text"');
    expect(content).toContain("<Card className={message.role");
    expect(content).not.toMatch(/<(?:button|input)\b/);
  });
});
