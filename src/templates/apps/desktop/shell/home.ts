import { fullDesktopCapabilities, type DesktopCapabilities, type DesktopMode } from "../model.js";
import { nativeI18nImportPath, nativeI18nTemplate } from "../../fragments/native-i18n.js";

export function desktopRouteIndexContent(
  capabilities: DesktopCapabilities = fullDesktopCapabilities,
  mode: DesktopMode = "monorepo",
): string {
  const i18n = nativeI18nTemplate(
    capabilities.hasI18n,
    "desktopHome",
    nativeI18nImportPath("desktop", mode),
  );
  const routerImport = capabilities.hasAuth
    ? `import { createFileRoute, Link } from "@tanstack/react-router";`
    : `import { createFileRoute } from "@tanstack/react-router";`;
  const authImports = capabilities.hasAuth ? `import { useAuth } from "../hooks/useAuth";` : "";
  const apiImports = capabilities.hasApi
    ? `import { useQuery } from "@tanstack/react-query";\nimport { desktopQueryOptions } from "../lib/orpc";`
    : "";
  const actionImports = capabilities.hasAuth
    ? 'import { Button } from "@/components/ui/button";'
    : 'import { Badge } from "@/components/ui/badge";';
  const skeletonImport =
    capabilities.hasAuth || capabilities.hasApi
      ? 'import { Skeleton } from "@/components/ui/skeleton";'
      : "";
  const authState = capabilities.hasAuth
    ? `  const { user, isAuthenticated, isPending } = useAuth();`
    : "";
  const apiState = capabilities.hasApi
    ? `  const health = useQuery(desktopQueryOptions.health());`
    : "";
  const primaryAction = capabilities.hasAuth
    ? `<Button render={<Link to="/dashboard" />} nativeButton={false}>${i18n.child("openDashboard", "Open dashboard")}</Button>`
    : `<Badge variant="secondary">${i18n.child("frontendOnlyWorkspace", "Frontend-only workspace")}</Badge>`;
  const authStatus = capabilities.hasI18n
    ? 'isAuthenticated ? user?.email : t("notSignedIn")'
    : 'isAuthenticated ? user?.email : "Not signed in"';
  const authRow = capabilities.hasAuth
    ? `<div className="grid gap-1 px-4 py-3 sm:grid-cols-[10rem_1fr] sm:items-center">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">${i18n.child("identity", "Identity")}</p>
          {isPending ? <Skeleton className="h-4 w-48" aria-label={${i18n.value("checkingSession", "Checking session…")}} /> : <p className="text-sm">{${authStatus}}</p>}
        </div>`
    : "";
  const healthStatus = capabilities.hasI18n
    ? 'health.data ? t("apiStatusAt", { status: health.data.status, time: health.data.time }) : t("unavailable")'
    : 'health.data ? `${health.data.status} at ${health.data.time}` : health.error instanceof Error ? health.error.message : "Unavailable"';
  const apiRow = capabilities.hasApi
    ? `<div className="grid gap-1 px-4 py-3 sm:grid-cols-[10rem_1fr] sm:items-center">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">${i18n.child("apiHealth", "API health")}</p>
          {health.isPending ? <Skeleton className="h-4 w-48" aria-label={${i18n.value("checking", "Checking…")}} /> : <p className="font-mono text-xs text-muted-foreground">{${healthStatus}}</p>}
        </div>`
    : "";
  const architectureItems = [
    `<li>${i18n.child("architecturePreload", "Electron isolates privileged APIs behind the typed preload bridge.")}</li>`,
    capabilities.hasApi
      ? `<li>${i18n.child("architectureApi", "Remote state uses typed oRPC query options and one shared QueryClient policy.")}</li>`
      : "",
    capabilities.hasAuth
      ? `<li>${i18n.child("architectureAuth", "Better Auth owns identity flows; the renderer sends credentials with every request.")}</li>`
      : "",
    `<li>${i18n.child("architectureTheme", "The dark-first semantic theme is shared with the generated web UI.")}</li>`,
  ].join("");

  return `${routerImport}
${authImports}
${apiImports}
${actionImports}
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
${skeletonImport}
${i18n.importLine}

export const Route = createFileRoute("/")({ component: IndexComponent });

function IndexComponent() {
${i18n.hookLine}
${authState}
${apiState}

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8">
      <section className="flex flex-col gap-5 py-6">
        <div className="flex flex-col gap-2">
          <p className="font-mono text-xs uppercase tracking-wider text-primary">${i18n.child("kicker", "GhostInit desktop")}</p>
          <h2 className="text-2xl font-semibold tracking-tight">${i18n.child("title", "A focused client for your generated application.")}</h2>
          <p className="max-w-[65ch] text-sm leading-relaxed text-muted-foreground">${i18n.child("description", "Electron, TanStack Router, semantic Tailwind tokens, and a constrained preload bridge. Every enabled capability is explicit in the generated source.")}</p>
        </div>
        <div>${primaryAction}</div>
      </section>

      <Card aria-labelledby="runtime-status">
        <CardHeader><CardTitle id="runtime-status">${i18n.child("runtimeStatus", "Runtime status")}</CardTitle><CardDescription>${i18n.child("description", "Electron, TanStack Router, semantic Tailwind tokens, and a constrained preload bridge. Every enabled capability is explicit in the generated source.")}</CardDescription></CardHeader>
        <CardContent className="divide-y divide-border">
          ${authRow}
          ${apiRow}
          <div className="grid gap-1 px-4 py-3 sm:grid-cols-[10rem_1fr] sm:items-center">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">${i18n.child("desktopBridge", "Desktop bridge")}</p>
            <code className="font-mono text-xs text-foreground">window.desktopBridge</code>
          </div>
        </CardContent>
      </Card>

      <Separator />
      <section>
        <h3 className="text-sm font-medium">${i18n.child("architectureTitle", "Architecture")}</h3>
        <ul className="mt-3 flex list-disc flex-col gap-2 ps-5 text-sm leading-relaxed text-muted-foreground">${architectureItems}</ul>
      </section>
    </main>
  );
}
`;
}
