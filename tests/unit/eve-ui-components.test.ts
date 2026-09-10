import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
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
  const clientPage = content.match(/import GhostinitPageContent from "\.\/([^"]+)"/);
  if (clientPage)
    return source(files, `${path.slice(0, path.lastIndexOf("/"))}/${clientPage[1]}.tsx`);
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
    const temporaryRoot = mkdtempSync(join(tmpdir(), "eve-client-architecture-"));
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
          const safeHeader = `${sourceRoot}/features/agent/components/agent-header.tsx`;
          const serverClassifiedHeader = `${sourceRoot}/features/eve/components/agent-header.tsx`;
          expect(files.some(({ path }) => path === serverClassifiedHeader)).toBe(false);
          expect(files.some(({ path }) => path === safeHeader)).toBe(true);
        }
      }
    } finally {
      rmSync(temporaryRoot, { force: true, recursive: true });
    }
  });

  for (const mode of ["monorepo", "single"] as const) {
    for (const framework of ["nextjs", "tanstack-start"] as const) {
      test(`${mode}/${framework} keeps the agent route and focused components below 150 formatted lines`, () => {
        const files = filesFor(mode, framework);
        const root = mode === "monorepo" ? "apps/web/src" : "src";
        const routePath =
          framework === "nextjs" ? `${root}/app/agent/page.tsx` : `${root}/routes/agent.tsx`;
        const headerPath = `${root}/features/agent/components/agent-header.tsx`;
        const route = source(files, routePath);
        const header = source(files, headerPath);
        const screen = source(files, `${root}/features/agent/page.tsx`);
        const workspace = source(files, `${root}/features/agent/components/agent-workspace.tsx`);

        for (const entry of files.filter(
          ({ path }) =>
            path === routePath ||
            path.startsWith(`${root}/features/agent/`) ||
            path === `${root}/app/agent/page.client.tsx`,
        )) {
          expect(formattedLineCount(entry.path, entry.content), entry.path).toBeLessThanOrEqual(
            150,
          );
        }
        if (framework === "tanstack-start")
          expect(route).toContain('export const Route = createFileRoute("/agent")');
        expect(route).toContain('from "@/features/agent/page"');
        expect(screen).toContain("<AgentWorkspace {...useAgentConversation()} />");
        expect(workspace).toContain('import { AgentHeader } from "./agent-header"');
        expect(workspace).toContain('import { AgentTranscript } from "./agent-transcript"');
        expect(workspace).toContain('import { AgentPrompt } from "./agent-prompt"');
        expect(workspace).toContain("<AgentHeader />");
        expect(header).toContain('useSurfaceTranslations("agent")');
        expect(header).toContain('t("webDescription")');
        expect(header).not.toContain("agentRoot");
      });
    }
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
        const root = mode === "single" ? "src" : "apps/web/src";
        expectWebComponentInventory(
          [
            source(files, path),
            ...files
              .filter((file) => file.path.startsWith(`${root}/features/agent/`))
              .map((file) => file.content),
          ].join("\n"),
        );
      });
    }
  }

  test("Electron uses the constrained preload client plus existing Base UI-backed controls", () => {
    const files = filesFor("monorepo", "tanstack-start", ["web", "desktop"]);
    const root = "apps/desktop/src/renderer";
    expect(source(files, `${root}/routes/agent.tsx`)).toContain(
      'import { AgentScreen } from "@/features/agent/screen"',
    );
    expect(source(files, `${root}/features/agent/screen.tsx`)).toContain(
      "composer={<AgentPrompt send={conversation.send}",
    );
    const content = source(files, `${root}/features/agent/components/agent-view.tsx`);
    const prompt = source(files, `${root}/features/agent/components/agent-prompt.tsx`);
    expect(content).toContain('from "@/components/ui/button"');
    expect(content).toContain('from "@/components/ui/card"');
    expect(content).toContain('from "@/components/ui/chat"');
    expect(prompt).toContain('from "@/components/ui/form"');
    expect(prompt).toContain("<field.TextField");
    expect(source(files, `${root}/components/ui/form.tsx`)).toContain(
      'from "../form-fields/text-field"',
    );
    expect(source(files, `${root}/components/form-fields/text-field.tsx`)).toContain(
      'from "../ui/input"',
    );
    expect(content).toContain("<MessageScrollerProvider autoScroll>");
    expect(content).toContain("<Bubble align={message.role");
    expect(content).not.toContain("<Card key={message.id}");
    expect(content).not.toMatch(/<(?:button|input)\b/);
    expect(content).not.toContain("rounded-lg bg-primary px-3 py-2");
  });

  test("Expo composes its chat from React Native Reusables controls and cards", () => {
    const files = filesFor("monorepo", "tanstack-start", ["web", "mobile"]);
    const root = "apps/mobile/src";
    expect(source(files, "apps/mobile/app/agent.tsx")).toContain(
      'import { AgentScreen } from "@/features/agent/screen"',
    );
    expect(source(files, `${root}/features/agent/screen.tsx`)).toContain(
      "composer={<AgentPrompt send={conversation.send}",
    );
    const content = source(files, `${root}/features/agent/components/agent-view.tsx`);
    const prompt = source(files, `${root}/features/agent/components/agent-prompt.tsx`);
    expect(content).toContain('from "@/components/ui/button"');
    expect(content).toContain('from "@/components/ui/card"');
    expect(prompt).toContain("<NativeFormField");
    expect(prompt).toContain('from "@/components/form-fields/native-field"');
    expect(source(files, `${root}/components/form-fields/native-field.tsx`)).toContain(
      'from "@/components/ui/input"',
    );
    expect(content).toContain('from "@/components/ui/text"');
    expect(content).toContain("<Card className={message.role");
    expect(content).not.toMatch(/<(?:button|input)\b/);
  });
});
