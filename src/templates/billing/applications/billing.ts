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
  return `import { createCheckoutService, validateBillingRedirectUrl, type BillingProviderName } from "${servicesImport}";
import type { Result } from "${resultImport}";
import type { CheckoutRecord, BillingProviderPort, BillingCheckoutRepositoryPort, BillingCustomerLookupPort, BillingPriceCatalogPort } from "${servicesImport}";

export interface CreateCheckoutUseCaseInput {
  userId: string;
  customerEmail: string;
  provider: BillingProviderName;
  planId: "pro";
  successUrl: string;
  failureUrl?: string;
  cancelUrl?: string;
  quantity?: number;
  requestKey: string;
}

type UseCaseDeps = {
  billingProvider: BillingProviderPort;
  customerRepository: BillingCustomerLookupPort;
  checkoutRepository: BillingCheckoutRepositoryPort;
  priceCatalog: BillingPriceCatalogPort;
};

export async function createCheckoutUseCase(
  input: CreateCheckoutUseCaseInput,
  deps: UseCaseDeps,
): Promise<Result<CheckoutRecord, Error>> {
  if (!input.planId || !input.successUrl) {
    return { ok: false, error: new Error("planId and successUrl are required") };
  }
  // Domain invariant: every checkout must be traceable to the authenticated user.
  if (!input.userId) {
    return { ok: false, error: new Error("userId is required") };
  }
  const readEnvironment = (name: string) => process.env[name];
  const successUrl = validateBillingRedirectUrl(input.successUrl, "Checkout success URL", readEnvironment);
  if (!successUrl.ok) return { ok: false, error: successUrl.error };
  const failureUrl = input.failureUrl
    ? validateBillingRedirectUrl(input.failureUrl, "Checkout failure URL", readEnvironment)
    : null;
  if (failureUrl && !failureUrl.ok) return { ok: false, error: failureUrl.error };
  const cancelUrl = input.cancelUrl
    ? validateBillingRedirectUrl(input.cancelUrl, "Checkout cancel URL", readEnvironment)
    : null;
  if (cancelUrl && !cancelUrl.ok) return { ok: false, error: cancelUrl.error };
  // No payment-link creation goes through checkout — it has its own port and
  // its own use-case (see: createPaymentLink flow, Chargily-only).
  return createCheckoutService(
    {
      provider: input.provider,
      userId: input.userId,
      planId: input.planId,
      successUrl: successUrl.value,
      failureUrl: failureUrl?.value,
      cancelUrl: cancelUrl?.value,
      customerEmail: input.customerEmail,
      quantity: input.quantity,
      requestKey: input.requestKey,
    },
    {
      billingProvider: deps.billingProvider,
      customerRepository: deps.customerRepository,
      checkoutRepository: deps.checkoutRepository,
      priceCatalog: deps.priceCatalog,
    },
  );
}
`;
}

function subscriptionsApplication(mode: ProjectMode): string {
  const servicesImport =
    mode === "monorepo" ? `@repo/services/billing` : `@/server/services/billing`;
  const resultImport = mode === "monorepo" ? `@repo/kernel` : `@/server/kernel/result`;
  return `import { listSubscriptionsService, type BillingSnapshot, type BillingSnapshotRepositoryPort } from "${servicesImport}";
import type { Result } from "${resultImport}";

export async function listSubscriptionsUseCase(userId: string, repository: BillingSnapshotRepositoryPort): Promise<Result<BillingSnapshot, Error>> {
  return listSubscriptionsService(userId, repository);
}
`;
}

function portalUseCase(mode: ProjectMode): string {
  const servicesImport =
    mode === "monorepo" ? `@repo/services/billing` : `@/server/services/billing`;
  const resultImport = mode === "monorepo" ? `@repo/kernel` : `@/server/kernel/result`;
  return `import {
  createPortalSessionService,
  validateBillingRedirectUrl,
  type BillingProviderName,
  type PortalCustomerRepositoryPort,
  type PortalProviderPort,
  type PortalSessionRecord,
  type CreatePortalSessionOutput,
} from "${servicesImport}";
import type { Result } from "${resultImport}";

export interface CreatePortalSessionUseCaseInput {
  provider: BillingProviderName;
  actorId: string;
  returnUrl: string;
}

export type { PortalSessionRecord };

export async function createPortalSessionUseCase(
  input: CreatePortalSessionUseCaseInput,
  deps: {
    billingProvider: PortalProviderPort;
    customerRepository: PortalCustomerRepositoryPort;
  },
): Promise<CreatePortalSessionOutput> {
  const returnUrl = validateBillingRedirectUrl(
    input.returnUrl,
    "Portal return URL",
    (name) => process.env[name],
  );
  if (!returnUrl.ok) return returnUrl;
  return createPortalSessionService({ ...input, returnUrl: returnUrl.value }, deps);
}
`;
}

export function billingApplicationsFiles(mode: ProjectMode = "monorepo"): TemplateFile[] {
  const base = mode === "monorepo" ? "packages/modules/src" : "src/server/modules";
  return [
    ...(mode === "single"
      ? [
          file(`${base}/billing/index.ts`, `export * from "./application/index.js";\n`),
          file(
            `${base}/billing/application/index.ts`,
            `export { createCheckoutUseCase, type CreateCheckoutUseCaseInput } from "./create-checkout.usecase.js";
export { listSubscriptionsUseCase } from "./list-subscriptions.usecase.js";
export { createPortalSessionUseCase, type CreatePortalSessionUseCaseInput, type PortalSessionRecord } from "./create-portal-session.usecase.js";
`,
          ),
        ]
      : []),
    file(`${base}/billing/application/create-checkout.usecase.ts`, createCheckoutUseCase(mode)),
    file(
      `${base}/billing/application/list-subscriptions.usecase.ts`,
      subscriptionsApplication(mode),
    ),
    file(`${base}/billing/application/create-portal-session.usecase.ts`, portalUseCase(mode)),
  ];
}
