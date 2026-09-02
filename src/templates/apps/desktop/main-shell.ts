export interface DesktopMainShellOptions {
  readonly authImport: string;
  readonly authStorage: string;
  readonly apiTransportImport: string;
  readonly eveHelpers: string;
  readonly i18nSchema: string;
  readonly i18nSetting: string;
}

export function desktopMainShellContent(options: DesktopMainShellOptions): string {
  const { apiTransportImport, authImport, authStorage, eveHelpers, i18nSchema, i18nSetting } =
    options;
  return `import { app, BrowserWindow, ipcMain${authImport}, shell, dialog, session, type IpcMainInvokeEvent } from "electron";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Store, { type Schema } from "electron-store";
import electronUpdater from "electron-updater";
import { env } from "./server/transport/runtime-config.js";
${apiTransportImport}

// Adapted from t3code apps/desktop/src/electron/ElectronSafeStorage.ts + ElectronWindow.ts
// Plain singleton, no Effect layers, keeps <300 LOC

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const { autoUpdater } = electronUpdater;
type ClientSettingValue = string | number | boolean | null;
type DesktopClientSettings = {
  theme?: "light" | "dark";
${i18nSetting}  [key: string]: ClientSettingValue | undefined;
};
type DesktopStore = {
  clientSettings?: DesktopClientSettings;
  "auth:session"?: string;
};
const desktopStoreSchema: Schema<DesktopStore> = {
  clientSettings: {
    type: "object",
    maxProperties: 50,
    propertyNames: {
      type: "string",
      maxLength: 64,
      not: { enum: ["__proto__", "constructor", "prototype"] },
    },
    properties: {
      theme: { type: "string", enum: ["light", "dark"] },
${i18nSchema}    },
    additionalProperties: { type: ["string", "number", "boolean", "null"] },
  },
  "auth:session": { type: "string", maxLength: 8192 },
};
let storeInstance: Store<DesktopStore> | undefined;

function desktopStore(): Store<DesktopStore> {
  storeInstance ??= new Store<DesktopStore>({
    schema: desktopStoreSchema,
    rootSchema: { type: "object", additionalProperties: false },
    clearInvalidConfig: true,
  });
  return storeInstance;
}

${authStorage}${eveHelpers}
let mainWindow: BrowserWindow | null = null;
const DEFAULT_DEV_RENDERER_URL = "http://localhost:5173";

function resolveDevRendererUrl(): URL | null {
  if (app.isPackaged) return null;
  const raw = process.env.ELECTRON_RENDERER_URL ||
    (process.env.ELECTRON_IS_DEV === "1" ? DEFAULT_DEV_RENDERER_URL : undefined);
  if (!raw) return null;
  const parsed = new URL(raw);
  const loopback = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
  if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || !loopback.has(parsed.hostname)) {
    throw new Error("ELECTRON_RENDERER_URL must be an HTTP(S) loopback URL");
  }
  return parsed;
}

const devRendererUrl = resolveDevRendererUrl();

function comparablePath(path: string): string {
  const normalized = resolve(path);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function isTrustedRendererUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (devRendererUrl) return parsed.origin === devRendererUrl.origin;
    if (parsed.protocol !== "file:") return false;
    return comparablePath(fileURLToPath(parsed)) === comparablePath(join(__dirname, "renderer/index.html"));
  } catch {
    return false;
  }
}

function assertTrustedIpc(event: IpcMainInvokeEvent): void {
  const frameUrl = event.senderFrame?.url;
  if (!mainWindow || event.sender !== mainWindow.webContents || !frameUrl || !isTrustedRendererUrl(frameUrl)) {
    throw new Error("Untrusted desktop IPC caller");
  }
}

// CSP is injected here (not a meta tag) so connect-src follows DESKTOP_API_URL
// without hand-editing renderer HTML. WS scheme derives from the API protocol.
function desktopCsp(): string {
  const origin = new URL(env.DESKTOP_API_URL);
  const wsProtocol = origin.protocol === "https:" ? "wss:" : "ws:";
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    \`connect-src 'self' \${origin.origin} \${wsProtocol}//\${origin.host}\`,
  ].join("; ");
}

function shouldInjectDesktopRendererCsp(
  resourceType: string,
  responseWebContentsId: number | undefined,
  rendererWebContentsId: number | undefined,
  trustedRendererUrl: boolean,
): boolean {
  return resourceType === "mainFrame" &&
    rendererWebContentsId !== undefined &&
    responseWebContentsId === rendererWebContentsId &&
    trustedRendererUrl;
}

function responseHeadersWithDesktopCsp(
  responseHeaders: Record<string, string[]> | undefined,
): Record<string, string[]> {
  const nextHeaders = { ...responseHeaders };
  for (const name of Object.keys(nextHeaders)) {
    if (name.toLowerCase() === "content-security-policy") delete nextHeaders[name];
  }
  nextHeaders["Content-Security-Policy"] = [desktopCsp()];
  return nextHeaders;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#11111b",
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      additionalArguments: [\`--ghostinit-desktop-api-url=\${encodeURIComponent(env.DESKTOP_API_URL)}\`],
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      enableWebSQL: false,
    },
  });

  mainWindow.on("ready-to-show", () => mainWindow?.show());
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // Scope the generated CSP to this renderer's main document. The default
  // session is also used by OAuth, API, and subresource requests; their
  // provider headers (including provider CSP) must pass through untouched.
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    if (!shouldInjectDesktopRendererCsp(
      details.resourceType,
      details.webContentsId,
      mainWindow?.webContents.id,
      isTrustedRendererUrl(details.url),
    )) {
      callback({});
      return;
    }
    callback({
      responseHeaders: responseHeadersWithDesktopCsp(details.responseHeaders),
    });
  });
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });

  // Adapted from t3code DesktopWindow load logic: dev loads Vite, prod loads file
  if (devRendererUrl) {
    mainWindow.loadURL(devRendererUrl.toString());
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadFile(join(__dirname, "renderer/index.html"));
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (
        (parsed.protocol !== "https:" && parsed.protocol !== "http:") ||
        parsed.username ||
        parsed.password
      ) return { action: "deny" as const };
      void shell.openExternal(parsed.toString());
    } catch { return { action: "deny" as const }; }
    return { action: "deny" as const };
  });

  // Security: deny in-page navigations to external origins
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!isTrustedRendererUrl(url)) event.preventDefault();
  });
  mainWindow.webContents.on("will-redirect", (event, url) => {
    if (!isTrustedRendererUrl(url)) event.preventDefault();
  });
  mainWindow.webContents.on("will-attach-webview", (event) => event.preventDefault());
}

`;
}
