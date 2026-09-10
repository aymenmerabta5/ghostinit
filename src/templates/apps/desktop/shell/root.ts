import { desktopShellDataFiles } from "./data.js";
import { file, type TemplateFile } from "../../../shared.js";
import * as v from "../../../versions.js";
import { fullDesktopCapabilities, type DesktopCapabilities, type DesktopMode } from "../model.js";
import { nativeI18nImportPath, nativeI18nTemplate } from "../../fragments/native-i18n.js";

function desktopAppShellContent(
  capabilities: DesktopCapabilities = fullDesktopCapabilities,
  mode: DesktopMode = "monorepo",
): string {
  const authImport = capabilities.hasAuth ? 'import { useShellIdentity } from "./queries";' : "";
  const i18n = nativeI18nTemplate(
    capabilities.hasI18n,
    "header",
    nativeI18nImportPath("desktop", mode),
  );
  const i18nImport = capabilities.hasI18n
    ? `${i18n.importLine.replace("useTranslations", "LocaleSwitcher, useTranslations")}`
    : "";
  const analyticsImport = capabilities.hasAnalytics
    ? `import { DesktopAnalyticsProvider } from "../../lib/analytics";`
    : "";
  const analyticsOpen = capabilities.hasAnalytics ? "<DesktopAnalyticsProvider>" : "<>";
  const analyticsClose = capabilities.hasAnalytics ? "</DesktopAnalyticsProvider>" : "</>";
  const i18nState = capabilities.hasI18n ? `${i18n.hookLine}\n` : "";
  const translated = (key: string, fallback: string): string =>
    capabilities.hasI18n ? `{t("${key}")}` : fallback;
  const authState = capabilities.hasAuth
    ? `  const { user, isAuthenticated } = useShellIdentity();`
    : "";
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

  return `import { Outlet, Link } from "@tanstack/react-router";
import * as React from "react";
import { ThemeToggle } from "../../components/theme-toggle";
import { Button } from "@/components/ui/button";
import { BrandWordmark } from "@/components/brand-wordmark";
${authImport}
${i18nImport}
${analyticsImport}

import { useDesktopBranding } from "./queries";
import { minimizeWindow, maximizeWindow, closeWindow } from "./mutations";
import { useUpdateCheck } from "./use-update-check";

function WindowControls() {
${i18nState}
  return (
    <div className="flex items-center gap-1" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
      <Button type="button" size="icon" variant="ghost" onClick={minimizeWindow} aria-label={${capabilities.hasI18n ? 't("windowMinimize")' : '"Minimize"'}}>−</Button>
      <Button type="button" size="icon" variant="ghost" onClick={maximizeWindow} aria-label={${capabilities.hasI18n ? 't("windowMaximize")' : '"Maximize"'}}>□</Button>
      <Button type="button" size="icon" variant="destructive" onClick={closeWindow} aria-label={${capabilities.hasI18n ? 't("windowClose")' : '"Close"'}}>×</Button>
    </div>
  );
}

function UpdateAction() {
${i18nState}  const { check, status } = useUpdateCheck();

  return <Button type="button" variant="ghost" size="sm" onClick={check}>{status ?? ${capabilities.hasI18n ? 't("updatesCheck")' : '"Check updates"'}}</Button>;
}

export function DesktopAppShell() {
${i18nState}  const branding = useDesktopBranding();
${authState}

  return (
    ${analyticsOpen}
      <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="flex h-14 items-center justify-between border-b bg-card px-4" style={{ WebkitAppRegion: "drag" } as React.CSSProperties}>
        <div className="flex min-w-0 items-center gap-3" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
          <div className="shrink-0">
            <h1 className="text-sm font-semibold leading-none" title={branding.name}><BrandWordmark /></h1>
            <p className="hidden text-xs text-muted-foreground sm:block">{branding.version ? \`v\${branding.version}\` : "Electron ${v.electron.electron.split(".")[0]} • TanStack Router"}</p>
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

function protectedPaths(capabilities: DesktopCapabilities): string[] {
  return [
    ...(capabilities.hasAuth ? ["/dashboard", "/settings"] : []),
    ...(capabilities.hasAuth && capabilities.hasApi ? ["/workspace"] : []),
    ...(
      [
        [capabilities.hasMessaging, "/messages"],
        [capabilities.hasNotifications, "/notifications"],
        [capabilities.hasStorage, "/storage"],
        [capabilities.hasJobs, "/jobs"],
        [capabilities.hasBilling, "/billing"],
        [capabilities.hasPdf, "/pdf"],
        [capabilities.hasEve, "/agent"],
      ] as const
    )
      .filter(([enabled]) => enabled)
      .map(([, path]) => path),
    ...(capabilities.hasAdmin ? ["/admin", "/admin/users", "/admin/users/create"] : []),
  ];
}
export function desktopRouteRootContent(
  capabilities: DesktopCapabilities = fullDesktopCapabilities,
  mode: DesktopMode = "monorepo",
): string {
  const alias = mode === "single" ? "@/renderer" : "@";
  return `import { createRootRoute${capabilities.hasAuth ? ", redirect" : ""} } from "@tanstack/react-router";
import { DesktopAppShell } from "${alias}/features/app-shell/app-shell";
${
  capabilities.hasAuth
    ? `import { readDesktopSession } from "${alias}/features/app-shell/queries";
const authenticatedDesktopRoutes = new Set(${JSON.stringify(protectedPaths(capabilities))});
async function requireAuthenticatedDesktopRoute(pathname: string): Promise<void> {
  if (!authenticatedDesktopRoutes.has(pathname)) return;
  const result = await readDesktopSession();
  if (!result.data?.user) throw redirect({ to: "/sign-in" });
}`
    : ""
}
export const Route = createRootRoute({ ${capabilities.hasAuth ? "beforeLoad: ({ location }) => requireAuthenticatedDesktopRoute(location.pathname), " : ""}component: DesktopAppShell });
`;
}
export function desktopShellFeatureFiles(
  capabilities: DesktopCapabilities,
  mode: DesktopMode,
): TemplateFile[] {
  const root = `${mode === "single" ? "src" : "apps/desktop/src"}/renderer/features/app-shell`;
  const i18n = nativeI18nTemplate(
    capabilities.hasI18n,
    "header",
    nativeI18nImportPath("desktop", mode),
  );
  let shell = desktopAppShellContent(capabilities, mode);
  const windowStart = shell.indexOf("function WindowControls()");
  const updateStart = shell.indexOf("function UpdateAction()", windowStart);
  const shellStart = shell.indexOf("export function DesktopAppShell()", updateStart);
  const windowView = shell
    .slice(windowStart, updateStart)
    .replace("function WindowControls()", "export function WindowControls()");
  const updateView = shell
    .slice(updateStart, shellStart)
    .replace("function UpdateAction()", "export function UpdateAction()");
  shell = shell.slice(0, windowStart) + shell.slice(shellStart);
  const navigationStart = shell.indexOf("<nav aria-label=");
  const navigationEnd = shell.indexOf("</nav>", navigationStart) + "</nav>".length;
  const navigation = shell.slice(navigationStart, navigationEnd);
  shell =
    shell.slice(0, navigationStart) +
    `<DesktopNavigation${capabilities.hasAuth ? " isAuthenticated={isAuthenticated}" : ""} />` +
    shell.slice(navigationEnd);
  shell = shell
    .replace("import { Outlet, Link }", "import { Outlet }")
    .replace('import { Button } from "@/components/ui/button";\n', "")
    .replace(
      'import { minimizeWindow, maximizeWindow, closeWindow } from "./mutations";',
      'import { WindowControls } from "./window-controls";',
    )
    .replace(
      'import { useUpdateCheck } from "./use-update-check";',
      'import { UpdateAction } from "./update-action";\nimport { DesktopNavigation } from "./components/navigation";',
    );
  return [
    file(`${root}/app-shell.tsx`, shell),
    file(
      `${root}/window-controls.tsx`,
      `import type * as React from "react";
import { Button } from "@/components/ui/button";
import { minimizeWindow, maximizeWindow, closeWindow } from "./mutations";
${i18n.importLine}
${windowView}`,
    ),
    file(
      `${root}/update-action.tsx`,
      `import { Button } from "@/components/ui/button";
import { useUpdateCheck } from "./use-update-check";
${i18n.importLine}
${updateView}`,
    ),
    file(
      `${root}/components/navigation.tsx`,
      `import type * as React from "react";
import { Link } from "@tanstack/react-router";
${i18n.importLine}
export function DesktopNavigation(${capabilities.hasAuth ? "{ isAuthenticated }: { isAuthenticated: boolean }" : ""}): React.JSX.Element {
${i18n.hookLine}
  return ${navigation};
}
`,
    ),
    ...desktopShellDataFiles(root, capabilities, mode),
  ];
}
