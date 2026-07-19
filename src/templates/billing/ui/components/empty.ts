export function billingEmptyContent(): string {
  return `"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent, EmptyMedia } from "@/components/ui/empty";
import { CreditCardIcon, PlusIcon } from "./icons";
export function BillingEmpty(): React.JSX.Element {
  return (
    <Empty>
      <EmptyHeader><EmptyMedia variant="icon"><CreditCardIcon data-icon="inline-start" className="size-5" /></EmptyMedia><EmptyTitle>No billing configured</EmptyTitle><EmptyDescription className="max-w-[60ch]">Billing is optional. Add a provider to enable checkout, subscriptions, and invoices. Flexible: Chargily alone for Algeria EDAHABIA/CIB, global alone for international, Chargily + global for dual market.</EmptyDescription></EmptyHeader>
      <EmptyContent><div className="flex flex-col gap-3"><Button asChild><a href="https://github.com/ghostinit/ghostinit#billing"><PlusIcon data-icon="inline-start" />Add billing provider</a></Button><div className="flex flex-col gap-1 text-xs text-muted-foreground max-w-[70ch]"><p>Examples:</p><p className="font-mono">--billing chargily // Algeria EDAHABIA/CIB alone</p><p className="font-mono">--billing stripe // Global alone</p><p className="font-mono">--billing chargily,stripe // Algeria + Global dual market</p><p className="font-mono">--billing all // All 4 providers</p><p className="mt-1">Run: ghostinit add billing --provider chargily or stripe or chargily,stripe or all</p></div></div></EmptyContent>
    </Empty>
  );
}
`;
}
