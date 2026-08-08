import { file, packageJson, tsconfig, type TemplateFile, codeScripts } from "../shared.js";
import * as v from "../versions.js";
import { verificationContent } from "./lib/verification.js";
import { qrContent } from "./lib/qr.js";
import { renderContent } from "./lib/render.js";
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

type PdfMode = "monorepo" | "single";

function pdfPackageFiles(mode: PdfMode): TemplateFile[] {
  const base = mode === "monorepo" ? "packages/pdf" : "src/server/pdf";
  const isMonorepo = mode === "monorepo";
  return [
    file(
      `${base}/package.json`,
      packageJson({
        name: isMonorepo ? "@repo/pdf" : "pdf",
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
          qrcode: `^${v.pdf.qrcode}`,
          ...(isMonorepo ? { "@repo/kernel": "workspace:*" } : {}),
        },
        devDependencies: {
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
        include: ["src/**/*"],
        compilerOptions: {
          types: ["node", "react"],
          jsx: "react-jsx",
          composite: true,
          declaration: true,
          declarationMap: true,
          sourceMap: true,
          outDir: "./dist",
          rootDir: "./src",
        },
      }),
    ),
    file(
      `${base}/src/index.ts`,
      `export * from "./lib/verification.js";
export * from "./lib/qr.js";
export * from "./lib/render.js";
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
    file(`${base}/src/client/usePdf.ts`, usePdfHookContent(base)),
    file(
      `${base}/README.md`,
      `# @repo/pdf

Server-side PDF generation via \`@react-pdf/renderer\` + \`qrcode\` + \`dejavu-fonts-ttf\`.

## Templates
- \`InvoiceTemplate\` — A4 portrait, items table, totals, notes
- \`CertificateTemplate\` — A4 landscape, border styles, QR verification
- \`AgreementTemplate\` — A4 landscape, multi-party, signatures

## Borders
\`classic | formal | minimal | modern | ornate | premium\` in \`src/borders/\`

## Usage (server)
\`\`\`ts
import { renderPdfToBuffer } from "@repo/pdf";
import { InvoiceTemplate } from "@repo/pdf/templates/invoice";
import { generateQRCodeDataUrl } from "@repo/pdf/lib/qr";
import { generateVerificationCode } from "@repo/pdf/lib/verification";
import { createElement } from "react";

const code = generateVerificationCode();
const qr = await generateQRCodeDataUrl(\`https://example.com/verify/\${code}\`);
const buffer = await renderPdfToBuffer(createElement(InvoiceTemplate, { data: { ...exampleInvoiceData, verificationCode: code, qrCodeDataUrl: qr } }));
// buffer is Node Buffer — persist to S3 or return base64
\`\`\`

## API route (Next.js)
\`\`\`ts
// apps/web/src/app/api/pdf/route.ts
import { renderPdfToBuffer } from "@repo/pdf";
import { InvoiceTemplate } from "@repo/pdf/templates/invoice";
import { CertificateTemplate } from "@repo/pdf/templates/certificate";
import { AgreementTemplate } from "@repo/pdf/templates/agreement";
export async function POST(req: Request) {
  const { template, data, locale } = await req.json();
  const map = { invoice: InvoiceTemplate, certificate: CertificateTemplate, agreement: AgreementTemplate };
  const Comp = map[template];
  const buffer = await renderPdfToBuffer(createElement(Comp, { data, locale }));
  return Response.json({ pdfBase64: buffer.toString("base64"), fileName: \`\${template}.pdf\` });
}
\`\`\`

## Client (web)
\`\`\`ts
import { usePdf } from "@repo/pdf/client/usePdf";
const { generate } = usePdf();
await generate({ template: "invoice", data: exampleInvoiceData });
\`\`\`

## Expo (mobile) — recommended
Do NOT bundle \`@react-pdf/renderer\` on device. Call the server endpoint and use expo-file-system + expo-sharing:

\`\`\`ts
import { usePdfMobile } from "@/hooks/usePdf"; // emitted to apps/mobile/src/hooks/usePdf.ts when --apps mobile + --with-pdf
await generateAndShare({ template: "certificate", data: exampleCertificateData });
\`\`\`

## Desktop (Electron)
Same HTTP path as web. Electron main is Node so you *can* import \`@repo/pdf\` directly in main process, but prefer HTTP for parity.

## Single mode
Import from \`@/server/pdf\` instead of \`@repo/pdf\` — same API.

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

function pdfRouteNextContent(importPrefix: string): string {
  return `import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { InvoiceTemplate, CertificateTemplate, AgreementTemplate } from "${importPrefix}";

const templates: Record<string, unknown> = { invoice: InvoiceTemplate, certificate: CertificateTemplate, agreement: AgreementTemplate };

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { template?: string; data?: unknown; locale?: string };
    const template = body.template ?? "invoice";
    const Comp = templates[template] as React.ComponentType<{ data: unknown; locale?: string }> | undefined;
    if (!Comp) return NextResponse.json({ error: "Unknown template" }, { status: 400 });
    const buffer = await renderToBuffer(createElement(Comp as React.ComponentType, { data: body.data, locale: body.locale } as never) as Parameters<typeof renderToBuffer>[0]);
    const pdfBase64 = Buffer.from(buffer).toString("base64");
    return NextResponse.json({ pdfBase64, fileName: \`\${template}.pdf\` });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
`;
}

function pdfRouteTanstackContent(importPrefix: string): string {
  return `import { createFileRoute } from "@tanstack/react-router";
import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { InvoiceTemplate, CertificateTemplate, AgreementTemplate } from "${importPrefix}";

const templates: Record<string, unknown> = { invoice: InvoiceTemplate, certificate: CertificateTemplate, agreement: AgreementTemplate };

async function handle({ request }: { request: Request }): Promise<Response> {
  try {
    const body = await request.json() as { template?: string; data?: unknown; locale?: string };
    const template = body.template ?? "invoice";
    const Comp = templates[template] as React.ComponentType<{ data: unknown; locale?: string }> | undefined;
    if (!Comp) return Response.json({ error: "Unknown template" }, { status: 400 });
    const buffer = await renderToBuffer(createElement(Comp as React.ComponentType, { data: body.data, locale: body.locale } as never) as Parameters<typeof renderToBuffer>[0]);
    const pdfBase64 = Buffer.from(buffer).toString("base64");
    return Response.json({ pdfBase64, fileName: \`\${template}.pdf\` });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export const Route = createFileRoute("/api/pdf")({ server: { handlers: { POST: handle } } });
`;
}

function pdfRouteFiles(mode: PdfMode, framework: string = "nextjs"): TemplateFile[] {
  const isNext = framework === "nextjs";
  const importPrefix = mode === "monorepo" ? "@repo/pdf" : "@/server/pdf/src";
  if (isNext) {
    const base = mode === "monorepo" ? "apps/web/src/app/api/pdf" : "src/app/api/pdf";
    return [file(`${base}/route.ts`, pdfRouteNextContent(importPrefix))];
  }
  const base = mode === "monorepo" ? "apps/web/src/routes/api/pdf" : "src/routes/api/pdf";
  const fileName = mode === "monorepo" ? `${base}.ts` : `${base}.ts`;
  return [file(fileName, pdfRouteTanstackContent(importPrefix))];
}

function pdfMobileHookFiles(mode: PdfMode): TemplateFile[] {
  if (mode === "single") return [file("src/hooks/usePdf.ts", usePdfMobileContent())];
  return [file("apps/mobile/src/hooks/usePdf.ts", usePdfMobileContent())];
}

function pdfDesktopHelperFiles(mode: PdfMode): TemplateFile[] {
  if (mode === "single") return [file("src/lib/pdf.ts", desktopPdfHelperContent())];
  return [file("apps/desktop/src/lib/pdf.ts", desktopPdfHelperContent())];
}

export function pdfFiles(
  mode: PdfMode = "monorepo",
  framework: string = "nextjs",
  hasWeb = true,
): TemplateFile[] {
  const files: TemplateFile[] = [...pdfPackageFiles(mode)];
  if (hasWeb) files.push(...pdfRouteFiles(mode, framework));
  return files;
}

export function pdfFilesWithApps(
  mode: PdfMode,
  hasMobile: boolean,
  hasDesktop: boolean,
  framework: string = "nextjs",
  hasWeb = true,
): TemplateFile[] {
  const files = pdfFiles(mode, framework, hasWeb);
  if (hasMobile) files.push(...pdfMobileHookFiles(mode));
  if (hasDesktop) files.push(...pdfDesktopHelperFiles(mode));
  return files;
}
