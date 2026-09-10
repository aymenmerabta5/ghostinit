/** Header actions: theme, locale, pending state, and signed-in/out account controls. */
import type { RouterType } from "./shared.js";

export function headerActionsContent(
  router: RouterType,
  hasI18n = false,
  hasNotifications = false,
): string {
  const linkImport =
    router === "next"
      ? 'import Link from "next/link";'
      : 'import { Link } from "@tanstack/react-router";';
  const signInUp =
    router === "next"
      ? `<div className="flex items-center gap-2">
          <Button className="hidden sm:inline-flex" variant="ghost" size="sm" render={<Link href="/sign-in" />} nativeButton={false}>{t("signIn")}</Button>
          <Button size="sm" render={<Link href="/sign-up" />} nativeButton={false}>{t("signUp")}</Button>
        </div>`
      : `<div className="flex items-center gap-2">
          <Button className="hidden sm:inline-flex" variant="ghost" size="sm" render={<Link to="/sign-in" />} nativeButton={false}>{t("signIn")}</Button>
          <Button size="sm" render={<Link to="/sign-up" />} nativeButton={false}>{t("signUp")}</Button>
        </div>`;
  const localeImport = hasI18n ? 'import { LocaleSwitcher } from "./locale-switcher.js";' : "";
  const localeSwitcher = hasI18n ? '<LocaleSwitcher className="w-20 shrink-0 sm:w-28" />' : "";

  return `"use client";

import * as React from "react";
${linkImport}
import { Button } from "@/components/ui/button";
import { HeaderUserMenu } from "./header-user-menu.js";
import type { WorkspaceIdentity } from "./workspace-identity.js";
import { ThemeToggle } from "./theme-toggle.js";
${localeImport}
import type { WorkspaceDestination } from "@/features/app-shell/navigation-model";
import { useSurfaceTranslations } from "@/lib/translations";

export interface HeaderActionsProps {
  identity: WorkspaceIdentity;
  onNavigate(destination: WorkspaceDestination): void;
  onSignOut(): Promise<void>;
${hasNotifications ? "  notifications?: React.ReactNode;" : ""}
}

export function HeaderActions({ identity, onNavigate, onSignOut${hasNotifications ? ", notifications" : ""} }: HeaderActionsProps): React.JSX.Element {
  const t = useSurfaceTranslations("header");
  const common = useSurfaceTranslations("common");
  return (
    <div className="flex shrink-0 items-center gap-1 sm:gap-2">
      ${localeSwitcher}
      <ThemeToggle />
      {identity.status === "pending" ? (
        <div className="size-9 motion-safe:animate-pulse rounded-full bg-muted" aria-hidden />
      ) : identity.status === "authenticated" ? (
        <div className="flex items-center gap-2">${hasNotifications ? "{notifications}" : ""}<HeaderUserMenu user={identity.user} onNavigate={onNavigate} onSignOut={onSignOut} /></div>
      ) : identity.status === "error" ? (
        <div className="flex items-center gap-2" role="status">
          <span className="hidden text-xs text-muted-foreground md:inline">{t("accountUnavailable")}</span>
          <Button variant="outline" size="sm" onClick={identity.retry} aria-label={t("retryAccount")}>{common("retry")}</Button>
        </div>
      ) : (
        ${signInUp}
      )}
    </div>
  );
}
`;
}
