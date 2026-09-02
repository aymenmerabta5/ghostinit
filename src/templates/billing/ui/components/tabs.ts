export function billingTabsContent(selected: string[]): string {
  const labelMap: Record<string, string> = {
    stripe: "providerStripe",
    chargily: "providerChargily",
    paddle: "providerPaddle",
    polar: "providerPolar",
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
  if (selected.length === 1) {
    const isChargily = selected[0] === "chargily";
    const alertImport = isChargily
      ? 'import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";'
      : "";
    const chargilyState = isChargily
      ? '  const isChargilyAlone = only === "chargily" && list.length === 1;'
      : "";
    const chargilyAloneAlert = isChargily
      ? `        {isChargilyAlone ? (<Alert><AlertTitle>{t("algeriaMarketTitle")}</AlertTitle><AlertDescription className="max-w-[70ch]">{t("algeriaMarketDescription")}</AlertDescription></Alert>) : null}`
      : "";
    const translationImport = isChargily
      ? 'import { useSurfaceTranslations } from "@/lib/translations";'
      : "";
    const translationHook = isChargily ? '  const t = useSurfaceTranslations("billing");' : "";
    return `"use client";
import * as React from "react";
${alertImport}
${imports}
import { BillingDataProvider, type BillingInitialData } from "../hooks/use-billing-page";
${translationImport}
interface BillingTabsProps { providers: string[]; initialData: BillingInitialData; }
export function BillingTabs({ providers, initialData }: BillingTabsProps): React.JSX.Element {
  return <BillingDataProvider initialData={initialData}><BillingTabsContent providers={providers} /></BillingDataProvider>;
}
function BillingTabsContent({ providers }: { providers: string[] }): React.JSX.Element {
${translationHook}
  const list = providers.length > 0 ? providers : ${JSON.stringify(selected)} as string[];
  const only = list[0];
${chargilyState}
  return (
    <div className="flex flex-col gap-6">
${chargilyAloneAlert}
${singleBranches}
    </div>
  );
}
`;
  }

  const tabsTriggers = selected
    .map(
      (p) =>
        `          <TabsTrigger value="${p}">{t("${labelMap[p] ?? "providerStripe"}")}</TabsTrigger>`,
    )
    .join("\n");
  const tabsContents = selected
    .map(
      (p) =>
        `        <TabsContent value="${p}" className="flex flex-col gap-6">\n          <${p.charAt(0).toUpperCase() + p.slice(1)}Panel />\n        </TabsContent>`,
    )
    .join("\n");
  const dualAlert = `      {hasChargily && hasGlobal ? (<Alert className="border-primary/20 bg-primary/[0.04]"><AlertTitle>{t("dualMarketTitle")}</AlertTitle><AlertDescription className="max-w-[75ch]">{t("dualMarketDescription", { providers: "${selected.join(", ")}" })}</AlertDescription></Alert>) : null}`;
  const badgeRow = `      <div className="flex flex-wrap gap-2">{hasChargily ? <Badge variant="secondary"><span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-primary" /> {t("algeriaCoverage")}</span></Badge> : null}{hasGlobal ? <Badge variant="secondary"><span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-primary" /> {t("globalCoverage", { providers: "${selected.filter((p) => ["stripe", "paddle", "polar"].includes(p)).join(", ")}" })}</span></Badge> : null}</div>`;

  return `"use client";
import * as React from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
${imports}
import { BillingDataProvider, type BillingInitialData } from "../hooks/use-billing-page";
import { useSurfaceTranslations } from "@/lib/translations";
interface BillingTabsProps { providers: string[]; initialData: BillingInitialData; }
export function BillingTabs({ providers, initialData }: BillingTabsProps): React.JSX.Element {
  return <BillingDataProvider initialData={initialData}><BillingTabsContent providers={providers} /></BillingDataProvider>;
}
function BillingTabsContent({ providers }: { providers: string[] }): React.JSX.Element {
  const t = useSurfaceTranslations("billing");
  const list = providers.length > 0 ? providers : ${JSON.stringify(selected)} as string[];
  const hasChargily = list.includes("chargily");
  const hasGlobal = list.some((p) => ["stripe", "paddle", "polar"].includes(p));
  if (list.length === 1) {
    const only = list[0];
    const isChargilyAlone = hasChargily && list.length === 1;
    return (
      <div className="flex flex-col gap-6">
        {isChargilyAlone ? <Alert><AlertTitle>{t("algeriaMarketTitle")}</AlertTitle><AlertDescription className="max-w-[70ch]">{t("algeriaMarketDescription")}</AlertDescription></Alert> : null}
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
