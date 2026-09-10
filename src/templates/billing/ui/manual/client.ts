export function manualClientContent(): string {
  return `import { MANUAL_RECEIPT_MAX_BYTES, MANUAL_RECEIPT_TYPES } from "./model";

export function manualReceiptAllowed(file: Pick<File, "size" | "type">): boolean {
  return file.size > 0 && file.size <= MANUAL_RECEIPT_MAX_BYTES &&
    MANUAL_RECEIPT_TYPES.some((mimeType) => mimeType === file.type);
}
export function manualReceiptBlob(receipt: { base64: string; mimeType: string }): Blob {
  if (!MANUAL_RECEIPT_TYPES.some((value) => value === receipt.mimeType)) throw new Error("MANUAL_RECEIPT_INVALID");
  const raw = atob(receipt.base64);
  if (raw.length === 0 || raw.length > MANUAL_RECEIPT_MAX_BYTES) throw new Error("MANUAL_RECEIPT_INVALID");
  return new Blob([Uint8Array.from(raw, (value) => value.charCodeAt(0))], { type: receipt.mimeType });
}
`;
}
