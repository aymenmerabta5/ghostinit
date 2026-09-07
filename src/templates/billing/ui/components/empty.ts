export function billingEmptyContent(): string {
  return `"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent, EmptyMedia } from "@/components/ui/empty";
import { CreditCardIcon, PlusIcon } from "./icons";
import { useSurfaceTranslations } from "@/lib/translations";
export function BillingEmpty(): React.JSX.Element {
  const t = useSurfaceTranslations("billing");
  return (
    <Empty>
      <EmptyHeader><EmptyMedia variant="icon"><CreditCardIcon data-icon="inline-start" className="size-5" /></EmptyMedia><EmptyTitle>{t("noBillingTitle")}</EmptyTitle><EmptyDescription className="max-w-[60ch]">{t("noBillingDescription")}</EmptyDescription></EmptyHeader>
      <EmptyContent><div className="flex flex-col gap-3"><Button render={<a href="https://github.com/ghostinit/ghostinit#billing" target="_blank" rel="noreferrer" />} nativeButton={false}><PlusIcon data-icon="inline-start" />{t("addProvider")}</Button><p className="text-xs text-muted-foreground">{t("securityNote")}</p></div></EmptyContent>
    </Empty>
  );
}
`;
}
