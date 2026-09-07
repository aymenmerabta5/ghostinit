import { file, type TemplateFile } from "../../../shared.js";

export function settingsLayoutContent(hasBilling = true, hasIdentityTransport = true): string {
  const billingNavigation = hasBilling ? '  { labelKey: "billing", href: "/billing" },\n' : "";
  const workspaceNavigation = hasIdentityTransport
    ? '            <Link href="/settings/workspace" aria-current={pathname.startsWith("/settings/workspace") ? "page" : undefined} className={cn("inline-flex min-h-9 items-center rounded-lg px-3 text-sm font-medium transition-colors", pathname.startsWith("/settings/workspace") ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground")}>{t("workspace")}</Link>\n'
    : "";
  const adminNavigation = hasIdentityTransport
    ? '            {user?.role === "admin" ? <Link href="/admin" className="inline-flex min-h-9 items-center rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground">{t("admin")}</Link> : null}\n'
    : "";
  return `"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useSurfaceTranslations } from "@/lib/translations";
${hasIdentityTransport ? 'import { useQueryAuthSession } from "@/components/query-auth-boundary";' : ""}
const nav = [
  { labelKey: "title", href: "/settings" },
${billingNavigation}
] as const;
export default function SettingsLayout({ children }: { children: React.ReactNode; }): React.JSX.Element {
  const t = useSurfaceTranslations("settings");
  const pathname = usePathname();
${hasIdentityTransport ? "  const auth = useQueryAuthSession();\n  const user = auth?.hasCanonicalApi && !auth.isPending && !auth.error ? auth.currentRequest?.user : null;" : ""}
  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
      <div className="flex min-w-0 flex-col gap-7">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="max-w-[65ch] text-sm leading-6 text-muted-foreground">{t("description")}</p>
        </div>
          <nav aria-label={t("title")} className="flex flex-wrap items-center gap-1 border-b border-border/70 pb-3">
            {nav.map((item) => (
              <Link key={item.href} href={item.href} aria-current={pathname === item.href ? "page" : undefined} className={cn("inline-flex min-h-9 items-center rounded-lg px-3 text-sm font-medium transition-colors", pathname === item.href || (pathname.startsWith(item.href + "/") && item.href !== "/settings") ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground")}>{t(item.labelKey)}</Link>
            ))}
${adminNavigation}${workspaceNavigation}
          </nav>
          <section className="min-w-0">{children}</section>
      </div>
    </main>
  );
}
`;
}

export function settingsLayout(hasBilling = true, hasIdentityTransport = true): TemplateFile {
  return file(
    "apps/web/src/app/settings/layout.tsx",
    settingsLayoutContent(hasBilling, hasIdentityTransport),
  );
}
