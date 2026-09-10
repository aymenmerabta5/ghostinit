import type { ProjectMode } from "../../lib/addons.js";
import { file, type TemplateFile } from "../shared.js";

/** Private receipt transport; storage keys and URLs never cross this boundary. */
export function manualBillingApiFiles(mode: ProjectMode): TemplateFile[] {
  const root = mode === "monorepo" ? "packages/api/src" : "src/server/api";
  return [file(`${root}/procedures/billing/manual.ts`, manualBillingTransportContent())];
}

export function manualBillingTransportContent(): string {
  return `import { Buffer } from "node:buffer";
import { oc } from "@orpc/contract";
import { implement, ORPCError } from "@orpc/server";
import { z } from "zod";
import type { ApiContext } from "../../context.js";
import { createServiceORPCError } from "../../utils/service-error.js";

const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;
const MAX_RECEIPT_BASE64 = 4 * Math.ceil(MAX_RECEIPT_BYTES / 3);
const activeUploads = new Set<string>();
const receiptSchema = z.object({
  base64: z.string().min(4).max(MAX_RECEIPT_BASE64).regex(/^[A-Za-z0-9+/]*={0,2}$/),
  mimeType: z.enum(["image/png", "image/jpeg", "application/pdf"]),
  originalName: z.string().min(1).max(200),
}).strict();
const paymentSchema = z.object({
  id: z.string(), ownerId: z.string(), amountMinor: z.number().int(), currency: z.literal("DZD"),
  status: z.enum(["pending", "approved", "rejected"]), method: z.string(), reference: z.string().nullable(),
  createdAt: z.string().datetime(), reviewedAt: z.string().datetime().nullable(),
  reviewerId: z.string().nullable(), reason: z.string().nullable(),
});
const base = oc.errors({
  UNAUTHORIZED: { message: "Sign in to use manual payments" },
  FORBIDDEN: { message: "Manual payment access denied" },
  BAD_REQUEST: { message: "Invalid manual payment input" },
  NOT_FOUND: { message: "Manual payment not found" },
  CONFLICT: { message: "Manual payment has already been reviewed" },
  TOO_MANY_REQUESTS: { message: "Too many requests" },
  SERVICE_UNAVAILABLE: { message: "Manual payments are unavailable" },
  INTERNAL_SERVER_ERROR: { message: "Manual payment request failed" },
});

export const manualBillingContract = {
  summary: base.route({ method: "GET", path: "/billing/manual/summary" }).output(z.object({
    enabled: z.boolean(), currency: z.literal("DZD"), balanceMinor: z.number().int(),
    receiverInstructions: z.string(), allowedMethods: z.array(z.string()), canReview: z.boolean(),
  })),
  list: base.route({ method: "GET", path: "/billing/manual" }).output(z.object({ items: z.array(paymentSchema) })),
  reviewQueue: base.route({ method: "GET", path: "/billing/manual/review-queue" }).output(z.object({ items: z.array(paymentSchema) })),
  submit: base.route({ method: "POST", path: "/billing/manual" }).input(z.object({
    amountMinor: z.number().int().min(1).max(100_000_000),
    requestKey: z.string().uuid(), method: z.string().min(1).max(80).optional(),
    reference: z.string().max(160).optional(), receipt: receiptSchema,
  }).strict()).output(paymentSchema),
  receipt: base.route({ method: "GET", path: "/billing/manual/receipt" })
    .input(z.object({ id: z.string().min(1).max(128) }).strict()).output(receiptSchema),
  review: base.route({ method: "POST", path: "/billing/manual/review" }).input(z.object({
    id: z.string().min(1).max(128), decision: z.enum(["approved", "rejected"]),
    reason: z.string().max(500).optional(),
  }).strict()).output(paymentSchema),
};

function decodeReceipt(base64: string): Uint8Array {
  const bytes = Buffer.from(base64, "base64");
  // Require canonical encoding: Buffer alone accepts malformed and ambiguous input.
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_RECEIPT_BYTES || bytes.toString("base64") !== base64) {
    throw new ORPCError("BAD_REQUEST", { message: "Receipt must be a valid file up to 5 MiB" });
  }
  return bytes;
}

function failure(error: unknown): never {
  if (error instanceof ORPCError) throw error;
  const codeMap = {
    UNAUTHENTICATED: "UNAUTHORIZED", FORBIDDEN: "FORBIDDEN", INVALID_INPUT: "BAD_REQUEST",
    NOT_CONFIGURED: "SERVICE_UNAVAILABLE", NOT_FOUND: "NOT_FOUND", CONFLICT: "CONFLICT", LIMIT_EXCEEDED: "TOO_MANY_REQUESTS",
    APPLICATION_UNAUTHENTICATED: "UNAUTHORIZED", APPLICATION_ACCOUNT_SUSPENDED: "FORBIDDEN",
    APPLICATION_EMAIL_NOT_VERIFIED: "FORBIDDEN", APPLICATION_ADMIN_REQUIRED: "FORBIDDEN",
    APPLICATION_BAD_REQUEST: "BAD_REQUEST", APPLICATION_NOT_FOUND: "NOT_FOUND",
    APPLICATION_CONFLICT: "CONFLICT", APPLICATION_RATE_LIMITED: "TOO_MANY_REQUESTS",
    APPLICATION_RATE_LIMIT_UNAVAILABLE: "SERVICE_UNAVAILABLE", APPLICATION_INTERNAL_ERROR: "INTERNAL_SERVER_ERROR",
  } as const;
  if (!(error instanceof Error) || !("code" in error) || typeof error.code !== "string" || !Object.hasOwn(codeMap, error.code)) {
    throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "Manual payment request failed", cause: error });
  }
  return createServiceORPCError(error, {
    codeMap,
    fallbackCode: "INTERNAL_SERVER_ERROR", fallbackMessage: "Manual payment request failed",
  });
}

const implementer = implement<typeof manualBillingContract, ApiContext>(manualBillingContract);
export const manualBillingProcedures = {
  summary: implementer.summary.handler(async ({ context }) => {
    try { return await context.application.billing.manual.summary(); } catch (error) { return failure(error); }
  }),
  list: implementer.list.handler(async ({ context }) => {
    try { return await context.application.billing.manual.list(); } catch (error) { return failure(error); }
  }),
  reviewQueue: implementer.reviewQueue.handler(async ({ context }) => {
    try { return await context.application.billing.manual.reviewQueue(); } catch (error) { return failure(error); }
  }),
  submit: implementer.submit.handler(async ({ input, context }) => {
    const principal = context.application.principal;
    if (!principal) throw new ORPCError("UNAUTHORIZED", { message: "Sign in to use manual payments" });
    if (principal.banned) throw new ORPCError("FORBIDDEN", { message: "Manual payment access denied" });
    if (activeUploads.size >= 2 || activeUploads.has(principal.userId)) {
      throw new ORPCError("TOO_MANY_REQUESTS", { message: "Upload capacity is temporarily exhausted" });
    }
    activeUploads.add(principal.userId);
    try {
      const { base64, ...receipt } = input.receipt;
      return await context.application.billing.manual.submit({ ...input, receipt: { ...receipt, data: decodeReceipt(base64) } });
    } catch (error) { return failure(error); }
    finally { activeUploads.delete(principal.userId); }
  }),
  receipt: implementer.receipt.handler(async ({ input, context }) => {
    try {
      const { data, ...receipt } = await context.application.billing.manual.receipt(input);
      return receiptSchema.parse({ ...receipt, base64: Buffer.from(data).toString("base64") });
    } catch (error) { return failure(error); }
  }),
  review: implementer.review.handler(async ({ input, context }) => {
    try { return await context.application.billing.manual.review(input); } catch (error) { return failure(error); }
  }),
};
`;
}
