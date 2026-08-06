// @allow-long 900: desktop electron scaffold with tanstack router SPA + theme/updater/bridge
// adapted from t3code desktop but minimal
/**
 * Desktop core template — Electron 41 + Vite + TanStack Router SPA
 * Adapted from t3code apps/desktop but simplified for GhostInit SaaS starter.
 * Vendor-copies ElectronSafeStorage + ElectronUpdater patterns from t3code with attribution,
 * simplified from Effect layers to plain singletons to keep <300 LOC and host typecheck green.
 */

import { file, packageJson, type TemplateFile } from "../shared.js";
import * as v from "../versions.js";
import type { AddonInstallerMap } from "../../lib/addons.js";

function hasFeature(addons: AddonInstallerMap | undefined, key: string): boolean {
  if (!addons) return false;
  return Boolean((addons as Record<string, { inUse?: boolean }>)[key]?.inUse);
}

export function desktopPackageJsonContent(
  runtime: "node" | "bun" = "bun",
  addons?: AddonInstallerMap,
): string {
  const hasAuth = hasFeature(addons, "auth");
  return packageJson({
    name: "desktop",
    version: v.ghostinitVersion,
    private: true,
    type: "module",
    main: "dist/main.js",
    packageManager: runtime === "bun" ? `bun@${v.runtime.bun}` : `npm@10.8.0`,
    scripts: {
      dev: "electron-vite dev",
      build: "electron-vite build && electron-builder --publish never",
      preview: "electron-vite preview",
      typecheck: "tsc --noEmit",
      lint: "oxlint .",
    },
    dependencies: {
      react: `^${v.nextStack.react}`,
      "react-dom": `^${v.nextStack["react-dom"]}`,
      "@tanstack/react-router": `^${v.tanstackStart["@tanstack/react-router"]}`,
      "@tanstack/router-plugin": `^${v.tanstackStart["@tanstack/router-plugin"]}`,
      "@tanstack/react-query": `^${v.tanstack["@tanstack/react-query"]}`,
      "@orpc/client": `^${v.orpc["@orpc/client"]}`,
      "@orpc/server": `^${v.orpc["@orpc/server"]}`,
      "better-auth": `^${v.auth["better-auth"]}`,
      "electron-store": `^${v.electron["electron-store"]}`,
      "electron-updater": `^${v.electron["electron-updater"]}`,
      "@repo/ui": "workspace:*",
      "@repo/config": "workspace:*",
      "@repo/api": "workspace:*",
      ...(hasAuth ? { "@repo/auth": "workspace:*" } : {}),
    },
    devDependencies: {
      electron: `^${v.electron.electron}`,
      "electron-vite": `^${v.electron["electron-vite"]}`,
      "electron-builder": `^${v.electron["electron-builder"]}`,
      vite: `^${v.tanstackStart.vite}`,
      "@vitejs/plugin-react": `^${v.tanstackStart["@vitejs/plugin-react"]}`,
      typescript: `^${v.typescript.typescript}`,
      "@types/react": v.nextStack["@types/react"],
      "@types/react-dom": v.nextStack["@types/react-dom"],
      "@types/node": v.runtime["@types/node"],
      tailwindcss: "^4.3.2",
    },
  });
}

export function desktopViteConfigContent(): string {
  return `import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";

export default defineConfig({
  main: {
    build: {
      outDir: "dist",
    },
  },
  preload: {
    build: {
      outDir: "dist",
    },
  },
  renderer: {
    root: "src/renderer",
    build: {
      outDir: "dist/renderer",
    },
    plugins: [TanStackRouterVite({ routesDirectory: "src/renderer/routes", generatedRouteTree: "src/renderer/routeTree.gen.ts" }), react()],
  },
});
`;
}

export function desktopTsconfigContent(): string {
  return JSON.stringify(
    {
      compilerOptions: {
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "bundler",
        jsx: "react-jsx",
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true,
        baseUrl: ".",
        paths: {
          "@/*": ["src/renderer/*"],
          "@repo/*": ["../../packages/*/src"],
        },
        types: ["node"],
      },
      include: ["src/**/*", "electron.vite.config.ts"],
    },
    null,
    2,
  );
}

export function desktopMainContent(): string {
  return `import { app, BrowserWindow, ipcMain, safeStorage, shell, dialog } from "electron";
import { join } from "node:path";
import Store from "electron-store";
import { autoUpdater } from "electron-updater";

// Adapted from t3code apps/desktop/src/electron/ElectronSafeStorage.ts + ElectronWindow.ts
// Plain singleton, no Effect layers, keeps <300 LOC

const store = new Store();

function getSafeValue(key: string): string | undefined {
  const raw = store.get(key) as string | undefined;
  if (!raw) return undefined;
  try {
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(Buffer.from(raw, "base64"));
    }
  } catch {}
  return raw;
}

function setSafeValue(key: string, value: string) {
  try {
    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(value).toString("base64");
      store.set(key, encrypted);
      return;
    }
  } catch {}
  store.set(key, value);
}

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.on("ready-to-show", () => mainWindow?.show());

  // Adapted from t3code DesktopWindow load logic — dev loads vite, prod loads file
  const isDev = !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

app.whenReady().then(() => {
  createWindow();

  // ElectronSafeStorage-inspired: log encryption availability
  console.log("[desktop] safeStorage available:", safeStorage.isEncryptionAvailable());

  // ElectronUpdater-inspired minimal auto-updater (t3code uses autoUpdater.checkForUpdatesAndNotify)
  if (app.isPackaged) {
    autoUpdater.checkForUpdatesAndNotify().catch(() => {});
  }

  // IPC — minimal 8 channels (vs t3code 80)
  ipcMain.handle("desktop:get-app-branding", () => ({
    name: "GhostInit Desktop",
    version: app.getVersion(),
  }));

  ipcMain.handle("desktop:get-client-settings", () => store.get("clientSettings"));
  ipcMain.handle("desktop:set-client-settings", (_e: unknown, val: unknown) => store.set("clientSettings", val as never));

  ipcMain.handle("desktop:auth-get-session", () => getSafeValue("auth:session"));
  ipcMain.handle("desktop:auth-set-session", (_e: unknown, token: string) => setSafeValue("auth:session", token));

  ipcMain.handle("desktop:window-minimize", () => mainWindow?.minimize());
  ipcMain.handle("desktop:window-maximize", () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize();
    else mainWindow?.maximize();
  });
  ipcMain.handle("desktop:window-close", () => mainWindow?.close());

  ipcMain.handle("desktop:updates-check", () => autoUpdater.checkForUpdates());
  ipcMain.handle("desktop:updates-download", () => autoUpdater.downloadUpdate());
  ipcMain.handle("desktop:updates-install", () => autoUpdater.quitAndInstall());

  ipcMain.handle("desktop:shell-open-external", (_e: unknown, url: string) => shell.openExternal(url));

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// Single instance lock like t3code DesktopApp
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}
`;
}

export function desktopPreloadContent(): string {
  return `import { contextBridge, ipcRenderer } from "electron";

// Adapted from t3code apps/desktop/src/preload.ts — exposes typed desktopBridge via contextBridge
// t3code uses exposeClerkBridge + 80 channels; we expose minimal 8 for starter

export type DesktopBridge = {
  getAppBranding: () => Promise<{ name: string; version: string }>;
  getClientSettings: () => Promise<unknown>;
  setClientSettings: (v: unknown) => Promise<void>;
  authGetSession: () => Promise<string | undefined>;
  authSetSession: (token: string) => Promise<void>;
  windowMinimize: () => Promise<void>;
  windowMaximize: () => Promise<void>;
  windowClose: () => Promise<void>;
  updatesCheck: () => Promise<unknown>;
  updatesDownload: () => Promise<unknown>;
  updatesInstall: () => Promise<void>;
  shellOpenExternal: (url: string) => Promise<void>;
};

const bridge: DesktopBridge = {
  getAppBranding: () => ipcRenderer.invoke("desktop:get-app-branding"),
  getClientSettings: () => ipcRenderer.invoke("desktop:get-client-settings"),
  setClientSettings: (v) => ipcRenderer.invoke("desktop:set-client-settings", v),
  authGetSession: () => ipcRenderer.invoke("desktop:auth-get-session"),
  authSetSession: (token) => ipcRenderer.invoke("desktop:auth-set-session", token),
  windowMinimize: () => ipcRenderer.invoke("desktop:window-minimize"),
  windowMaximize: () => ipcRenderer.invoke("desktop:window-maximize"),
  windowClose: () => ipcRenderer.invoke("desktop:window-close"),
  updatesCheck: () => ipcRenderer.invoke("desktop:updates-check"),
  updatesDownload: () => ipcRenderer.invoke("desktop:updates-download"),
  updatesInstall: () => ipcRenderer.invoke("desktop:updates-install"),
  shellOpenExternal: (url) => ipcRenderer.invoke("desktop:shell-open-external", url),
};

contextBridge.exposeInMainWorld("desktopBridge", bridge);

declare global {
  interface Window {
    desktopBridge: DesktopBridge;
  }
}
`;
}

export function desktopOrpcContent(): string {
  return `import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import type { appRouter } from "@repo/api";

// Desktop oRPC — single port 3000, credentials via Electron session
// Like mobile's EXPO_PUBLIC_API_URL pattern, but for Electron we use http://localhost:3000
// and include credentials for Better Auth cookie. Auth token also available via safeStorage bridge.

function getBaseUrl(): string {
  // In Electron prod, window.location is file://, so we must use explicit localhost
  // In dev, vite serves renderer at http://localhost:5173, but API is at :3000
  return "http://localhost:3000";
}

const link = new RPCLink({
  url: \`\${getBaseUrl()}/api\`,
  fetch: (input, init) =>
    fetch(input as string, {
      ...(init as RequestInit),
      credentials: "include",
    }),
  headers: async () => {
    // Also try to pass session via safeStorage bridge if available (for bearer fallback)
    try {
      const w = window as unknown as { desktopBridge?: { authGetSession?: () => Promise<string | undefined> } };
      const token = await w.desktopBridge?.authGetSession?.();
      return token ? ({ cookie: token } as Record<string, string>) : {};
    } catch {
      return {};
    }
  },
});

export const orpc: RouterClient<typeof appRouter> = createORPCClient(link);

export function createApiClient() {
  return orpc;
}
export type ApiClient = typeof orpc;
`;
}

export function desktopAuthContent(): string {
  return `import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: "http://localhost:3000",
  fetchOptions: {
    credentials: "include",
  },
});
`;
}

export function desktopThemeProviderContent(): string {
  return `import * as React from "react";

type Theme = "light" | "dark";
type ClientSettings = { theme?: Theme; [key: string]: unknown };

const ThemeContext = React.createContext<{
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
} | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeRaw] = React.useState<Theme>("light");

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const bridge = (window as unknown as { desktopBridge?: { getClientSettings?: () => Promise<ClientSettings> } }).desktopBridge;
        const stored = await bridge?.getClientSettings?.();
        const candidate = (stored?.theme as Theme | undefined) ?? (localStorage.getItem("ghostinit-theme") as Theme | null);
        if (candidate === "dark" || candidate === "light") {
          if (mounted) setThemeRaw(candidate);
          return;
        }
        if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
          if (mounted) setThemeRaw("dark");
        }
      } catch {}
    })();
    return () => {
      mounted = false;
    };
  }, []);

  React.useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.style.colorScheme = theme;
    try {
      localStorage.setItem("ghostinit-theme", theme);
      const bridge = (window as unknown as {
        desktopBridge?: {
          getClientSettings?: () => Promise<ClientSettings>;
          setClientSettings?: (v: unknown) => Promise<void>;
        };
      }).desktopBridge;
      if (bridge?.getClientSettings && bridge?.setClientSettings) {
        bridge
          .getClientSettings()
          .then((prev) => bridge.setClientSettings?.({ ...(prev ?? {}), theme }))
          .catch(() => bridge.setClientSettings?.({ theme } as ClientSettings));
      } else {
        bridge?.setClientSettings?.({ theme } as ClientSettings);
      }
    } catch {}
  }, [theme]);

  const setTheme = React.useCallback((t: Theme) => setThemeRaw(t), []);
  const toggle = React.useCallback(() => setThemeRaw((p) => (p === "dark" ? "light" : "dark")), []);

  return <ThemeContext.Provider value={{ theme, setTheme, toggle }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
`;
}

export function desktopThemeToggleContent(): string {
  return `import * as React from "react";
import { useTheme } from "../lib/theme";

function SunIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}

function MoonIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M12 3a6 6 0 0 0 9 9a9 9 0 1 1-9-9Z" />
    </svg>
  );
}

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <button
        type="button"
        disabled
        aria-label="Toggle theme placeholder"
        className="inline-flex size-8 items-center justify-center rounded-md border bg-background"
      >
        <span className="size-4" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={\`Switch to \${theme === "dark" ? "light" : "dark"} mode\`}
      className="inline-flex size-8 items-center justify-center rounded-md border bg-background hover:bg-accent hover:text-accent-foreground transition-colors relative"
    >
      <SunIcon className="size-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <MoonIcon className="absolute size-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      <span className="sr-only">Toggle theme</span>
    </button>
  );
}
`;
}

export function desktopProvidersContent(): string {
  return `import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "./theme";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 1000 * 30,
    },
  },
});

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>{children}</ThemeProvider>
    </QueryClientProvider>
  );
}
`;
}

export function desktopUseAuthContent(): string {
  return `import { authClient } from "../lib/auth";

export function useAuth() {
  const { data: session, isPending, error, refetch } = authClient.useSession();
  return {
    session: session ?? null,
    user: session?.user ?? null,
    isPending,
    isAuthenticated: !!session?.user,
    error: error ?? null,
    refetch,
  };
}

export function useSession() {
  return useAuth();
}
`;
}

export function desktopRendererHtmlContent(): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>GhostInit Desktop</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/main.tsx"></script>
  </body>
</html>
`;
}

export function desktopRendererMainContent(): string {
  return `import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { Providers } from "./lib/providers";

import "./index.css";
import "@repo/ui/theme.css";

const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const root = document.getElementById("root");
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <Providers>
        <RouterProvider router={router} />
      </Providers>
    </React.StrictMode>,
  );
}
`;
}

export function desktopRendererCssContent(): string {
  return `@import "tailwindcss";
@import "@repo/ui/theme.css";

html, body, #root {
  height: 100%;
}

* {
  border-color: var(--border);
}

body {
  background: var(--background);
  color: var(--foreground);
  font-family: ui-sans-serif, system-ui, sans-serif;
}
`;
}

export function desktopRouteRootContent(): string {
  return `import { createRootRoute, Outlet, Link } from "@tanstack/react-router";
import * as React from "react";
import { ThemeToggle } from "../components/theme-toggle";
import { useAuth } from "../hooks/useAuth";

type Branding = { name: string; version: string };

function WindowControls() {
  const bridge = (window as unknown as {
    desktopBridge?: {
      windowMinimize?: () => Promise<void>;
      windowMaximize?: () => Promise<void>;
      windowClose?: () => Promise<void>;
    };
  }).desktopBridge;
  if (!bridge) return null;
  return (
    <div className="flex items-center gap-1" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
      <button
        type="button"
        onClick={() => bridge.windowMinimize?.()}
        aria-label="Minimize"
        className="inline-flex size-7 items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-foreground"
      >
        —
      </button>
      <button
        type="button"
        onClick={() => bridge.windowMaximize?.()}
        aria-label="Maximize"
        className="inline-flex size-7 items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-foreground"
      >
        □
      </button>
      <button
        type="button"
        onClick={() => bridge.windowClose?.()}
        aria-label="Close"
        className="inline-flex size-7 items-center justify-center rounded hover:bg-destructive hover:text-destructive-foreground text-muted-foreground"
      >
        ×
      </button>
    </div>
  );
}

function UpdaterBadge() {
  const [status, setStatus] = React.useState<string | null>(null);
  const bridge = (window as unknown as {
    desktopBridge?: {
      updatesCheck?: () => Promise<unknown>;
    };
  }).desktopBridge;

  const check = React.useCallback(async () => {
    if (!bridge?.updatesCheck) {
      setStatus("updater not available in dev");
      return;
    }
    setStatus("checking…");
    try {
      await bridge.updatesCheck();
      setStatus("checked — up to date");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "check failed");
    }
    setTimeout(() => setStatus(null), 3000);
  }, [bridge]);

  return (
    <button
      type="button"
      onClick={check}
      className="text-xs text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
      title="Check for updates (electron-updater)"
    >
      {status ?? "Check updates"}
    </button>
  );
}

export const Route = createRootRoute({
  component: RootComponent,
});

function RootComponent() {
  const [branding, setBranding] = React.useState<Branding>({ name: "GhostInit Desktop", version: "" });
  const { user, isAuthenticated } = useAuth();

  React.useEffect(() => {
    const bridge = (window as unknown as { desktopBridge?: { getAppBranding?: () => Promise<Branding> } }).desktopBridge;
    bridge?.getAppBranding?.().then(setBranding).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header
        className="flex h-14 items-center justify-between border-b bg-card px-4"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      >
        <div className="flex items-center gap-3" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
          <div className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground text-sm font-bold">G</div>
          <div className="hidden sm:block">
            <h1 className="text-sm font-semibold leading-none">{branding.name}</h1>
            <p className="text-xs text-muted-foreground">{branding.version ? \`v\${branding.version}\` : "Electron 41 • TanStack Router"}</p>
          </div>
          <nav className="ml-4 flex items-center gap-1">
            <Link
              to="/"
              className="rounded-md px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground [&.active]:bg-accent [&.active]:text-accent-foreground"
            >
              Home
            </Link>
            <Link
              to="/dashboard"
              className="rounded-md px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground [&.active]:bg-accent [&.active]:text-accent-foreground"
            >
              Dashboard
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-2" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
          <span className="hidden lg:inline text-xs text-muted-foreground max-w-[160px] truncate">
            {isAuthenticated ? user?.email : "Not signed in"}
          </span>
          <UpdaterBadge />
          <div className="h-6 w-px bg-border" />
          <ThemeToggle />
          <div className="h-6 w-px bg-border hidden sm:block" />
          <WindowControls />
        </div>
      </header>

      <main className="flex-1 p-6">
        <Outlet />
      </main>

      <footer className="border-t px-4 py-2 text-xs text-muted-foreground flex items-center justify-between">
        <span>oRPC • TanStack Query • Better Auth • safeStorage • electron-updater</span>
        <span className="hidden sm:inline">http://localhost:3000/api</span>
      </footer>
    </div>
  );
}
`;
}

export function desktopRouteIndexContent(): string {
  return `import { createFileRoute, Link } from "@tanstack/react-router";
import { useAuth } from "../hooks/useAuth";
import { orpc } from "../lib/orpc";
import { useQuery } from "@tanstack/react-query";

export const Route = createFileRoute("/")({
  component: IndexComponent,
});

function IndexComponent() {
  const { user, isAuthenticated, isPending } = useAuth();
  const health = useQuery({
    queryKey: ["health"],
    queryFn: () => orpc.health(),
  });

  const openExternal = (url: string) => {
    const bridge = (window as unknown as { desktopBridge?: { shellOpenExternal?: (u: string) => Promise<void> } }).desktopBridge;
    if (bridge?.shellOpenExternal) void bridge.shellOpenExternal(url);
    else window.open(url, "_blank");
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="rounded-xl border bg-card p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-2xl font-bold tracking-tight">Welcome to GhostInit Desktop</h2>
            <p className="text-sm text-muted-foreground">
              Electron 41 • TanStack Router SPA • oRPC + TanStack Query • Better Auth via http://localhost:3000 • theme persisted via electron-store + safeStorage
            </p>
          </div>
          <div className="hidden sm:flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold">◆</div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            to="/dashboard"
            className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Open Dashboard
          </Link>
          <button
            type="button"
            onClick={() => openExternal("http://localhost:3000")}
            className="inline-flex items-center rounded-md border bg-background px-4 py-2 text-sm hover:bg-accent"
          >
            Open web ( :3000 )
          </button>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border p-3">
            <div className="text-xs font-medium">Auth</div>
            {isPending ? (
              <p className="mt-1 text-sm text-muted-foreground">Loading…</p>
            ) : isAuthenticated ? (
              <p className="mt-1 text-sm">
                Signed in as <span className="font-medium">{user?.email}</span>
              </p>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">
                Not signed in — sign in at{" "}
                <button type="button" onClick={() => openExternal("http://localhost:3000/sign-in")} className="underline">
                  /sign-in
                </button>{" "}
                and session syncs via cookie + safeStorage bridge.
              </p>
            )}
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-xs font-medium">oRPC health</div>
            <p className="mt-1 text-xs text-muted-foreground">
              {health.isPending ? "…" : health.data ? \`\${(health.data as { status?: string }).status ?? "ok"}\${(health.data as { time?: string }).time ? \` @ \${(health.data as { time?: string }).time}\` : ""}\` : health.error ? String((health.error as Error).message ?? "error") : "—"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Credentials: include • Base: http://localhost:3000/api</p>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-xs font-medium">Desktop bridge</div>
            <code className="mt-1 block text-xs">window.desktopBridge</code>
            <p className="mt-1 text-xs text-muted-foreground">safeStorage • updater • window controls via IPC</p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border p-4">
        <h3 className="text-sm font-semibold">How it works</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>
            Renderer is SPA TanStack Router at <code>src/renderer/routes/*</code> built by electron-vite + <code>@tanstack/router-plugin</code>.
          </li>
          <li>
            No direct <code>@repo/database</code> import — only <code>@repo/api</code> via <code>orpc.health()</code> / <code>orpc.me()</code> over HTTP.
          </li>
          <li>
            Auth uses <code>better-auth/react</code> with <code>baseURL http://localhost:3000</code> and <code>credentials: include</code>.
          </li>
          <li>
            Theme is custom <code>ThemeProvider</code> persisting to <code>electron-store</code> + <code>localStorage</code> + <code>document.documentElement.classList</code>.
          </li>
        </ul>
      </div>
    </div>
  );
}
`;
}

export function desktopRouteDashboardContent(): string {
  return `import { createFileRoute, Link } from "@tanstack/react-router";
import { useAuth } from "../hooks/useAuth";
import { orpc } from "../lib/orpc";
import { useQuery } from "@tanstack/react-query";

export const Route = createFileRoute("/dashboard")({
  component: DashboardComponent,
});

function DashboardComponent() {
  const { user, isPending, isAuthenticated } = useAuth();
  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => orpc.me(),
    enabled: isAuthenticated,
  });
  const posts = useQuery({
    queryKey: ["posts"],
    queryFn: () => orpc.posts.list(),
    enabled: isAuthenticated,
  });

  if (isPending) return <p className="text-sm">Loading auth…</p>;
  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 rounded-xl border p-6">
        <h2 className="text-lg font-semibold">Dashboard — sign in required</h2>
        <p className="text-sm text-muted-foreground">
          This dashboard calls <code>orpc.me()</code> and <code>orpc.posts.list()</code> with credentials. Sign in via the web first so the httpOnly cookie is shared.
        </p>
        <Link to="/" className="text-sm text-primary underline">
          Back to home
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold tracking-tight">Dashboard</h2>
        <span className="text-xs text-muted-foreground">Hello {user?.email}</span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border bg-card p-4">
          <div className="text-sm font-medium">Session (Better Auth)</div>
          <p className="mt-1 text-xs text-muted-foreground">via useAuth() → authClient.useSession()</p>
          <pre className="mt-3 overflow-auto rounded bg-muted p-3 text-xs">{JSON.stringify({ id: user?.id, email: user?.email, name: (user as { name?: string })?.name }, null, 2)}</pre>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="text-sm font-medium">oRPC me()</div>
          <p className="mt-1 text-xs text-muted-foreground">QueryClient + RPCLink → http://localhost:3000/api</p>
          <pre className="mt-3 overflow-auto rounded bg-muted p-3 text-xs whitespace-pre-wrap">
            {me.isPending ? "loading…" : JSON.stringify(me.data ?? (me.error as Error)?.message ?? me.error, null, 2)}
          </pre>
          {me.error ? <p className="mt-2 text-xs text-destructive">{String((me.error as Error).message ?? me.error)}</p> : null}
        </div>
      </div>

      <div className="rounded-xl border p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Posts (orpc.posts.list)</h3>
          <span className="text-xs text-muted-foreground">{posts.isPending ? "loading…" : \`\${Array.isArray(posts.data) ? (posts.data as unknown[]).length : 0} items\`}</span>
        </div>
        {posts.error ? <p className="mt-2 text-xs text-destructive">{String((posts.error as Error).message ?? posts.error)}</p> : null}
        <pre className="mt-3 max-h-64 overflow-auto rounded bg-muted p-3 text-xs whitespace-pre-wrap">
          {posts.isPending ? "…" : JSON.stringify(posts.data ?? posts.error, null, 2)}
        </pre>
        <p className="mt-2 text-xs text-muted-foreground">
          No direct <code>@repo/database</code> or <code>@repo/services</code> import — only <code>@repo/api</code> via fetch. Architecture rule enforces this.
        </p>
      </div>
    </div>
  );
}
`;
}

export function desktopRouteTreeGenContent(): string {
  // Minimal stub — real generation via @tanstack/router-plugin in vite build
  return `// This file is generated by @tanstack/router-plugin — do not edit manually
import { Route as RootRoute } from "./routes/__root";
import { Route as IndexRoute } from "./routes/index";
import { Route as DashboardRoute } from "./routes/dashboard";

export const routeTree = RootRoute.addChildren([IndexRoute, DashboardRoute]);
`;
}

export function desktopElectronBuilderYmlContent(_projectName: string): string {
  return `appId: com.ghostinit.\${_projectName}
productName: \${projectName}
files:
  - dist/**/*
  - "!**/*.tsbuildinfo"
directories:
  buildResources: resources
  output: out
win:
  target: nsis
mac:
  target: dmg
linux:
  target: AppImage
publish:
  provider: generic
  url: https://example.com/updates
`;
}

export function desktopGitignoreContent(): string {
  return `node_modules
dist
out
.astro
`;
}

export function desktopCoreFiles(
  runtime: "node" | "bun" = "bun",
  addons?: AddonInstallerMap,
): TemplateFile[] {
  const projectNamePlaceholder = "__PROJECT_NAME__";
  return [
    file("apps/desktop/package.json", desktopPackageJsonContent(runtime, addons)),
    file("apps/desktop/electron.vite.config.ts", desktopViteConfigContent()),
    file("apps/desktop/tsconfig.json", desktopTsconfigContent()),
    file(
      "apps/desktop/electron-builder.yml",
      desktopElectronBuilderYmlContent(projectNamePlaceholder),
    ),
    file("apps/desktop/src/main.ts", desktopMainContent()),
    file("apps/desktop/src/preload.ts", desktopPreloadContent()),
    file("apps/desktop/src/renderer/index.html", desktopRendererHtmlContent()),
    file("apps/desktop/src/renderer/main.tsx", desktopRendererMainContent()),
    file("apps/desktop/src/renderer/index.css", desktopRendererCssContent()),
    file("apps/desktop/src/renderer/lib/orpc.ts", desktopOrpcContent()),
    file("apps/desktop/src/renderer/lib/auth.ts", desktopAuthContent()),
    file("apps/desktop/src/renderer/lib/theme.tsx", desktopThemeProviderContent()),
    file("apps/desktop/src/renderer/lib/providers.tsx", desktopProvidersContent()),
    file("apps/desktop/src/renderer/components/theme-toggle.tsx", desktopThemeToggleContent()),
    file("apps/desktop/src/renderer/hooks/useAuth.ts", desktopUseAuthContent()),
    file("apps/desktop/src/renderer/routes/__root.tsx", desktopRouteRootContent()),
    file("apps/desktop/src/renderer/routes/index.tsx", desktopRouteIndexContent()),
    file("apps/desktop/src/renderer/routes/dashboard.tsx", desktopRouteDashboardContent()),
    file("apps/desktop/src/renderer/routeTree.gen.ts", desktopRouteTreeGenContent()),
  ];
}
