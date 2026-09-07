import { describe, expect, test } from "bun:test";
import type { AppName, FrameworkName } from "../../src/lib/addons.js";
import type { ProjectConfig } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";
import {
  integrateDesignSystemApplications,
  resolveDesignSystemApps,
} from "../../src/templates/ui/index.js";

function config(
  mode: "monorepo" | "single",
  apps: AppName[],
  framework: FrameworkName = "nextjs",
): ProjectConfig {
  return {
    name: "design-system-app",
    version: "0.1.0",
    runtime: "bun",
    mode,
    framework,
    apps,
    database: "postgres",
    billing: [],
    features: [],
  } as ProjectConfig;
}

function byPath(files: ReadonlyArray<{ path: string; content: string }>) {
  return new Map(files.map((template) => [template.path, template.content]));
}

function imports(content: string): string[] {
  return [...content.matchAll(/^@import\s+["']([^"']+)["'];$/gm)].map((match) => match[1]);
}

const semanticColorDeclaration =
  /^\s*--(?:background|foreground|card|card-foreground|popover|popover-foreground|primary|primary-foreground|secondary|secondary-foreground|muted|muted-foreground|accent|accent-foreground|destructive|border|input|ring)\s*:/m;

describe("design-system application integration", () => {
  test("wires every monorepo app to its exact adapter and contract", () => {
    const files = byPath(generateProjectFiles(config("monorepo", ["web", "mobile", "desktop"])));
    const rows = [
      {
        css: "apps/web/src/app/globals.css",
        root: "apps/web/src/app/layout.tsx",
        target: "next",
      },
      {
        css: "apps/mobile/global.css",
        root: "apps/mobile/app/_layout.tsx",
        target: "expo",
      },
      {
        css: "apps/desktop/src/renderer/index.css",
        root: "apps/desktop/src/renderer/main.tsx",
        target: "electron",
      },
    ] as const;

    for (const row of rows) {
      const css = files.get(row.css) ?? "";
      const root = files.get(row.root) ?? "";
      expect(imports(css)).toEqual([
        ...(row.target === "expo" ? ["uniwind"] : []),
        `@repo/ui/styles/adapters/${row.target}/v1.css`,
      ]);
      expect(root).toContain('import { designSystemContract } from "@repo/ui/contract";');
      expect(root).toContain(`GhostInit design-system invariant:`);
      expect(root).toContain(`/${row.target}/v1`);
      expect(root).not.toMatch(/export\s+(?:const|function)\s+configuredDesignSystem/);
      expect(css).not.toMatch(semanticColorDeclaration);
      expect(css).not.toContain("oklch(");
    }

    const expo = files.get("apps/mobile/global.css") ?? "";
    expect(expo).toStartWith(
      '@import "uniwind";\n@import "@repo/ui/styles/adapters/expo/v1.css";\n',
    );
    expect(expo.match(/^@source /gm)).toHaveLength(3);
    expect(expo).toContain('@source "./app/**/*.{js,jsx,ts,tsx}";');
    expect(expo).toContain('@source "./src/**/*.{js,jsx,ts,tsx}";');
    expect(expo).toContain('@source "./components/**/*.{js,jsx,ts,tsx}";');

    const electron = files.get("apps/desktop/src/renderer/index.css") ?? "";
    expect(electron).toContain("html, body, #root {");
    expect(electron).toContain("height: 100%;");
    const sharedManifest = JSON.parse(files.get("packages/ui/package.json") ?? "null") as {
      dependencies: Record<string, string>;
    };
    expect(sharedManifest.dependencies.uniwind).toBeUndefined();
    const canonicalTheme = files.get("packages/ui/src/styles/theme.css") ?? "";
    expect(canonicalTheme).toMatch(semanticColorDeclaration);
    expect(canonicalTheme).toContain("oklch(");
    for (const [path, css] of files) {
      if (!path.endsWith(".css") || path === "packages/ui/src/styles/theme.css") continue;
      expect(css, path).not.toMatch(semanticColorDeclaration);
      expect(css, path).not.toContain("oklch(");
    }
    for (const app of ["web", "mobile", "desktop"]) {
      const manifest = JSON.parse(files.get(`apps/${app}/package.json`) ?? "null") as {
        dependencies: Record<string, string>;
      };
      const tsconfig = JSON.parse(files.get(`apps/${app}/tsconfig.json`) ?? "null") as {
        compilerOptions: { paths: Record<string, string[]> };
      };
      expect(manifest.dependencies["@repo/ui"]).toBe("workspace:*");
      if (app === "web") {
        expect(tsconfig.compilerOptions.paths["@repo/ui"]).toEqual([
          "../../packages/ui/src/index.ts",
        ]);
        expect(tsconfig.compilerOptions.paths["@repo/ui/*"]).toEqual(["../../packages/ui/src/*"]);
      } else {
        expect(tsconfig.compilerOptions.paths["@repo/ui"]).toBeUndefined();
        expect(tsconfig.compilerOptions.paths["@repo/ui/*"]).toBeUndefined();
      }
      if (app === "mobile") expect(manifest.dependencies.uniwind).toBeTruthy();
      else expect(manifest.dependencies.uniwind).toBeUndefined();
    }
  });

  test("selects the TanStack adapter rather than the generic web adapter", () => {
    const files = byPath(generateProjectFiles(config("monorepo", ["web"], "tanstack-start")));
    const css = files.get("apps/web/src/styles/app.css") ?? "";
    const root = files.get("apps/web/src/routes/__root.tsx") ?? "";
    expect(imports(css)).toEqual(["@repo/ui/styles/adapters/tanstack/v1.css"]);
    expect(root).toContain('import { designSystemContract } from "@repo/ui/contract";');
    expect(root).toContain("web/tanstack/v1");
  });

  test("uses physical relative imports and owns CSS dependencies in single mode", () => {
    const cases = [
      {
        app: "web",
        framework: "nextjs",
        css: "src/app/globals.css",
        root: "src/app/layout.tsx",
        target: "next",
        cssImport: "../platform/ui/styles/adapters/next/v1.css",
        contractImport: "../platform/ui/contract",
      },
      {
        app: "web",
        framework: "tanstack-start",
        css: "src/styles/app.css",
        root: "src/routes/__root.tsx",
        target: "tanstack",
        cssImport: "../platform/ui/styles/adapters/tanstack/v1.css",
        contractImport: "../platform/ui/contract",
      },
      {
        app: "mobile",
        framework: "nextjs",
        css: "global.css",
        root: "app/_layout.tsx",
        target: "expo",
        cssImport: "./src/platform/ui/styles/adapters/expo/v1.css",
        contractImport: "../src/platform/ui/contract",
      },
      {
        app: "desktop",
        framework: "nextjs",
        css: "src/renderer/index.css",
        root: "src/renderer/main.tsx",
        target: "electron",
        cssImport: "../platform/ui/styles/adapters/electron/v1.css",
        contractImport: "../platform/ui/contract",
      },
    ] as const;

    for (const row of cases) {
      const apps = [row.app] as AppName[];
      const framework = row.framework as FrameworkName;
      const generated = generateProjectFiles(config("single", apps, framework));
      expect(
        integrateDesignSystemApplications(
          generated,
          "single",
          resolveDesignSystemApps(apps, framework),
        ),
      ).toEqual(generated);
      const files = byPath(generated);
      expect(imports(files.get(row.css) ?? "")).toEqual([
        ...(row.target === "expo" ? ["uniwind"] : []),
        row.cssImport,
      ]);
      const root = files.get(row.root) ?? "";
      expect(root).toContain(`import { designSystemContract } from "${row.contractImport}";`);
      expect(root).toContain(`/${row.target}/v1`);

      const manifest = JSON.parse(files.get("package.json") ?? "null") as {
        dependencies: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      expect(manifest.dependencies.clsx).toBeTruthy();
      expect(manifest.dependencies.tailwindcss).toBeTruthy();
      expect(manifest.dependencies["tailwind-merge"]).toBeTruthy();
      const adapterDependency = row.target === "expo" ? "uniwind" : "tw-animate-css";
      expect(manifest.dependencies[adapterDependency]).toBeTruthy();
      expect(manifest.devDependencies?.[adapterDependency]).toBeUndefined();
    }
  });
});
