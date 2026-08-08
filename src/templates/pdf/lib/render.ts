export function renderContent(): string {
  return `import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";

export async function renderPdfToBuffer(element: React.ReactElement): Promise<Buffer> {
  const buf = await renderToBuffer(element as Parameters<typeof renderToBuffer>[0]);
  return Buffer.from(buf);
}

export function toBase64(buffer: Buffer): string {
  return buffer.toString("base64");
}

export function fromBase64(base64: string): Buffer {
  return Buffer.from(base64, "base64");
}

export function downloadPdfBrowser(pdfBase64: string, fileName: string): void {
  const bytes = Uint8Array.from(atob(pdfBase64), (c) => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
`;
}

export function renderContentServerOnly(): string {
  return `"server-only";
${renderContent()}`;
}
