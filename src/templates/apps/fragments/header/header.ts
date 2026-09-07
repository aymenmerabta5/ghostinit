import type { RouterType } from "./shared.js";
import { sharedHeaderStructure } from "./shared.js";

export function headerFileContent(router: RouterType, hasI18n = false, hasAuth = true): string {
  const link = router === "next" ? "href" : "to";
  const publicActions = hasAuth
    ? ""
    : `<div className="flex items-center gap-2">${hasI18n ? '<LocaleSwitcher className="w-20 shrink-0 sm:w-28" />' : ""}<ThemeToggle /></div>`;
  return `"use client";

import * as React from "react";
${router === "next" ? 'import Link from "next/link";' : 'import { Link } from "@tanstack/react-router";'}
import { ChevronRight } from "lucide-react";
import { BrandWordmark } from "./brand-wordmark";
import { useSurfaceTranslations } from "@/lib/translations";
${!hasAuth ? 'import { ThemeToggle } from "./theme-toggle.js";' : ""}
${!hasAuth && hasI18n ? 'import { LocaleSwitcher } from "./locale-switcher.js";' : ""}

export function HeaderBrand(): React.JSX.Element {
  return <Link ${link}="/" aria-label="GhostInit" className="inline-flex shrink-0 items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
    <BrandWordmark />
  </Link>;
}

export function Header({ workspace = false, title, navigation${hasAuth ? ", children" : ""} }: {
  workspace?: boolean; title?: string; navigation?: React.ReactNode; children?: React.ReactNode;
}): React.JSX.Element {
  const t = useSurfaceTranslations("header");
  return <header className="${sharedHeaderStructure.shellClass}">
    <div className="${sharedHeaderStructure.innerClass}">
      {workspace ? <div className="flex min-w-0 items-center gap-3">
        {navigation}
        <span className="hidden text-sm text-muted-foreground sm:inline">{t("workspace")}</span>
        <ChevronRight className="hidden size-3.5 shrink-0 text-muted-foreground rtl:rotate-180 sm:block" aria-hidden />
        <span className="hidden truncate text-sm font-medium sm:inline">{title ?? t("workspace")}</span>
      </div> : <HeaderBrand />}
      ${hasAuth ? "{children}" : publicActions}
    </div>
  </header>;
}
`;
}
