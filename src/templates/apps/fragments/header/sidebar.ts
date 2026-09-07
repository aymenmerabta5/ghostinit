export function workspaceSidebarContent(): string {
  return `"use client";

import type * as React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useSurfaceTranslations } from "@/lib/translations";
import { HeaderBrand } from "./header";
import type { WorkspaceIdentity } from "./workspace-identity";
import { WorkspaceNavigation } from "./workspace-navigation";

export function WorkspaceSidebar({ pathname, identity }: {
  pathname: string; identity: WorkspaceIdentity;
}): React.JSX.Element {
  const t = useSurfaceTranslations("header");
  return <aside className="fixed inset-y-0 start-0 z-[var(--layer-navigation)] hidden w-[232px] flex-col border-e bg-sidebar text-sidebar-foreground lg:flex">
    <div className="flex h-16 shrink-0 items-center border-b px-5"><HeaderBrand /></div>
    <div className="flex-1 overflow-y-auto px-3 py-6">
      <p className="mb-3 px-3 text-xs font-medium text-muted-foreground">{t("workspace")}</p>
      <WorkspaceNavigation pathname={pathname} identity={identity} />
    </div>
    {identity.status === "pending" || identity.status === "authenticated" ? <div className="border-t px-6 py-5">
      {identity.status === "pending" ? <div aria-hidden className="space-y-2"><Skeleton className="h-4 w-28" /><Skeleton className="h-3 w-36" /></div> : <>
        <p className="truncate text-sm font-medium">{identity.user.name ?? t("fallbackUser")}</p>
        <p className="mt-1 truncate text-xs text-muted-foreground">{identity.user.email}</p>
      </>}
    </div> : null}
  </aside>;
}
`;
}

export function workspaceNavigationTriggerContent(): string {
  return `"use client";

import * as React from "react";
import { PanelLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { BrandWordmark } from "./brand-wordmark";
import { useSurfaceTranslations } from "@/lib/translations";
import type { WorkspaceIdentity } from "./workspace-identity";
import { WorkspaceNavigation } from "./workspace-navigation";

export function WorkspaceNavigationTrigger({ pathname, identity }: {
  pathname: string; identity: WorkspaceIdentity;
}): React.JSX.Element {
  const [open, setOpen] = React.useState(false);
  const t = useSurfaceTranslations("header");
  const owner = identity.status === "authenticated" ? identity.user.email : identity.status;
  React.useEffect(() => { setOpen(false); }, [pathname, owner]);
  return <Sheet open={open} onOpenChange={setOpen}>
    <SheetTrigger render={<Button variant="ghost" size="icon" className="shrink-0 lg:hidden" aria-label={t("openNavigation")} />}><PanelLeft className="size-5" aria-hidden /></SheetTrigger>
    <SheetContent side="start" className="flex w-[min(320px,calc(100%-32px))] flex-col gap-6 bg-sidebar p-5" aria-describedby={undefined}>
      <SheetTitle className="pe-8"><BrandWordmark /></SheetTitle>
      <div className="min-h-0 flex-1 overflow-y-auto"><WorkspaceNavigation pathname={pathname} identity={identity} onNavigate={() => setOpen(false)} /></div>
    </SheetContent>
  </Sheet>;
}
`;
}
