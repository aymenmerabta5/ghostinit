/** Authenticated user dropdown, separated from the header navigation orchestrator. */
import type { HeaderNavigationCapabilities, RouterType } from "./shared.js";

export function headerUserMenuContent(
  router: RouterType,
  hasBilling = true,
  hasAdminNavigation = true,
  hasMessaging = false,
  hasPdf = false,
  navigation: HeaderNavigationCapabilities = {},
): string {
  const routerImport =
    router === "next"
      ? 'import { useRouter } from "next/navigation";'
      : 'import { useRouter } from "@tanstack/react-router";';
  const signOut =
    router === "next"
      ? `    transitionQueryAuthScope(getQueryClient(), null);
    router.push("/");
    router.refresh();`
      : `    transitionQueryAuthScope(getQueryClient(), null);
    router.navigate({ to: "/" });`;
  const queryResetImport = `import { getQueryClient, transitionQueryAuthScope } from "../lib/query-client.js";`;
  const billingDestination = !hasBilling
    ? ""
    : router === "next"
      ? `          <DropdownMenuItem onClick={() => router.push("/billing")}>{t("billing")}</DropdownMenuItem>\n`
      : `          <DropdownMenuItem onClick={() => router.navigate({ to: "/billing" })}>{t("billing")}</DropdownMenuItem>\n`;
  const messagingDestination = !hasMessaging
    ? ""
    : router === "next"
      ? `          <DropdownMenuItem onClick={() => router.push("/messages")}>{t("messages")}</DropdownMenuItem>\n`
      : `          <DropdownMenuItem onClick={() => router.navigate({ to: "/messages" })}>{t("messages")}</DropdownMenuItem>\n`;
  const destination = (enabled: boolean | undefined, path: string, label: string): string => {
    if (!enabled) return "";
    return router === "next"
      ? `          <DropdownMenuItem onClick={() => router.push("${path}")}>{t("${label}")}</DropdownMenuItem>\n`
      : `          <DropdownMenuItem onClick={() => router.navigate({ to: "${path}" })}>{t("${label}")}</DropdownMenuItem>\n`;
  };
  const extraDestinations = [
    destination(router === "next" && navigation.eve, "/agent", "agent"),
    destination(navigation.notifications, "/notifications", "notifications"),
    destination(navigation.storage, "/storage", "storage"),
    destination(navigation.featureFlags, "/feature-flags", "featureFlags"),
    destination(navigation.jobs, "/jobs", "jobs"),
    destination(hasPdf, "/pdf", "pdf"),
  ].join("");
  const adminNavigation = !hasAdminNavigation
    ? ""
    : router === "next"
      ? `          {user?.role === "admin" ? <DropdownMenuItem onClick={() => router.push("/admin/users")}>{t("users")}</DropdownMenuItem> : null}`
      : `          {user?.role === "admin" ? <DropdownMenuItem onClick={() => router.navigate({ to: "/admin/users" })}>{t("users")}</DropdownMenuItem> : null}`;
  const dropdownNav =
    router === "next"
      ? `          <DropdownMenuItem onClick={() => router.push("/dashboard")}>{t("dashboard")}</DropdownMenuItem>
${extraDestinations}
${messagingDestination}
${billingDestination}
          <DropdownMenuItem onClick={() => router.push("/settings")}>{t("settings")}</DropdownMenuItem>
${adminNavigation}`
      : `          <DropdownMenuItem onClick={() => router.navigate({ to: "/dashboard" })}>{t("dashboard")}</DropdownMenuItem>
${extraDestinations}
${messagingDestination}
${billingDestination}
          <DropdownMenuItem onClick={() => router.navigate({ to: "/settings" })}>{t("settings")}</DropdownMenuItem>
${adminNavigation}`;

  return `"use client";

import * as React from "react";
${routerImport}
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSurfaceTranslations } from "@/lib/translations";
import { authClient } from "../lib/auth-client.js";
${queryResetImport}

export interface HeaderUser {
  name?: string | null;
  email?: string | null;
  role?: string | null;
}

function getInitials(user: HeaderUser | null): string {
  if (user?.name) {
    const parts = user.name.trim().split(/\\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return parts[0].slice(0, 2).toUpperCase();
  }
  return user?.email?.slice(0, 2).toUpperCase() ?? "U";
}

export function HeaderUserMenu({ user }: { user: HeaderUser | null }): React.JSX.Element {
  const router = useRouter();
  const t = useSurfaceTranslations("header");

  async function handleSignOut(): Promise<void> {
    await authClient.signOut();
${signOut}
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="rounded-full" aria-label={t("userMenu")} />}>
        <Avatar className="size-8"><AvatarFallback className="text-xs">{getInitials(user)}</AvatarFallback></Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col gap-1">
            <span className="truncate font-medium">{user?.name ?? t("fallbackUser")}</span>
            <span className="truncate text-xs font-normal text-muted-foreground">{user?.email}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
${dropdownNav}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => void handleSignOut()}>{t("signOut")}</DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
`;
}
