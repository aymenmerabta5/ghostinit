import { desktopEveMainHandler, desktopEveMainHelpers } from "../fragments/eve/index.js";
import { desktopMainLifecycleContent } from "./main-lifecycle.js";
import { desktopMainShellContent } from "./main-shell.js";
import type { DesktopMode } from "./model.js";

export function desktopMainContent(
  hasAuth = true,
  mode: DesktopMode = "monorepo",
  hasI18n = false,
  hasEve = false,
  hasApi = false,
): string {
  void mode;
  const hasRemoteTransport = hasAuth || hasApi;
  const authImport = hasAuth ? ", safeStorage" : "";
  const authStorage = hasAuth
    ? `function secureStorageAvailable(): boolean {
  if (!safeStorage.isEncryptionAvailable()) return false;
  return process.platform !== "linux" || safeStorage.getSelectedStorageBackend() !== "basic_text";
}

function getSafeValue(key: "auth:session"): string | undefined {
  const raw = desktopStore().get(key);
  if (!raw) return undefined;
  if (!secureStorageAvailable()) throw new Error("Secure credential storage is unavailable");
  try {
    return safeStorage.decryptString(Buffer.from(raw, "base64"));
  } catch {
    throw new Error("Stored credential could not be decrypted");
  }
}

function setSafeValue(key: "auth:session", value: string): void {
  if (!secureStorageAvailable()) throw new Error("Secure credential storage is unavailable");
  try {
    desktopStore().set(key, safeStorage.encryptString(value).toString("base64"));
  } catch {
    throw new Error("Credential could not be encrypted");
  }
}

function isAsciiCredential(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code < 0x21 || code > 0x7e) return false;
  }
  return true;
}

type DesktopOAuthRequest = {
  authorizationURL: string;
  callbackURL: string;
};

function parseDesktopOAuthRequest(value: unknown): DesktopOAuthRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid OAuth request");
  }
  const authorizationURL = Reflect.get(value, "authorizationURL");
  const callbackURL = Reflect.get(value, "callbackURL");
  if (typeof authorizationURL !== "string" || typeof callbackURL !== "string") {
    throw new Error("Invalid OAuth request");
  }
  if (authorizationURL.length > 8_192 || callbackURL.length > 2_048) {
    throw new Error("Invalid OAuth request");
  }
  const authorization = new URL(authorizationURL);
  const callback = new URL(callbackURL);
  const configured = new URL(env.DESKTOP_API_URL);
  if (
    authorization.protocol !== "https:" ||
    authorization.username ||
    authorization.password ||
    callback.origin !== configured.origin ||
    callback.pathname !== "/desktop-auth-complete" ||
    callback.username ||
    callback.password
  ) {
    throw new Error("Invalid OAuth request");
  }
  return { authorizationURL: authorization.toString(), callbackURL: callback.toString() };
}

async function startDesktopOAuth(value: unknown): Promise<{ completed: true }> {
  const input = parseDesktopOAuthRequest(value);
  return await new Promise((resolve, reject) => {
    const authWindow = new BrowserWindow({
      width: 560,
      height: 760,
      parent: mainWindow ?? undefined,
      modal: true,
      show: false,
      autoHideMenuBar: true,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        session: session.defaultSession,
        webSecurity: true,
      },
    });
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const finish = (error?: Error): void => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      if (!authWindow.isDestroyed()) authWindow.close();
      if (error) reject(error);
      else resolve({ completed: true });
    };
    timeout = setTimeout(() => finish(new Error("OAuth sign-in timed out")), 5 * 60_000);
    const inspectNavigation = (event: { preventDefault(): void }, target: string): void => {
      let parsed: URL;
      try { parsed = new URL(target); } catch { event.preventDefault(); finish(new Error("OAuth navigation failed")); return; }
      const callback = new URL(input.callbackURL);
      if (parsed.origin === callback.origin && parsed.pathname === callback.pathname) {
        event.preventDefault();
        finish();
        return;
      }
      if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
        event.preventDefault();
        finish(new Error("OAuth navigation was blocked"));
      }
    };
    authWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" as const }));
    authWindow.webContents.on("will-navigate", inspectNavigation);
    authWindow.webContents.on("will-redirect", inspectNavigation);
    authWindow.once("ready-to-show", () => authWindow.show());
    authWindow.once("closed", () => {
      if (!settled) finish(new Error("OAuth sign-in was cancelled"));
    });
    void authWindow.loadURL(input.authorizationURL).catch(() => finish(new Error("OAuth sign-in could not be loaded")));
  });
}
`
    : "";
  const authReadyLog = hasAuth
    ? `  console.log("[desktop] secure credential storage available:", secureStorageAvailable());
`
    : "";
  const authHandlers = hasAuth
    ? `  ipcMain.handle("desktop:auth-get-session", (event) => {
    assertTrustedIpc(event);
    return getSafeValue("auth:session");
  });
  ipcMain.handle("desktop:auth-set-session", (event, token: unknown) => {
    assertTrustedIpc(event);
    if (typeof token !== "string" || token.length < 16 || token.length > 4096 || !isAsciiCredential(token)) throw new Error("Invalid auth token");
    setSafeValue("auth:session", token);
  });
  ipcMain.handle("desktop:auth-start-oauth", async (event, input: unknown) => {
    assertTrustedIpc(event);
    return await startDesktopOAuth(input);
  });
`
    : "";
  const i18nSetting = hasI18n ? '  locale?: "en" | "fr" | "ar";\n' : "";
  const i18nSchema = hasI18n ? '      locale: { type: "string", enum: ["en", "fr", "ar"] },\n' : "";
  const i18nHandler = hasI18n
    ? `  ipcMain.handle("desktop:get-system-locale", (event) => {
    assertTrustedIpc(event);
    return app.getLocale();
  });
`
    : "";
  const eveHelpers = hasEve ? desktopEveMainHelpers() : "";
  const eveHandler = hasEve ? desktopEveMainHandler() : "";
  const apiTransportImport = hasRemoteTransport
    ? 'import { handleDesktopApiRequest } from "./server/transport/api-fetch.js";'
    : "";
  const apiTransportHandler = hasRemoteTransport
    ? `  ipcMain.handle("desktop:api-fetch", async (event, input: unknown) => {
    assertTrustedIpc(event);
    return await handleDesktopApiRequest(input);
  });
`
    : "";
  return (
    desktopMainShellContent({
      apiTransportImport,
      authImport,
      authStorage,
      eveHelpers,
      i18nSchema,
      i18nSetting,
    }) +
    desktopMainLifecycleContent({
      apiTransportHandler,
      authHandlers,
      authReadyLog,
      eveHandler,
      i18nHandler,
    })
  );
}
