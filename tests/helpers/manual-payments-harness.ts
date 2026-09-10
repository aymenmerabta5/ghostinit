import { manualPaymentDomainContent } from "../../src/templates/billing/manual/domain.js";
import { manualPaymentServiceContent } from "../../src/templates/billing/manual/service.js";

export interface TestManualPayment {
  id: string;
  ownerId: string;
  amountMinor: number;
  status: "pending" | "approved" | "rejected";
  reviewerId: string | null;
  reason: string | null;
}

export interface TestManualSubmit {
  amountMinor: number;
  requestKey: string;
  method?: string;
  reference?: string;
  receipt: { data: Uint8Array; mimeType: string; originalName: string };
}

export interface TestManualService {
  summary(actor: {
    id: string;
    role?: string;
  }): Promise<{ balanceMinor: number; enabled: boolean }>;
  list(actor: { id: string }): Promise<{ items: TestManualPayment[] }>;
  reviewQueue(actor: { id: string; role?: string }): Promise<{ items: TestManualPayment[] }>;
  receipt(
    actor: { id: string },
    id: string,
  ): Promise<{ data: Uint8Array; mimeType: string; originalName: string }>;
  submit(actor: { id: string }, input: TestManualSubmit): Promise<TestManualPayment>;
  review(
    actor: { id: string; role?: string },
    input: { id: string; decision: "approved" | "rejected"; reason?: string },
  ): Promise<TestManualPayment>;
}

export function evaluateManualTemplate<T>(
  source: string,
  exports: readonly string[],
  bindings: Record<string, unknown> = {},
): T {
  const executable = new Bun.Transpiler({ loader: "ts" }).transformSync(
    source.replace(/^import[^;]+;\s*/gm, "").replace(/^export /gm, ""),
  );
  return new Function(...Object.keys(bindings), `${executable}\nreturn {${exports.join(",")}};`)(
    ...Object.values(bindings),
  ) as T;
}

export function manualDomainBindings(): Record<string, unknown> {
  return evaluateManualTemplate(manualPaymentDomainContent(), [
    "ManualPaymentError",
    "validateManualPaymentSubmit",
    "validateManualPaymentReview",
    "validateManualPaymentReceipt",
    "MAX_MANUAL_PENDING",
    "MAX_MANUAL_RECEIPTS_PER_OWNER",
  ]);
}

export function testManualService(repository: unknown, enabled = true): TestManualService {
  const module = evaluateManualTemplate<{
    createManualPaymentService(repository: unknown, config: unknown): TestManualService;
  }>(manualPaymentServiceContent(), ["createManualPaymentService"], manualDomainBindings());
  return module.createManualPaymentService(repository, {
    enabled,
    currency: "DZD",
    receiverInstructions: "Transfer to the configured fixture account",
    allowedMethods: ["BaridiMob", "Bank transfer"],
  });
}

export function manualSubmitInput(marker = 1): TestManualSubmit {
  return {
    amountMinor: 12500,
    requestKey: `manual-fixture-request-${marker}`,
    method: "BaridiMob",
    reference: `transfer-${marker}`,
    receipt: {
      data: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, marker]),
      mimeType: "image/png",
      originalName: "receipt.png",
    },
  };
}
