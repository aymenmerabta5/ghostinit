export function renderContent(): string {
  return `import { Font, renderToBuffer } from "@react-pdf/renderer";
import type { ReactElement } from "react";
import { preparePdfFonts, type PdfFontSources } from "./fonts.js";

interface PdfRenderState { admitted: number; tail: Promise<void>; }
const renderStateKey = Symbol.for("ghostinit.pdf.render-states");
const shared = globalThis as typeof globalThis & { [renderStateKey]?: WeakMap<object, PdfRenderState> };
const states = shared[renderStateKey] ??= new WeakMap<object, PdfRenderState>();
const state = states.get(Font) ?? { admitted: 0, tail: Promise.resolve() };
states.set(Font, state);
const MAX_ADMITTED_PDF_RENDERS = 2;

export class PdfRenderBusyError extends Error {
  override readonly name = "PdfRenderBusyError";
  constructor() { super("PDF rendering capacity is busy"); }
}

/** Bounded FIFO: one render owns the SDK font registry and one may wait. */
export async function renderPdfToBuffer(element: ReactElement, sources?: PdfFontSources): Promise<Buffer> {
  if (state.admitted >= MAX_ADMITTED_PDF_RENDERS) throw new PdfRenderBusyError();
  state.admitted += 1;
  const previous = state.tail;
  let release!: () => void;
  state.tail = new Promise<void>((resolve) => { release = resolve; });
  try {
    await previous;
    preparePdfFonts(sources);
    const buf = await renderToBuffer(element as Parameters<typeof renderToBuffer>[0]);
    return Buffer.from(buf);
  } finally {
    state.admitted -= 1;
    release();
  }
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
