export function workspaceIdentityContent(): string {
  return `import type { HeaderUser } from "./header-user-menu";

export type WorkspaceIdentity =
  | { status: "pending" }
  | { status: "authenticated"; user: HeaderUser }
  | { status: "anonymous" }
  | { status: "error"; retry(): void };

export function resolveWorkspaceIdentity(input: {
  pending: boolean; error: unknown; user: HeaderUser | null; retry(): void;
}): WorkspaceIdentity {
  if (input.pending) return { status: "pending" };
  if (input.error) return { status: "error", retry: input.retry };
  if (input.user) return { status: "authenticated", user: input.user };
  return { status: "anonymous" };
}
`;
}

export function workspaceIdentityStatusContent(): string {
  return `"use client";
import type * as React from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSurfaceTranslations } from "@/lib/translations";
import type { WorkspaceIdentity } from "./workspace-identity";

export function WorkspaceIdentityStatus({ identity }: {
  identity: Exclude<WorkspaceIdentity, { status: "authenticated" }>;
}): React.JSX.Element {
  const t = useSurfaceTranslations("header");
  const common = useSurfaceTranslations("common");
  if (identity.status === "pending") return <div role="status" aria-label={t("accountLoading")} aria-busy={true} className="flex flex-col gap-3 px-3">
    <Skeleton className="h-9 w-full" /><Skeleton className="h-9 w-4/5" /><Skeleton className="h-9 w-full" />
  </div>;
  if (identity.status === "error") return <div className="space-y-3 px-3" role="alert">
    <p className="text-sm leading-6 text-muted-foreground">{t("accountUnavailable")}</p>
    <Button size="sm" variant="outline" onClick={identity.retry} aria-label={t("retryAccount")}>{common("retry")}</Button>
  </div>;
  return <p role="status" className="px-3 text-sm leading-6 text-muted-foreground">{t("notSignedIn")}</p>;
}
`;
}
