export function paddlePanelContent(hookImportPath: string): string {
  return `"use client";
import * as React from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { CreditCardIcon, ExternalLinkIcon } from "../icons";
import { Spinner } from "@/components/ui/spinner";
import { useBillingPage } from "${hookImportPath}";
export function PaddlePanel(): React.JSX.Element {
  const { subscriptions, subsLoading, isCheckoutLoading, hasCustomerId, handleCheckout, handlePortal } = useBillingPage();
  const paddleSubs = subscriptions.filter((s) => s.provider === "paddle");
  return (
    <Card>
      <CardHeader><div className="flex items-center justify-between gap-3"><div className="flex flex-col gap-1"><CardTitle>Paddle Billing</CardTitle><CardDescription className="max-w-[65ch]">Merchant of Record, global tax handling. Transactions with checkout url, TransactionCompleted and subscription events.</CardDescription></div><Badge variant="secondary"><span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-primary" /> paddle</span></Badge></div></CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="flex flex-wrap gap-2"><Button onClick={() => void handleCheckout("paddle")} disabled={isCheckoutLoading}>{isCheckoutLoading ? <Spinner data-icon="inline-start" /> : <CreditCardIcon data-icon="inline-start" />}Create transaction checkout</Button><Button variant="outline" onClick={() => void handlePortal("paddle")} disabled={!hasCustomerId}><ExternalLinkIcon data-icon="inline-start" />Customer portal</Button></div>
        <Alert><AlertTitle>MoR handling</AlertTitle><AlertDescription className="max-w-[65ch]">Paddle handles VAT and sales tax globally. Checkout url from transaction, webhooks unmarshal raw body string paddlesignature header. EventName TransactionCompleted, SubscriptionCreated, SubscriptionCanceled.</AlertDescription></Alert>
        <div className="flex flex-col gap-3"><h3 className="text-sm font-medium">Subscriptions</h3>{subsLoading ? <Skeleton className="h-10 w-full" /> : <div className="rounded-md border bg-card"><Table><TableHeader><TableRow><TableHead>Provider</TableHead><TableHead>Status</TableHead><TableHead>Period end</TableHead></TableRow></TableHeader><TableBody>{paddleSubs.map((s) => (<TableRow key={s.id}><TableCell><Badge variant="secondary">{s.provider}</Badge></TableCell><TableCell><Badge variant="outline" className="capitalize">{s.status}</Badge></TableCell><TableCell className="text-muted-foreground">{s.currentPeriodEnd ? new Date(s.currentPeriodEnd as string).toLocaleDateString() : "—"}</TableCell></TableRow>))}{paddleSubs.length === 0 ? <TableRow><TableCell colSpan={3} className="text-center text-sm text-muted-foreground py-6">No subscriptions yet, create transaction to start</TableCell></TableRow> : null}</TableBody></Table></div>}</div>
      </CardContent>
      <CardFooter className="text-xs text-muted-foreground"><p className="max-w-[70ch]">transactions.create items priceId quantity customerId collectionMode automatic customData userId successUrl failureUrl returns checkout url redirect.</p></CardFooter>
    </Card>
  );
}
`;
}
