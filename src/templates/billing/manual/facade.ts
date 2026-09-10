export function postgresManualPaymentFacadeContent(): string {
  return `import "server-only";
import { createManualPaymentService } from "./applications/manual-payment-service";
import { postgresManualPaymentRepository } from "./adapters/manual/repository";
import { manualPaymentConfig } from "./manual-payment-config";

export const manualPaymentService = createManualPaymentService(postgresManualPaymentRepository, manualPaymentConfig);
export { ManualPaymentError } from "./domain/manual-payment";
export type { ManualPayment, ManualPaymentActor, ManualPaymentSubmitInput, ManualPaymentReviewInput, ManualPaymentReceipt, ManualPaymentSummary } from "./domain/manual-payment";
export type { ManualPaymentService } from "./applications/manual-payment-service";
`;
}
