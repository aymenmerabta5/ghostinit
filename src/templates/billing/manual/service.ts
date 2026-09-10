export function manualPaymentServiceContent(): string {
  return `import {
  ManualPaymentError, validateManualPaymentSubmit, validateManualPaymentReview,
  type ManualPaymentActor, type ManualPaymentConfig, type ManualPaymentRepository,
  type ManualPaymentSubmitInput, type ManualPaymentReviewInput,
} from "../domain/manual-payment";

export function createManualPaymentService(repository: ManualPaymentRepository, config: ManualPaymentConfig) {
  async function authorize(actor: ManualPaymentActor, admin = false) {
    if (!actor?.id?.trim()) throw new ManualPaymentError("UNAUTHENTICATED", "Sign in to access manual payments");
    const current = await repository.requireActor(actor.id);
    if (admin && current.role !== "admin" && current.role !== "superAdmin") throw new ManualPaymentError("FORBIDDEN", "Administrator access is required");
    return current;
  }
  return {
    async summary(actor: ManualPaymentActor) {
      const current = await authorize(actor);
      return { enabled: config.enabled && Boolean(config.receiverInstructions.trim()) && config.allowedMethods.length > 0,
        currency: config.currency, balanceMinor: await repository.balance(current.id),
        receiverInstructions: config.receiverInstructions, allowedMethods: config.allowedMethods };
    },
    async list(actor: ManualPaymentActor) {
      const current = await authorize(actor);
      return { items: await repository.list(current.id) };
    },
    async reviewQueue(actor: ManualPaymentActor) {
      const current = await authorize(actor, true);
      return { items: await repository.reviewQueue(current.id) };
    },
    async submit(actor: ManualPaymentActor, input: ManualPaymentSubmitInput) {
      const current = await authorize(actor);
      if (!config.enabled || !config.receiverInstructions.trim() || config.allowedMethods.length === 0) {
        throw new ManualPaymentError("NOT_CONFIGURED", "Manual payment receiver instructions are not configured");
      }
      return await repository.submit(current.id, validateManualPaymentSubmit(input, config));
    },
    async receipt(actor: ManualPaymentActor, id: string) {
      const current = await authorize(actor);
      if (!id) throw new ManualPaymentError("INVALID_INPUT", "Payment is required");
      return await repository.receipt(current.id, id);
    },
    async review(actor: ManualPaymentActor, input: ManualPaymentReviewInput) {
      const current = await authorize(actor, true);
      return await repository.review(current.id, validateManualPaymentReview(input));
    },
  };
}

export type ManualPaymentService = ReturnType<typeof createManualPaymentService>;
`;
}
