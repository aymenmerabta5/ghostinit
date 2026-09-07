import type { HeaderNavigationCapabilities, RouterType } from "./shared.js";

export function workspaceNavigationContent(
  router: RouterType,
  hasBilling: boolean,
  hasAdminNavigation: boolean,
  hasPdf: boolean,
  hasMessaging: boolean,
  navigation: HeaderNavigationCapabilities,
): string {
  const entries = [
    { path: "/dashboard", label: "dashboard", icon: "LayoutDashboard", enabled: true },
    { path: "/agent", label: "agent", icon: "Bot", enabled: router === "next" && navigation.eve },
    { path: "/messages", label: "messages", icon: "MessageSquare", enabled: hasMessaging },
    {
      path: "/notifications",
      label: "notifications",
      icon: "Bell",
      enabled: navigation.notifications,
    },
    { path: "/storage", label: "storage", icon: "FolderOpen", enabled: navigation.storage },
    {
      path: "/feature-flags",
      label: "featureFlags",
      icon: "Flag",
      enabled: navigation.featureFlags,
    },
    { path: "/jobs", label: "jobs", icon: "Workflow", enabled: navigation.jobs },
    { path: "/billing", label: "billing", icon: "CreditCard", enabled: hasBilling },
    { path: "/pdf", label: "pdf", icon: "FileText", enabled: hasPdf },
    { path: "/settings", label: "settings", icon: "Settings2", enabled: true },
    {
      path: router === "next" ? "/admin/users" : "/admin",
      label: "admin",
      icon: "ShieldCheck",
      enabled: hasAdminNavigation,
    },
  ].filter((entry) => entry.enabled);
  const icons = entries.map((entry) => entry.icon).join(", ");
  const items = entries
    .map(({ path, label, icon }) => `  { path: "${path}", label: "${label}", icon: ${icon} },`)
    .join("\n");
  return `"use client";

import type * as React from "react";
${router === "next" ? 'import Link from "next/link";' : 'import { Link } from "@tanstack/react-router";'}
import { ${icons} } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useSurfaceTranslations } from "@/lib/translations";

const NAVIGATION = [
${items}
] as const;

function isCurrentPath(pathname: string, destination: string): boolean {
  const root = destination.startsWith("/admin") ? "/admin" : destination;
  return pathname === root || pathname.startsWith(root + "/");
}

export function workspaceSection(pathname: string): string | undefined {
  const item = NAVIGATION.find((entry) => isCurrentPath(pathname, entry.path));
  if (item) return item.label;
  // Add custom protected route roots here; unknown routes retain the public layout.
  if (isCurrentPath(pathname, "/workspace") || isCurrentPath(pathname, "/two-factor")) return "workspace";
  return undefined;
}

export function WorkspaceNavigation({ pathname, ${hasAdminNavigation ? "isAdmin, " : ""}pending = false, onNavigate }: {
  pathname: string; isAdmin: boolean; pending?: boolean; onNavigate?: () => void;
}): React.JSX.Element {
  const t = useSurfaceTranslations("header");
  if (pending) return <div aria-hidden className="flex flex-col gap-3 px-3"><Skeleton className="h-9 w-full" /><Skeleton className="h-9 w-4/5" /><Skeleton className="h-9 w-full" /></div>;
  return <nav aria-label={t("primaryNavigation")} className="flex flex-col gap-1">
    {NAVIGATION${hasAdminNavigation ? '.filter((item) => item.label !== "admin" || isAdmin)' : ""}.map(({ path, label, icon: Icon }) => {
      const active = isCurrentPath(pathname, path);
      return <Link key={path} ${router === "next" ? "href" : "to"}={path} onClick={onNavigate} aria-current={active ? "page" : undefined}
        className={"flex min-h-10 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " + (active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground")}>
        <Icon className="size-[18px] shrink-0" strokeWidth={1.75} aria-hidden /><span className="min-w-0 break-words">{t(label)}</span>
      </Link>;
    })}
  </nav>;
}
`;
}
