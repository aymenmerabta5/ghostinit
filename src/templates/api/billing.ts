import type { ProjectMode } from "../../lib/addons.js";
import { file, type TemplateFile } from "../shared.js";

interface BillingTransportPaths {
  readonly base: string;
}

const applicationErrorMap = `APPLICATION_UNAUTHENTICATED: "UNAUTHORIZED", APPLICATION_ACCOUNT_SUSPENDED: "FORBIDDEN", APPLICATION_EMAIL_NOT_VERIFIED: "FORBIDDEN", APPLICATION_ADMIN_REQUIRED: "FORBIDDEN", APPLICATION_BAD_REQUEST: "BAD_REQUEST", APPLICATION_NOT_FOUND: "NOT_FOUND", APPLICATION_NOT_IMPLEMENTED: "NOT_IMPLEMENTED", APPLICATION_CONFLICT: "CONFLICT", APPLICATION_RATE_LIMITED: "TOO_MANY_REQUESTS", APPLICATION_RATE_LIMIT_UNAVAILABLE: "SERVICE_UNAVAILABLE", APPLICATION_INTERNAL_ERROR: "INTERNAL_SERVER_ERROR"`;

function paths(mode: ProjectMode): BillingTransportPaths {
  return mode === "monorepo"
    ? {
        base: "packages/api/src/procedures/billing",
      }
    : {
        base: "src/server/api/procedures/billing",
      };
}

function subscriptionsContent(): string {
  return `import { oc } from "@orpc/contract";
import { implement } from "@orpc/server";
import { createServiceORPCError } from "../../utils/service-error.js";
import { z } from "zod";
import type { ApiContext } from "../../context.js";

const contract = {
  list: oc
    .route({ method: "GET", path: "/billing/subscriptions" })
    .errors({
      UNAUTHORIZED: { message: "Unauthorized" },
      FORBIDDEN: { message: "Account suspended or unverified" },
      TOO_MANY_REQUESTS: { message: "Too many requests" },
      SERVICE_UNAVAILABLE: { message: "Rate limiting unavailable" },
      INTERNAL_SERVER_ERROR: { message: "Unable to load billing data" },
    })
    .output(z.object({
      subscriptions: z.array(z.record(z.string(), z.unknown())),
      invoices: z.array(z.record(z.string(), z.unknown())),
      usageEvents: z.array(z.record(z.string(), z.unknown())),
      licenseKeys: z.array(z.record(z.string(), z.unknown())),
    })),
};

export const billingSubscriptionsContract = contract.list;
const implementer = implement<typeof contract, ApiContext>(contract);

export const billingSubscriptions = implementer.list.handler(async ({ context }) => {
  try {
    return await context.application.billing.subscriptions();
  } catch (error) {
    return createServiceORPCError(error, {
      codeMap: { ${applicationErrorMap} },
      fallbackMessage: "Unable to load billing data",
    });
  }
});
`;
}

function checkoutContent(): string {
  return `import { oc } from "@orpc/contract";
import { implement } from "@orpc/server";
import { createServiceORPCError } from "../../utils/service-error.js";
import { z } from "zod";
import type { ApiContext } from "../../context.js";

const contract = {
  createCheckout: oc
    .route({ method: "POST", path: "/billing/checkout" })
    .errors({
      UNAUTHORIZED: { message: "Unauthorized" },
      FORBIDDEN: { message: "Account suspended or unverified" },
      TOO_MANY_REQUESTS: { message: "Too many requests" },
      SERVICE_UNAVAILABLE: { message: "Rate limiting unavailable" },
      BAD_REQUEST: { message: "Invalid checkout input" },
      INTERNAL_SERVER_ERROR: { message: "Failed to create checkout" },
    })
    .input(z.object({
      provider: z.enum(["stripe", "chargily", "paddle", "polar"]),
      planId: z.literal("pro"),
      successUrl: z.string().url(),
      failureUrl: z.string().url().optional(),
      cancelUrl: z.string().url().optional(),
      quantity: z.number().int().min(1).max(1_000).optional(),
      requestKey: z.string().uuid(),
    }))
    .output(z.object({
      id: z.string(),
      url: z.string(),
      provider: z.enum(["stripe", "chargily", "paddle", "polar"]),
      status: z.string(),
    })),
};

export const billingCreateCheckoutContract = contract.createCheckout;
const implementer = implement<typeof contract, ApiContext>(contract);

export const billingCreateCheckout = implementer.createCheckout.handler(async ({ input, context }) => {
  try {
    return await context.application.billing.createCheckout(input);
  } catch (error) {
    return createServiceORPCError(error, {
      codeMap: { ${applicationErrorMap} },
      fallbackMessage: "Failed to create checkout",
    });
  }
});
`;
}

function portalContent(): string {
  return `import { oc } from "@orpc/contract";
import { implement } from "@orpc/server";
import { createServiceORPCError } from "../../utils/service-error.js";
import { z } from "zod";
import type { ApiContext } from "../../context.js";

const contract = {
  createPortalSession: oc
    .route({ method: "POST", path: "/billing/portal" })
    .errors({
      UNAUTHORIZED: { message: "Unauthorized" },
      FORBIDDEN: { message: "Account suspended or unverified" },
      TOO_MANY_REQUESTS: { message: "Too many requests" },
      SERVICE_UNAVAILABLE: { message: "Rate limiting unavailable" },
      BAD_REQUEST: { message: "Invalid portal return URL" },
      NOT_FOUND: { message: "Billing customer not found" },
      NOT_IMPLEMENTED: { message: "Customer portal not supported" },
      INTERNAL_SERVER_ERROR: { message: "Failed to create portal session" },
    })
    .input(z.object({
      provider: z.enum(["stripe", "chargily", "paddle", "polar"]),
      returnUrl: z.string().url(),
    }))
    .output(z.object({ url: z.string() })),
};

export const billingCreatePortalSessionContract = contract.createPortalSession;
const implementer = implement<typeof contract, ApiContext>(contract);

export const billingCreatePortalSession = implementer.createPortalSession.handler(async ({ input, context }) => {
  try {
    return await context.application.billing.createPortalSession(input);
  } catch (error) {
    return createServiceORPCError(error, {
      codeMap: { ${applicationErrorMap}, NOT_SUPPORTED: "NOT_IMPLEMENTED", CUSTOMER_NOT_FOUND: "NOT_FOUND", INVALID_REDIRECT: "BAD_REQUEST" },
      fallbackMessage: "Failed to create portal session",
    });
  }
});
`;
}

function paymentLinkContent(): string {
  return `import { oc } from "@orpc/contract";
import { implement } from "@orpc/server";
import { createServiceORPCError } from "../../utils/service-error.js";
import { z } from "zod";
import type { ApiContext } from "../../context.js";

const contract = {
  createPaymentLink: oc
    .route({ method: "POST", path: "/billing/payment-link" })
    .errors({
      UNAUTHORIZED: { message: "Unauthorized" },
      FORBIDDEN: { message: "Merchant administrator required" },
      TOO_MANY_REQUESTS: { message: "Too many requests" },
      SERVICE_UNAVAILABLE: { message: "Rate limiting unavailable" },
      NOT_IMPLEMENTED: { message: "Payment links are not supported" },
      INTERNAL_SERVER_ERROR: { message: "Failed to create payment link" },
    })
    .input(z.object({
      provider: z.enum(["stripe", "chargily", "paddle", "polar"]),
      name: z.string().min(1).max(120),
      items: z.array(z.object({ price: z.string().min(1).max(200), quantity: z.number().int().min(1).max(1_000) })).min(1).max(20),
      afterCompletionMessage: z.string().max(500).optional(),
    }))
    .output(z.object({ id: z.string(), url: z.string().url() })),
};

export const billingCreatePaymentLinkContract = contract.createPaymentLink;
const implementer = implement<typeof contract, ApiContext>(contract);

export const billingCreatePaymentLink = implementer.createPaymentLink.handler(async ({ input, context }) => {
  try {
    return await context.application.billing.createPaymentLink(input);
  } catch (error) {
    return createServiceORPCError(error, {
      codeMap: { ${applicationErrorMap} },
      fallbackMessage: "Failed to create payment link",
    });
  }
});
`;
}

export function billingApiFiles(mode: ProjectMode): TemplateFile[] {
  const target = paths(mode);
  return [
    file(`${target.base}/subscriptions.ts`, subscriptionsContent()),
    file(`${target.base}/create-checkout.ts`, checkoutContent()),
    file(`${target.base}/create-portal-session.ts`, portalContent()),
    file(`${target.base}/create-payment-link.ts`, paymentLinkContent()),
  ];
}
