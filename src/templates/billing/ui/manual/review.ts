export function manualReviewContent(): string {
  return `"use client";
import type * as React from "react";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { useSurfaceTranslations } from "@/lib/translations";

export function ManualReviewQueue({ empty, children }: { empty: boolean; children: React.ReactNode }): React.JSX.Element {
  const t = useSurfaceTranslations("billing");
  if (empty) return <Empty><EmptyHeader><EmptyTitle>{t("manualQueueEmpty")}</EmptyTitle><EmptyDescription>{t("manualQueueEmptyHelp")}</EmptyDescription></EmptyHeader></Empty>;
  return <ul className="divide-y">{children}</ul>;
}
`;
}
