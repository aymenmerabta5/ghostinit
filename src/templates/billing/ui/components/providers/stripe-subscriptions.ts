export function stripeSubscriptionsContent(hookImportPath: string): string {
  return `"use client";
import type * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useSurfaceTranslations } from "@/lib/translations";
import { formatBillingSubscriptionStatus } from "../../status-labels";
import type { Sub } from "${hookImportPath}";

export function StripeSubscriptions({ subscriptions, loading }: { subscriptions: Sub[]; loading: boolean }): React.JSX.Element {
  const t = useSurfaceTranslations("billing");
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-medium">{t("subscriptions")}</h3>
      {loading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : subscriptions.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle className="text-sm">{t("noSubscriptionsTitle")}</EmptyTitle>
            <EmptyDescription>{t("noSubscriptionsDescription")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("provider")}</TableHead>
                <TableHead>{t("status")}</TableHead>
                <TableHead>{t("periodEnd")}</TableHead>
                <TableHead>{t("customer")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {subscriptions.map((subscription) => (
                <TableRow key={subscription.id}>
                  <TableCell><Badge variant="secondary">{subscription.provider}</Badge></TableCell>
                  <TableCell><Badge variant={subscription.status === "active" ? "secondary" : subscription.status === "past_due" ? "destructive" : "outline"} className="capitalize">{formatBillingSubscriptionStatus(subscription.status, t)}</Badge></TableCell>
                  <TableCell className="text-muted-foreground">{subscription.currentPeriodEnd ? new Date(subscription.currentPeriodEnd as string).toLocaleDateString() : "—"}</TableCell>
                  <TableCell className="truncate max-w-[18ch]">{subscription.customerId ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
        </Table>
      )}
    </div>
  );
}
`;
}
