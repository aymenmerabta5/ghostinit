import { file, packageJson, tsconfig, type TemplateFile, codeScripts } from "../shared.js";
import * as v from "../versions.js";
import { verificationContent } from "./lib/verification.js";
import { qrContent } from "./lib/qr.js";
import { renderContent } from "./lib/render.js";
import { fontsContent } from "./lib/fonts.js";
import { pdfLocaleContent } from "./lib/locale.js";
import {
  borderClassicContent,
  borderFormalContent,
  borderMinimalContent,
  borderModernContent,
  borderOrnateContent,
  borderPremiumContent,
  bordersIndexContent,
} from "./templates/borders.js";
import { invoiceTemplateContent } from "./templates/invoice.js";
import { certificateTemplateContent } from "./templates/certificate.js";
import { agreementTemplateContent } from "./templates/agreement.js";
import {
  invoiceExampleContent,
  certificateExampleContent,
  agreementExampleContent,
} from "./examples.js";
import { usePdfHookContent, usePdfMobileContent, desktopPdfHelperContent } from "./client.js";
import { pdfDesktopPageContent, pdfExpoPageContent, pdfWebPageContent } from "./surfaces.js";

type PdfMode = "monorepo" | "single";

function pdfPackageFiles(mode: PdfMode, hasWeb: boolean): TemplateFile[] {
  const base = mode === "monorepo" ? "packages/pdf" : "src/server/pdf";
  const isMonorepo = mode === "monorepo";
  const serverImport = isMonorepo ? "@repo/pdf" : "@/server/pdf/src";
  const webClientImport = isMonorepo ? "@repo/pdf/client/usePdf" : "@/hooks/usePdf";
  const mobileClientImport = isMonorepo ? "@/hooks/usePdf" : "@/hooks/usePdfMobile";
  return [
    ...(isMonorepo
      ? [
          file(
            `${base}/package.json`,
            packageJson({
              name: "@repo/pdf",
              exports: {
                ".": "./src/index.ts",
                "./client/usePdf": "./src/client/usePdf.ts",
                "./templates/invoice": "./src/templates/invoice.tsx",
                "./templates/certificate": "./src/templates/certificate.tsx",
                "./templates/agreement": "./src/templates/agreement.tsx",
              },
              scripts: codeScripts(),
              dependencies: {
                "@react-pdf/renderer": `^${v.pdf["@react-pdf/renderer"]}`,
                "dejavu-fonts-ttf": `^${v.pdf["dejavu-fonts-ttf"]}`,
                pdfkit: `^${v.pdf.pdfkit}`,
                qrcode: `^${v.pdf.qrcode}`,
                react: `^${v.nextStack.react}`,
              },
              devDependencies: {
                "bun-types": `^${v.runtime.bun}`,
                "@types/node": `^${v.runtime["@types/node"]}`,
                "@types/qrcode": `^${v.pdf["@types/qrcode"]}`,
                "@types/react": `^${v.nextStack["@types/react"]}`,
                typescript: `^${v.typescript.typescript}`,
              },
            }),
          ),
          file(
            `${base}/tsconfig.json`,
            tsconfig({
              include: ["src/**/*", "tests/**/*"],
              compilerOptions: {
                types: ["bun-types/test", "node", "react"],
                jsx: "react-jsx",
                composite: true,
                declaration: true,
                declarationMap: true,
                sourceMap: true,
                outDir: "./dist",
                rootDir: ".",
              },
            }),
          ),
        ]
      : []),
    file(
      `${base}/src/index.ts`,
      `export * from "./lib/verification.js";
export * from "./lib/qr.js";
 export * from "./lib/render.js";
export { registerPdfFonts, type PdfFontSources } from "./lib/fonts.js";
export { normalizePdfLocale, pdfLocaleTag, pdfMessage, pdfRowDirection, pdfTextAlign, pdfTextDirection, type PdfLocale, type PdfMessageKey } from "./lib/locale.js";
export * from "./templates/invoice.js";
export * from "./templates/certificate.js";
export * from "./templates/agreement.js";
export * from "./borders/index.js";
export type { InvoiceData } from "./templates/invoice.js";
export type { CertificateData } from "./templates/certificate.js";
export type { AgreementData } from "./templates/agreement.js";
`,
    ),
    file(`${base}/src/lib/verification.ts`, verificationContent()),
    file(`${base}/src/lib/qr.ts`, qrContent()),
    file(`${base}/src/lib/render.ts`, renderContent()),
    file(`${base}/src/lib/fonts.ts`, fontsContent()),
    file(`${base}/src/lib/locale.ts`, pdfLocaleContent()),
    file(`${base}/src/borders/BorderClassic.tsx`, borderClassicContent()),
    file(`${base}/src/borders/BorderFormal.tsx`, borderFormalContent()),
    file(`${base}/src/borders/BorderMinimal.tsx`, borderMinimalContent()),
    file(`${base}/src/borders/BorderModern.tsx`, borderModernContent()),
    file(`${base}/src/borders/BorderOrnate.tsx`, borderOrnateContent()),
    file(`${base}/src/borders/BorderPremium.tsx`, borderPremiumContent()),
    file(`${base}/src/borders/index.ts`, bordersIndexContent()),
    file(`${base}/src/templates/invoice.tsx`, invoiceTemplateContent()),
    file(`${base}/src/templates/certificate.tsx`, certificateTemplateContent()),
    file(`${base}/src/templates/agreement.tsx`, agreementTemplateContent()),
    file(`${base}/src/examples/invoice.example.ts`, invoiceExampleContent()),
    file(`${base}/src/examples/certificate.example.ts`, certificateExampleContent()),
    file(`${base}/src/examples/agreement.example.ts`, agreementExampleContent()),
    ...(isMonorepo || hasWeb
      ? [
          file(
            isMonorepo ? `${base}/src/client/usePdf.ts` : "src/hooks/usePdf.ts",
            usePdfHookContent(base),
          ),
        ]
      : []),
    file(
      `${base}/README.md`,
      `# ${serverImport}

Server-side PDF generation via \`@react-pdf/renderer\` + \`qrcode\` + \`dejavu-fonts-ttf\`.

## Templates
- \`InvoiceTemplate\` — A4 portrait, items table, totals, notes
- \`CertificateTemplate\` — A4 landscape, border styles, QR verification
- \`AgreementTemplate\` — A4 landscape, multi-party, signatures

## Borders
\`classic | formal | minimal | modern | ornate | premium\` in \`src/borders/\`

## Usage (server)
\`\`\`ts
import {
  generateQRCodeDataUrl,
  generateVerificationCode,
  InvoiceTemplate,
  renderPdfToBuffer,
} from "${serverImport}";
import { createElement } from "react";

const code = generateVerificationCode();
const qr = await generateQRCodeDataUrl(\`https://example.com/verify/\${code}\`);
const buffer = await renderPdfToBuffer(createElement(InvoiceTemplate, { data: { ...exampleInvoiceData, verificationCode: code, qrCodeDataUrl: qr } }));
// buffer is Node Buffer — persist to S3 or return base64
\`\`\`

## API route (Next.js)
The generated \`/api/pdf\` route requires an authenticated session before it
consumes the body. It accepts only bounded JSON, enforces depth/item/text and
per-actor admission limits, caps rendered output, and returns generic internal
errors. The generated admission counter is deliberately process-local: run one
web replica (the Fly profile constrains this), keep Docker at one replica, or
replace it with a shared transactional admission adapter before scaling. The
capability resolver rejects Vercel because a serverless fleet cannot enforce
these limits globally. Do not replace the route with an unbounded
\`request.json()\` handler.

Use \`renderPdfToBuffer\` for server rendering. It admits at most two calls,
serializes font setup and rendering, and reloads local font faces for each
document so Arabic shaping state cannot leak between requests. A full renderer
returns \`PdfRenderBusyError\`, mapped by the HTTP route to a retryable 429.

## Client (web)
\`\`\`ts
import { usePdf } from "${webClientImport}";
const { generate } = usePdf();
await generate({ template: "invoice", data: exampleInvoiceData });
\`\`\`

## Expo (mobile) — recommended
Do NOT bundle \`@react-pdf/renderer\` on device. Call the server endpoint and use expo-file-system + expo-sharing:

\`\`\`ts
import { usePdfMobile } from "${mobileClientImport}";
await generateAndShare({ template: "certificate", data: exampleCertificateData });
\`\`\`

## Desktop (Electron)
Same HTTP path as web. Electron main is Node so you *can* import
\`${serverImport}\` directly in main process, but prefer HTTP for parity.

## Single mode
Import server APIs from \`@/server/pdf/src\` instead of \`@repo/pdf\`. The web-only
hook is emitted at \`@/hooks/usePdf\`; client code is never placed below
\`src/server\`.

## GenerationMatrix
Every \`.ts/.tsx\` parses and relative imports resolve for both \`monorepo\` and \`single\` via \`oxc-parser\`.
`,
    ),
    file(
      `${base}/tests/barrel.test.ts`,
      `import { describe, it, expect } from "bun:test";
import * as mod from "../src/index.js";
describe("@repo/pdf barrel", () => {
  it("loads", () => { expect(typeof mod.generateVerificationCode).toBe("function"); });
});
`,
    ),
  ];
}

const PDF_ROUTE_GUARDS = `const MAX_PDF_REQUEST_BYTES = 64 * 1024;
const MAX_PDF_OUTPUT_BYTES = 8 * 1024 * 1024;
const MAX_ACTIVE_PDF_RENDERS = 2;
const PDF_RATE_WINDOW_MS = 60_000;
const MAX_PDF_RENDERS_PER_WINDOW = 5;
const PDF_BODY_TIMEOUT_MS = 10_000;
const PDF_RENDER_TIMEOUT_MS = 15_000;

class PdfRequestError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

class PdfRenderTimeoutError extends PdfRequestError {
  constructor() {
    super(504, "PDF generation timed out");
  }
}

type PdfRequestBody = {
  template: "invoice" | "certificate" | "agreement";
  data: unknown;
  locale?: string;
};

interface PdfAuthorizationContext {
  readonly user?: {
    readonly id: string;
    readonly banned?: boolean | null;
  };
}

let activePdfRenders = 0;
const pdfRate = new Map<string, { count: number; windowStartedAt: number }>();

function requirePdfActor(context: PdfAuthorizationContext): string {
  if (!context.user?.id) throw new PdfRequestError(401, "Unauthorized");
  if (context.user.banned === true) {
    throw new PdfRequestError(403, "Suspended accounts cannot generate PDFs");
  }
  return context.user.id;
}

async function resolvePdfActor(headers: Headers): Promise<string> {
  try {
    return requirePdfActor(await createContext(headers));
  } catch (error) {
    if (error instanceof PdfRequestError) throw error;
    throw new PdfRequestError(503, "Authentication service unavailable");
  }
}

function validateJsonBudget(root: unknown): void {
  const stack: Array<{ value: unknown; depth: number }> = [{ value: root, depth: 0 }];
  let nodes = 0;
  while (stack.length > 0) {
    const current = stack.pop()!;
    nodes += 1;
    if (nodes > 2_000 || current.depth > 10) {
      throw new PdfRequestError(400, "PDF data is too complex");
    }
    const value = current.value;
    if (value === null || typeof value === "boolean") continue;
    if (typeof value === "string") {
      if (value.length > 10_000) throw new PdfRequestError(400, "PDF text is too long");
      continue;
    }
    if (typeof value === "number") {
      if (!Number.isFinite(value)) throw new PdfRequestError(400, "PDF data contains an invalid number");
      continue;
    }
    if (Array.isArray(value)) {
      if (value.length > 100) throw new PdfRequestError(400, "PDF data contains too many items");
      for (const item of value) stack.push({ value: item, depth: current.depth + 1 });
      continue;
    }
    if (typeof value !== "object") throw new PdfRequestError(400, "PDF data must be JSON-compatible");
    const entries = Object.entries(value);
    if (entries.length > 100) throw new PdfRequestError(400, "PDF data contains too many fields");
    for (const [key, child] of entries) {
      if (key === "__proto__" || key === "constructor" || key === "prototype") {
        throw new PdfRequestError(400, "PDF data contains a forbidden field");
      }
      if (key === "logoUrl" || key === "issuerLogoUrl" || key === "qrCodeDataUrl") {
        if (child !== undefined && child !== null && child !== "") {
          throw new PdfRequestError(400, "Client-supplied PDF images are not supported");
        }
      }
      stack.push({ value: child, depth: current.depth + 1 });
    }
  }
}

function pdfRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new PdfRequestError(400, "PDF template data must be an object");
  }
  return value as Record<string, unknown>;
}

function pdfDate(value: unknown, field: string, required: boolean): Date | null | undefined {
  if (value === null && !required) return null;
  if (value === undefined && !required) return undefined;
  if (typeof value !== "string" && typeof value !== "number") {
    throw new PdfRequestError(400, \`PDF \${field} must be an ISO date\`);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new PdfRequestError(400, \`PDF \${field} is invalid\`);
  return date;
}

function normalizePdfData(template: PdfRequestBody["template"], value: unknown): Record<string, unknown> {
  const source = pdfRecord(value);
  const data: Record<string, unknown> = { ...source };
  if (template === "invoice") {
    data.issuedAt = pdfDate(source.issuedAt, "issuedAt", true);
    if (source.dueDate !== undefined) data.dueDate = pdfDate(source.dueDate, "dueDate", false);
  } else if (template === "certificate") {
    if (source.issuedAt !== undefined) data.issuedAt = pdfDate(source.issuedAt, "issuedAt", false);
    if (source.validUntil !== undefined) data.validUntil = pdfDate(source.validUntil, "validUntil", false);
  } else {
    data.effectiveDate = pdfDate(source.effectiveDate, "effectiveDate", true);
    if (source.expiryDate !== undefined) data.expiryDate = pdfDate(source.expiryDate, "expiryDate", false);
  }
  return data;
}

async function readPdfRequest(request: Request): Promise<PdfRequestBody> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") throw new PdfRequestError(415, "Content-Type must be application/json");
  const declared = request.headers.get("content-length");
  if (declared && (!/^\\d+$/.test(declared) || Number(declared) > MAX_PDF_REQUEST_BYTES)) {
    throw new PdfRequestError(413, "PDF request is too large");
  }
  const reader = request.body?.getReader();
  if (!reader) throw new PdfRequestError(400, "PDF request body is required");
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    void reader.cancel("PDF request body timeout").catch(() => undefined);
  }, PDF_BODY_TIMEOUT_MS);
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_PDF_REQUEST_BYTES) {
        void reader.cancel("PDF request limit exceeded").catch(() => undefined);
        throw new PdfRequestError(413, "PDF request is too large");
      }
      chunks.push(value);
    }
    if (timedOut) throw new PdfRequestError(408, "PDF request body timed out");
  } finally {
    clearTimeout(timeout);
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new PdfRequestError(400, "PDF request contains invalid JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new PdfRequestError(400, "PDF request must be an object");
  }
  const record = parsed as Record<string, unknown>;
  const template = record.template;
  if (template !== "invoice" && template !== "certificate" && template !== "agreement") {
    throw new PdfRequestError(400, "Unknown PDF template");
  }
  if (!("data" in record)) throw new PdfRequestError(400, "PDF data is required");
  if (record.locale !== undefined && (typeof record.locale !== "string" || !/^[A-Za-z]{2}(?:-[A-Za-z]{2})?$/.test(record.locale))) {
    throw new PdfRequestError(400, "Invalid PDF locale");
  }
  validateJsonBudget(record.data);
  return {
    template,
    data: normalizePdfData(template, record.data),
    ...(typeof record.locale === "string" ? { locale: record.locale } : {}),
  };
}

async function renderWithDeadline<T>(render: Promise<T>): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      render,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new PdfRenderTimeoutError()), PDF_RENDER_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function admitPdfRender(actorId: string): () => void {
  const now = Date.now();
  for (const [key, value] of pdfRate) {
    if (now - value.windowStartedAt >= PDF_RATE_WINDOW_MS) pdfRate.delete(key);
  }
  if (pdfRate.size > 10_000) throw new PdfRequestError(503, "PDF service is busy");
  const current = pdfRate.get(actorId);
  const entry = !current || now - current.windowStartedAt >= PDF_RATE_WINDOW_MS
    ? { count: 0, windowStartedAt: now }
    : current;
  if (entry.count >= MAX_PDF_RENDERS_PER_WINDOW || activePdfRenders >= MAX_ACTIVE_PDF_RENDERS) {
    throw new PdfRequestError(429, "PDF generation limit reached");
  }
  entry.count += 1;
  pdfRate.set(actorId, entry);
  activePdfRenders += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    activePdfRenders = Math.max(0, activePdfRenders - 1);
  };
}

function safePdfError(error: unknown): { status: number; message: string } {
  if (error instanceof PdfRenderBusyError) return { status: 429, message: error.message };
  if (error instanceof PdfRequestError) return { status: error.status, message: error.message };
  console.error("[pdf] generation failed", { error: error instanceof Error ? error.name : "UnknownError" });
  return { status: 500, message: "PDF generation failed" };
}`;

function pdfRouteNextContent(importPrefix: string, apiPrefix: string): string {
  return `import { NextRequest, NextResponse } from "next/server";
import { createElement } from "react";
import type { ComponentType } from "react";
import { createContext } from "${apiPrefix}";
import { InvoiceTemplate, CertificateTemplate, AgreementTemplate, renderPdfToBuffer, PdfRenderBusyError } from "${importPrefix}";

${PDF_ROUTE_GUARDS}

const templates: Record<string, unknown> = { invoice: InvoiceTemplate, certificate: CertificateTemplate, agreement: AgreementTemplate };

export async function POST(req: NextRequest): Promise<NextResponse> {
  let release: (() => void) | undefined;
  try {
    const actorId = await resolvePdfActor(req.headers);
    release = admitPdfRender(actorId);
    const body = await readPdfRequest(req);
    const Comp = templates[body.template] as ComponentType<{ data: unknown; locale?: string }>;
    const render = renderPdfToBuffer(
      createElement(Comp, { data: body.data, locale: body.locale }),
    );
    let buffer: Awaited<typeof render>;
    try {
      buffer = await renderWithDeadline(render);
    } catch (error) {
      if (error instanceof PdfRenderTimeoutError) {
        const lateRelease = release;
        release = undefined;
        void render.finally(() => lateRelease?.()).catch(() => undefined);
      }
      throw error;
    }
    if (buffer.byteLength > MAX_PDF_OUTPUT_BYTES) {
      throw new PdfRequestError(413, "Generated PDF is too large");
    }
    const pdfBase64 = Buffer.from(buffer).toString("base64");
    return NextResponse.json(
      { pdfBase64, fileName: \`\${body.template}.pdf\` },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    const safe = safePdfError(error);
    return NextResponse.json(
      { error: safe.message },
      { status: safe.status, headers: { "Cache-Control": "private, no-store" } },
    );
  } finally {
    release?.();
  }
}
`;
}

function pdfServerTanstackContent(importPrefix: string, apiPrefix: string): string {
  return `import "server-only";
import { createElement } from "react";
import type { ComponentType } from "react";
import { createContext } from "${apiPrefix}";
import {
  InvoiceTemplate,
  CertificateTemplate,
  AgreementTemplate,
  renderPdfToBuffer,
  PdfRenderBusyError,
  type PdfFontSources,
} from "${importPrefix}";
import sansFont from "dejavu-fonts-ttf/ttf/DejaVuSans.ttf?inline";
import sansBoldFont from "dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf?inline";
import serifFont from "dejavu-fonts-ttf/ttf/DejaVuSerif.ttf?inline";
import serifBoldFont from "dejavu-fonts-ttf/ttf/DejaVuSerif-Bold.ttf?inline";

${PDF_ROUTE_GUARDS}

const templates: Record<string, unknown> = { invoice: InvoiceTemplate, certificate: CertificateTemplate, agreement: AgreementTemplate };
const embeddedPdfFontSources = {
  sans: sansFont,
  sansBold: sansBoldFont,
  serif: serifFont,
  serifBold: serifBoldFont,
} satisfies PdfFontSources;

export async function handlePdfRequest(request: Request): Promise<Response> {
  let release: (() => void) | undefined;
  try {
    const actorId = await resolvePdfActor(request.headers);
    release = admitPdfRender(actorId);
    const body = await readPdfRequest(request);
    const Comp = templates[body.template] as ComponentType<{ data: unknown; locale?: string }>;
    const render = renderPdfToBuffer(
      createElement(Comp, { data: body.data, locale: body.locale }),
      embeddedPdfFontSources,
    );
    let buffer: Awaited<typeof render>;
    try {
      buffer = await renderWithDeadline(render);
    } catch (error) {
      if (error instanceof PdfRenderTimeoutError) {
        const lateRelease = release;
        release = undefined;
        void render.finally(() => lateRelease?.()).catch(() => undefined);
      }
      throw error;
    }
    if (buffer.byteLength > MAX_PDF_OUTPUT_BYTES) {
      throw new PdfRequestError(413, "Generated PDF is too large");
    }
    const pdfBase64 = Buffer.from(buffer).toString("base64");
    return Response.json(
      { pdfBase64, fileName: \`\${body.template}.pdf\` },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    const safe = safePdfError(error);
    return Response.json(
      { error: safe.message },
      { status: safe.status, headers: { "Cache-Control": "private, no-store" } },
    );
  } finally {
    release?.();
  }
}
`;
}

function pdfRouteTanstackContent(): string {
  return `import { createServerOnlyFn } from "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";

const dispatchPdfRequest = createServerOnlyFn(async (request: Request): Promise<Response> => {
  const { handlePdfRequest } = await import("@/server/http/pdf.server");
  return await handlePdfRequest(request);
});

export const Route = createFileRoute("/api/pdf")({
  server: {
    handlers: {
      POST: ({ request }: { request: Request }) => dispatchPdfRequest(request),
    },
  },
});
`;
}

function pdfRouteFiles(mode: PdfMode, framework: string = "nextjs"): TemplateFile[] {
  const isNext = framework === "nextjs";
  const importPrefix = mode === "monorepo" ? "@repo/pdf" : "@/server/pdf/src";
  const apiPrefix = mode === "monorepo" ? "@repo/api" : "@/server/api";
  if (isNext) {
    const base = mode === "monorepo" ? "apps/web/src/app/api/pdf" : "src/app/api/pdf";
    return [file(`${base}/route.ts`, pdfRouteNextContent(importPrefix, apiPrefix))];
  }
  const root = mode === "monorepo" ? "apps/web/" : "";
  return [
    file(`${root}src/routes/api/pdf.ts`, pdfRouteTanstackContent()),
    file(`${root}src/server/http/pdf.server.ts`, pdfServerTanstackContent(importPrefix, apiPrefix)),
  ];
}

function pdfWebSurfaceFiles(mode: PdfMode, framework: string): TemplateFile[] {
  const isNext = framework === "nextjs";
  const path =
    mode === "monorepo"
      ? isNext
        ? "apps/web/src/app/pdf/page.tsx"
        : "apps/web/src/routes/pdf.tsx"
      : isNext
        ? "src/app/pdf/page.tsx"
        : "src/routes/pdf.tsx";
  return [file(path, pdfWebPageContent(mode, isNext ? "nextjs" : "tanstack-start"))];
}

function pdfMobileHookFiles(mode: PdfMode, hasI18n: boolean): TemplateFile[] {
  if (mode === "single") {
    return [
      file("src/hooks/usePdfMobile.ts", usePdfMobileContent("single")),
      file("app/pdf.tsx", pdfExpoPageContent("@/hooks/usePdfMobile", hasI18n)),
    ];
  }
  return [
    file("apps/mobile/src/hooks/usePdf.ts", usePdfMobileContent("monorepo")),
    file("apps/mobile/app/pdf.tsx", pdfExpoPageContent("@/hooks/usePdf", hasI18n)),
  ];
}

function pdfDesktopHelperFiles(mode: PdfMode, hasI18n: boolean): TemplateFile[] {
  if (mode === "single") {
    return [
      file("src/lib/pdf.ts", desktopPdfHelperContent("single")),
      file("src/renderer/routes/pdf.tsx", pdfDesktopPageContent(hasI18n, "@/renderer/lib/i18n")),
    ];
  }
  return [
    file("apps/desktop/src/lib/pdf.ts", desktopPdfHelperContent("monorepo")),
    file("apps/desktop/src/renderer/routes/pdf.tsx", pdfDesktopPageContent(hasI18n)),
  ];
}

export function pdfFiles(
  mode: PdfMode = "monorepo",
  framework: string = "nextjs",
  hasWeb = true,
): TemplateFile[] {
  const files: TemplateFile[] = [...pdfPackageFiles(mode, hasWeb)];
  if (hasWeb) files.push(...pdfRouteFiles(mode, framework), ...pdfWebSurfaceFiles(mode, framework));
  return files;
}

export function pdfFilesWithApps(
  mode: PdfMode,
  hasMobile: boolean,
  hasDesktop: boolean,
  framework: string = "nextjs",
  hasWeb = true,
  hasI18n = false,
): TemplateFile[] {
  const files = pdfFiles(mode, framework, hasWeb);
  if (hasMobile) files.push(...pdfMobileHookFiles(mode, hasI18n));
  if (hasDesktop) files.push(...pdfDesktopHelperFiles(mode, hasI18n));
  return files;
}
