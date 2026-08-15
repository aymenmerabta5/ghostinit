/**
 * Electron Tray fragment — behind optional flag
 * Provides system tray with native theme sync
 */

export function desktopTrayContent(): string {
  return `import { app, Tray, Menu, nativeImage, nativeTheme } from "electron";
import { join } from "node:path";

let tray: Tray | null = null;

export function createTray(mainWindow: Electron.BrowserWindow): Tray {
  const iconPath = join(__dirname, "../resources/icon.png");
  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon.resize({ width: 16, height: 16 }));
  const contextMenu = Menu.buildFromTemplate([
    { label: "Show", click: () => mainWindow.show() },
    { label: "Quit", click: () => app.quit() },
  ]);
  tray.setToolTip("GhostInit Desktop");
  tray.setContextMenu(contextMenu);
  tray.on("click", () => {
    if (mainWindow.isVisible()) mainWindow.hide();
    else mainWindow.show();
  });
  nativeTheme.on("updated", () => {
    mainWindow.webContents.send("desktop:theme-updated", nativeTheme.shouldUseDarkColors);
  });
  return tray;
}

export function destroyTray(): void {
  tray?.destroy();
  tray = null;
}
`;
}
