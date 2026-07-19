export function stripePanelContent(hookImportPath: string): string {
  return `"use client";
import * as React from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { CreditCardIcon, ExternalLinkIcon, CopyIcon } from "../icons";
import { useBillingPage } from "${hookImportPath}";
export function StripePanel(): React.JSX.Element {
  const { subscriptions, invoices, subsLoading, isCheckoutLoading, pastDue, hasCustomerId, handleCheckout, handlePortal, copyText } = useBillingPage();
  const stripeSubs = subscriptions.filter((s) => s.provider === "stripe");
  const stripeInvs = invoices.filter((i) => i.provider === "stripe");
  return (
    <Card>
      <CardHeader><div className="flex items-center justify-between gap-3"><div className="flex flex-col gap-1"><CardTitle>Stripe Billing</CardTitle><CardDescription className="max-w-[65ch]">Global cards, subscription native. Checkout sessions with automatic tax and customer portal deep link.</CardDescription></div><Badge variant="secondary"><span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-primary" /> stripe</span></Badge></div></CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="flex flex-wrap gap-2"><Button onClick={() => void handleCheckout("stripe")} disabled={isCheckoutLoading}>{isCheckoutLoading ? <Spinner data-icon="inline-start" /> : <CreditCardIcon data-icon="inline-start" />}Checkout</Button><Button variant="outline" onClick={() => void handlePortal("stripe")} disabled={!hasCustomerId}><ExternalLinkIcon data-icon="inline-start" />Customer portal</Button><Button variant="outline" onClick={() => void copyText(window.location.origin)}><CopyIcon data-icon="inline-start" />Copy success URL</Button></div>
        {pastDue ? <Alert><AlertTitle>Payment past due</AlertTitle><AlertDescription className="max-w-[65ch]">Your subscription is past due. Update payment method in customer portal to restore access.</AlertDescription></Alert> : null}
        <div className="flex flex-col gap-3"><h3 className="text-sm font-medium">Subscriptions</h3>{subsLoading ? <div className="flex flex-col gap-2"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div> : stripeSubs.length === 0 ? <Empty className="border border-dashed"><EmptyHeader><EmptyTitle className="text-sm">No subscriptions yet</EmptyTitle><EmptyDescription>Create a checkout session to start a subscription.</EmptyDescription></EmptyHeader></Empty> : <div className="rounded-md border bg-card"><Table><TableHeader><TableRow><TableHead>Provider</TableHead><TableHead>Status</TableHead><TableHead>Period end</TableHead><TableHead>Customer</TableHead></TableRow></TableHeader><TableBody>{stripeSubs.map((s) => (<TableRow key={s.id}><TableCell><Badge variant="secondary">{s.provider}</Badge></TableCell><TableCell><Badge variant={s.status === "active" ? "secondary" : s.status === "past_due" ? "destructive" : "outline"} className="capitalize">{s.status}</Badge></TableCell><TableCell className="text-muted-foreground">{s.currentPeriodEnd ? new Date(s.currentPeriodEnd as string).toLocaleDateString() : "—"}</TableCell><TableCell className="truncate max-w-[18ch]">{s.customerId ?? "—"}</TableCell></TableRow>))}</TableBody></Table></div>}</div>
        <Separator />
        <div className="flex flex-col gap-3"><h3 className="text-sm font-medium">Invoices</h3>{stripeInvs.length === 0 ? <p className="text-sm text-muted-foreground">No invoices yet.</p> : <div className="rounded-md border bg-card"><Table><TableHeader><TableRow><TableHead>Amount</TableHead><TableHead>Status</TableHead><TableHead>Receipt</TableHead></TableRow></TableHeader><TableBody>{stripeInvs.map((inv) => (<TableRow key={inv.id}><TableCell>{inv.currency?.toUpperCase()} {(inv.amount / 100).toFixed(2)}</TableCell><TableCell><Badge variant={inv.paid ? "secondary" : "outline"}>{inv.status}</Badge></TableCell><TableCell>{inv.hostedUrl ? <a className="text-sm underline" href={inv.hostedUrl} target="_blank" rel="noreferrer">Open</a> : "—"}</TableCell></TableRow>))}</TableBody></Table></div>}</div>
      </CardContent>
      <CardFooter className="flex-col items-start gap-2 text-xs text-muted-foreground"><p className="max-w-[70ch]">Portal flow uses return_url and flow_data subscription_update deep link. Checkout creates session via oRPC then redirects to url.</p></CardFooter>
    </Card>
  );
}
`;
}
