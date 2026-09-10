import { describe, expect, test } from "bun:test";
import { parseSync } from "oxc-parser";
import { resolveCreateConfig } from "../../src/commands/create/resolution.js";
import { buildProjectGenerationPlan } from "../../src/templates/default.js";

const targets = [
  { label: "next", app: "web", framework: "nextjs" },
  { label: "tanstack", app: "web", framework: "tanstack-start" },
  { label: "expo", app: "mobile", framework: "nextjs" },
  { label: "electron", app: "desktop", framework: "nextjs" },
] as const;

describe("generated text branding integration", () => {
  for (const mode of ["single", "monorepo"] as const) {
    for (const target of targets) {
      test(`${mode}/${target.label} emits and mounts a parseable wordmark without rejected image wiring`, () => {
        const singleNative = mode === "single" && target.app !== "web";
        const resolution = resolveCreateConfig({
          name: "wordmark-integration",
          runtime: "bun",
          mode,
          framework: target.framework,
          database: singleNative ? "none" : "postgres",
          databaseWasExplicit: true,
          preset: singleNative ? "frontend" : "saas",
          apps: mode === "monorepo" && target.app !== "web" ? ["web", target.app] : [target.app],
          billing: [],
          features: [],
          cache: "none",
          deploy: "none",
        });
        if (!resolution.ok) throw new Error(resolution.message);
        const plan = buildProjectGenerationPlan(resolution.resolvedConfig);
        const files = new Map(plan.files.map((entry) => [entry.physicalPath, entry.content]));
        const prefix = mode === "monorepo" ? `apps/${target.app}/` : "";
        const wordmarkRoot =
          mode === "monorepo" && target.app === "desktop"
            ? "apps/desktop/src/renderer"
            : `${prefix}src`;
        const wordmarkPath = `${wordmarkRoot}/components/brand-wordmark.tsx`;
        const wordmark = files.get(wordmarkPath);
        expect(wordmark, wordmarkPath).toBeDefined();
        expect(parseSync(wordmarkPath, wordmark!).errors).toEqual([]);
        expect(wordmark).toContain("export function BrandWordmark");
        expect(wordmark).not.toMatch(/<img|<Image|<svg|next\/image|lucide|uniwind/);
        expect(wordmark!.includes('from "react-native"')).toBe(target.app === "mobile");
        if (mode === "monorepo" && target.app === "desktop") {
          expect(files.has("apps/desktop/src/components/brand-wordmark.tsx")).toBe(false);
        }
        const consumers =
          target.app === "web"
            ? [
                `${prefix}src/components/header.tsx`,
                `${prefix}src/components/workspace-navigation-trigger.tsx`,
              ]
            : target.app === "mobile"
              ? [
                  `${prefix}${singleNative ? "src/features/marketing/screen.tsx" : "src/features/app-shell/header.tsx"}`,
                ]
              : [`${prefix}src/renderer/features/app-shell/app-shell.tsx`];
        for (const path of consumers) {
          const source = files.get(path);
          expect(source, path).toBeDefined();
          expect(parseSync(path, source!).errors).toEqual([]);
          expect(source).toContain("<BrandWordmark />");
          expect(source).toContain(
            "components/brand-wordmark".replace(
              "components/",
              target.app === "web" ? "./" : "@/components/",
            ),
          );
          expect(source).not.toMatch(/BrandMark|brand-mark|brandAssets|brandFavicons|data:image/);
        }
        expect(
          [...files.keys()].filter((path) =>
            /(?:brand-data\.ts|brand-mark\.tsx|brand-assets\.ts)$/.test(path),
          ),
        ).toEqual([]);
        const uiRoot = mode === "monorepo" ? "packages/ui/src" : "src/platform/ui";
        expect(files.get(`${uiRoot}/index.ts`)).not.toMatch(/brandAssets|brandFavicons|brand-data/);
        if (target.app === "web") {
          const root = files.get(
            `${prefix}src/${target.framework === "nextjs" ? "app/layout.tsx" : "routes/__root.tsx"}`,
          );
          expect(root).not.toMatch(/brandFavicons|brandAssets|brand-data|data:image/);
        }
      });
    }
  }
});
