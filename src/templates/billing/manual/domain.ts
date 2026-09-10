export function manualPaymentDomainContent(): string {
  return `export const MAX_MANUAL_AMOUNT_MINOR = 100_000_000;
export const MAX_MANUAL_RECEIPT_BYTES = 5 * 1024 * 1024;
export const MAX_MANUAL_PENDING = 10;
export const MAX_MANUAL_RECEIPTS_PER_OWNER = 1000;

export interface ManualPaymentActor { readonly id: string; readonly role?: string | null }
export interface ManualPaymentConfig {
  readonly enabled: boolean;
  readonly currency: "DZD";
  readonly receiverInstructions: string;
  readonly allowedMethods: readonly string[];
}
export interface ManualPaymentSummary {
  readonly enabled: boolean;
  readonly currency: "DZD";
  readonly balanceMinor: number;
  readonly receiverInstructions: string;
  readonly allowedMethods: readonly string[];
}
export interface ManualPaymentReceipt {
  readonly data: Uint8Array;
  readonly mimeType: string;
  readonly originalName: string;
}
export interface ManualPaymentSubmitInput {
  readonly amountMinor: number;
  readonly requestKey: string;
  readonly method?: string;
  readonly reference?: string;
  readonly receipt: ManualPaymentReceipt;
}
export interface ValidatedManualPaymentSubmitInput extends ManualPaymentSubmitInput {
  readonly method: string;
  readonly reference: string;
}
export interface ManualPaymentReviewInput {
  readonly id: string;
  readonly decision: "approved" | "rejected";
  readonly reason?: string;
}
export interface ManualPayment {
  readonly id: string;
  readonly ownerId: string;
  readonly amountMinor: number;
  readonly currency: "DZD";
  readonly status: "pending" | "approved" | "rejected";
  readonly method: string;
  readonly reference: string | null;
  readonly createdAt: string;
  readonly reviewedAt: string | null;
  readonly reviewerId: string | null;
  readonly reason: string | null;
}
export type ManualPaymentErrorCode = "UNAUTHENTICATED" | "FORBIDDEN" | "INVALID_INPUT" | "NOT_CONFIGURED" | "NOT_FOUND" | "CONFLICT" | "LIMIT_EXCEEDED";
export class ManualPaymentError extends Error {
  readonly code: ManualPaymentErrorCode;
  constructor(code: ManualPaymentErrorCode, message: string) {
    super(message);
    this.name = "ManualPaymentError";
    this.code = code;
  }
}

/** Adapters recheck active identity within writes; roles passed by callers are never authority. */
export interface ManualPaymentRepository {
  requireActor(id: string): Promise<ManualPaymentActor>;
  balance(id: string): Promise<number>;
  list(id: string): Promise<ManualPayment[]>;
  reviewQueue(id: string): Promise<ManualPayment[]>;
  submit(id: string, input: ValidatedManualPaymentSubmitInput): Promise<ManualPayment>;
  receipt(id: string, paymentId: string): Promise<ManualPaymentReceipt>;
  review(id: string, input: ManualPaymentReviewInput): Promise<ManualPayment>;
}

export function validateManualPaymentReceipt(receipt: ManualPaymentReceipt): void {
  const data = receipt?.data;
  if (!(data instanceof Uint8Array) || data.byteLength < 8 || data.byteLength > MAX_MANUAL_RECEIPT_BYTES) {
    throw new ManualPaymentError("INVALID_INPUT", "Receipt must be a PNG, JPEG, or PDF of at most 5 MiB");
  }
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => data[index] === byte);
  const jpeg = data[0] === 255 && data[1] === 216 && data[2] === 255;
  const pdf = [37, 80, 68, 70, 45].every((byte, index) => data[index] === byte);
  if (!((receipt.mimeType === "image/png" && png) || (receipt.mimeType === "image/jpeg" && jpeg) || (receipt.mimeType === "application/pdf" && pdf))) {
    throw new ManualPaymentError("INVALID_INPUT", "Receipt contents do not match an allowed file type");
  }
  if (typeof receipt.originalName !== "string" || !receipt.originalName.trim() || receipt.originalName.length > 200 || Array.from(receipt.originalName).some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127 || code === 47 || code === 92;
  })) {
    throw new ManualPaymentError("INVALID_INPUT", "Receipt filename is invalid");
  }
}

export function validateManualPaymentSubmit(input: ManualPaymentSubmitInput, config: ManualPaymentConfig): ValidatedManualPaymentSubmitInput {
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor < 1 || input.amountMinor > MAX_MANUAL_AMOUNT_MINOR) {
    throw new ManualPaymentError("INVALID_INPUT", "Amount must be between 1 and 100000000 DZD minor units");
  }
  if (typeof input.requestKey !== "string" || !/^[A-Za-z0-9_-]{16,128}$/.test(input.requestKey)) {
    throw new ManualPaymentError("INVALID_INPUT", "A valid submission key is required");
  }
  const method = input.method?.trim() || config.allowedMethods[0];
  if (!method || !config.allowedMethods.includes(method)) throw new ManualPaymentError("INVALID_INPUT", "Choose a configured transfer method");
  const reference = input.reference?.trim() ?? "";
  if (reference.length > 160) throw new ManualPaymentError("INVALID_INPUT", "Transfer reference is too long");
  validateManualPaymentReceipt(input.receipt);
  return { ...input, method, reference };
}

export function validateManualPaymentReview(input: ManualPaymentReviewInput): ManualPaymentReviewInput {
  if (!input.id || !["approved", "rejected"].includes(input.decision)) throw new ManualPaymentError("INVALID_INPUT", "Choose a payment and review decision");
  const reason = input.reason?.trim() ?? "";
  if (reason.length > 500 || (input.decision === "rejected" && !reason)) {
    throw new ManualPaymentError("INVALID_INPUT", "Rejection requires a reason of at most 500 characters");
  }
  return { ...input, reason };
}
`;
}
