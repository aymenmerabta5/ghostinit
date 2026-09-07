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
import { ChevronRight, Layers2 } from "lucide-react";
import { useSurfaceTranslations } from "@/lib/translations";
${!hasAuth ? 'import { ThemeToggle } from "./theme-toggle.js";' : ""}
${!hasAuth && hasI18n ? 'import { LocaleSwitcher } from "./locale-switcher.js";' : ""}

export function HeaderBrand(): React.JSX.Element {
  return <Link ${link}="/" className="inline-flex shrink-0 items-center gap-2.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
    <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Layers2 className="size-[18px]" strokeWidth={1.75} aria-hidden /></span>
    <span className="text-[15px] font-semibold tracking-tight">GhostInit</span>
  </Link>;
}

export function Header({ workspace = false, title, navigation${hasAuth ? ", children" : ""} }: {
  workspace?: boolean; title?: string; navigation?: React.ReactNode; children?: React.ReactNode;
}): React.JSX.Element {
  const t = useSurfaceTranslations("header");
  return <header className="${sharedHeaderStructure.shellClass}">
    <div className={workspace ? "flex h-16 items-center justify-between gap-3 px-5 sm:px-8 lg:px-10" : "${sharedHeaderStructure.innerClass}"}>
      {workspace ? <div className="flex min-w-0 items-center gap-3">
        {navigation}
        <span className="hidden text-sm text-muted-foreground sm:inline">{t("workspace")}</span>
        <ChevronRight className="hidden size-3.5 shrink-0 text-muted-foreground rtl:rotate-180 sm:block" aria-hidden />
        <span className="truncate text-sm font-medium">{title ?? t("workspace")}</span>
      </div> : <HeaderBrand />}
      ${hasAuth ? "{children}" : publicActions}
    </div>
  </header>;
}
`;
}
