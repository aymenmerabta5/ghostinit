import { describe, expect, it } from "bun:test";
import { parseSync } from "oxc-parser";
import { resolveCreateConfig } from "../../src/commands/create/resolution.js";
import { generateProjectFiles } from "../../src/templates/default.js";
import type { TemplateFile } from "../../src/templates/shared.js";

type Mode = "monorepo" | "single";
type Framework = "nextjs" | "tanstack-start";
type App = "web" | "mobile" | "desktop";

function resolvePdfProject(mode: Mode, framework: Framework, apps: App[], pdf = true) {
  const singleNative = mode === "single" && apps.length === 1 && apps[0] !== "web";
  return resolveCreateConfig({
    name: "pdf-surface",
    runtime: "bun",
    mode,
    framework,
    database: singleNative ? "none" : "postgres",
    databaseWasExplicit: !singleNative,
    preset: singleNative && !pdf ? "frontend" : "custom",
    apps,
    billing: [],
    features: [],
    cache: "none",
    deploy: "none",
    withAuth: !singleNative,
    withApi: !singleNative,
    withAnalytics: singleNative && !pdf,
    withI18n: singleNative && !pdf,
    withPdf: pdf,
  });
}

function generate(mode: Mode, framework: Framework, apps: App[], pdf = true): TemplateFile[] {
  const result = resolvePdfProject(mode, framework, apps, pdf);
  if (!result.ok) throw new Error(result.message);
  return generateProjectFiles(result.config, { dryRun: true });
}

function contentAt(files: TemplateFile[], path: string): string {
  const entry = files.find((candidate) => candidate.path === path);
  expect(entry, `missing ${path}`).toBeDefined();
  return entry?.content ?? "";
}

describe("PDF application-surface parity", () => {
  const supportedCases = [
    { mode: "monorepo", app: "web", apps: ["web"] },
    { mode: "monorepo", app: "mobile", apps: ["web", "mobile"] },
    { mode: "monorepo", app: "desktop", apps: ["web", "desktop"] },
    { mode: "single", app: "web", apps: ["web"] },
  ] as const satisfies readonly {
    mode: Mode;
    app: App;
    apps: readonly App[];
  }[];

  for (const framework of ["nextjs", "tanstack-start"] as const) {
    for (const { mode, app, apps } of supportedCases) {
      it(`${mode}/${framework}/${apps.join("+")} emits a discoverable secure ${app} PDF client`, () => {
        const files = generate(mode, framework, [...apps]);
        const prefix = mode === "monorepo" ? `apps/${app}/` : "";
        let pagePath: string;
        let adapterPath: string;
        let navigation: string;

        if (app === "web") {
          pagePath =
            mode === "monorepo"
              ? framework === "nextjs"
                ? "apps/web/src/app/pdf/page.tsx"
                : "apps/web/src/routes/pdf.tsx"
              : framework === "nextjs"
                ? "src/app/pdf/page.tsx"
                : "src/routes/pdf.tsx";
          adapterPath =
            mode === "monorepo" ? "packages/pdf/src/client/usePdf.ts" : "src/hooks/usePdf.ts";
          navigation = contentAt(files, `${prefix}src/components/header.tsx`);
          expect(navigation).toContain(framework === "nextjs" ? 'href="/pdf"' : 'to="/pdf"');
          const routePath =
            mode === "monorepo"
              ? framework === "nextjs"
                ? "apps/web/src/app/api/pdf/route.ts"
                : "apps/web/src/routes/api/pdf.ts"
              : framework === "nextjs"
                ? "src/app/api/pdf/route.ts"
                : "src/routes/api/pdf.ts";
          const route = contentAt(files, routePath);
          const implementation =
            framework === "tanstack-start"
              ? contentAt(
                  files,
                  mode === "monorepo"
                    ? "apps/web/src/server/http/pdf.server.ts"
                    : "src/server/http/pdf.server.ts",
                )
              : route;

          if (framework === "tanstack-start") {
            expect(route).toContain('import { createServerOnlyFn } from "@tanstack/react-start"');
            expect(route).toMatch(
              /const dispatchPdfRequest = createServerOnlyFn\(async \(request: Request\): Promise<Response> => \{\s*const \{ handlePdfRequest \} = await import\("@\/server\/http\/pdf\.server"\);\s*return await handlePdfRequest\(request\);\s*\}\);/,
            );
            expect(route).toContain(
              "POST: ({ request }: { request: Request }) => dispatchPdfRequest(request)",
            );
            expect(route).not.toContain(
              '(await import("@/server/http/pdf.server")).handlePdfRequest(request)',
            );
            expect(route).not.toContain("normalizePdfData");
            expect(route).not.toContain("admitPdfRender");
            expect(implementation).toContain('import "server-only"');
          }

          expect(implementation).toContain("normalizePdfData(template, record.data)");
          expect(implementation).toContain("admitPdfRender(actorId)");
        } else if (app === "mobile") {
          pagePath = `${prefix}app/pdf.tsx`;
          adapterPath =
            mode === "monorepo" ? "apps/mobile/src/hooks/usePdf.ts" : "src/hooks/usePdfMobile.ts";
          navigation = `${contentAt(files, `${prefix}src/components/header.tsx`)}\n${contentAt(files, `${prefix}app/_layout.tsx`)}`;
          expect(navigation).toContain('href="/pdf"');
          expect(navigation).toContain('name="pdf"');
        } else {
          pagePath = `${prefix}src/renderer/routes/pdf.tsx`;
          adapterPath = `${prefix}src/lib/pdf.ts`;
          navigation = `${contentAt(files, `${prefix}src/renderer/routes/__root.tsx`)}\n${contentAt(files, `${prefix}src/renderer/routeTree.gen.ts`)}`;
          expect(navigation).toContain('to="/pdf"');
          expect(navigation).toContain("Route as PdfRoute");
        }

        const page = contentAt(files, pagePath);
        const adapter = contentAt(files, adapterPath);
        expect(parseSync(pagePath, page).errors).toEqual([]);
        expect(parseSync(adapterPath, adapter).errors).toEqual([]);
        expect(page).toContain("samplePdfData");
        expect(page).toContain("invoice");
        expect(page).toContain("certificate");
        expect(page).toContain("agreement");
        expect(page).not.toContain("logoUrl:");
        expect(page).not.toContain("qrCodeDataUrl:");
        expect(adapter).toContain('credentials: "include"');
        expect(adapter).toContain(
          app === "web" ? "current application origin" : "configured API origin",
        );
        expect(adapter).not.toContain("await res.json() as");
        if (app === "desktop") {
          expect(adapter).toContain("desktopBridgeFetch(url");
          expect(adapter).toContain("window.desktopBridge.apiUrl");
          expect(adapter).not.toContain("await fetch(url");
        }
        expect(`${page}\n${adapter}`).not.toMatch(
          /\bas any\b|as unknown as|@ts-(?:ignore|nocheck)/,
        );

        const serverRoutes = files.filter(
          ({ path }) => path.endsWith("app/api/pdf/route.ts") || path.endsWith("routes/api/pdf.ts"),
        );
        expect(serverRoutes).toHaveLength(1);
      });
    }
  }

  it("all monorepo apps share one server route and keep platform adapters separate", () => {
    const files = generate("monorepo", "nextjs", ["web", "mobile", "desktop"]);
    expect(files.filter(({ path }) => path.endsWith("app/api/pdf/route.ts"))).toHaveLength(1);
    const expected = [
      "packages/pdf/src/client/usePdf.ts",
      "apps/mobile/src/hooks/usePdf.ts",
      "apps/desktop/src/lib/pdf.ts",
    ];
    for (const path of expected)
      expect(
        files.some((entry) => entry.path === path),
        path,
      ).toBe(true);
  });

  it("rejects single native PDF selections without a backend host", () => {
    for (const framework of ["nextjs", "tanstack-start"] as const) {
      for (const app of ["mobile", "desktop"] as const) {
        const result = resolvePdfProject("single", framework, [app], true);
        expect(result.ok, `${framework}/${app}`).toBe(false);
        if (result.ok) throw new Error(`single ${app} PDF must remain unreachable`);
        expect(result.reason).toBe("single-native-server-capabilities-unsupported");
        expect(result.unsupportedSelections).toEqual(
          expect.arrayContaining(["auth", "api", "pdf"]),
        );
      }
    }
  });

  it("capability-off output has no PDF routes, adapters, navigation, or package dependency", () => {
    const disabledCases = [
      { mode: "monorepo", apps: ["web", "mobile", "desktop"] },
      { mode: "single", apps: ["web"] },
      { mode: "single", apps: ["mobile"] },
      { mode: "single", apps: ["desktop"] },
    ] as const satisfies readonly { mode: Mode; apps: readonly App[] }[];
    for (const { mode, apps } of disabledCases) {
      const files = generate(mode, "nextjs", [...apps], false);
      const source = files.map(({ content }) => content).join("\n");
      expect(files.some(({ path }) => /(?:^|\/)pdf(?:\/|\.tsx?$)/i.test(path))).toBe(false);
      expect(source).not.toContain('href="/pdf"');
      expect(source).not.toContain('to="/pdf"');
      const rootManifest = JSON.parse(contentAt(files, "package.json")) as {
        dependencies?: Record<string, string>;
      };
      expect(rootManifest.dependencies?.["@react-pdf/renderer"]).toBeUndefined();
      if (mode === "single" && apps[0] !== "web") {
        expect(
          files.some(
            ({ path }) =>
              path === (apps[0] === "mobile" ? "app/index.tsx" : "src/renderer/routes/index.tsx"),
          ),
        ).toBe(true);
      }
    }
  });
});
