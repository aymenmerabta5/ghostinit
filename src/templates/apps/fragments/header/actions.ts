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
  const localeSwitcher = hasI18n ? '<LocaleSwitcher className="w-16 sm:w-32" />' : "";
  const notificationImport = hasNotifications
    ? 'import { NotificationInboxBell } from "@/features/notifications/bell";'
    : "";
  const notificationBell = hasNotifications ? "<NotificationInboxBell />" : "";

  return `"use client";

import * as React from "react";
${linkImport}
import { Button } from "@/components/ui/button";
import { HeaderUserMenu } from "./header-user-menu.js";
import type { HeaderUser } from "./header-user-menu.js";
import { ThemeToggle } from "./theme-toggle.js";
${localeImport}
${notificationImport}
import { useSurfaceTranslations } from "@/lib/translations";

export interface HeaderActionsProps {
  user: HeaderUser | null;
  isAuthenticated: boolean;
  pending: boolean;
}

export function HeaderActions({ user, isAuthenticated, pending }: HeaderActionsProps): React.JSX.Element {
  const t = useSurfaceTranslations("header");
  return (
    <div className="flex items-center gap-2">
      ${localeSwitcher}
      <ThemeToggle />
      {pending ? (
        <div className="size-9 animate-pulse rounded-full bg-muted" aria-hidden />
      ) : isAuthenticated ? (
        <div className="flex items-center gap-2">${notificationBell}<HeaderUserMenu user={user} /></div>
      ) : (
        ${signInUp}
      )}
    </div>
  );
}
`;
}
