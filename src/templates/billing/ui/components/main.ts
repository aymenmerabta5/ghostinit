export function mainPageContent(selected: string[]): string {
  return `"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { BillingHeader } from "./components/billing-header";
import { BillingEmpty } from "./components/billing-empty";
import { BillingTabs } from "./components/billing-tabs";
const PROVIDERS = ${JSON.stringify(selected)} as const;
export default function BillingPage(): React.JSX.Element {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className={cn("mx-auto flex max-w-5xl flex-col gap-8 p-6 md:p-8 lg:p-10")}>
        <BillingHeader />
        <Separator />
        {PROVIDERS.length === 0 ? <BillingEmpty /> : <BillingTabs providers={[...PROVIDERS] as string[]} />}
      </div>
    </main>
  );
}
`;
}

export function packageMainPageContent(selected: string[]): string {
  return mainPageContent(selected);
}
