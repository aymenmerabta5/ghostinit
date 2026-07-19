export function billingTabsContent(selected: string[]): string {
  const labelMap: Record<string, string> = {
    stripe: "Stripe",
    chargily: "Chargily",
    paddle: "Paddle",
    polar: "Polar",
  };
  if (selected.length === 0)
    return `"use client";\nimport * as React from "react";\nexport function BillingTabs(): React.JSX.Element | null { return null; }\n`;
  const imports = selected
    .map(
      (p) =>
        `import { ${p.charAt(0).toUpperCase() + p.slice(1)}Panel } from "./providers/${p}-panel";`,
    )
    .join("\n");
  const singleBranches = selected
    .map(
      (p) =>
        `        {only === "${p}" ? <${p.charAt(0).toUpperCase() + p.slice(1)}Panel /> : null}`,
    )
    .join("\n");
  const tabsTriggers = selected
    .map((p) => `          <TabsTrigger value="${p}">${labelMap[p] ?? p}</TabsTrigger>`)
    .join("\n");
  const tabsContents = selected
    .map(
      (p) =>
        `        <TabsContent value="${p}" className="flex flex-col gap-6">\n          <${p.charAt(0).toUpperCase() + p.slice(1)}Panel />\n        </TabsContent>`,
    )
    .join("\n");
  const dualAlert = `      {hasChargily && hasGlobal ? (<Alert className="border-primary/20 bg-primary/[0.04]"><AlertTitle>Algeria + Global coverage — dual market</AlertTitle><AlertDescription className="max-w-[75ch]">You have Chargily plus global provider(s) selected: ${selected.join(", ")}. Recommend routing DZ customers to Chargily EDAHABIA/CIB checkout for local payment methods.</AlertDescription></Alert>) : null}`;
  const badgeRow = `      <div className="flex flex-wrap gap-2">{hasChargily ? <Badge variant="secondary"><span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-primary" /> Algeria EDAHABIA/CIB via Chargily</span></Badge> : null}{hasGlobal ? <Badge variant="secondary"><span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-primary" /> Global via ${selected.filter((p) => ["stripe", "paddle", "polar"].includes(p)).join(", ")}</span></Badge> : null}</div>`;
  const chargilyAloneAlert = `        {isChargilyAlone ? (<Alert><AlertTitle>Algeria market — EDAHABIA/CIB standalone</AlertTitle><AlertDescription className="max-w-[70ch]">Chargily alone for Algeria market: EDAHABIA/CIB checkout-only, server-only, no portal, manual recurring via subscriptions table + cron billing-renewal monthly.</AlertDescription></Alert>) : null}`;

  if (selected.length === 1) {
    return `"use client";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
${imports}
interface BillingTabsProps { providers: string[]; }
export function BillingTabs({ providers }: BillingTabsProps): React.JSX.Element {
  const list = providers.length > 0 ? providers : ${JSON.stringify(selected)} as string[];
  const only = list[0];
  const hasChargily = list.includes("chargily");
  const hasGlobal = list.some((p) => ["stripe", "paddle", "polar"].includes(p));
  const isChargilyAlone = hasChargily && list.length === 1;
  return (
    <div className="flex flex-col gap-6">
${chargilyAloneAlert}
${singleBranches}
    </div>
  );
}
`;
  }

  return `"use client";
import * as React from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
${imports}
interface BillingTabsProps { providers: string[]; }
export function BillingTabs({ providers }: BillingTabsProps): React.JSX.Element {
  const list = providers.length > 0 ? providers : ${JSON.stringify(selected)} as string[];
  const hasChargily = list.includes("chargily");
  const hasGlobal = list.some((p) => ["stripe", "paddle", "polar"].includes(p));
  if (list.length === 1) {
    const only = list[0];
    const isChargilyAlone = hasChargily && list.length === 1;
    return (
      <div className="flex flex-col gap-6">
        {isChargilyAlone ? <Alert><AlertTitle>Algeria market — EDAHABIA/CIB standalone</AlertTitle><AlertDescription className="max-w-[70ch]">Chargily alone for Algeria market: EDAHABIA/CIB checkout-only, server-only, no portal, manual recurring via subscriptions table + cron billing-renewal monthly.</AlertDescription></Alert> : null}
${singleBranches
  .split("\n")
  .map((l) => "        " + l.trim())
  .join("\n")}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-6">
${dualAlert}
${badgeRow}
      <Tabs defaultValue={list[0]} className="flex flex-col gap-4">
        <TabsList>
${tabsTriggers}
        </TabsList>
${tabsContents}
      </Tabs>
    </div>
  );
}
`;
}
