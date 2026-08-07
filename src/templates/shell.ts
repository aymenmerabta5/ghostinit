import { file, type TemplateFile } from "./shared.js";
import type { ProjectMode } from "../lib/addons.js";

function shellContent(mode: ProjectMode): string {
  const isSingle = mode === "single";
  const base = isSingle ? "src/components/shell" : "apps/web/src/components/shell";
  // Return multiple files via helper — caller will spread
  return base;
}

function statsCardContent(): string {
  return `"use client";
import * as React from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
export function StatsCard({ title, value, description, trend }: { title: string; value: string | number; description?: string; trend?: "up" | "down" | "neutral" }): React.JSX.Element {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {description ? <CardDescription className="text-xs">{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="flex items-baseline justify-between">
        <span className="text-2xl font-bold tracking-tight">{value}</span>
        {trend ? <Badge variant={trend === "up" ? "secondary" : trend === "down" ? "destructive" : "outline"}>{trend}</Badge> : null}
      </CardContent>
    </Card>
  );
}
`;
}

function mastheadContent(): string {
  return `"use client";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
export function DashboardMasthead({ title, description, badge }: { title: string; description?: string; badge?: string }): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2 border-b pb-4">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {badge ? <Badge variant="secondary">{badge}</Badge> : null}
      </div>
      {description ? <p className="text-sm text-muted-foreground max-w-[65ch]">{description}</p> : null}
    </div>
  );
}
`;
}

function sidebarContent(): string {
  return `"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/billing", label: "Billing" },
  { href: "/settings", label: "Settings" },
  { href: "/admin", label: "Admin" },
];
export function DashboardSidebar(): React.JSX.Element {
  const pathname = usePathname();
  return (
    <aside className="hidden md:flex w-56 shrink-0 flex-col gap-4 border-r pr-4 py-6">
      <div className="px-2 font-semibold tracking-tight">GhostInit</div>
      <nav className="flex flex-col gap-1">
        {NAV.map((item) => {
          const active = pathname === item.href || pathname?.startsWith(item.href + "/");
          return (
            <Button
              key={item.href}
              variant="ghost"
              size="sm"
              className={cn("justify-start", active && "bg-accent font-medium")}
              render={<Link href={item.href}>{item.label}</Link>}
            />
          );
        })}
      </nav>
    </aside>
  );
}
export function useSidebar(): { collapsed: boolean; toggle: () => void } {
  const [collapsed, setCollapsed] = React.useState(false);
  return { collapsed, toggle: () => setCollapsed((v) => !v) };
}
`;
}

function navbarContent(): string {
  return `"use client";
import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { authClient } from "@/lib/auth-client";
export function DashboardNavbar(): React.JSX.Element {
  const { data: session } = authClient.useSession();
  const user = (session as unknown as { user?: { email?: string; role?: string } })?.user;
  return (
    <header className="sticky top-0 z-20 flex h-12 items-center justify-between border-b bg-background/80 px-4 backdrop-blur">
      <div className="flex items-center gap-2">
        <span className="font-semibold">GhostInit</span>
        {user ? <Badge variant="secondary">{user.role ?? "user"}</Badge> : null}
      </div>
      <div className="flex items-center gap-2">
        {user ? (
          <>
            <span className="hidden sm:inline text-xs text-muted-foreground">{user.email}</span>
            <Button size="sm" variant="ghost" onClick={() => authClient.signOut()}>Sign out</Button>
          </>
        ) : (
          <Button size="sm" render={<Link href="/sign-in">Sign in</Link>} />
        )}
      </div>
    </header>
  );
}
`;
}

export function shellFiles(mode: ProjectMode = "monorepo"): TemplateFile[] {
  const base = shellContent(mode);
  return [
    file(`${base}/StatsCard.tsx`, statsCardContent()),
    file(`${base}/Masthead.tsx`, mastheadContent()),
    file(`${base}/Sidebar.tsx`, sidebarContent()),
    file(`${base}/Navbar.tsx`, navbarContent()),
  ];
}
