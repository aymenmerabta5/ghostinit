/** Shared browser form; the request application remains the merchant authority. */
export function billingPaymentLinkFormContent(hookImport: string): string {
  return `"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useSurfaceTranslations } from "@/lib/translations";
import { useBillingPage, type ProviderName } from "${hookImport}";

export function BillingPaymentLinkForm({ provider }: { provider: ProviderName }): React.JSX.Element {
  const t = useSurfaceTranslations("billing");
  const { canCreatePaymentLinks, handlePaymentLink, isPaymentLinkLoading } = useBillingPage();
  const [name, setName] = React.useState("");
  const [price, setPrice] = React.useState("");
  const [url, setUrl] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  if (!canCreatePaymentLinks) return <p className="text-sm text-muted-foreground">{t("adminPaymentLinks")}</p>;
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null); setUrl(null);
    try { setUrl(await handlePaymentLink(provider, name.trim(), price.trim())); }
    catch { setError(t("paymentLinkError")); }
  }
  return <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-3">
    <FieldGroup><Field><FieldLabel htmlFor={provider + "-payment-link-name"}>{t("paymentLinkName")}</FieldLabel><Input id={provider + "-payment-link-name"} value={name} maxLength={120} required onChange={(event) => setName(event.target.value)} /></Field><Field><FieldLabel htmlFor={provider + "-payment-link-price"}>{t("providerPriceId")}</FieldLabel><Input id={provider + "-payment-link-price"} value={price} maxLength={200} required onChange={(event) => setPrice(event.target.value)} /></Field></FieldGroup>
    <Button type="submit" variant="outline" disabled={isPaymentLinkLoading || !name.trim() || !price.trim()}>{t("createPaymentLink")}</Button>
    {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
    {url ? <a className="break-all text-sm underline" href={url} target="_blank" rel="noreferrer">{url}</a> : null}
  </form>;
}
`;
}

export const billingProviderUrlContent = `export function safeBillingProviderUrl(value: string): string {
  const url = new URL(value);
  const localHttp = url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !localHttp) || url.username || url.password) throw new Error("Billing provider returned an unsafe URL");
  return url.toString();
}
`;
