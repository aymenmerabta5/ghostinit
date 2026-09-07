/** Header orchestrator with router-specific links and a focused account action child. */
import type { HeaderNavigationCapabilities, RouterType } from "./shared.js";
import { sharedHeaderStructure } from "./shared.js";

export function headerFileContent(
  router: RouterType,
  hasI18n = false,
  hasAuth = true,
  hasBilling = true,
  hasAdminNavigation = true,
  convexApiImport?: string,
  hasPdf = false,
  hasMessaging = false,
  navigation: HeaderNavigationCapabilities = {},
): string {
  const isNext = router === "next";
  const publicLinkImport = isNext
    ? 'import Link from "next/link";'
    : 'import { Link } from "@tanstack/react-router";';
  const logoLink = isNext
    ? '<Link href="/" className="flex items-center gap-2">'
    : '<Link to="/" className="flex items-center gap-2">';
  const localeSwitcherImport = hasI18n
    ? 'import { LocaleSwitcher } from "./locale-switcher.js";'
    : "";
  const localeSwitcher = hasI18n ? '<LocaleSwitcher className="w-20 shrink-0 sm:w-32" />' : "";
  const usesConvexRole = hasAdminNavigation && convexApiImport !== undefined;

  if (!hasAuth) {
    return `"use client";

import * as React from "react";
${publicLinkImport}
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "./theme-toggle.js";
${localeSwitcherImport}
import { useSurfaceTranslations } from "@/lib/translations";

export function Header(): React.JSX.Element {
  const t = useSurfaceTranslations("header");
  return (
    <header className="${sharedHeaderStructure.shellClass}">
      <div className="${sharedHeaderStructure.innerClass}">
        ${logoLink}
          <span className="text-sm font-semibold tracking-tight">GhostInit</span>
          <Badge variant="secondary" className="hidden sm:inline-flex">{t("productBadge")}</Badge>
        </Link>
        <div className="flex items-center gap-2">
          ${localeSwitcher}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
`;
  }

  const navLinkImport = isNext
    ? `import Link from "next/link";`
    : `import { Link } from "@tanstack/react-router";`;
  const homeLink = isNext
    ? `<Link href="/" className="flex items-center gap-2">`
    : `<Link to="/" className="flex items-center gap-2">`;
  const billingLink = !hasBilling
    ? ""
    : isNext
      ? `            <Button variant="ghost" size="sm" render={<Link href="/billing" />} nativeButton={false}>{t("billing")}</Button>\n`
      : `            <Button variant="ghost" size="sm" render={<Link to="/billing" />} nativeButton={false}>{t("billing")}</Button>\n`;
  const pdfLink = !hasPdf
    ? ""
    : isNext
      ? `            <Button variant="ghost" size="sm" render={<Link href="/pdf" />} nativeButton={false}>PDF</Button>\n`
      : `            <Button variant="ghost" size="sm" render={<Link to="/pdf" />} nativeButton={false}>PDF</Button>\n`;
  const messagingLink = !hasMessaging
    ? ""
    : isNext
      ? `            <Button variant="ghost" size="sm" render={<Link href="/messages" />} nativeButton={false}>{t("messages")}</Button>\n`
      : `            <Button variant="ghost" size="sm" render={<Link to="/messages" />} nativeButton={false}>{t("messages")}</Button>\n`;
  const eveLink =
    !isNext || !navigation.eve
      ? ""
      : `            <Button variant="ghost" size="sm" render={<Link href="/agent" />} nativeButton={false}>{t("agent")}</Button>\n`;
  const adminNavigation = !hasAdminNavigation
    ? ""
    : isNext
      ? `            {${usesConvexRole ? "appUser" : "user"}?.role === "admin" ? (
              <Button variant="ghost" size="sm" render={<Link href="/admin/users" />} nativeButton={false}>{t("admin")}</Button>
            ) : null}`
      : `            {${usesConvexRole ? "appUser" : "user"}?.role === "admin" ? (
              <Button variant="ghost" size="sm" render={<Link to="/admin" />} nativeButton={false}>{t("admin")}</Button>
            ) : null}`;
  const navLinks = isNext
    ? `            <Button variant="ghost" size="sm" render={<Link href="/dashboard" />} nativeButton={false}>{t("dashboard")}</Button>
${eveLink}
${messagingLink}
${billingLink}
${pdfLink}
            <Button variant="ghost" size="sm" render={<Link href="/settings" />} nativeButton={false}>{t("settings")}</Button>
${adminNavigation}`
    : `            <Button variant="ghost" size="sm" render={<Link to="/dashboard" />} nativeButton={false}>{t("dashboard")}</Button>
${messagingLink}
${billingLink}
${pdfLink}
            <Button variant="ghost" size="sm" render={<Link to="/settings" />} nativeButton={false}>{t("settings")}</Button>
${adminNavigation}`;

  return `"use client";

import * as React from "react";
${navLinkImport}
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HeaderActions } from "./header-actions.js";
import { useSurfaceTranslations } from "@/lib/translations";
import { useAuth } from "../hooks/use-auth.js";
${usesConvexRole ? `import { useConvexAuth, useQuery } from "convex/react";\nimport { api } from "${convexApiImport}";` : ""}

export function Header(): React.JSX.Element {
  const { user, isAuthenticated, isPending } = useAuth();
  ${usesConvexRole ? 'const convexAuth = useConvexAuth();\n  const appUser = useQuery(api.users.me, convexAuth.isAuthenticated ? {} : "skip");' : ""}
  const t = useSurfaceTranslations("header");

  return (
    <header className="${sharedHeaderStructure.shellClass}">
      <div className="${sharedHeaderStructure.innerClass}">
        <div className="flex min-w-0 items-center gap-6">
          ${homeLink}
            <span className="text-sm font-semibold tracking-tight">GhostInit</span>
            <Badge variant="secondary" className="hidden sm:inline-flex">{t("productBadge")}</Badge>
          </Link>
          {isAuthenticated ? (
            <nav className="hidden min-w-0 items-center gap-1 overflow-x-auto xl:flex">
${navLinks}
            </nav>
          ) : null}
        </div>
        <HeaderActions user={${usesConvexRole ? "user ? { ...user, role: appUser?.role ?? null } : null" : "user"}} isAuthenticated={isAuthenticated} pending={${usesConvexRole ? "isPending || convexAuth.isLoading" : "isPending"}} />
      </div>
    </header>
  );
}
`;
}
