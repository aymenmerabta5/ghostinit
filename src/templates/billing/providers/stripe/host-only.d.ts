/**
 * Host-only Stripe type surface.
 *
 * The CLI intentionally does not install every optional provider SDK. These
 * declarations let the raw template sources participate in the host typecheck;
 * the billing generator does not emit this file, so generated projects resolve
 * the complete declarations from their selected Stripe dependency instead.
 */
declare module "stripe" {
  namespace Stripe {
    /** Mirrors Stripe 22's forward-compatible open-enum sentinel. */
    type OtherString = string & Record<never, never>;

    interface StripeConfig {
      apiVersion?: "2026-07-29.dahlia";
    }

    interface RequestOptions {
      idempotencyKey?: string;
    }

    namespace Checkout {
      interface SessionCreateParams {
        mode: "subscription";
        line_items: Array<{ price: string; quantity: number }>;
        success_url: string;
        cancel_url: string;
        automatic_tax?: { enabled: boolean };
        expand?: string[];
        customer?: string;
        customer_email?: string;
        client_reference_id?: string;
        metadata?: Record<string, string>;
        subscription_data?: { metadata?: Record<string, string> };
      }

      interface Session {
        id: string;
        url: string | null;
      }
    }

    interface CustomerCreateParams {
      email?: string;
      name?: string;
      phone?: string;
      address?: {
        country?: string;
        state?: string;
        city?: string;
        line1?: string;
        postal_code?: string;
      };
      metadata?: Record<string, string>;
    }

    interface Customer {
      id: string;
    }

    namespace BillingPortal {
      interface SessionCreateParams {
        customer: string;
        return_url?: string;
        flow_data?: SessionCreateParams.FlowData;
      }

      namespace SessionCreateParams {
        interface FlowData {
          type:
            | "payment_method_update"
            | "subscription_cancel"
            | "subscription_update"
            | "subscription_update_confirm";
        }
      }

      interface Session {
        url: string;
      }
    }

    interface SubscriptionListParams {
      customer?: string;
      status?: SubscriptionListParams.Status;
      limit?: number;
      expand?: string[];
    }

    namespace SubscriptionListParams {
      type Status =
        | "active"
        | "all"
        | "canceled"
        | "ended"
        | "incomplete"
        | "incomplete_expired"
        | "past_due"
        | "paused"
        | "trialing"
        | "unpaid";
    }

    interface SubscriptionItem {
      current_period_end: number;
      price: {
        id: string;
        product: string | { id: string };
      };
    }

    interface Subscription {
      id: string;
      customer: string | { id: string };
      items: { data: SubscriptionItem[] };
      metadata: Record<string, string>;
      status: Subscription.Status;
      trial_end: number | null;
      created: number;
    }

    namespace Subscription {
      type Status =
        | "active"
        | "canceled"
        | "incomplete"
        | "incomplete_expired"
        | "past_due"
        | "paused"
        | "trialing"
        | "unpaid"
        | OtherString;
    }

    interface Event {
      id: string;
      type: string;
      created: number;
      [key: string]: unknown;
    }
  }

  class Stripe {
    constructor(secretKey: string, config?: Stripe.StripeConfig);

    readonly checkout: {
      sessions: {
        create(
          params: Stripe.Checkout.SessionCreateParams,
          options?: Stripe.RequestOptions,
        ): Promise<Stripe.Checkout.Session>;
      };
    };
    readonly customers: {
      create(
        params: Stripe.CustomerCreateParams,
        options?: Stripe.RequestOptions,
      ): Promise<Stripe.Customer>;
    };
    readonly billingPortal: {
      sessions: {
        create(
          params: Stripe.BillingPortal.SessionCreateParams,
        ): Promise<Stripe.BillingPortal.Session>;
      };
    };
    readonly subscriptions: {
      list(params: Stripe.SubscriptionListParams): Promise<{ data: Stripe.Subscription[] }>;
    };
    readonly webhooks: {
      constructEventAsync(
        payload: string | Buffer,
        signature: string | Buffer | string[],
        secret: string,
      ): Promise<Stripe.Event>;
    };
  }

  export default Stripe;
}
