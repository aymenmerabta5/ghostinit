export function billingHeaderContent(): string {
  return `"use client";
import * as React from "react";
import { useSurfaceTranslations } from "@/lib/translations";
export function BillingHeader(): React.JSX.Element {
  const t = useSurfaceTranslations("billing");
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      <p className="text-sm text-muted-foreground max-w-[65ch]">{t("description")}</p>
    </div>
  );
}
`;
}
