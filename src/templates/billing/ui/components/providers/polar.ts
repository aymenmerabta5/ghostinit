export function polarPanelContent(hookImportPath: string): string {
  return `"use client";
import * as React from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { CreditCardIcon, ExternalLinkIcon, CopyIcon, ChartIcon } from "../icons";
import { useBillingPage } from "${hookImportPath}";
export function PolarPanel(): React.JSX.Element {
  const { subscriptions, subsLoading, isCheckoutLoading, hasCustomerId, licenseKey, licenseLoading, usageEvents, usageLoading, handleCheckout, handlePortal, createLicenseKey, ingestUsage, copyText } = useBillingPage();
  const polarSubs = subscriptions.filter((s) => s.provider === "polar");
  return (
    <Card>
      <CardHeader><div className="flex items-center justify-between gap-3"><div className="flex flex-col gap-1"><CardTitle>Polar Billing</CardTitle><CardDescription className="max-w-[65ch]">Open source MoR, seat-based products, license keys, metering via events ingest secure server side.</CardDescription></div><Badge variant="secondary"><span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-primary" /> polar</span></Badge></div></CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="flex flex-wrap gap-2"><Button onClick={() => void handleCheckout("polar")} disabled={isCheckoutLoading}>{isCheckoutLoading ? <Spinner data-icon="inline-start" /> : <CreditCardIcon data-icon="inline-start" />}Checkout products</Button><Button variant="outline" onClick={() => void handlePortal("polar")} disabled={!hasCustomerId}><ExternalLinkIcon data-icon="inline-start" />Customer portal</Button><Button variant="outline" onClick={() => void ingestUsage()}><ChartIcon data-icon="inline-start" />Ingest usage event</Button></div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-3 rounded-md border p-4"><h3 className="text-sm font-medium">License key</h3>{licenseLoading ? <Skeleton className="h-8 w-full" /> : licenseKey ? <div className="flex flex-col gap-2"><div className="flex items-center gap-2"><Input readOnly value={licenseKey.key} className="flex-1 font-mono text-xs" /><Button size="sm" variant="outline" onClick={() => void copyText(licenseKey.key)}><CopyIcon data-icon="inline-start" />Copy</Button></div><div className="flex gap-2"><Badge variant="secondary" className="capitalize">{licenseKey.status}</Badge><Badge variant="outline">{licenseKey.provider}</Badge></div><p className="text-xs text-muted-foreground">Seats via checkout seats param, limit_activations handling via customer-portal license-keys activate validate.</p></div> : <div className="flex flex-col gap-2"><p className="text-sm text-muted-foreground">No license yet.</p><Button size="sm" variant="outline" onClick={() => void createLicenseKey()}>Generate license key</Button></div>}</div>
          <div className="flex flex-col gap-3 rounded-md border p-4"><h3 className="text-sm font-medium">Usage meter</h3><p className="text-xs text-muted-foreground max-w-[50ch]">Tokens used via server secure events ingest, idempotent via externalId unique index.</p>{usageLoading ? <Skeleton className="h-[120px] w-full" /> : <div className="h-[120px] w-full rounded-md bg-muted/40 flex flex-col gap-2 p-3"><div className="flex items-baseline gap-2"><span className="text-2xl font-semibold">{usageEvents.reduce((a, b) => a + (b.credits ?? 0), 0)}</span><span className="text-xs text-muted-foreground">credits total</span></div><div className="flex gap-1 flex-wrap">{usageEvents.slice(0, 12).map((e) => (<Badge key={e.id} variant="outline" className="text-[10px]">{e.name}:{e.credits}</Badge>))}{usageEvents.length === 0 ? <span className="text-xs text-muted-foreground">No events yet, click ingest usage event</span> : null}</div></div>}</div>
        </div>
        <Separator />
        <div className="flex flex-col gap-3"><h3 className="text-sm font-medium">Subscriptions</h3>{subsLoading ? <Skeleton className="h-10 w-full" /> : <div className="rounded-md border bg-card"><Table><TableHeader><TableRow><TableHead>Provider</TableHead><TableHead>Status</TableHead><TableHead>Seats</TableHead><TableHead>Period end</TableHead></TableRow></TableHeader><TableBody>{polarSubs.map((s) => (<TableRow key={s.id}><TableCell><Badge variant="secondary">{s.provider}</Badge></TableCell><TableCell><Badge variant="outline" className="capitalize">{s.status}</Badge></TableCell><TableCell className="text-xs text-muted-foreground">{(s.metadata as Record<string, unknown> | null)?.seats as string | number ?? "—"}</TableCell><TableCell className="text-muted-foreground">{s.currentPeriodEnd ? new Date(s.currentPeriodEnd as string).toLocaleDateString() : "—"}</TableCell></TableRow>))}{polarSubs.length === 0 ? <TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-6">No Polar subscriptions yet</TableCell></TableRow> : null}</TableBody></Table></div>}</div>
      </CardContent>
      <CardFooter className="text-xs text-muted-foreground"><p className="max-w-[75ch]">Polar checkouts.create products customerName billingAddress country locale seats, webhooks.createWebhookEndpoint url format slack events, events.ingest name organizationId externalCustomerId externalId metadata credits idempotent externalId, license keys seats via customer-portal activate validate.</p></CardFooter>
    </Card>
  );
}
`;
}
