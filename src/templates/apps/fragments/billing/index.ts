import type { TemplateFile } from "../../../shared.js";
import { file } from "../../../shared.js";
import {
  billingPage,
  billingPageContent,
  billingEmptyStateContent,
  billingPresentationContent,
  type RouterType,
} from "./page.js";
import type { BillingProviderName } from "../../../../lib/addons.js";
import { BILLING_PROVIDERS } from "../../../../lib/constants.js";
import { billingClientProviderOptions } from "./client-capabilities.js";
import { billingInvoicesContent } from "../../../billing/ui/invoices.js";
import { billingMoneyFile } from "../../../billing/ui/money.js";
import { billingStatusContent } from "../../../billing/ui/status.js";
import { manualBillingUiFiles } from "../../../billing/ui/manual/index.js";
import { billingUiFiles } from "../../../billing/ui/components/composer.js";
import {
  billingPaymentLinkFormContent,
  billingPaymentLinkViewContent,
  billingProviderUrlContent,
} from "../../../billing/ui/payment-link-form.js";
import {
  billingActionsHookContent,
  billingClientMutationsContent,
  billingClientTypesContent,
  billingFormSchemaContent,
  billingPaymentLinkHookContent,
} from "../../../billing/ui/client-workflows.js";

export {
  billingEmptyStateContent,
  billingPage,
  billingPageContent,
  billingPresentationContent,
  type RouterType,
};

export function billingFiles(
  router: RouterType = "next",
  isConvex = false,
  selected: readonly BillingProviderName[] = BILLING_PROVIDERS,
): TemplateFile[] {
  if (router === "next")
    return billingUiFiles({
      mode: "monorepo",
      addons: Object.fromEntries(
        BILLING_PROVIDERS.map((provider) => [provider, { inUse: selected.includes(provider) }]),
      ),
    });
  const featureBase = "apps/web/src/features/billing";
  const hasOnline = selected.some((provider) => provider !== "manual");
  const hasPaymentLink = selected.includes("chargily");
  const files: TemplateFile[] = [
    ...(selected.includes("manual") ? manualBillingUiFiles("apps/web/src") : []),
    billingPage(router, isConvex, hasOnline),
    file(featureBase + "/billing-page.tsx", billingPresentationContent(router, selected)),
  ];
  if (!hasOnline) return files;
  files.push(
    billingMoneyFile("apps/web/src"),
    file(featureBase + "/status-labels.ts", billingStatusContent()),
    file(featureBase + "/components/billing-empty-state.tsx", billingEmptyStateContent(selected)),
    file(featureBase + "/components/billing-invoices.tsx", billingInvoicesContent()),
    file(featureBase + "/model.ts", billingSnapshotContent()),
    file(featureBase + "/types.ts", billingClientTypesContent(hasPaymentLink, false)),
    file(
      featureBase + "/provider-options.ts",
      'import type { ProviderName } from "./model";\nexport const BILLING_PROVIDERS: readonly { id: ProviderName; label: string; checkout: true; portal: boolean; paymentLink: boolean }[] = ' +
        JSON.stringify(billingClientProviderOptions(selected)) +
        ";\nexport function supportsBillingPortal(provider: ProviderName): boolean { return BILLING_PROVIDERS.some((option) => option.id === provider && option.portal); }\n",
    ),
    file(featureBase + "/provider-url.ts", billingProviderUrlContent),
    file(featureBase + "/queries.ts", billingQueriesContent()),
    file(featureBase + "/mutations.ts", billingClientMutationsContent("tanstack")),
    file(featureBase + "/use-billing-actions.ts", billingActionsHookContent()),
    file(featureBase + "/use-billing-page.ts", billingHookContent()),
  );
  if (hasPaymentLink)
    files.push(
      file(featureBase + "/payment-link-form.tsx", billingPaymentLinkFormContent()),
      file(featureBase + "/use-payment-link-form.ts", billingPaymentLinkHookContent()),
      file(featureBase + "/schema.ts", billingFormSchemaContent),
      file(featureBase + "/components/payment-link-form.tsx", billingPaymentLinkViewContent()),
    );
  return files;
}

function billingSnapshotContent(): string {
  return `export type ProviderName = "stripe" | "chargily" | "paddle" | "polar";
export interface Sub { id: string; provider: ProviderName; status: string; customerId?: string | null; }
export interface Inv { id: string; provider: ProviderName; amount: number; currency?: string; status: string; paid: boolean; }

function isProviderName(value: unknown): value is ProviderName { return value === "stripe" || value === "chargily" || value === "paddle" || value === "polar"; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null; }
function recordId(value: Record<string, unknown>): string | null { return typeof value.id === "string" ? value.id : typeof value._id === "string" ? value._id : null; }

export function normalizeBillingSnapshot(data: { subscriptions: readonly unknown[]; invoices: readonly unknown[] }): { subscriptions: Sub[]; invoices: Inv[] } {
  const subscriptions = data.subscriptions.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const id = recordId(entry); const provider = entry.provider; const status = entry.status;
    if (!id || !isProviderName(provider) || typeof status !== "string") return [];
    const customerId = typeof entry.customerId === "string" || entry.customerId === null ? entry.customerId : undefined;
    return [{ id, provider, status, customerId }];
  });
  const invoices = data.invoices.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const id = recordId(entry); const provider = entry.provider; const status = entry.status;
    if (!id || !isProviderName(provider) || typeof status !== "string" || typeof entry.amount !== "number") return [];
    const currency = typeof entry.currency === "string" ? entry.currency : undefined;
    return [{ id, provider, status, amount: entry.amount, currency, paid: entry.paid === true }];
  });
  return { subscriptions, invoices };
}
`;
}

function billingQueriesContent(): string {
  return `"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { billingSnapshotQueryKey, currentQueryAuthScope } from "@/lib/query-client";
import { protectedRouteSessionQueryOptions } from "@/lib/protected-route";
import { getProtectedRouteSession } from "@/lib/server-functions";
import { orpcClient } from "@/lib/orpc";
import { normalizeBillingSnapshot } from "./model";
export type { Inv, ProviderName, Sub } from "./model";

export async function fetchBillingSnapshot() {
  return normalizeBillingSnapshot(await orpcClient.billing.subscriptions());
}
export function useBillingSnapshot() {
  const queryClient = useQueryClient();
  const scope = currentQueryAuthScope(queryClient);
  return useQuery({ queryKey: scope ? billingSnapshotQueryKey(scope) : ["auth", "anonymous", "billing", "snapshot"], queryFn: fetchBillingSnapshot, enabled: Boolean(scope) && typeof window !== "undefined", staleTime: 30_000 });
}
export function useBillingIdentity() {
  const queryClient = useQueryClient();
  const scope = currentQueryAuthScope(queryClient);
  return useQuery({ queryKey: scope ? protectedRouteSessionQueryOptions(scope).queryKey : ["auth", "anonymous", "billing", "identity"], queryFn: () => getProtectedRouteSession(), enabled: Boolean(scope), staleTime: 30_000 });
}
`;
}

function billingHookContent(): string {
  return `"use client";
import { useBillingSnapshot, useBillingIdentity } from "./queries";
import { useBillingActions } from "./use-billing-actions";
export type { ProviderName } from "./model";

export function useBillingPage() {
  const snapshot = useBillingSnapshot();
  const identity = useBillingIdentity();
  const actions = useBillingActions();
  const role = identity.data?.user?.role;
  const subscriptions = snapshot.data?.subscriptions ?? [];
  const invoices = snapshot.data?.invoices ?? [];
  return { ...actions, subscriptions, invoices, subsLoading: snapshot.isPending, pastDue: subscriptions.some((subscription) => subscription.status === "past_due"), canCreatePaymentLinks: !identity.data?.user?.banned && (role === "admin" || role === "superAdmin"), snapshotError: snapshot.error, refreshing: snapshot.isFetching, refresh: async () => { await snapshot.refetch(); } };
}
`;
}
