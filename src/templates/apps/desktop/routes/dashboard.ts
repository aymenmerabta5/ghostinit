import { fullDesktopCapabilities, type DesktopCapabilities, type DesktopMode } from "../model.js";
import { nativeI18nImportPath, nativeI18nTemplate } from "../../fragments/native-i18n.js";

export function desktopRouteDashboardContent(
  capabilities: DesktopCapabilities = fullDesktopCapabilities,
  mode: DesktopMode = "monorepo",
): string {
  const i18n = nativeI18nTemplate(
    capabilities.hasI18n,
    "dashboard",
    nativeI18nImportPath("desktop", mode),
  );
  const supportingHooks =
    capabilities.hasI18n && (capabilities.hasApi || capabilities.hasBilling)
      ? [
          '  const commonT = useTranslations("common");',
          capabilities.hasBilling ? '  const billingT = useTranslations("billing");' : "",
        ]
          .filter(Boolean)
          .join("\n")
      : "";
  const apiImports = capabilities.hasApi
    ? `import { useQuery } from "@tanstack/react-query";\nimport { desktopQueryOptions${capabilities.hasBilling ? ", orpc" : ""} } from "../lib/orpc";`
    : "";
  const apiQueries = capabilities.hasApi
    ? `  const me = useQuery({ ...desktopQueryOptions.me(), enabled: isAuthenticated });`
    : "";
  const billingQuery = capabilities.hasBilling
    ? `  const subscriptions = useQuery(orpc.billing.subscriptions.queryOptions({ enabled: isAuthenticated }));`
    : "";
  const profileActions = [
    `<Button render={<Link to="/settings" />} nativeButton={false} size="sm" variant="outline">${i18n.child("identity.editProfile", "Edit profile")}</Button>`,
    capabilities.hasBilling
      ? `<Button render={<Link to="/billing" />} nativeButton={false} size="sm" variant="outline">${i18n.child("identity.billing", "Billing")}</Button>`
      : "",
    capabilities.hasAdmin
      ? `<Button render={<Link to="/admin" />} nativeButton={false} size="sm" variant="outline">${i18n.child("identity.admin", "Admin")}</Button>`
      : "",
  ].join("");
  const apiResult = capabilities.hasI18n
    ? 'me.isPending ? commonT("loading") : me.error ? commonT("error") : JSON.stringify(me.data, null, 2)'
    : 'me.isPending ? "Loading…" : me.error instanceof Error ? me.error.message : JSON.stringify(me.data, null, 2)';
  const apiSection = capabilities.hasApi
    ? `<Card><CardHeader><CardTitle>${i18n.child("desktop.applicationIdentity", "Application identity")}</CardTitle><CardDescription>${i18n.child("desktop.applicationIdentityDescription", "Typed query from the application API.")}</CardDescription></CardHeader><CardContent><pre className="overflow-auto rounded-md bg-muted p-3 font-mono text-xs whitespace-pre-wrap">{${apiResult}}</pre></CardContent></Card>`
    : "";
  const subscriptionsResult = capabilities.hasI18n
    ? 'subscriptions.isPending ? commonT("loading") : subscriptions.error ? commonT("error") : JSON.stringify(subscriptions.data?.subscriptions ?? [], null, 2)'
    : 'subscriptions.isPending ? "Loading…" : subscriptions.error instanceof Error ? subscriptions.error.message : JSON.stringify(subscriptions.data?.subscriptions ?? [], null, 2)';
  const billingSection = capabilities.hasBilling
    ? `<Card><CardHeader><div className="flex items-center justify-between gap-3"><div><CardTitle>${capabilities.hasI18n ? '{billingT("subscriptions")}' : "Subscriptions"}</CardTitle><CardDescription>${i18n.child("desktop.subscriptionDescription", "Cached and invalidated through typed oRPC keys.")}</CardDescription></div><Button render={<Link to="/billing" />} nativeButton={false} size="sm" variant="outline">${i18n.child("actions.manageBilling", "Manage")}</Button></div></CardHeader><CardContent><pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 font-mono text-xs whitespace-pre-wrap">{${subscriptionsResult}}</pre></CardContent></Card>`
    : "";

  return `import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "../hooks/useAuth";
import { authClient } from "../lib/auth";
${apiImports}
${i18n.importLine}

export const Route = createFileRoute("/dashboard")({ component: DashboardComponent });

function DashboardComponent() {
${i18n.hookLine}
${supportingHooks}
  const { user, isPending, isAuthenticated } = useAuth();
${apiQueries}
${billingQuery}

  if (isPending) return <main className="mx-auto flex max-w-5xl flex-col gap-3 p-6" aria-label={${i18n.value("desktop.checkingSession", "Checking session…")}}><Skeleton className="h-8 w-48" /><Skeleton className="h-48 w-full" /></main>;
  if (!isAuthenticated || !user) {
    return (
      <Empty className="mx-auto max-w-2xl"><EmptyHeader><EmptyTitle>${i18n.child("desktop.signInRequired", "Sign in required")}</EmptyTitle><EmptyDescription>${i18n.child("desktop.signInDescription", "Open the sign-in route to continue.")}</EmptyDescription></EmptyHeader><EmptyContent><Button render={<Link to="/sign-in" />} nativeButton={false}>${i18n.child("signIn", "Sign in")}</Button></EmptyContent></Empty>
    );
  }

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6">
      <header className="flex flex-col gap-3 border-b pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div><h1 className="text-2xl font-semibold tracking-tight">${i18n.child("title", "Dashboard")}</h1><p className="mt-1 max-w-[65ch] text-sm text-muted-foreground">${i18n.child("authenticatedDescription", "Account context and enabled application capabilities.")}</p></div>
        <Button type="button" variant="outline" onClick={() => authClient.signOut()}>${i18n.child("desktop.signOut", "Sign out")}</Button>
      </header>

      <section className="grid gap-5 md:grid-cols-[minmax(0,2fr)_minmax(15rem,1fr)]">
        <Card><CardHeader><CardTitle>{user.name ?? user.email}</CardTitle><CardDescription>{user.email}</CardDescription></CardHeader><CardContent><p className="font-mono text-xs uppercase tracking-wide text-muted-foreground">${i18n.child("sessionTitle", "Current session")}</p><div className="mt-4 flex flex-wrap gap-2">${profileActions}</div></CardContent></Card>
        <Card><CardHeader><CardTitle>${i18n.child("actions.security", "Security")}</CardTitle><CardDescription>${i18n.child("desktop.securityDescription", "Password and two-factor settings stay with Better Auth.")}</CardDescription></CardHeader><CardContent><Button render={<Link to="/settings" />} nativeButton={false} variant="outline">${i18n.child("desktop.openSettings", "Open settings")}</Button></CardContent></Card>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        ${apiSection}
        ${billingSection}
      </div>
    </main>
  );
}
`;
}
