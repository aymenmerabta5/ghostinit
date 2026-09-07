export function billingHeaderContent(): string {
  return `"use client";
import * as React from "react";
import { useSurfaceTranslations } from "@/lib/translations";
export function BillingHeader(): React.JSX.Element {
  const t = useSurfaceTranslations("billing");
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
      <p className="max-w-[65ch] text-sm leading-6 text-muted-foreground">{t("description")}</p>
    </div>
  );
}
`;
}
