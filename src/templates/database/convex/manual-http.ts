export function convexManualHttpContent(): string {
  return `import { ConvexError } from "convex/values";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { manualPaymentConfig } from "./manualPaymentConfig";

const MAX_BYTES = 5 * 1024 * 1024;
const privateHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

function invalid(message: string): never { throw new ConvexError({ code: "INVALID_INPUT", message }); }
function failure(error: unknown): Response {
  if (error instanceof ConvexError && error.data && typeof error.data === "object" && "code" in error.data) {
    const code = String(error.data.code);
    const status = code === "UNAUTHENTICATED" ? 401 : ["FORBIDDEN", "USER_BANNED", "AUTH_MAPPING_MISSING", "AUTH_SESSION_REVOKED"].includes(code) ? 403 : code === "NOT_FOUND" ? 404 : code === "CONFLICT" ? 409 : 400;
    return Response.json({ error: code }, { status, headers: privateHeaders });
  }
  return Response.json({ error: "MANUAL_PAYMENT_FAILED" }, { status: 500, headers: privateHeaders });
}

async function readReceipt(request: Request): Promise<Uint8Array<ArrayBuffer>> {
  const length = request.headers.get("Content-Length");
  if (length !== null && (!/^\\d+$/.test(length) || Number(length) > MAX_BYTES)) invalid("Receipt exceeds 5 MiB");
  if (!request.body) invalid("Receipt required");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > MAX_BYTES) { await reader.cancel(); invalid("Receipt exceeds 5 MiB"); }
      chunks.push(next.value);
    }
  } finally { reader.releaseLock(); }
  if (size < 8) invalid("Receipt required");
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

function validateSignature(bytes: Uint8Array, mimeType: string): void {
  const png = [137, 80, 78, 71, 13, 10, 26, 10];
  const valid = mimeType === "image/png" ? png.every((byte, index) => bytes[index] === byte)
    : mimeType === "image/jpeg" ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    : mimeType === "application/pdf" ? [37, 80, 68, 70, 45].every((byte, index) => bytes[index] === byte)
    : false;
  if (!valid) invalid("Receipt content must match a PNG, JPEG or PDF file");
}

export const uploadReceipt = httpAction(async (ctx, request): Promise<Response> => {
  let storedId: Id<"_storage"> | undefined;
  let uploadId: Id<"manual_receipt_uploads"> | undefined;
  const uploadToken = crypto.randomUUID();
  try {
    // Authenticate before consuming up to 5 MiB from the client.
    if (!await ctx.auth.getUserIdentity()) throw new ConvexError({ code: "UNAUTHENTICATED", message: "Authentication required" });
    if (request.url.length > 4096) invalid("Payment metadata too long");
    const params = new URL(request.url).searchParams;
    const mimeType = request.headers.get("Content-Type")?.split(";")[0]?.trim().toLowerCase() ?? "";
    const bytes = await readReceipt(request);
    validateSignature(bytes, mimeType);
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
    const receiptSha256 = Array.from(digest, byte => byte.toString(16).padStart(2, "0")).join("");
    const reference = params.get("reference")?.trim() || undefined;
    const input = {
      amountMinor: Number(params.get("amountMinor")), requestKey: params.get("requestKey") ?? "",
      method: params.get("method")?.trim() || manualPaymentConfig.allowedMethods[0] || "", reference,
      receiptSha256, receiptMimeType: mimeType, receiptOriginalName: params.get("originalName") ?? "receipt",
      receiptBytes: bytes.byteLength,
    };
    const reservation = await ctx.runMutation(internal.manualPaymentUploads.reserve, { ...input, uploadToken });
    if (reservation.previous) return Response.json(reservation.previous, { headers: privateHeaders });
    uploadId = reservation.uploadId;
    storedId = await ctx.storage.store(new Blob([bytes], { type: mimeType + ";gi-manual-upload=" + uploadToken }));
    const result = await ctx.runMutation(internal.manualPayments.submit, { ...input, receiptStorageId: storedId, uploadId, uploadToken });
    if (!result.attached) await ctx.runMutation(internal.manualPaymentUploads.abandon, { uploadId, token: uploadToken, storageId: storedId });
    return Response.json(result.payment, { headers: privateHeaders });
  } catch (error) {
    // This transaction checks linkage before deleting; an ambiguous successful submission stays intact.
    if (uploadId) {
      try { await ctx.runMutation(internal.manualPaymentUploads.abandon, { uploadId, token: uploadToken, storageId: storedId }); }
      catch { /* The durable reservation and MIME marker let scheduled cleanup recover this file. */ }
    }
    return failure(error);
  }
});

export const downloadReceipt = httpAction(async (ctx, request): Promise<Response> => {
  try {
    if (!await ctx.auth.getUserIdentity()) throw new ConvexError({ code: "UNAUTHENTICATED", message: "Authentication required" });
    const id = new URL(request.url).searchParams.get("id");
    if (!id || id.length > 128) invalid("Payment identifier required");
    // The internal query rechecks current role/bans and owner on every download.
    const receipt = await ctx.runQuery(internal.manualPayments.receipt, { id: id as Id<"manual_payments"> });
    const blob = await ctx.storage.get(receipt.storageId);
    if (!blob) throw new ConvexError({ code: "NOT_FOUND", message: "Receipt not found" });
    await ctx.runQuery(internal.manualPayments.receipt, { id: id as Id<"manual_payments"> });
    const extension = receipt.mimeType === "image/png" ? "png" : receipt.mimeType === "image/jpeg" ? "jpg" : "pdf";
    return new Response(blob, { headers: {
      ...privateHeaders, "Content-Type": receipt.mimeType, "Content-Length": String(blob.size),
      "Content-Disposition": "attachment; filename=receipt." + extension,
      "X-Receipt-Name": encodeURIComponent(receipt.originalName),
      "Content-Security-Policy": "default-src 'none'; sandbox",
    } });
  } catch (error) { return failure(error); }
});
`;
}
