export function chargilyPanelContent(hookImportPath: string): string {
  return `"use client";
import * as React from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { WalletIcon, LinkIcon, CopyIcon } from "../icons";
import { Spinner } from "@/components/ui/spinner";
import { useBillingPage } from "${hookImportPath}";
export function ChargilyPanel(): React.JSX.Element {
  const { subscriptions, subsLoading, isCheckoutLoading, paymentLinkUrl, shareAfterMessage, handleCheckout, createPaymentLink, copyText } = useBillingPage();
  const chargilySubs = subscriptions.filter((s) => s.provider === "chargily");
  return (
    <Card>
      <CardHeader><div className="flex items-center justify-between gap-3"><div className="flex flex-col gap-1"><CardTitle>Chargily Billing</CardTitle><CardDescription className="max-w-[65ch]">EDAHABIA and CIB methods, Algeria checkout-only. No customer portal, manual recurring via DB and monthly cron. Use alone for DZ market or combined with Stripe/Paddle/Polar for Algeria + Global dual coverage.</CardDescription></div><Badge variant="secondary"><span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-primary" /> chargily</span></Badge></div></CardHeader>
      <CardContent className="flex flex-col gap-6">
        <Alert><AlertTitle>Algeria market — EDAHABIA/CIB checkout-only</AlertTitle><AlertDescription className="max-w-[70ch]">Chargily is Algeria-specific gateway for EDAHABIA/CIB cards. Checkout-only, server-only, no customer portal. Recurring handled manually via subscriptions table + cron billing-renewal monthly.</AlertDescription></Alert>
        <Alert><AlertTitle>Server only</AlertTitle><AlertDescription className="max-w-[70ch]">Chargily SDK must only be used server side. Never import in client components. Webhook verifies via verifySignature raw Buffer, header signature.</AlertDescription></Alert>
        <div className="flex flex-wrap gap-2"><Button onClick={() => void handleCheckout("chargily")} disabled={isCheckoutLoading}>{isCheckoutLoading ? <Spinner data-icon="inline-start" /> : <WalletIcon data-icon="inline-start" />}Checkout via EDAHABIA/CIB</Button><Button variant="outline" onClick={() => void createPaymentLink()}><LinkIcon data-icon="inline-start" />Create shareable payment link</Button></div>
        {paymentLinkUrl ? <div className="flex flex-col gap-2 rounded-md border bg-muted/40 p-3"><p className="text-xs font-medium">Payment link</p><div className="flex items-center gap-2"><Input readOnly value={paymentLinkUrl} className="flex-1" /><Button size="sm" variant="outline" onClick={() => void copyText(paymentLinkUrl)}><CopyIcon data-icon="inline-start" />Copy</Button></div><p className="text-xs text-muted-foreground">{shareAfterMessage || "After completion message will appear after payment."}</p></div> : null}
        <div className="flex flex-col gap-3"><h3 className="text-sm font-medium">Checkouts (DB manual status)</h3>{subsLoading ? <Skeleton className="h-10 w-full" /> : <div className="rounded-md border bg-card"><Table><TableHeader><TableRow><TableHead>Provider</TableHead><TableHead>Status</TableHead><TableHead>Method</TableHead><TableHead>Checkout URL</TableHead></TableRow></TableHeader><TableBody>{chargilySubs.map((s) => (<TableRow key={s.id}><TableCell><Badge variant="secondary">{s.provider}</Badge></TableCell><TableCell><Badge variant="outline" className="capitalize">{s.status}</Badge></TableCell><TableCell className="text-xs">EDAHABIA/CIB</TableCell><TableCell className="truncate max-w-[20ch] text-muted-foreground">Manual via cron billing-renewal</TableCell></TableRow>))}{chargilySubs.length === 0 ? <TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-6">No checkouts yet</TableCell></TableRow> : null}</TableBody></Table></div>}<p className="text-xs text-muted-foreground max-w-[70ch]">Chargily is checkout-only, server-only. Recurring handled manually via subscriptions table plus eve cron agent/schedules/billing-renewal.md monthly creating new checkout payment_method edahabia|cib with checkout_url redirect.</p></div>
      </CardContent>
      <CardFooter className="flex-col items-start gap-2 text-xs text-muted-foreground"><p className="max-w-[70ch]">Flow: createProduct name description images metadata, createPrice amount currency dzd product_id, createCheckout items price quantity success_url failure_url payment_method edahabia|cib locale pass_fees_to_customer, redirect checkout_url.</p></CardFooter>
    </Card>
  );
}
`;
}
