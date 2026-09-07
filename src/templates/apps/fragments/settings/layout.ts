import { file, type TemplateFile } from "../../../shared.js";

export function settingsLayoutContent(hasBilling = true, hasIdentityTransport = true): string {
  const billingNavigation = hasBilling ? '  { labelKey: "billing", href: "/billing" },\n' : "";
  const workspaceNavigation = hasIdentityTransport
    ? '            <Link href="/settings/workspace" className={cn("block rounded-md px-3 py-2 text-sm font-medium transition-colors", pathname.startsWith("/settings/workspace") ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground")}>{t("workspace")}</Link>\n'
    : "";
  return `"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useSurfaceTranslations } from "@/lib/translations";
import { Separator } from "@/components/ui/separator";
const nav = [
  { labelKey: "title", href: "/settings" },
${billingNavigation}  { labelKey: "admin", href: "/admin" },
] as const;
export default function SettingsLayout({ children }: { children: React.ReactNode; }): React.JSX.Element {
  const t = useSurfaceTranslations("settings");
  const pathname = usePathname();
  return (
    <main className="min-h-screen bg-background p-6 md:p-8">
      <div className="mx-auto max-w-5xl flex flex-col gap-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground max-w-[65ch]">{t("description")}</p>
        </div>
        <Separator />
        <div className="flex flex-col gap-8 md:flex-row">
          <aside className="w-full md:w-48 flex flex-col gap-1">
            {nav.map((item) => (
              <Link key={item.href} href={item.href} className={cn("block rounded-md px-3 py-2 text-sm font-medium transition-colors", pathname === item.href || (pathname.startsWith(item.href + "/") && item.href !== "/settings") ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground")}>{t(item.labelKey)}</Link>
            ))}
${workspaceNavigation}
          </aside>
          <section className="flex-1 min-w-0">{children}</section>
        </div>
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
