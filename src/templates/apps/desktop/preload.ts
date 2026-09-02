import { desktopEvePreloadBridge, desktopEvePreloadType } from "../fragments/eve/index.js";

export function desktopPreloadContent(
  hasAuth = true,
  hasI18n = false,
  hasEve = false,
  hasRemoteTransport = hasAuth,
): string {
  const authTypes = hasAuth
    ? `  authGetSession: () => Promise<string | undefined>;
  authSetSession: (token: string) => Promise<void>;
  authStartOAuth: (input: { authorizationURL: string; callbackURL: string }) => Promise<{ completed: true }>;
`
    : "";
  const authBridge = hasAuth
    ? `  authGetSession: () => ipcRenderer.invoke("desktop:auth-get-session"),
  authSetSession: (token) => ipcRenderer.invoke("desktop:auth-set-session", token),
  authStartOAuth: (input) => ipcRenderer.invoke("desktop:auth-start-oauth", input),
`
    : "";
  const i18nType = hasI18n ? "  getSystemLocale: () => Promise<string>;\n" : "";
  const i18nBridge = hasI18n
    ? '  getSystemLocale: () => ipcRenderer.invoke("desktop:get-system-locale"),\n'
    : "";
  const eveType = hasEve ? desktopEvePreloadType() : "";
  const eveBridge = hasEve ? desktopEvePreloadBridge() : "";
  const apiType = hasRemoteTransport
    ? `  apiFetch: (input: { body: Uint8Array | null; headers: [string, string][]; method: string; url: string }) => Promise<{ body: Uint8Array; headers: [string, string][]; status: number; statusText: string }>;
`
    : "";
  const apiBridge = hasRemoteTransport
    ? `  apiFetch: (input) => ipcRenderer.invoke("desktop:api-fetch", input),
`
    : "";
  return `import { contextBridge, ipcRenderer } from "electron";

const DESKTOP_API_URL_ARGUMENT = "--ghostinit-desktop-api-url=";

function desktopApiUrl(): string {
  let encoded: string | undefined;
  for (const argument of process.argv) {
    if (argument.startsWith(DESKTOP_API_URL_ARGUMENT)) {
      encoded = argument.slice(DESKTOP_API_URL_ARGUMENT.length);
    }
  }
  if (!encoded) throw new Error("The desktop API URL was not provided by the main process");
  let value: string;
  try {
    value = decodeURIComponent(encoded);
  } catch {
    throw new Error("The desktop API URL provided by the main process is invalid");
  }
  const parsed = new URL(value);
  if ((parsed.protocol !== "https:" && parsed.protocol !== "http:") || value !== parsed.origin) {
    throw new Error("The desktop API URL provided by the main process is invalid");
  }
  return parsed.origin;
}

// Adapted from t3code apps/desktop/src/preload.ts; exposes typed desktopBridge via contextBridge
// t3code uses exposeClerkBridge + 80 channels; we expose minimal 8 for starter

export type DesktopClientSettings = {
  theme?: "light" | "dark";
${hasI18n ? '  locale?: "en" | "fr" | "ar";\n' : ""}  [key: string]: unknown;
};

export type DesktopUpdateCheck = {
  isUpdateAvailable: boolean;
  updateInfo: {
    version: string;
    releaseName: string | null;
    releaseDate: string;
    releaseNotes: string | null;
  } | null;
};

export type DesktopBridge = {
  readonly apiUrl: string;
  getAppBranding: () => Promise<{ name: string; version: string }>;
  getClientSettings: () => Promise<DesktopClientSettings | undefined>;
  setClientSettings: (v: DesktopClientSettings) => Promise<void>;
${authTypes}${i18nType}${eveType}${apiType}  windowMinimize: () => Promise<void>;
  windowMaximize: () => Promise<void>;
  windowClose: () => Promise<void>;
  updatesCheck: () => Promise<DesktopUpdateCheck>;
  updatesDownload: () => Promise<{ downloaded: true }>;
  updatesInstall: () => Promise<void>;
  shellOpenExternal: (url: string) => Promise<void>;
};

const bridge: DesktopBridge = {
  apiUrl: desktopApiUrl(),
  getAppBranding: () => ipcRenderer.invoke("desktop:get-app-branding"),
  getClientSettings: () => ipcRenderer.invoke("desktop:get-client-settings"),
  setClientSettings: (v) => ipcRenderer.invoke("desktop:set-client-settings", v),
${authBridge}${i18nBridge}${eveBridge}${apiBridge}  windowMinimize: () => ipcRenderer.invoke("desktop:window-minimize"),
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
