import { describe, expect, test } from "bun:test";
import { pdf as pdfVersions } from "../../packages/versions/src/index.js";
import { projectConfigSchema } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";

type Framework = "nextjs" | "tanstack-start";
type Mode = "monorepo" | "single";

function generated(
  mode: Mode,
  framework: Framework,
  pdf = true,
  deploy: "none" | "vercel" | "fly" | "docker" = "none",
  runtime: "bun" | "node" = "bun",
) {
  return generateProjectFiles(
    projectConfigSchema.parse({
      name: "pdf-production-resolution",
      mode,
      framework,
      runtime,
      database: "postgres",
      preset: "custom",
      auth: true,
      api: true,
      pdf,
      deploy,
      billing: [],
      apps: ["web"],
      features: [],
    }),
    { dryRun: true },
  );
}

function contentAt(files: ReturnType<typeof generated>, path: string): string {
  const content = files.find((entry) => entry.path === path)?.content;
  expect(content, `${path} was not generated`).toBeDefined();
  return content ?? "";
}

function manifestAt(files: ReturnType<typeof generated>, path: string) {
  return JSON.parse(contentAt(files, path)) as {
    dependencies?: Record<string, string>;
    overrides?: Record<string, string>;
    scripts?: Record<string, string>;
  };
}

function expectPin(actual: string | undefined, expected: string): void {
  expect(actual?.replace(/^[~^]/, "")).toBe(expected);
}

describe("PDF production dependency resolution", () => {
  test("only PDF-enabled Bun Next commands preload their declared renderer dependency", () => {
    for (const mode of ["monorepo", "single"] as const) {
      for (const runtime of ["bun", "node"] as const) {
        for (const pdf of [false, true]) {
          const files = generated(mode, "nextjs", pdf, "none", runtime);
          const app = manifestAt(
            files,
            mode === "single" ? "package.json" : "apps/web/package.json",
          );
          for (const phase of ["dev", "build", "start"]) {
            expect(app.scripts?.[phase]?.includes("--preload @react-pdf/renderer")).toBe(
              runtime === "bun" && pdf,
            );
          }
          if (pdf) expect(app.dependencies?.["@react-pdf/renderer"]).toBeDefined();
        }
      }
    }
  });

  test("pins age-eligible renderer and pdfkit releases", () => {
    expect(pdfVersions["@react-pdf/renderer"]).toBe("4.8.1");
    expect(pdfVersions.pdfkit).toBe("0.20.1");
  });

  for (const mode of ["monorepo", "single"] as const) {
    for (const framework of ["nextjs", "tanstack-start"] as const) {
      test(`${mode}/${framework} resolves local fonts from the owning dependency`, () => {
        const files = generated(mode, framework);
        const base = mode === "monorepo" ? "packages/pdf" : "src/server/pdf";
        const fonts = contentAt(files, `${base}/src/lib/fonts.ts`);
        expect(fonts).toContain('Reflect.get(globalThis, "Bun")');
        expect(fonts).toContain("resolveSync");
        expect(fonts).toContain(
          'join(process.cwd(), "node_modules", "dejavu-fonts-ttf", "ttf", fileName)',
        );
        expect(fonts).toContain("statSync(/* turbopackIgnore: true */ resolved).isFile()");
        expect(fonts).not.toMatch(/https?:\/\//);
        expect(fonts).not.toContain("catch");

        for (const template of ["invoice", "certificate", "agreement"]) {
          const source = contentAt(files, `${base}/src/templates/${template}.tsx`);
          expect(source).not.toContain("registerPdfFonts");
          expect(source).not.toContain("node_modules/dejavu-fonts-ttf");
          expect(source).not.toContain("catch {}");
        }

        const render = contentAt(files, `${base}/src/lib/render.ts`);
        expect(render).toContain('import { preparePdfFonts, type PdfFontSources } from "./fonts"');
        expect(render).toContain("preparePdfFonts(sources);");

        const rootManifest = manifestAt(files, "package.json");
        expect(rootManifest.overrides?.pdfkit).toBe(pdfVersions.pdfkit);
        const ownerManifest =
          mode === "monorepo" ? manifestAt(files, "packages/pdf/package.json") : rootManifest;
        expectPin(
          ownerManifest.dependencies?.["@react-pdf/renderer"],
          pdfVersions["@react-pdf/renderer"],
        );
        expectPin(
          ownerManifest.dependencies?.["dejavu-fonts-ttf"],
          pdfVersions["dejavu-fonts-ttf"],
        );
        expectPin(ownerManifest.dependencies?.pdfkit, pdfVersions.pdfkit);

        const appManifest =
          mode === "monorepo" ? manifestAt(files, "apps/web/package.json") : rootManifest;
        expectPin(appManifest.dependencies?.["dejavu-fonts-ttf"], pdfVersions["dejavu-fonts-ttf"]);
        expectPin(appManifest.dependencies?.pdfkit, pdfVersions.pdfkit);

        if (framework === "nextjs") {
          const configPath = mode === "monorepo" ? "apps/web/next.config.ts" : "next.config.ts";
          const nextConfig = contentAt(files, configPath);
          expect(nextConfig).toContain("outputFileTracingIncludes: {");
          expect(nextConfig).toContain('"/api/pdf": [');
          for (const font of [
            "DejaVuSans.ttf",
            "DejaVuSans-Bold.ttf",
            "DejaVuSerif.ttf",
            "DejaVuSerif-Bold.ttf",
          ]) {
            expect(nextConfig).toContain(`"./node_modules/dejavu-fonts-ttf/ttf/${font}"`);
          }
          const routePath =
            mode === "monorepo" ? "apps/web/src/app/api/pdf/route.ts" : "src/app/api/pdf/route.ts";
          expect(contentAt(files, routePath)).toContain("const render = renderPdfToBuffer(");
        } else {
          const serverPath =
            mode === "monorepo"
              ? "apps/web/src/server/http/pdf.server.ts"
              : "src/server/http/pdf.server.ts";
          const server = contentAt(files, serverPath);
          for (const font of [
            "DejaVuSans.ttf",
            "DejaVuSans-Bold.ttf",
            "DejaVuSerif.ttf",
            "DejaVuSerif-Bold.ttf",
          ]) {
            expect(server).toContain(`dejavu-fonts-ttf/ttf/${font}?inline`);
          }
          expect(server).toContain("satisfies PdfFontSources");
          expect(server).toContain("const render = renderPdfToBuffer(");
          expect(server).toContain("embeddedPdfFontSources,");
        }
      });
    }
  }

  test("keeps the PDF dependency override capability-gated", () => {
    for (const mode of ["monorepo", "single"] as const) {
      const files = generated(mode, "nextjs", false);
      const root = manifestAt(files, "package.json");
      expect(root.overrides?.pdfkit).toBeUndefined();
      const appPath = mode === "monorepo" ? "apps/web/package.json" : "package.json";
      const app = manifestAt(files, appPath);
      expect(app.dependencies?.["@react-pdf/renderer"]).toBeUndefined();
      expect(app.dependencies?.["dejavu-fonts-ttf"]).toBeUndefined();
      expect(app.dependencies?.pdfkit).toBeUndefined();
      const configPath = mode === "monorepo" ? "apps/web/next.config.ts" : "next.config.ts";
      expect(contentAt(files, configPath)).not.toContain("outputFileTracingIncludes");
      expect(files.some(({ path }) => path.includes("/pdf/"))).toBe(false);
    }
  });

  test("keeps process-local admission truthful in generated deployment artifacts", () => {
    for (const mode of ["monorepo", "single"] as const) {
      const files = generated(mode, "tanstack-start", true, "fly");
      const fly = contentAt(files, "fly.toml");
      const docker = contentAt(files, "Dockerfile");
      const readmePath =
        mode === "monorepo" ? "packages/pdf/README.md" : "src/server/pdf/README.md";
      const readme = contentAt(files, readmePath);

      expect(fly).toContain("max_machines_running = 1");
      expect(fly).toContain("PDF admission is process-local");
      expect(docker).toContain("Run exactly one web replica");
      expect(readme).toContain("admission counter is deliberately process-local");
      expect(readme).toContain("capability resolver rejects Vercel");
    }
  });

  test("keeps the low-level Nitro/Vercel renderer font-portable behind the rejected deploy binding", () => {
    for (const mode of ["monorepo", "single"] as const) {
      // generateProjectFiles is the renderer layer and intentionally assumes its
      // input was resolved. The public create/V2 resolvers reject this pairing
      // until a shared transactional admission adapter exists.
      const files = generated(mode, "tanstack-start", true, "vercel");
      const nitroPath = mode === "monorepo" ? "apps/web/nitro.config.ts" : "nitro.config.ts";
      const serverPath =
        mode === "monorepo"
          ? "apps/web/src/server/http/pdf.server.ts"
          : "src/server/http/pdf.server.ts";
      expect(contentAt(files, nitroPath)).toContain("preset: 'vercel'");
      expect(contentAt(files, serverPath).match(/\.ttf\?inline/g)).toHaveLength(4);
    }
  });
});
