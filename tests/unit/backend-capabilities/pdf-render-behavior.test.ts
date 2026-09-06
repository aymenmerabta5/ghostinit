import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { pdfFilesWithApps } from "../../../src/templates/pdf/index.js";

const require = createRequire(import.meta.url);
const transpiler = new Bun.Transpiler({ loader: "ts", target: "bun" });
type PdfResponse = { pdfBase64: string; fileName: string };
type Renderer = {
  renderPdfToBuffer(element: unknown, sources?: Record<string, string>): Promise<Uint8Array>;
  PdfRenderBusyError: typeof Error;
};

describe("generated PDF operation", () => {
  test("renders every generated document with local fonts after enforcing request authorization", async () => {
    const react = (await import(pathToFileURL(require.resolve("react")).href)) as {
      createElement(component: unknown, props: unknown): unknown;
    };
    const fontPaths = [
      "DejaVuSans.ttf",
      "DejaVuSans-Bold.ttf",
      "DejaVuSerif.ttf",
      "DejaVuSerif-Bold.ttf",
    ].map((name) => require.resolve(`dejavu-fonts-ttf/ttf/${name}`));
    for (const mode of ["monorepo", "single"] as const) {
      for (const framework of ["nextjs", "tanstack-start"] as const) {
        const files = pdfFilesWithApps(mode, false, false, framework, true);
        const prefix = mode === "monorepo" ? "packages/pdf/src/" : "src/server/pdf/src/";
        const root = mkdtempSync(join(tmpdir(), "ghostinit-pdf-render-"));
        try {
          symlinkSync(
            resolve(import.meta.dir, "../../../node_modules"),
            join(root, "node_modules"),
            process.platform === "win32" ? "junction" : "dir",
          );
          for (const file of files.filter((entry) => entry.path.startsWith(prefix))) {
            const destination = join(root, file.path.slice(prefix.length));
            mkdirSync(dirname(destination), { recursive: true });
            writeFileSync(destination, file.content, "utf8");
          }
          const load = async (path: string) =>
            (await import(pathToFileURL(join(root, path)).href)) as Record<string, unknown>;
          const invoice = await load("templates/invoice.tsx");
          const certificate = await load("templates/certificate.tsx");
          const agreement = await load("templates/agreement.tsx");
          const renderer = (await load("lib/render.ts")) as unknown as Renderer;
          const source = files.find((entry) =>
            framework === "nextjs"
              ? entry.path.endsWith("app/api/pdf/route.ts")
              : entry.path.endsWith("server/http/pdf.server.ts"),
          )?.content;
          if (!source) throw new Error("Missing generated PDF request handler");
          const javascript = transpiler.transformSync(
            source.replace(/^import[^;]+;\s*/gm, "").replace(/^export /gm, ""),
          );
          let actor: { id: string; banned?: boolean } | undefined;
          let renders = 0;
          const handler = new Function(
            "renderPdfToBuffer",
            "createElement",
            "createContext",
            "InvoiceTemplate",
            "CertificateTemplate",
            "AgreementTemplate",
            "PdfRenderBusyError",
            "NextResponse",
            "sansFont",
            "sansBoldFont",
            "serifFont",
            "serifBoldFont",
            javascript + `\nreturn ${framework === "nextjs" ? "POST" : "handlePdfRequest"};`,
          )(
            async (element: unknown, sources?: Record<string, string>) => {
              renders += 1;
              return await renderer.renderPdfToBuffer(element, sources);
            },
            react.createElement,
            async () => ({ user: actor }),
            invoice.InvoiceTemplate,
            certificate.CertificateTemplate,
            agreement.AgreementTemplate,
            renderer.PdfRenderBusyError,
            Response,
            ...fontPaths,
          ) as (request: Request) => Promise<Response>;
          const request = (body: unknown) =>
            new Request("https://app.example.test/api/pdf", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(body),
            });
          let reads = 0;
          const unauthorized = request({});
          Object.defineProperty(unauthorized, "body", {
            get: () => {
              reads += 1;
              throw new Error("unauthorized request body read");
            },
          });
          expect((await handler(unauthorized)).status).toBe(401);
          actor = { id: "suspended", banned: true };
          expect((await handler(request({}))).status).toBe(403);
          expect(reads).toBe(0);
          expect(renders).toBe(0);

          for (const template of ["invoice", "certificate", "agreement"] as const) {
            const examples = await load(`examples/${template}.example.ts`);
            const exportName = `example${template[0]!.toUpperCase()}${template.slice(1)}Data`;
            for (const locale of ["en", "fr", "ar"]) {
              actor = { id: `${template}-${locale}` };
              const response = await handler(
                request({ template, locale, data: examples[exportName] }),
              );
              expect(response.status, `${mode}/${framework}/${template}/${locale}`).toBe(200);
              expect(response.headers.get("cache-control")).toBe("private, no-store");
              const body = (await response.json()) as PdfResponse;
              expect(body.fileName).toBe(`${template}.pdf`);
              const bytes = Buffer.from(body.pdfBase64, "base64");
              expect(bytes.length).toBeGreaterThan(1000);
              expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
              expect(bytes.subarray(-32).toString()).toContain("%%EOF");
            }
          }
          const acceptedRenders = renders;
          actor = { id: "invalid-input" };
          const invalid = await handler(
            request({ template: "invoice", data: { issuedAt: "invalid-date" } }),
          );
          expect(invalid.status).toBe(400);
          expect(renders).toBe(acceptedRenders);
        } finally {
          rmSync(root, { recursive: true, force: true });
        }
      }
    }
  });
});
