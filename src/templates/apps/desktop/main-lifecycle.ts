export interface DesktopMainLifecycleOptions {
  readonly apiTransportHandler: string;
  readonly authHandlers: string;
  readonly authReadyLog: string;
  readonly eveHandler: string;
  readonly i18nHandler: string;
}

export function desktopMainLifecycleContent(options: DesktopMainLifecycleOptions): string {
  const { apiTransportHandler, authHandlers, authReadyLog, eveHandler, i18nHandler } = options;
  return `const DESKTOP_STARTUP_SMOKE_ARGUMENT = "--ghostinit-startup-smoke";
if (process.argv.includes(DESKTOP_STARTUP_SMOKE_ARGUMENT)) {
  // Never make termination depend on a GUI executable's stdout flush callback.
  // The exit status is the cross-platform launch acknowledgement; stdout is diagnostic only.
  process.stdout.write("[desktop] startup smoke ok\\n");
  app.exit(0);
} else {
  const hasSingleInstanceLock = app.requestSingleInstanceLock();
  if (!hasSingleInstanceLock) {
    app.quit();
  } else {
    void app.whenReady().then(() => {
  desktopStore();
  createWindow();

${authReadyLog}
  // ElectronUpdater-inspired minimal auto-updater (t3code uses autoUpdater.checkForUpdatesAndNotify)
  if (app.isPackaged) {
    autoUpdater.checkForUpdatesAndNotify().catch(() => {});
  }

  // IPC with validated channels (zod-lite), analogous to server auth actions
  ipcMain.handle("desktop:get-app-branding", (event) => {
    assertTrustedIpc(event);
    return { name: "GhostInit Desktop", version: app.getVersion() };
  });

  ipcMain.handle("desktop:get-client-settings", (event) => {
    assertTrustedIpc(event);
    return desktopStore().get("clientSettings");
  });
  ipcMain.handle("desktop:set-client-settings", (event, val: unknown) => {
    assertTrustedIpc(event);
    if (val === null || typeof val !== "object" || Array.isArray(val)) throw new Error("Invalid clientSettings: expected object");
    if (JSON.stringify(val).length > 16_384) throw new Error("Invalid clientSettings: payload too large");
    if (val && typeof val === "object") {
      const keys = Object.keys(val as object);
      if (keys.length > 50) throw new Error("Invalid clientSettings: too many keys");
      if (keys.some((k) => k.length > 64 || k === "__proto__" || k === "constructor" || k === "prototype")) throw new Error("Invalid clientSettings: forbidden key");
      for (const k of keys) {
        const v = (val as Record<string, unknown>)[k];
        if (v !== null && typeof v !== "string" && typeof v !== "number" && typeof v !== "boolean") {
          throw new Error(\`Invalid clientSettings value for \${k}\`);
        }
      }
    }
    desktopStore().set("clientSettings", val as DesktopClientSettings);
  });

${authHandlers}
${apiTransportHandler}
${i18nHandler}
${eveHandler}
  ipcMain.handle("desktop:window-minimize", (event) => {
    assertTrustedIpc(event);
    return mainWindow?.minimize();
  });
  ipcMain.handle("desktop:window-maximize", (event) => {
    assertTrustedIpc(event);
    if (mainWindow?.isMaximized()) mainWindow.unmaximize();
    else mainWindow?.maximize();
  });
  ipcMain.handle("desktop:window-close", (event) => {
    assertTrustedIpc(event);
    return mainWindow?.close();
  });

  ipcMain.handle("desktop:updates-check", async (event) => {
    assertTrustedIpc(event);
    try {
      const result = await autoUpdater.checkForUpdates();
      const updateInfo = result?.updateInfo;
      return {
        isUpdateAvailable: result?.isUpdateAvailable ?? false,
        updateInfo: updateInfo
          ? {
              version: updateInfo.version,
              releaseName: typeof updateInfo.releaseName === "string" ? updateInfo.releaseName : null,
              releaseDate: updateInfo.releaseDate,
              releaseNotes: typeof updateInfo.releaseNotes === "string" ? updateInfo.releaseNotes : null,
            }
          : null,
      };
    } catch {
      throw new Error("Update check failed");
    }
  });
  ipcMain.handle("desktop:updates-download", async (event) => {
    assertTrustedIpc(event);
    try {
      await autoUpdater.downloadUpdate();
      return { downloaded: true as const };
    } catch {
      throw new Error("Update download failed");
    }
  });
  ipcMain.handle("desktop:updates-install", (event) => {
    assertTrustedIpc(event);
    try { autoUpdater.quitAndInstall(); } catch (e) { dialog.showErrorBox("Update install failed", e instanceof Error ? e.message : String(e)); }
  });
  // Forward updater events to renderer
  autoUpdater.on("update-available", (info) => mainWindow?.webContents.send("desktop:update-available", info));
  autoUpdater.on("update-downloaded", (info) => mainWindow?.webContents.send("desktop:update-downloaded", info));
  autoUpdater.on("error", (err) => mainWindow?.webContents.send("desktop:update-error", err?.message ?? String(err)));

  ipcMain.handle("desktop:shell-open-external", (event, url: unknown) => {
    assertTrustedIpc(event);
    if (typeof url !== "string") throw new Error("Invalid URL");
    let parsed: URL;
    try { parsed = new URL(url); } catch { throw new Error("Invalid URL"); }
    if ((parsed.protocol !== "https:" && parsed.protocol !== "http:") || parsed.username || parsed.password) throw new Error("Invalid URL");
    return shell.openExternal(parsed.toString());
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
  }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown startup error";
    dialog.showErrorBox("Desktop startup failed", message);
    app.quit();
  });

  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
  }
}
`;
}
