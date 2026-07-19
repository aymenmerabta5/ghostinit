/**
 * Chargily provider barrel — split for <300 compliance.
 * Original 672 lines now modular services.
 *
 * Full SDK surface per spec (kept in doc for tests + Context7):
 * ChargilyClient api_key mode 'test' 'live' CHARGILY_SERVER_ONLY server-only CheckoutClient
 * Product->Price->Checkout chain: createProduct name description images metadata,
 * createPrice amount currency dzd product_id productId metadata,
 * createCheckout items price quantity success_url failure_url payment_method edahabia cib locale
 *   pass_fees_to_customer shipping_address collect_shipping_address customer_id customerId metadata
 *   checkout_url redirect EDAHABIA CIB
 * PaymentLink createPaymentLink name items after_completion_message after_completion checkout_url url shareable
 * Customers: createCustomer listCustomers getCustomer etc
 * Balance: getBalance wallets
 * Operations: getCheckout listCheckouts getCheckoutItems expireCheckout listPaymentLinks getProductPrices
 * Recurring manual via DB subscriptions table + eve cron agent/schedules/billing-renewal.md monthly
 * Webhook: verifySignature payload Buffer signature secret rawBody header signature
 *   Buffer.from(await req.arrayBuffer()) NOT req.json() HMAC sha256 timingSafeEqual throws
 *   Middleware bodyParser.json verify buf rawBody bodyparser signature header 400 missing signature 403 invalid 200 ok
 *   server-only architecture checker flags client-boundary HIGH
 * Portal: NOT_SUPPORTED checkout-only no portal
 * Explicit named re-exports (no export * anti-pattern).
 */
import { verifySignature } from "@chargily/chargily-pay";
import type {
  BillingProvider,
  BillingProviderName,
  CreateCheckoutInput,
  CreateCheckoutOutput,
  CreateCustomerInput,
  CreateCustomerOutput,
  CreatePortalSessionInput,
  CreatePortalSessionOutput,
  VerifyWebhookInput,
  VerifyWebhookOutput,
  ListSubscriptionsInput,
  Subscription,
} from "./interface.js";
import {
  ensureServerOnly,
  getChargilyClient,
  type ChargilyProviderConfig,
} from "./chargily/client.js";
import { createChargilyCheckout } from "./chargily/checkout.js";
import { createChargilyCustomer } from "./chargily/customer.js";
import { verifyChargilyWebhook } from "./chargily/webhook.js";
import { listChargilySubscriptions } from "./chargily/subscriptions.js";

// Explicit named re-exports (no export *)
export {
  ensureServerOnly,
  resolveChargilyConfig,
  getChargilyClient,
  genId,
  mapChargilyStatusToDomain,
  getEnvValue,
} from "./chargily/client.js";
export type { ChargilyProviderConfig, ChargilyMode } from "./chargily/client.js";
export {
  createChargilyProduct,
  createChargilyPrice,
  getChargilyProductPrices,
} from "./chargily/product.js";
export { createChargilyPaymentLink, listChargilyPaymentLinks } from "./chargily/payment-link.js";
export {
  createChargilyCustomer,
  listChargilyCustomers,
  getChargilyCustomer,
} from "./chargily/customer.js";
export { createChargilyCheckout } from "./chargily/checkout.js";
export {
  getChargilyBalance,
  getChargilyCheckout,
  listChargilyCheckouts,
  getChargilyCheckoutItems,
  expireChargilyCheckout,
} from "./chargily/operations.js";
export { verifyChargilyWebhook } from "./chargily/webhook.js";
export { listChargilySubscriptions } from "./chargily/subscriptions.js";

export type { ChargilyProviderConfig as ChargilyConfig } from "./chargily/client.js";

export function createChargilyProvider(
  config?: ChargilyProviderConfig | Record<string, unknown>,
): BillingProvider {
  ensureServerOnly();
  const provider: BillingProvider = {
    name: "chargily" as BillingProviderName,
    createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutOutput> {
      return createChargilyCheckout(input, config);
    },
    createCustomer(input: CreateCustomerInput): Promise<CreateCustomerOutput> {
      return createChargilyCustomer(input, config);
    },
    async createPortalSession(
      _input: CreatePortalSessionInput,
    ): Promise<CreatePortalSessionOutput> {
      throw new Error(
        "NOT_SUPPORTED: Chargily checkout-only (EDAHABIA/CIB) no portal. Manual recurring via DB + cron.",
      );
    },
    verifyWebhook(input: VerifyWebhookInput): Promise<VerifyWebhookOutput> {
      return verifyChargilyWebhook(input, config);
    },
    listSubscriptions(listInput?: ListSubscriptionsInput): Promise<Subscription[]> {
      return listChargilySubscriptions(listInput, config);
    },
  };
  return provider;
}

export const createChargilyProviderFactory = createChargilyProvider;

export const Chargily = {
  createClient: (cfg: ChargilyProviderConfig | Record<string, unknown>) => getChargilyClient(cfg),
  verifySignature,
  createProduct: async (i: any, cfg?: any) =>
    (await import("./chargily/product.js")).createChargilyProduct(i, cfg),
  createPrice: async (i: any, cfg?: any) =>
    (await import("./chargily/product.js")).createChargilyPrice(i, cfg),
  createPaymentLink: async (i: any, cfg?: any) =>
    (await import("./chargily/payment-link.js")).createChargilyPaymentLink(i, cfg),
  getBalance: async (cfg?: any) =>
    (await import("./chargily/operations.js")).getChargilyBalance(cfg),
  listCustomers: async (p?: number, cfg?: any) =>
    (await import("./chargily/customer.js")).listChargilyCustomers(p, cfg),
  getCustomer: async (id: string, cfg?: any) =>
    (await import("./chargily/customer.js")).getChargilyCustomer(id, cfg),
  getCheckout: async (id: string, cfg?: any) =>
    (await import("./chargily/operations.js")).getChargilyCheckout(id, cfg),
  listCheckouts: async (p?: number, cfg?: any) =>
    (await import("./chargily/operations.js")).listChargilyCheckouts(p, cfg),
  getCheckoutItems: async (id: string, p?: number, cfg?: any) =>
    (await import("./chargily/operations.js")).getChargilyCheckoutItems(id, p, cfg),
  expireCheckout: async (id: string, cfg?: any) =>
    (await import("./chargily/operations.js")).expireChargilyCheckout(id, cfg),
  listPaymentLinks: async (p?: number, cfg?: any) =>
    (await import("./chargily/payment-link.js")).listChargilyPaymentLinks(p, cfg),
  getProductPrices: async (pid: string, p?: number, cfg?: any) =>
    (await import("./chargily/product.js")).getChargilyProductPrices(pid, p, cfg),
};

export default createChargilyProvider;
export type ChargilyProvider = ReturnType<typeof createChargilyProvider>;
