/**
 * BillingProvider port — stable abstraction so services never import SDKs directly.
 * Raw body Buffer MUST be used for webhooks (not req.json).
 */
import type { BillingProviderName } from "./types.js";
import type {
  CreateCheckoutInput,
  CreateCheckoutOutput,
  CreateCustomerInput,
  CreateCustomerOutput,
  CreatePortalSessionInput,
  CreatePortalSessionOutput,
  CreatePaymentLinkInput,
  CreatePaymentLinkOutput,
  VerifyWebhookInput,
  VerifyWebhookOutput,
  ListSubscriptionsInput,
  CreateLicenseKeyInput,
  CreateLicenseKeyOutput,
  IngestUsageEventInput,
  IngestUsageEventOutput,
} from "./inputs.js";
import type { Subscription } from "./types.js";

export interface BillingProvider {
  readonly name: BillingProviderName;
  createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutOutput>;
  createCustomer(input: CreateCustomerInput): Promise<CreateCustomerOutput>;
  /**
   * Customer portal — stripe/paddle/polar only. Chargily checkout-only throws NOT_SUPPORTED.
   * Chargily is checkout-only: renewal requires a new customer-authorized payment.
   */
  createPortalSession?(input: CreatePortalSessionInput): Promise<CreatePortalSessionOutput>;
  /** Merchant payment-link creation. Only providers with a native capability implement this. */
  createPaymentLink?(input: CreatePaymentLinkInput): Promise<CreatePaymentLinkOutput>;
  /**
   * Webhook verification — all 4 need raw Buffer:
   * stripe: await constructEventAsync(buf, sig, secret) for Bun/worker SubtleCrypto
   * chargily: verifySignature(payload Buffer, sig, secret) header "signature"
   * paddle: unmarshal(buf.toString(), secret, sig header paddle-signature)
   * polar: validateEvent raw body whsec base64
   */
  verifyWebhook(input: VerifyWebhookInput): Promise<VerifyWebhookOutput>;
  listSubscriptions?(input: ListSubscriptionsInput): Promise<Subscription[]>;
  createLicenseKey?(input: CreateLicenseKeyInput): Promise<CreateLicenseKeyOutput>;
  ingestUsageEvent?(input: IngestUsageEventInput): Promise<IngestUsageEventOutput>;
}

export type BillingProviderFactory = (config?: Record<string, unknown>) => BillingProvider;

export interface BillingProviderRegistry {
  stripe?: BillingProviderFactory;
  chargily?: BillingProviderFactory;
  paddle?: BillingProviderFactory;
  polar?: BillingProviderFactory;
}
