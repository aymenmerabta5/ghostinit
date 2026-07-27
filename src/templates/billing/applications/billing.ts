/**
 * Billing application use-cases — this is Domain (layer 3) behind Services (layer 4).
 *
 * The application layer owns the flow: validate, authorize, then delegate to a
 * port (BillingProviderPort) that a Capabilities-layer service adapter satisfies.
 * It does not know which vendor satisfies the port — that's the point of the
 * layering. Today the only flow expressed here is createCheckout; the rest live
 * in services/billing/* and are promoted here as they grow a domain invariant
 * worth encoding.
 */
import { file, type TemplateFile } from "../../shared.js";
import type { ProjectMode } from "../../../lib/addons.js";

function createCheckoutUseCase(mode: ProjectMode): string {
  const servicesImport =
    mode === "monorepo" ? `@repo/services/billing` : `@/server/services/billing`;
  const resultImport = mode === "monorepo" ? `@repo/kernel` : `@/server/kernel/result`;
  return `import { createCheckoutService, type BillingProviderName } from "${servicesImport}";
import type { Result } from "${resultImport}";
import type { CheckoutRecord, BillingProviderPort } from "${servicesImport}";

export interface CreateCheckoutUseCaseInput {
  userId: string;
  customerEmail: string;
  provider: BillingProviderName;
  priceId: string;
  successUrl: string;
  failureUrl?: string;
  cancelUrl?: string;
  quantity?: number;
}

type UseCaseDeps = { billingProvider: BillingProviderPort };

export async function createCheckoutUseCase(
  input: CreateCheckoutUseCaseInput,
  deps: UseCaseDeps,
): Promise<Result<CheckoutRecord, Error>> {
  if (!input.priceId || !input.successUrl) {
    return { ok: false, error: new Error("priceId and successUrl are required") };
  }
  // Domain invariant: every checkout must be traceable to the authenticated user.
  if (!input.userId) {
    return { ok: false, error: new Error("userId is required") };
  }
  // No payment-link creation goes through checkout — it has its own port and
  // its own use-case (see: createPaymentLink flow, Chargily-only).
  return createCheckoutService(
    {
      provider: input.provider,
      priceId: input.priceId,
      successUrl: input.successUrl,
      failureUrl: input.failureUrl ?? "",
      userId: input.userId,
    },
    { billingProvider: deps.billingProvider },
  );
}
`;
}

function subscriptionsApplication(mode: ProjectMode): string {
  const servicesImport =
    mode === "monorepo" ? `@repo/services/billing` : `@/server/services/billing`;
  const resultImport = mode === "monorepo" ? `@repo/kernel` : `@/server/kernel/result`;
  return `import { listSubscriptionsService, type BillingSnapshot } from "${servicesImport}";
import type { Result } from "${resultImport}";

export async function listSubscriptionsUseCase(userId: string): Promise<Result<BillingSnapshot, Error>> {
  return listSubscriptionsService(userId);
}
`;
}

function portalUseCase(mode: ProjectMode): string {
  const servicesImport =
    mode === "monorepo" ? `@repo/services/billing` : `@/server/services/billing`;
  return `import {
  createPortalSessionService,
  type BillingProviderName,
  type PortalProviderPort,
  type PortalSessionRecord,
  type Result,
} from "${servicesImport}";

export interface CreatePortalSessionUseCaseInput {
  provider: BillingProviderName;
  customerId: string;
  returnUrl: string;
}

export type { PortalSessionRecord };

export async function createPortalSessionUseCase(
  input: CreatePortalSessionUseCaseInput,
  deps: { billingProvider: PortalProviderPort },
): Promise<Result<PortalSessionRecord, Error>> {
  return createPortalSessionService(input, deps);
}
`;
}

export function billingApplicationsFiles(mode: ProjectMode = "monorepo"): TemplateFile[] {
  const base = mode === "monorepo" ? "packages/modules/src" : "src/server/modules";
  return [
    file(`${base}/billing/application/create-checkout.usecase.ts`, createCheckoutUseCase(mode)),
    file(
      `${base}/billing/application/list-subscriptions.usecase.ts`,
      subscriptionsApplication(mode),
    ),
    file(`${base}/billing/application/create-portal-session.usecase.ts`, portalUseCase(mode)),
  ];
}
