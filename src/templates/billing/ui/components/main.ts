/**
 * Billing page shell.
 *
 * The provider list is fixed at generation time, so the empty-vs-tabs branch is
 * resolved here rather than emitted as a runtime `PROVIDERS.length === 0` check —
 * against a `as const` tuple TypeScript knows the length is a literal and rejects
 * the comparison with TS2367 ("types '2' and '0' have no overlap"). Emitting only
 * the branch that applies also drops the unused import.
 */
export function mainPageContent(selected: string[]): string {
  const hasProviders = selected.length > 0;
  const bodyImport = hasProviders
    ? `import { BillingTabs } from "./components/billing-tabs";`
    : `import { BillingEmpty } from "./components/billing-empty";`;
  const providersConst = hasProviders
    ? `const PROVIDERS: string[] = ${JSON.stringify(selected)};\n`
    : "";
  const body = hasProviders ? `<BillingTabs providers={PROVIDERS} />` : `<BillingEmpty />`;

  return `"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { BillingHeader } from "./components/billing-header";
${bodyImport}
${providersConst}export default function BillingPage(): React.JSX.Element {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className={cn("mx-auto flex max-w-5xl flex-col gap-8 p-6 md:p-8 lg:p-10")}>
        <BillingHeader />
        <Separator />
        ${body}
      </div>
    </main>
  );
}
`;
}
