import { nativeI18nImportPath, nativeI18nTemplate } from "../../fragments/native-i18n.js";
import type { DesktopMode } from "../model.js";
import { desktopOrpcSpecifier } from "./specifiers.js";

export function desktopAdminOverviewSource(
  _isConvex = false,
  mode: DesktopMode = "monorepo",
  hasI18n = false,
): string {
  const i18n = nativeI18nTemplate(hasI18n, "adminUsers", nativeI18nImportPath("desktop", mode));
  const errorsHook = hasI18n ? '  const errorsT = useTranslations("errors");' : "";
  return `import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { desktopQueryOptions } from "${desktopOrpcSpecifier(mode)}";
${i18n.importLine}

export const Route = createFileRoute("/admin")({
  component: AdminPage,
});

function AdminPage() {
${i18n.hookLine}
${errorsHook}
  const session = useQuery(desktopQueryOptions.me());
  const user = session.data?.user;
  const isPending = session.isPending;
  const role = user?.banned ? null : user?.role;
  if (isPending) return <main className="mx-auto flex max-w-5xl flex-col gap-3 p-6" aria-label={${i18n.value("table.loading", "Loading…")}}><Skeleton className="h-8 w-48" /><Skeleton className="h-40 w-full" /></main>;
  if (role !== "admin") {
    return (
      <Alert className="mx-auto max-w-2xl" variant="destructive">
        <AlertTitle>${i18n.child("native.accessRequired", "Admin: forbidden")}</AlertTitle>
        <AlertDescription className="flex flex-col gap-3"><span>${i18n.child("native.accessDescription", "You need admin role. Sign in as admin on web first.")}</span><span>{${hasI18n ? 't("native.role", { role: String(role ?? "none") })' : '`Current role: ${String(role ?? "none")}`'}}</span><Button render={<Link to="/" />} nativeButton={false} size="sm" variant="outline">${hasI18n ? '{errorsT("backHome")}' : "Back to home"}</Button></AlertDescription>
      </Alert>
    );
  }
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">${i18n.child("native.kicker", "Admin")}</h1>
        <Button render={<Link to="/admin/users" />} nativeButton={false} size="sm">${i18n.child("list.title", "Manage users")}</Button>
      </div>
      <p className="text-sm text-muted-foreground max-w-[65ch]">${i18n.child("list.description", "Manage users and roles through the authoritative user store.")}</p>
      <Separator />
      <div className="grid gap-4 sm:grid-cols-2">
        <Card><CardHeader><CardTitle>${i18n.child("native.users", "Users")}</CardTitle><CardDescription>${i18n.child("native.manageDescription", "List, ban, and promote users.")}</CardDescription></CardHeader><CardContent><Button render={<Link to="/admin/users" />} nativeButton={false} variant="outline">${i18n.child("native.openUsers", "Open users")}</Button></CardContent></Card>
        <Card><CardHeader><CardTitle>${i18n.child("list.create", "Create user")}</CardTitle><CardDescription>${i18n.child("native.createDescription", "Add accounts directly.")}</CardDescription></CardHeader><CardContent><Button render={<Link to="/admin/users/create" />} nativeButton={false} variant="outline">${i18n.child("list.create", "Create user")}</Button></CardContent></Card>
      </div>
    </main>
  );
}
`;
}

export function desktopRouteAdminContent(
  _isConvex = false,
  mode: DesktopMode = "monorepo",
  _hasI18n = false,
): string {
  return `import { createFileRoute } from "@tanstack/react-router";
import { AdminOverviewScreen } from "${mode === "single" ? "@/renderer" : "@"}/features/admin-users/overview-screen";
export const Route = createFileRoute("/admin")({ component: AdminOverviewScreen });
`;
}
