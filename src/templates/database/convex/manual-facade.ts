import type { ProjectMode } from "../../../lib/addons.js";

export function convexManualFacadeContent(mode: ProjectMode): string {
  const auth = mode === "monorepo" ? "@repo/auth/server" : "@/server/auth";
  const config = mode === "monorepo" ? "@repo/config/server" : "@/lib/env/server";
  const api = "../../../convex/_generated/api";
  return `import "server-only";
import { fetchAuthMutation, fetchAuthQuery, getToken } from "${auth}";
import { env } from "${config}";
import { api } from "${api}";
import { ConvexError, type GenericId as Id } from "convex/values";
import { ManualPaymentError, validateManualPaymentReceipt, type ManualPaymentErrorCode, type ManualPaymentActor, type ManualPayment, type ManualPaymentConfig, type ManualPaymentReceipt, type ManualPaymentSubmitInput, type ManualPaymentReviewInput } from "./domain/manual-payment.js";

function knownError(code: string): ManualPaymentError {
  const normalized = ["USER_BANNED", "AUTH_MAPPING_MISSING", "AUTH_SESSION_REVOKED"].includes(code) ? "FORBIDDEN" : code;
  const allowed: readonly string[] = ["UNAUTHENTICATED", "FORBIDDEN", "INVALID_INPUT", "NOT_CONFIGURED", "NOT_FOUND", "CONFLICT", "LIMIT_EXCEEDED"];
  if (!allowed.includes(normalized)) throw new Error("Manual payment request failed");
  return new ManualPaymentError(normalized as ManualPaymentErrorCode, normalized.replaceAll("_", " "));
}

async function authenticated<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation(); }
  catch (error) {
    if (error instanceof ConvexError && error.data && typeof error.data === "object" && "code" in error.data) throw knownError(String(error.data.code));
    throw error;
  }
}

function parsePayment(value: unknown): ManualPayment {
  if (!value || typeof value !== "object") throw new Error("Invalid payment response");
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.ownerId !== "string" || !Number.isSafeInteger(row.amountMinor) || row.currency !== "DZD" || !["pending", "approved", "rejected"].includes(String(row.status)) || typeof row.method !== "string" || typeof row.createdAt !== "string" || ![row.reference, row.reviewedAt, row.reviewerId, row.reason].every(item => item === null || typeof item === "string")) throw new Error("Invalid payment response");
  return value as ManualPayment;
}

async function privateRequest(path: string, params: URLSearchParams, init: RequestInit = {}): Promise<Response> {
  const token = await getToken();
  if (!token) throw new ManualPaymentError("UNAUTHENTICATED", "Authentication required");
  const site = env.CONVEX_SITE_URL;
  if (!site || site.startsWith("REPLACE_WITH")) throw new ManualPaymentError("NOT_CONFIGURED", "CONVEX_SITE_URL must be configured for manual payments");
  const url = new URL(path, site);
  url.search = params.toString();
  const response = await fetch(url, {
    ...init, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(30_000),
    headers: { ...init.headers, Authorization: "Bearer " + token },
  });
  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null);
    const code = payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string" ? payload.error : "MANUAL_PAYMENT_FAILED";
    throw knownError(code);
  }
  return response;
}

// The authenticated Convex request, not a caller-supplied actor ID or role, owns every operation.
export const manualPaymentService = {
  async summary(_actor: ManualPaymentActor): Promise<ManualPaymentConfig & { balanceMinor: number }> {
    return await authenticated(() => fetchAuthQuery(api.manualPayments.summary, {}));
  },
  async list(_actor: ManualPaymentActor): Promise<{ items: ManualPayment[] }> {
    return await authenticated(() => fetchAuthQuery(api.manualPayments.list, {}));
  },
  async reviewQueue(_actor: ManualPaymentActor): Promise<{ items: ManualPayment[] }> {
    return await authenticated(() => fetchAuthQuery(api.manualPayments.reviewQueue, {}));
  },
  async submit(_actor: ManualPaymentActor, input: ManualPaymentSubmitInput): Promise<ManualPayment> {
    validateManualPaymentReceipt(input.receipt);
    const params = new URLSearchParams({ amountMinor: String(input.amountMinor), requestKey: input.requestKey, originalName: input.receipt.originalName });
    if (input.method !== undefined) params.set("method", input.method);
    if (input.reference !== undefined) params.set("reference", input.reference);
    const response = await privateRequest("/api/manual-payments", params, {
      method: "POST", headers: { "Content-Type": input.receipt.mimeType }, body: new Uint8Array(input.receipt.data),
    });
    return parsePayment(await response.json());
  },
  async receipt(_actor: ManualPaymentActor, id: string): Promise<ManualPaymentReceipt> {
    const response = await privateRequest("/api/manual-payments/receipt", new URLSearchParams({ id }));
    const maxBytes = 5 * 1024 * 1024;
    if (Number(response.headers.get("Content-Length") ?? "0") > maxBytes || !response.body) throw new Error("Invalid receipt response");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const item = await reader.read();
        if (item.done) break;
        size += item.value.byteLength;
        if (size > maxBytes) { await reader.cancel(); throw new Error("Invalid receipt response"); }
        chunks.push(item.value);
      }
    } finally { reader.releaseLock(); }
    const data = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.byteLength; }
    const receipt = {
      data, mimeType: response.headers.get("Content-Type") ?? "application/octet-stream",
      originalName: decodeURIComponent(response.headers.get("X-Receipt-Name") ?? "receipt"),
    };
    validateManualPaymentReceipt(receipt);
    return receipt;
  },
  async review(_actor: ManualPaymentActor, input: ManualPaymentReviewInput): Promise<ManualPayment> {
    return await authenticated(() => fetchAuthMutation(api.manualPayments.review, { ...input, id: input.id as Id<"manual_payments"> }));
  },
};
`;
}
