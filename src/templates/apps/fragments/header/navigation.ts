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
    .map(
      ({ path, label, icon }) =>
        `  { path: "${path}", label: "${label}", icon: ${icon}, match: "${path === "/billing" ? "exact" : "subtree"}" },`,
    )
    .join("\n");
  return `"use client";

import type * as React from "react";
${router === "next" ? 'import Link from "next/link";' : 'import { Link } from "@tanstack/react-router";'}
import { ${icons} } from "lucide-react";
import { useSurfaceTranslations } from "@/lib/translations";
import type { WorkspaceIdentity } from "./workspace-identity";
import { WorkspaceIdentityStatus } from "./workspace-identity-status";

const NAVIGATION = [
${items}
] as const;

function isCurrentPath(pathname: string, destination: string, match: "exact" | "subtree"): boolean {
  const normalized = pathname.replace(/\\/+$/, "") || "/";
  const root = destination.startsWith("/admin") ? "/admin" : destination;
  return normalized === root || (match === "subtree" && normalized.startsWith(root + "/"));
}

// Register custom protected routes above; unknown routes retain the public layout.
export function workspaceSection(pathname: string): (typeof NAVIGATION)[number]["label"] | undefined {
  return NAVIGATION.find((entry) => isCurrentPath(pathname, entry.path, entry.match))?.label;
}

export function WorkspaceNavigation({ pathname, identity, onNavigate }: {
  pathname: string; identity: WorkspaceIdentity; onNavigate?: () => void;
}): React.JSX.Element {
  const t = useSurfaceTranslations("header");
  if (identity.status !== "authenticated") return <WorkspaceIdentityStatus identity={identity} />;
  ${hasAdminNavigation ? 'const isAdmin = identity.user.role === "admin";' : ""}
  return <nav aria-label={t("primaryNavigation")} className="flex flex-col gap-1">
    {NAVIGATION${hasAdminNavigation ? '.filter((item) => item.label !== "admin" || isAdmin)' : ""}.map(({ path, label, icon: Icon, match }) => {
      const active = isCurrentPath(pathname, path, match);
      return <Link key={path} ${router === "next" ? "href" : "to"}={path} onClick={onNavigate} aria-current={active ? "page" : undefined}
        className={"flex min-h-10 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " + (active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground")}>
        <Icon className="size-[18px] shrink-0" strokeWidth={1.75} aria-hidden /><span className="min-w-0 break-words">{t(label)}</span>
      </Link>;
    })}
  </nav>;
}
`;
}
