import { file, type TemplateFile } from "../shared.js";
import type { ProjectMode } from "../../lib/addons.js";
import { resultImportForMode, sharedCalculateTotal } from "./shared.js";

export function invoiceServiceContent(mode: ProjectMode): string {
  const resultImport = resultImportForMode(mode);
  return `${resultImport}
export interface InvoiceItem { id: string; unitPrice: number; quantity: number; name: string; }
export interface CreateInvoiceInput { userId: string; items: InvoiceItem[]; }
export interface InvoiceRecord { id: string; total: number; status: string; }
export interface InvoiceDeps { insertInvoice: (data: { userId: string; total: number; }) => Promise<InvoiceRecord>; }
export type CreateInvoiceOutput = Result<InvoiceRecord, Error>;
${sharedCalculateTotal}
export async function createInvoiceService(input: CreateInvoiceInput, deps: InvoiceDeps): Promise<CreateInvoiceOutput> {
  try { const total = calculateTotal(input.items); const record = await deps.insertInvoice({ userId: input.userId, total }); return ok(record); } catch (e) { return err(e instanceof Error ? e : new Error(String(e))); }
}
`;
}

function makeInvoiceIndex(includePreviewExport: boolean): string {
  return `export { createInvoiceService } from "./create-invoice.service.js";\nexport type { InvoiceItem, CreateInvoiceInput, InvoiceRecord, InvoiceDeps, CreateInvoiceOutput } from "./create-invoice.service.js";\n${includePreviewExport ? `export { previewInvoiceService } from "./preview-invoice.service.js";\n` : ""}`;
}

export function invoiceServiceFiles(mode: ProjectMode): TemplateFile[] {
  const base = mode === "monorepo" ? "packages/services/src" : "src/server/services";
  return [
    file(`${base}/invoice/index.ts`, makeInvoiceIndex(false)),
    file(`${base}/invoice/create-invoice.service.ts`, invoiceServiceContent(mode)),
  ];
}
