export function polarSubscriptionsContent(hookImportPath: string): string {
  return `"use client";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useSurfaceTranslations } from "@/lib/translations";
import type { Sub } from "${hookImportPath}";

interface PolarSubscriptionsProps {
  readonly subscriptions: readonly Sub[];
  readonly loading: boolean;
}

function periodEnd(value: Sub["currentPeriodEnd"]): string {
  if (!value) return "—";
  return (value instanceof Date ? value : new Date(value)).toLocaleDateString();
}

export function PolarSubscriptions({ subscriptions, loading }: PolarSubscriptionsProps): React.JSX.Element {
  const t = useSurfaceTranslations("billing");
  return <div className="flex flex-col gap-3">
    <h3 className="text-sm font-medium">{t("subscriptions")}</h3>
    {loading ? <Skeleton className="h-10 w-full" aria-label={t("loadingSubscriptions")} /> : subscriptions.length === 0 ? <Empty><EmptyHeader><EmptyTitle>{t("noSubscriptionsTitle")}</EmptyTitle><EmptyDescription>{t("noSubscriptionsDescription")}</EmptyDescription></EmptyHeader></Empty> : <Table><TableHeader><TableRow><TableHead>{t("provider")}</TableHead><TableHead>{t("status")}</TableHead><TableHead>{t("seats")}</TableHead><TableHead>{t("periodEnd")}</TableHead></TableRow></TableHeader><TableBody>{subscriptions.map((subscription) => <TableRow key={subscription.id}><TableCell><Badge variant="secondary">{subscription.provider}</Badge></TableCell><TableCell><Badge variant="outline" className="capitalize">{subscription.status}</Badge></TableCell><TableCell className="text-xs text-muted-foreground">{(subscription.metadata?.seats as string | number | undefined) ?? "—"}</TableCell><TableCell className="text-muted-foreground">{periodEnd(subscription.currentPeriodEnd)}</TableCell></TableRow>)}</TableBody></Table>}
  </div>;
}
`;
}
