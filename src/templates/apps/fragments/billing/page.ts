import { file, type TemplateFile } from "../../../shared.js";
import {
  tanstackGetSessionFnContent,
  tanstackAuthBeforeLoadContent,
} from "../auth/tanstack-guard.js";

export type RouterType = "next" | "tanstack";

const nextBillingContent = `"use client";
import * as React from "react";
import { Separator, Card, CardHeader, CardTitle, CardDescription, CardContent, Badge, Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent } from "@repo/ui";
export default function BillingPage(): React.JSX.Element {
  return (
    <main className="min-h-screen bg-background p-6 md:p-8">
      <div className="mx-auto max-w-5xl flex flex-col gap-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
          <p className="text-sm text-muted-foreground max-w-[65ch]">Flexible billing — any combo stripe, chargily EDAHABIA, paddle, polar. Idempotent webhook handling, shared tables, oRPC contract-first.</p>
        </div>
        <Separator />
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Subscriptions</CardTitle>
            <CardDescription className="max-w-[60ch]">Manage billing via flexible providers. Stripe global, Chargily Algeria EDAHABIA/CIB, Paddle MoR 5%+50c, Polar metering.</CardDescription>
          </CardHeader>
          <CardContent>
            <Empty>
              <EmptyHeader>
                <EmptyTitle>No billing configured</EmptyTitle>
                <EmptyDescription className="max-w-[60ch]">Add a billing provider via ghostinit add billing.</EmptyDescription>
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
  );
}
`;

function tanstackBillingContentInternal(): string {
  return `import * as React from 'react'
import { createFileRoute, redirect, Link } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { auth } from '@repo/auth'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Badge, Button, Separator, Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent } from '@repo/ui'

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
