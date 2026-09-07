import type { BillingProviderName } from "../../../../lib/addons.js";
import { billingClientProviderOptions } from "../billing/client-capabilities.js";
import { nativeI18nTemplate } from "../native-i18n.js";

export function expoBillingContent(
  mode: "monorepo" | "single" = "monorepo",
  selectedProviders: readonly BillingProviderName[] = [],
  hasI18n = false,
): string {
  const providerOptions = JSON.stringify(billingClientProviderOptions(selectedProviders));
  const i18n = nativeI18nTemplate(hasI18n, "billing");
  const renews = hasI18n
    ? '{t("renews", { date: item.currentPeriodEnd })}'
    : "Renews {item.currentPeriodEnd}";
  return `import * as React from "react";
import { ActivityIndicator, AppState, ScrollView, View } from "react-native";
import { Link } from "expo-router";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { useAuth } from "@/hooks/use-auth";
import { orpc } from "@/lib/orpc";
import { env } from "${mode === "monorepo" ? "@repo/config/expo" : "@/lib/env/expo"}";
${i18n.importLine.replace("{ useTranslations }", "{ usePlatformI18n, useTranslations }")}
import { formatBillingInvoiceAmount } from "@/lib/billing-money";

type ProviderName = "stripe" | "chargily" | "paddle" | "polar";
type ProviderOption = { id: ProviderName; label: string; checkout: true; portal: boolean; paymentLink: boolean };
type SubscriptionView = { id: string; provider: string; status: string; currentPeriodEnd?: string };
type InvoiceView = { id: string; provider: string; amount: number; currency?: string; status: string; paid: boolean };

const SELECTED_PROVIDERS = ${providerOptions} satisfies readonly ProviderOption[];
WebBrowser.maybeCompleteAuthSession();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function recordId(value: Record<string, unknown>): string | null {
  return typeof value.id === "string" ? value.id : typeof value._id === "string" ? value._id : null;
}

function subscriptionView(value: unknown): SubscriptionView | null {
  if (!isRecord(value) || typeof value.provider !== "string" || typeof value.status !== "string") return null;
  const id = recordId(value);
  if (!id) return null;
  return {
    id,
    provider: value.provider,
    status: value.status,
    ...(typeof value.currentPeriodEnd === "string" ? { currentPeriodEnd: value.currentPeriodEnd } : {}),
  };
}

function invoiceView(value: unknown): InvoiceView | null {
  if (!isRecord(value) || typeof value.provider !== "string" || typeof value.amount !== "number" || typeof value.status !== "string" || typeof value.paid !== "boolean") return null;
  const id = recordId(value);
  if (!id) return null;
  return {
    id,
    provider: value.provider,
    amount: value.amount,
    status: value.status,
    paid: value.paid,
    ...(typeof value.currency === "string" ? { currency: value.currency } : {}),
  };
}

function secureRequestKey(): string {
  const cryptoValue: unknown = Reflect.get(globalThis, "crypto");
  if (typeof cryptoValue !== "object" || cryptoValue === null) throw new Error("Secure random generation is unavailable");
  const randomUUID: unknown = Reflect.get(cryptoValue, "randomUUID");
  if (typeof randomUUID === "function") {
    const value: unknown = Reflect.apply(randomUUID, cryptoValue, []);
    if (typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) return value;
  }
  const getRandomValues: unknown = Reflect.get(cryptoValue, "getRandomValues");
  if (typeof getRandomValues !== "function") throw new Error("Secure random generation is unavailable");
  const bytes = new Uint8Array(16);
  Reflect.apply(getRandomValues, cryptoValue, [bytes]);
  bytes[6] = (bytes[6] ?? 0) & 0x0f | 0x40;
  bytes[8] = (bytes[8] ?? 0) & 0x3f | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return \`\${hex.slice(0, 8)}-\${hex.slice(8, 12)}-\${hex.slice(12, 16)}-\${hex.slice(16, 20)}-\${hex.slice(20)}\`;
}

function billingReturnUrl(status: "success" | "cancel" | "return"): string {
  const configured = new URL(env.EXPO_PUBLIC_APP_URL);
  if (configured.username || configured.password) throw new Error("EXPO_PUBLIC_APP_URL must not contain credentials");
  if (configured.protocol === "https:" || configured.protocol === "http:") {
    const result = new URL("/billing", configured);
    result.searchParams.set("checkout", status);
    return result.toString();
  }
  if (["javascript:", "data:", "file:", "blob:"].includes(configured.protocol)) throw new Error("EXPO_PUBLIC_APP_URL must be an application URL or deep link");
  const route = configured.hostname ? \`/\${configured.hostname}\${configured.pathname}\` : configured.pathname;
  if (route.replace(/\\/$/, "") !== "/billing") throw new Error("The configured billing deep link must target /billing");
  configured.searchParams.set("checkout", status);
  return configured.toString();
}

async function openProviderUrl(value: string, returnUrl?: string): Promise<void> {
  const parsed = new URL(value);
  const localHttp = parsed.protocol === "http:" && ["localhost", "127.0.0.1", "::1", "[::1]"].includes(parsed.hostname);
  if ((parsed.protocol !== "https:" && !localHttp) || parsed.username || parsed.password) throw new Error("Billing provider returned an unsafe URL");
  if (returnUrl) {
    await WebBrowser.openAuthSessionAsync(parsed.toString(), returnUrl);
    return;
  }
  if (!(await Linking.canOpenURL(parsed.toString()))) throw new Error("No browser can open the billing URL");
  await Linking.openURL(parsed.toString());
}

export default function BillingScreen(): React.JSX.Element {
${i18n.hookLine}
  const locale = ${hasI18n ? "usePlatformI18n().locale" : '"en"'};
  const { isAuthenticated } = useAuth();
  const applicationIdentity = useQuery(orpc.me.queryOptions({ enabled: isAuthenticated }));
  const snapshot = useQuery(orpc.billing.subscriptions.queryOptions({ enabled: isAuthenticated }));
  const checkout = useMutation(orpc.billing.createCheckout.mutationOptions());
  const portal = useMutation(orpc.billing.createPortalSession.mutationOptions());
  const paymentLink = useMutation(orpc.billing.createPaymentLink.mutationOptions());
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [linkName, setLinkName] = React.useState(${i18n.value("defaultLinkName", "Pro plan")});
  const [linkPrice, setLinkPrice] = React.useState("");
  const subscriptions = React.useMemo(() => snapshot.data?.subscriptions.flatMap((value) => subscriptionView(value) ?? []) ?? [], [snapshot.data]);
  const invoices = React.useMemo(() => snapshot.data?.invoices.flatMap((value) => invoiceView(value) ?? []) ?? [], [snapshot.data]);
  const role = applicationIdentity.data?.user?.role ?? "";
  const isAdmin = role === "admin" || role === "superAdmin";
  const busy = checkout.isPending || portal.isPending || paymentLink.isPending;

  React.useEffect(() => {
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active" && isAuthenticated) void snapshot.refetch();
    });
    return () => listener.remove();
  }, [isAuthenticated, snapshot.refetch]);

  async function run(action: () => Promise<{ url: string; returnUrl?: string }>, fallback: string): Promise<void> {
    setActionError(null);
    try {
      const result = await action();
      await openProviderUrl(result.url, result.returnUrl);
      if (result.returnUrl) await snapshot.refetch();
    }
    ${hasI18n ? "catch {" : "catch (cause) {"} setActionError(${hasI18n ? "fallback" : "cause instanceof Error ? cause.message : fallback"}); }
  }

  function startCheckout(provider: ProviderName): void {
    void run(async () => {
      const successUrl = billingReturnUrl("success");
      const result = await checkout.mutateAsync({ provider, planId: "pro", successUrl, failureUrl: billingReturnUrl("cancel"), requestKey: secureRequestKey() });
      return { ...result, returnUrl: successUrl };
    }, ${i18n.value("checkoutError", "Checkout failed")});
  }

  function openPortal(provider: ProviderName): void {
    void run(async () => {
      const returnUrl = billingReturnUrl("return");
      const result = await portal.mutateAsync({ provider, returnUrl });
      return { ...result, returnUrl };
    }, ${i18n.value("portalError", "Portal unavailable")});
  }

  function createPaymentLink(provider: ProviderName): void {
    const price = linkPrice.trim();
    const name = linkName.trim();
    if (!price || !name) { setActionError(${i18n.value("paymentLinkRequired", "Payment-link name and price ID are required")}); return; }
    void run(() => paymentLink.mutateAsync({ provider, name, items: [{ price, quantity: 1 }], afterCompletionMessage: ${i18n.value("paymentReceived", "Payment received")} }), ${i18n.value("paymentLinkError", "Payment link failed")});
  }

  return (
    <ScrollView className="flex-1 bg-background">
      <View className="w-full max-w-[960px] self-center gap-5 p-5">
        <View className="flex-row items-center justify-between"><View className="gap-1"><Text className="text-2xl font-bold tracking-tight">${i18n.child("title", "Billing")}</Text><Text className="text-sm text-muted-foreground">${i18n.child("mobileDescription", "Secure checkout and account billing through the typed application API.")}</Text></View><Link href="/dashboard" asChild><Button variant="outline"><Text>${i18n.child("dashboard", "Dashboard")}</Text></Button></Link></View>
        {actionError ? <Text className="text-sm text-destructive">{actionError}</Text> : null}
        {snapshot.error ? <Text className="text-sm text-destructive">{${hasI18n ? i18n.value("dataUnavailable", "Billing data is unavailable") : 'snapshot.error instanceof Error ? snapshot.error.message : "Billing data is unavailable"'}}</Text> : null}
        {!isAuthenticated ? <Card><CardHeader><CardTitle>${i18n.child("signInRequired", "Sign in required")}</CardTitle><CardDescription>${i18n.child("signInDescription", "Billing data and actions are actor-owned.")}</CardDescription></CardHeader></Card> : null}
        <View className="gap-3">
          {SELECTED_PROVIDERS.map((provider) => <Card key={provider.id}><CardHeader><CardTitle>{provider.label}</CardTitle><CardDescription>${i18n.child("providerDescription", "Only server-selected provider capabilities are exposed.")}</CardDescription></CardHeader><CardContent className="gap-3"><View className="flex-row flex-wrap gap-2"><Button disabled={!isAuthenticated || busy} onPress={() => startCheckout(provider.id)}><Text>${i18n.child("startCheckout", "Start checkout")}</Text></Button>{provider.portal ? <Button variant="outline" disabled={!isAuthenticated || busy} onPress={() => openPortal(provider.id)}><Text>${i18n.child("openPortal", "Open portal")}</Text></Button> : null}</View>{provider.paymentLink ? isAdmin ? <View className="gap-2"><Input value={linkName} onChangeText={setLinkName} placeholder={${i18n.value("paymentLinkName", "Payment-link name")}} /><Input value={linkPrice} onChangeText={setLinkPrice} placeholder={${i18n.value("providerPriceId", "Provider price ID")}} autoCapitalize="none" /><Button variant="outline" disabled={busy} onPress={() => createPaymentLink(provider.id)}><Text>${i18n.child("createPaymentLink", "Create payment link")}</Text></Button></View> : <Text className="text-xs text-muted-foreground">${i18n.child("adminPaymentLinks", "Merchant administrators can create payment links.")}</Text> : null}</CardContent></Card>)}
        </View>
        <Card><CardHeader><CardTitle>${i18n.child("subscriptions", "Subscriptions")}</CardTitle><CardDescription>${i18n.child("subscriptionDescription", "Actor-scoped subscription state.")}</CardDescription></CardHeader><CardContent className="gap-2">{snapshot.isPending ? <ActivityIndicator /> : subscriptions.length === 0 ? <Text className="text-sm text-muted-foreground">${i18n.child("noSubscriptionsTitle", "No subscriptions yet.")}</Text> : subscriptions.map((item) => <View key={item.id} className="flex-row items-center justify-between rounded-lg border border-border px-3 py-2"><View className="gap-1"><Text className="text-sm">{item.provider}</Text>{item.currentPeriodEnd ? <Text className="text-xs text-muted-foreground">${renews}</Text> : null}</View><Badge variant={item.status === "past_due" ? "destructive" : "secondary"}><Text className="text-xs">{item.status}</Text></Badge></View>)}</CardContent></Card>
        <Card><CardHeader><CardTitle>${i18n.child("invoices", "Invoices")}</CardTitle><CardDescription>${i18n.child("invoiceDescription", "Recent actor-scoped invoices.")}</CardDescription></CardHeader><CardContent className="gap-2">{invoices.length === 0 ? <Text className="text-sm text-muted-foreground">${i18n.child("noInvoices", "No invoices yet.")}</Text> : invoices.map((item) => <View key={item.id} className="flex-row items-center justify-between rounded-lg border border-border px-3 py-2"><Text className="text-sm">{item.provider} · {formatBillingInvoiceAmount(item, locale)}</Text><Badge variant={item.paid ? "secondary" : "destructive"}><Text className="text-xs">{item.status}</Text></Badge></View>)}</CardContent></Card>
        <Button variant="outline" disabled={!isAuthenticated || snapshot.isFetching} onPress={() => void snapshot.refetch()}><Text>${i18n.child("refresh", "Refresh billing")}</Text></Button>
      </View>
    </ScrollView>
  );
}
`;
}
