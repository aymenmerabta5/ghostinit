export function billingClientMutationsContent(router: "next" | "tanstack" = "next"): string {
  const transport =
    router === "next"
      ? `import { createBillingCheckoutAction, createBillingPortalAction, createBillingPaymentLinkAction } from "@/app/billing/actions";
const createCheckout = (input: CheckoutInput) => createBillingCheckoutAction(input);
const createPortal = (input: PortalInput) => createBillingPortalAction(input);
const createPaymentLink = (input: PaymentLinkInput) => createBillingPaymentLinkAction(input);`
      : `import { orpcClient } from "@/lib/orpc";
const createCheckout = (input: CheckoutInput) => orpcClient.billing.createCheckout({ provider: input.provider, planId: "pro", successUrl: input.origin + "/billing/success", failureUrl: input.origin + "/billing/cancel", requestKey: input.requestKey });
const createPortal = (input: PortalInput) => orpcClient.billing.createPortalSession({ provider: input.provider, returnUrl: input.origin + "/billing" });
const createPaymentLink = (input: PaymentLinkInput) => orpcClient.billing.createPaymentLink({ provider: input.provider, name: input.name, items: [{ price: input.price, quantity: 1 }] });`;
  return `"use client";
import { useAuthOwnedMutation } from "@/hooks/use-auth-owned-mutation";
import { safeBillingProviderUrl } from "./provider-url";
import type { ProviderName } from "./model";
interface PortalInput { provider: ProviderName; origin: string; }
interface CheckoutInput extends PortalInput { requestKey: string; }
interface PaymentLinkInput { provider: ProviderName; name: string; price: string; }
${transport}
export function useBillingCheckoutMutation() { return useAuthOwnedMutation(async (input: CheckoutInput) => { const result = await createCheckout(input); return { ...result, url: safeBillingProviderUrl(result.url) }; }); }
export function useBillingPortalMutation() { return useAuthOwnedMutation(async (input: PortalInput) => { const result = await createPortal(input); return { ...result, url: safeBillingProviderUrl(result.url) }; }); }
export function useBillingPaymentLinkMutation() { return useAuthOwnedMutation(async (input: PaymentLinkInput) => { const result = await createPaymentLink(input); return { ...result, url: safeBillingProviderUrl(result.url) }; }); }
`;
}

export function billingActionsHookContent(): string {
  return `"use client";
import * as React from "react";
import { toast } from "sonner";
import { useSurfaceTranslations } from "@/lib/translations";
import { useAuthOwnedEffect } from "@/hooks/use-auth-owned-effect";
import { useBillingCheckoutMutation, useBillingPortalMutation } from "./mutations";
import type { ProviderName } from "./model";

export function useBillingActions() {
  const t = useSurfaceTranslations("billing");
  const captureOwner = useAuthOwnedEffect();
  const checkout = useBillingCheckoutMutation();
  const portal = useBillingPortalMutation();
  const navigationBusy = React.useRef(false);
  async function handleCheckout(provider: ProviderName): Promise<void> {
    if (navigationBusy.current) return;
    navigationBusy.current = true;
    try {
      const result = await checkout.run({ provider, origin: window.location.origin, requestKey: crypto.randomUUID() });
      if (result.status === "success" && result.isCurrent()) window.location.assign(result.data.url);
      else if (result.status === "error" && result.isCurrent()) toast.error(t("checkoutError"));
    } finally { navigationBusy.current = false; }
  }
  async function handlePortal(provider: ProviderName): Promise<void> {
    if (navigationBusy.current) return;
    navigationBusy.current = true;
    try {
      const result = await portal.run({ provider, origin: window.location.origin });
      if (result.status === "success" && result.isCurrent()) window.location.assign(result.data.url);
      else if (result.status === "error" && result.isCurrent()) toast.error(t("portalError"));
    } finally { navigationBusy.current = false; }
  }
  async function copyText(value: string): Promise<void> {
    const isCurrent = captureOwner();
    if (!isCurrent()) return;
    try { await navigator.clipboard.writeText(value); if (isCurrent()) toast.success("Copied to clipboard"); }
    catch { if (isCurrent()) toast.error("Copy failed"); }
  }
  return { handleCheckout, handlePortal, copyText, copySuccessUrl: () => copyText(window.location.origin), isCheckoutLoading: checkout.isPending || portal.isPending };
}
`;
}

export function billingPaymentLinkHookContent(): string {
  return `"use client";
import * as React from "react";
import { useAppForm } from "@/components/ui/form";
import { useSurfaceTranslations } from "@/lib/translations";
import { createPaymentLinkSchema } from "./schema";
import { useBillingPaymentLinkMutation } from "./mutations";

export function usePaymentLinkForm(allowed: boolean) {
  const t = useSurfaceTranslations("billing");
  const mutation = useBillingPaymentLinkMutation();
  const busy = React.useRef(false);
  const form = useAppForm({
    defaultValues: { name: "", price: "" },
    validators: { onSubmit: createPaymentLinkSchema(t("paymentLinkRequired")) },
    onSubmit: async ({ value }) => {
      if (!allowed || busy.current) return;
      busy.current = true;
      try { await mutation.run({ provider: "chargily", name: value.name.trim(), price: value.price.trim() }); }
      finally { busy.current = false; }
    },
  });
  return { form, allowed, error: mutation.error ? t("paymentLinkError") : null, url: mutation.data?.url ?? null };
}
`;
}

export function billingClientTypesContent(hasPaymentLink: boolean, rich = true): string {
  return `import type { useBillingPage } from "./use-billing-page";
${hasPaymentLink ? 'import type { usePaymentLinkForm } from "./use-payment-link-form";' : ""}
export type BillingPageState = ReturnType<typeof useBillingPage>;
${hasPaymentLink ? "export type PaymentLinkFormState = ReturnType<typeof usePaymentLinkForm>;" : ""}
export type { ProviderName, Sub, Inv${rich ? ", LicenseKey, UsageEvent, BillingInitialData" : ""} } from "./model";
`;
}

export const billingFormSchemaContent = `import { z } from "zod";
export function createPaymentLinkSchema(required: string) {
  return z.object({ name: z.string().trim().min(1, required).max(120), price: z.string().trim().min(1, required).max(200) });
}
`;
