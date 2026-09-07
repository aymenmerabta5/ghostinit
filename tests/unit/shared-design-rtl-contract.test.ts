import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type { ProjectConfig } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";
import {
  oklchDarkTokens,
  oklchLightTokens,
  semanticThemeCssContent,
} from "../../src/templates/apps/fragments/css.js";
import { webUiFiles } from "../../src/templates/apps/fragments/web-ui/index.js";
import { primitivesFiles } from "../../src/templates/apps/fragments/web-ui/primitives.js";
import { singleGlobalsCss } from "../../src/templates/modes/single/core/css.js";
import { lintScriptFiles } from "../../src/templates/tooling/lint-scripts.js";
import { themeCssContent } from "../../src/templates/ui/theme.js";

const workspace = resolve(import.meta.dir, "../..");
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function config(partial: Partial<ProjectConfig> = {}): ProjectConfig {
  return {
    name: "demo",
    runtime: "bun",
    version: "0.1.0",
    mode: "monorepo",
    billing: [],
    features: [],
    database: "postgres",
    framework: "nextjs",
    apps: ["web"],
    ...partial,
  } as ProjectConfig;
}

function fixture(): string {
  const directory = mkdtempSync(resolve(workspace, ".generated-design-rtl-"));
  temporaryDirectories.push(directory);
  return directory;
}

function writeFiles(
  directory: string,
  files: ReadonlyArray<{ path: string; content: string }>,
): void {
  for (const template of files) {
    const target = resolve(directory, template.path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, template.content);
  }
}

function runRtlGate(directory: string): { exitCode: number; output: string } {
  const result = spawnSync("node", [resolve(directory, "scripts/check-rtl-logical.cjs")], {
    cwd: directory,
    encoding: "utf8",
  });
  return {
    exitCode: result.status ?? -1,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
  };
}

describe("shared light-first design and RTL contract", () => {
  test("single and package modes render the exact same semantic token source", () => {
    const shared = semanticThemeCssContent();
    const packageTheme = themeCssContent();
    const singleTheme = singleGlobalsCss();

    expect(packageTheme).toBe(shared);
    expect(singleTheme).toContain(shared);
    expect(shared.startsWith(":root,\n.light {")).toBe(true);
    expect(shared).toContain(oklchLightTokens);
    expect(shared).toContain(oklchDarkTokens);
    expect(oklchDarkTokens.startsWith(".dark {")).toBe(true);
    expect(oklchDarkTokens).toContain("--background: oklch(0.1949 0.0155 261.6);");
    expect(oklchDarkTokens).toContain("--foreground: oklch(0.9598 0.0091 258.3);");
    expect(oklchDarkTokens).toContain("--card: oklch(0.2374 0.0195 258.4);");
    expect(oklchDarkTokens).toContain("--popover: oklch(0.2860 0.0255 255.7);");
    expect(oklchDarkTokens).toContain("--primary: oklch(0.7879 0.1066 266.9);");
    expect(oklchDarkTokens).toContain("--border: oklch(0.3697 0.0418 260.8);");
    expect(oklchLightTokens).toContain("--background: oklch(0.9759 0.0029 264.5);");
    expect(oklchLightTokens).toContain("--foreground: oklch(0.2493 0.0114 278.0);");
    expect(oklchLightTokens).toContain("--card: oklch(0.9965 0.0017 247.8);");
    expect(oklchLightTokens).toContain("--primary: oklch(0.5084 0.2059 266.9);");
    expect(shared).toContain("--radius: 0.75rem;");
    expect(shared).toContain("--radius-sm: calc(var(--radius) - 6px);");
    expect(shared).toContain("--radius-md: calc(var(--radius) - 4px);");
    expect(shared).toContain("--radius-lg: var(--radius);");
    expect(shared).toContain("--radius-xl: calc(var(--radius) + 4px);");
    expect(shared).toContain(
      '--font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;',
    );
    expect(shared).not.toMatch(/oklch\((?:0|1) 0 0(?:\s*\/[^)]*)?\)/);
    expect(shared).not.toMatch(/#(?:000|fff)\b/i);
  });

  test("portable theme and primitives use the approved elevation and layer scale", () => {
    const theme = themeCssContent();
    const primitives = primitivesFiles()
      .map((template) => template.content)
      .join("\n");
    const ui = new Map(webUiFiles().map((template) => [template.path, template.content]));
    const dialog = ui.get("apps/web/src/components/ui/dialog.tsx") ?? "";
    const dropdown = ui.get("apps/web/src/components/ui/dropdown-menu.tsx") ?? "";
    const sheet = ui.get("apps/web/src/components/ui/sheet.tsx") ?? "";
    const table = ui.get("apps/web/src/components/ui/table.tsx") ?? "";

    expect(theme).not.toContain("grain-overlay");
    expect(theme).not.toContain("z-index");
    expect(theme).not.toContain("DM Sans");
    expect(primitives).not.toContain("shadow-sm");
    expect(primitives).not.toContain("rounded-xl");
    expect(primitives).toContain(
      'cn("rounded-lg border border-border bg-card text-card-foreground shadow-surface"',
    );
    expect(primitives).toContain('default: "h-10 px-4 py-2"');
    expect(primitives).toContain('sm: "h-9 px-3 text-sm"');
    expect(primitives).toContain('lg: "h-11 px-6"');
    expect(primitives).toContain('icon: "size-10"');
    expect(primitives).toContain("p-5 sm:p-6");
    expect(primitives).toContain('cn("ms-auto flex items-center gap-2"');
    expect(primitives).not.toMatch(/\b(?:ml|mr|pl|pr)-/);
    expect(dialog).toContain("fixed start-[50%]");
    expect(dialog).toContain("absolute end-4");
    expect(dialog).toContain("shadow-modal");
    expect(dialog).toContain("rounded-xl");
    expect(dialog).toContain("max-h-[calc(100dvh-2rem)]");
    expect(dialog).toContain("overflow-y-auto");
    expect(dropdown).toContain("data-[inset]:ps-8");
    expect(dropdown).toContain('className="ms-auto rtl:rotate-180"');
    expect(sheet).toContain('side: "end"');
    expect(sheet).toContain("start-0");
    expect(sheet).toContain("end-0");
    expect(sheet).toContain("shadow-modal");
    expect(dropdown).toContain("shadow-popover");
    for (const overlay of [dialog, sheet]) {
      expect(overlay).toContain("z-[var(--layer-overlay)] bg-scrim");
      expect(overlay).toContain("z-[var(--layer-modal)]");
      expect(overlay).not.toContain("bg-foreground/80");
      expect(overlay).not.toContain("shadow-lg");
    }
    for (const overlay of [dialog, sheet, dropdown]) {
      expect(overlay).toContain("motion-reduce:animate-none!");
    }
    expect(dropdown).toContain("z-[var(--layer-popover)]");
    const layers = [...theme.matchAll(/--layer-([a-z]+): (\d+);/g)].map((match) => [
      match[1],
      Number(match[2]),
    ]);
    expect(layers).toEqual([
      ["navigation", 20],
      ["overlay", 40],
      ["modal", 50],
      ["popover", 60],
      ["tooltip", 70],
      ["toast", 80],
    ]);
    for (const elevation of ["control", "surface", "popover", "modal"]) {
      expect(theme).toContain(`--shadow-${elevation}: var(--elevation-${elevation});`);
    }
    expect(table).toContain("text-start");
    expect(table).toContain("pe-0");
  });

  test("overlay icons are imported by the primitive that renders them", () => {
    const ui = new Map(webUiFiles().map((template) => [template.path, template.content]));
    const sheet = ui.get("apps/web/src/components/ui/sheet.tsx") ?? "";
    const breadcrumb = ui.get("apps/web/src/components/ui/breadcrumb.tsx") ?? "";

    expect(sheet).toContain('import { X } from "lucide-react";');
    expect(sheet).not.toContain("ChevronRight");
    expect(breadcrumb).toContain('import { ChevronRight } from "lucide-react";');
    expect(breadcrumb).toContain('<ChevronRight className="rtl:rotate-180" aria-hidden />');
  });

  test("the RTL gate scans every frontend root and keeps exceptions token-scoped", () => {
    const directory = fixture();
    writeFiles(directory, lintScriptFiles());
    const violations = [
      ["src/app/page.tsx", "left-0"],
      ["src/routes/index.tsx", "right-0"],
      ["apps/web/src/components/card.tsx", "ml-2"],
      ["apps/desktop/src/renderer/view.tsx", "pr-3"],
      ["apps/mobile/app/index.tsx", "text-left"],
      ["apps/mobile/src/components/item.tsx", "border-r"],
    ] as const;
    for (const [path, token] of violations) {
      writeFiles(directory, [
        { path, content: `export const Fixture = () => <div className="${token}" />;\n` },
      ]);
    }
    writeFiles(directory, [
      {
        path: "apps/web/src/components/ui/popover.tsx",
        content:
          'export const Popover = () => <div className="data-[side=left]:slide-in-from-right-2 ml-4" />;\n',
      },
      {
        path: "apps/desktop/src/renderer/physical.css",
        content: ".physical { margin-left: 1rem; }\n",
      },
      {
        path: "src/features/physical-style.tsx",
        content: "export const PhysicalStyle = () => <div style={{ right: 0 }} />;\n",
      },
    ]);

    const result = runRtlGate(directory);
    expect(result.exitCode).toBe(1);
    for (const [path, token] of violations) {
      expect(result.output).toContain(`${path}:1`);
      expect(result.output).toContain(token);
    }
    expect(result.output).toContain("apps/web/src/components/ui/popover.tsx:1");
    expect(result.output).toContain("ml-4");
    expect(result.output).toContain("apps/desktop/src/renderer/physical.css:1");
    expect(result.output).toContain("margin-left:");
    expect(result.output).toContain("src/features/physical-style.tsx:1");
    expect(result.output).toContain("right:");
  });

  test("representative generated Next, TanStack, desktop, and mobile sources pass RTL", () => {
    const variants: ReadonlyArray<readonly [string, ProjectConfig]> = [
      [
        "monorepo Next with billing, i18n, desktop, and mobile",
        config({
          apps: ["web", "desktop", "mobile"],
          billing: ["stripe"],
          features: ["i18n"],
        }),
      ],
      [
        "monorepo TanStack with Convex billing",
        config({ framework: "tanstack-start", database: "convex", billing: ["stripe"] }),
      ],
      [
        "single Next with billing and i18n",
        config({ mode: "single", billing: ["stripe"], features: ["i18n"] }),
      ],
      [
        "single TanStack with Convex billing",
        config({
          mode: "single",
          framework: "tanstack-start",
          database: "convex",
          billing: ["stripe"],
        }),
      ],
      [
        "single desktop frontend",
        config({
          mode: "single",
          preset: "frontend",
          apps: ["desktop"],
          database: "none",
          auth: false,
          api: false,
          email: false,
          analytics: false,
        }),
      ],
      [
        "single mobile frontend",
        config({
          mode: "single",
          preset: "frontend",
          apps: ["mobile"],
          database: "none",
          auth: false,
          api: false,
          email: false,
          analytics: false,
        }),
      ],
    ];

    for (const [label, variant] of variants) {
      const directory = fixture();
      writeFiles(directory, generateProjectFiles(variant, { dryRun: false }));
      const result = runRtlGate(directory);
      expect(result.exitCode, `${label}\n${result.output}`).toBe(0);
      expect(result.output).toContain("RTL logical direction check passed.");
    }
  });

  test("web and Electron identity workspaces use logical text alignment", () => {
    const files = generateProjectFiles(config({ apps: ["web", "desktop"], billing: ["stripe"] }), {
      dryRun: false,
    });
    const workspaces = files.filter(
      ({ path }) =>
        path.endsWith("features/identity-workspace/components/organizations-card.tsx") ||
        path.endsWith("renderer/routes/workspace.tsx"),
    );
    expect(workspaces).toHaveLength(2);
    for (const workspace of workspaces) {
      expect(workspace.content, workspace.path).toContain("text-start");
      expect(workspace.content, workspace.path).not.toContain("text-left");
    }
  });
});
