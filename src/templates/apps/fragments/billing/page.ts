import { file, type TemplateFile } from "../../../shared.js";
import {
  tanstackGetSessionFnContent,
  tanstackAuthBeforeLoadContent,
} from "../auth/tanstack-guard.js";

export type RouterType = "next" | "tanstack";

const nextBillingContent = `"use client";
import * as React from "react";
import { Separator } from "@/components/ui/separator";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty";
import { useBillingPage } from "./hooks/use-billing.js";
function BillingContent(): React.JSX.Element {
  const { subscriptions, invoices, subsLoading, isCheckoutLoading, pastDue, handleCheckout, handlePortal } = useBillingPage();
  const hasSubs = subscriptions.length > 0;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
          <p className="text-sm text-muted-foreground max-w-[65ch]">Subscriptions • Invoices • Entitlement — Stripe/Chargily/Paddle/Polar with idempotent webhooks.</p>
        </div>
        <Badge variant={pastDue ? "destructive" : hasSubs ? "secondary" : "outline"}>{pastDue ? "past due" : hasSubs ? \`\${subscriptions.length} active\` : "no subs"}</Badge>
      </div>
      <Separator />
      {subsLoading ? <p className="text-sm text-muted-foreground">Loading subscriptions…</p> : hasSubs ? (
        <div className="grid gap-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Subscriptions</CardTitle><CardDescription>Your active subscriptions across providers</CardDescription></CardHeader>
            <CardContent className="flex flex-col gap-2">
              {subscriptions.map((s) => (
                <div key={s.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                  <div className="flex items-center gap-2"><Badge variant="secondary">{s.provider}</Badge><span className="font-mono text-xs">{s.status}</span></div>
                  <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => handlePortal(s.provider)}>Manage</Button></div>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Invoices</CardTitle><CardDescription>Recent invoices</CardDescription></CardHeader>
            <CardContent className="flex flex-col gap-2">
              {invoices.length===0 ? <p className="text-sm text-muted-foreground">No invoices.</p> : invoices.map((inv) => (
                <div key={inv.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                  <span className="text-sm">{inv.provider} — {inv.amount} {inv.currency ?? ""}</span><Badge variant={inv.paid ? "secondary" : "destructive"}>{inv.status}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card>
          <CardHeader><CardTitle className="text-base">Subscriptions</CardTitle><CardDescription>Manage billing via flexible providers</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Empty>
              <EmptyHeader><EmptyTitle>No subscriptions</EmptyTitle><EmptyDescription>Start a checkout with any provider. Entitlement is checked server-side via oRPC.</EmptyDescription></EmptyHeader>
              <EmptyContent>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" disabled={isCheckoutLoading} onClick={() => handleCheckout("stripe")}>Stripe checkout</Button>
                  <Button size="sm" variant="outline" disabled={isCheckoutLoading} onClick={() => handleCheckout("chargily")}>Chargily (EDAHABIA/CIB)</Button>
                  <Button size="sm" variant="outline" disabled={isCheckoutLoading} onClick={() => handleCheckout("paddle")}>Paddle</Button>
                  <Button size="sm" variant="outline" disabled={isCheckoutLoading} onClick={() => handleCheckout("polar")}>Polar</Button>
                </div>
              </EmptyContent>
            </Empty>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
export default function BillingPage(): React.JSX.Element {
  return (
    <main className="min-h-screen bg-background p-6 md:p-8">
      <div className="mx-auto max-w-5xl flex flex-col gap-8">
        <BillingContent />
      </div>
    </main>
  );
}
`;

function tanstackBillingContentInternal(): string {
  return `import * as React from 'react'
import { createFileRoute, redirect, Link } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { auth } from '@repo/auth'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty";

${tanstackGetSessionFnContent()}

export const Route = createFileRoute('/billing')({
  ${tanstackAuthBeforeLoadContent()}
  component: BillingPage,
})

function BillingPage(): React.JSX.Element {
  return (
    <main className="min-h-screen bg-background p-6 md:p-8">
      <div className="mx-auto max-w-5xl flex flex-col gap-8">
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
            <p className="text-sm text-muted-foreground max-w-[65ch]">Flexible billing — any combo stripe, chargily EDAHABIA, paddle, polar.</p>
          </div>
          <Button size="sm" asChild><Link to="/dashboard">Dashboard</Link></Button>
        </div>
        <Separator />
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Subscriptions</CardTitle>
            <CardDescription className="max-w-[60ch]">Idempotent webhook handling, shared tables, oRPC contract-first.</CardDescription>
          </CardHeader>
          <CardContent>
            <Empty>
              <EmptyHeader>
                <EmptyTitle>No billing configured</EmptyTitle>
                <EmptyDescription className="max-w-[60ch]">Add a billing provider via ghostinit add billing. Stripe global, Chargily Algeria EDAHABIA/CIB, Paddle MoR 5%+50c, Polar metering.</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <div className="flex gap-2">
                  <Badge variant="secondary"><span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-primary" /> stripe</span></Badge>
                  <Badge variant="secondary"><span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-primary" /> chargily</span></Badge>
                  <Badge variant="secondary">paddle</Badge>
                  <Badge variant="secondary">polar</Badge>
                </div>
              </EmptyContent>
            </Empty>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
`;
}

export function billingPageContent(router: RouterType = "next"): string {
  if (router === "tanstack") return tanstackBillingContentInternal();
  return nextBillingContent;
}

export function billingPage(router: RouterType = "next"): TemplateFile {
  if (router === "tanstack") {
    return file("apps/web/src/routes/billing.tsx", tanstackBillingContentInternal());
  }
  return file("apps/web/src/app/billing/page.tsx", nextBillingContent);
}
