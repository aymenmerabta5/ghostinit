import * as v from "../../../versions.js";
import { fullDesktopCapabilities, type DesktopCapabilities, type DesktopMode } from "../model.js";
import { nativeI18nImportPath, nativeI18nTemplate } from "../../fragments/native-i18n.js";

export function desktopRouteRootContent(
  capabilities: DesktopCapabilities = fullDesktopCapabilities,
  mode: DesktopMode = "monorepo",
): string {
  const authImport = capabilities.hasAuth
    ? `import { useAuth } from "../hooks/useAuth";\nimport { authClient } from "../lib/auth";`
    : "";
  const i18n = nativeI18nTemplate(
    capabilities.hasI18n,
    "header",
    nativeI18nImportPath("desktop", mode),
  );
  const i18nImport = capabilities.hasI18n
    ? `${i18n.importLine.replace("useTranslations", "LocaleSwitcher, useTranslations")}`
    : "";
  const analyticsImport = capabilities.hasAnalytics
    ? `import { DesktopAnalyticsProvider } from "../lib/analytics";`
    : "";
  const analyticsOpen = capabilities.hasAnalytics ? "<DesktopAnalyticsProvider>" : "<>";
  const analyticsClose = capabilities.hasAnalytics ? "</DesktopAnalyticsProvider>" : "</>";
  const i18nState = capabilities.hasI18n ? `${i18n.hookLine}\n` : "";
  const translated = (key: string, fallback: string): string =>
    capabilities.hasI18n ? `{t("${key}")}` : fallback;
  const translationDependency = capabilities.hasI18n ? "[t]" : "[]";
  const authState = capabilities.hasAuth ? `  const { user, isAuthenticated } = useAuth();` : "";
  const accountStatus = capabilities.hasAuth
    ? capabilities.hasI18n
      ? `{isAuthenticated ? user?.email : t("notSignedIn")}`
      : `{isAuthenticated ? user?.email : "Not signed in"}`
    : translated("frontendOnly", "Frontend only");
  const routeLink = (to: string, label: string): string => `
            <Link to="${to}" className="shrink-0 rounded-md px-3 py-1.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground [&.active]:bg-accent [&.active]:text-accent-foreground">
              ${label}
            </Link>`;
  const publicNavigation = [
    routeLink("/", translated("home", "Home")),
    capabilities.hasFeatureFlags
      ? routeLink("/feature-flags", translated("featureFlags", "Feature flags"))
      : "",
  ].join("");
  const authenticatedNavigation = [
    capabilities.hasAuth ? routeLink("/dashboard", translated("dashboard", "Dashboard")) : "",
    capabilities.hasEve ? routeLink("/agent", translated("agent", "Agent")) : "",
    capabilities.hasAuth ? routeLink("/settings", translated("settings", "Settings")) : "",
    capabilities.hasAuth && capabilities.hasApi
      ? routeLink("/workspace", translated("workspace", "Workspace"))
      : "",
    capabilities.hasMessaging ? routeLink("/messages", translated("messages", "Messages")) : "",
    capabilities.hasNotifications
      ? routeLink("/notifications", translated("notifications", "Notifications"))
      : "",
    capabilities.hasStorage ? routeLink("/storage", translated("storage", "Storage")) : "",
    capabilities.hasJobs ? routeLink("/jobs", translated("jobs", "Jobs")) : "",
    capabilities.hasBilling ? routeLink("/billing", translated("billing", "Billing")) : "",
    capabilities.hasPdf ? routeLink("/pdf", translated("pdf", "PDF")) : "",
    capabilities.hasAdmin ? routeLink("/admin", translated("admin", "Admin")) : "",
  ].join("");
  const anonymousNavigation = capabilities.hasAuth
    ? `${routeLink("/sign-in", translated("signIn", "Sign in"))}${routeLink("/sign-up", translated("signUp", "Sign up"))}`
    : "";
  const navigation = capabilities.hasAuth
    ? `${publicNavigation}{isAuthenticated ? <>${authenticatedNavigation}</> : <>${anonymousNavigation}</>}`
    : publicNavigation;
  const protectedRoutePaths = [
    ...(capabilities.hasAuth ? ["/dashboard", "/settings"] : []),
    ...(capabilities.hasAuth && capabilities.hasApi ? ["/workspace"] : []),
    ...(capabilities.hasMessaging ? ["/messages"] : []),
    ...(capabilities.hasNotifications ? ["/notifications"] : []),
    ...(capabilities.hasStorage ? ["/storage"] : []),
    ...(capabilities.hasJobs ? ["/jobs"] : []),
    ...(capabilities.hasBilling ? ["/billing"] : []),
    ...(capabilities.hasPdf ? ["/pdf"] : []),
    ...(capabilities.hasEve ? ["/agent"] : []),
    ...(capabilities.hasAdmin ? ["/admin", "/admin/users", "/admin/users/create"] : []),
  ];
  const routeAdmission = capabilities.hasAuth
    ? `const authenticatedDesktopRoutes = new Set(${JSON.stringify(protectedRoutePaths)});

async function requireAuthenticatedDesktopRoute(pathname: string): Promise<void> {
  if (!authenticatedDesktopRoutes.has(pathname)) return;
  const result = await authClient.getSession();
  if (!result.data?.user) throw redirect({ to: "/sign-in" });
}`
    : "";
  const routeDeclaration = capabilities.hasAuth
    ? `export const Route = createRootRoute({
  beforeLoad: ({ location }) => requireAuthenticatedDesktopRoute(location.pathname),
  component: RootComponent,
});`
    : "export const Route = createRootRoute({ component: RootComponent });";
  const footerCapabilities = [
    capabilities.hasApi ? "oRPC + TanStack Query" : translated("localRenderer", "Local renderer"),
    capabilities.hasAuth ? "Better Auth" : translated("noIdentityRuntime", "No identity runtime"),
    ...(capabilities.hasAuth ? ["safeStorage"] : []),
    ...(capabilities.hasEve ? [translated("eveApi", "Eve via /api/agent")] : []),
    "electron-updater",
  ].join(" • ");
  const apiLocation = capabilities.hasApi
    ? `<span className="hidden sm:inline">VITE_API_URL</span>`
    : "";

  return `import { createRootRoute, Outlet, Link${capabilities.hasAuth ? ", redirect" : ""} } from "@tanstack/react-router";
import * as React from "react";
import { ThemeToggle } from "../components/theme-toggle";
import { Button } from "@/components/ui/button";
${authImport}
${i18nImport}
${analyticsImport}

${routeAdmission}

type Branding = { name: string; version: string };

function WindowControls() {
${i18nState}  const bridge = window.desktopBridge;
  return (
    <div className="flex items-center gap-1" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
      <Button type="button" size="icon" variant="ghost" onClick={() => bridge.windowMinimize()} aria-label={${capabilities.hasI18n ? 't("windowMinimize")' : '"Minimize"'}}>−</Button>
      <Button type="button" size="icon" variant="ghost" onClick={() => bridge.windowMaximize()} aria-label={${capabilities.hasI18n ? 't("windowMaximize")' : '"Maximize"'}}>□</Button>
      <Button type="button" size="icon" variant="destructive" onClick={() => bridge.windowClose()} aria-label={${capabilities.hasI18n ? 't("windowClose")' : '"Close"'}}>×</Button>
    </div>
  );
}

function UpdateAction() {
${i18nState}  const [status, setStatus] = React.useState<string | null>(null);
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); }, []);

  const check = React.useCallback(async () => {
    setStatus(${capabilities.hasI18n ? 't("updatesChecking")' : '"Checking…"'});
    try {
      await window.desktopBridge.updatesCheck();
      setStatus(${capabilities.hasI18n ? 't("updatesCurrent")' : '"Up to date"'});
    } ${capabilities.hasI18n ? "catch {" : "catch (error) {"}
      setStatus(${capabilities.hasI18n ? 't("updatesError")' : 'error instanceof Error ? error.message : "Update check failed"'});
    }
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setStatus(null), 3000);
  }, ${translationDependency});

  return <Button type="button" variant="ghost" size="sm" onClick={check}>{status ?? ${capabilities.hasI18n ? 't("updatesCheck")' : '"Check updates"'}}</Button>;
}

${routeDeclaration}

function RootComponent() {
${i18nState}  const [branding, setBranding] = React.useState<Branding>({ name: "GhostInit Desktop", version: "" });
${authState}

  React.useEffect(() => {
    window.desktopBridge.getAppBranding().then(setBranding).catch(() => undefined);
  }, []);

  return (
    ${analyticsOpen}
      <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="flex h-14 items-center justify-between border-b bg-card px-4" style={{ WebkitAppRegion: "drag" } as React.CSSProperties}>
        <div className="flex min-w-0 items-center gap-3" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
          <div className="flex size-8 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">G</div>
          <div className="hidden sm:block">
            <h1 className="text-sm font-semibold leading-none">{branding.name}</h1>
            <p className="text-xs text-muted-foreground">{branding.version ? \`v\${branding.version}\` : "Electron ${v.electron.electron.split(".")[0]} • TanStack Router"}</p>
          </div>
          <nav aria-label={${capabilities.hasI18n ? 't("primaryNavigation")' : '"Primary"'}} className="ms-2 flex min-w-0 items-center gap-1 overflow-x-auto sm:ms-4">${navigation}
          </nav>
        </div>
        <div className="flex items-center gap-2" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
          <span className="hidden max-w-40 truncate text-xs text-muted-foreground lg:inline">${accountStatus}</span>
          <UpdateAction />
          ${capabilities.hasI18n ? "<LocaleSwitcher />" : ""}
          <div className="h-6 w-px bg-border" />
          <ThemeToggle />
          <div className="hidden h-6 w-px bg-border sm:block" />
          <WindowControls />
        </div>
      </header>
      <main className="flex-1 p-6"><Outlet /></main>
      <footer className="flex items-center justify-between border-t px-4 py-2 text-xs text-muted-foreground">
        <span>${footerCapabilities}</span>
        ${apiLocation}
      </footer>
      </div>
    ${analyticsClose}
  );
}
`;
}
