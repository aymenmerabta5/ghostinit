import type { DesktopMode } from "./model.js";

/**
 * Resolve the privileged Electron main-process endpoint from a runtime override
 * or the validated endpoint embedded by electron-vite during packaging.
 */
export function desktopRuntimeConfigContent(mode: DesktopMode = "monorepo"): string {
  const configImport =
    mode === "monorepo" ? "@repo/config/desktop-main" : "../../lib/env/desktop-main.js";
  return `import { app } from "electron";
import { resolveDesktopMainEnv } from "${configImport}";

declare const __GHOSTINIT_DESKTOP_EMBEDDED_API_URL__: string | undefined;

const embeddedApiUrl =
  typeof __GHOSTINIT_DESKTOP_EMBEDDED_API_URL__ === "string"
    ? __GHOSTINIT_DESKTOP_EMBEDDED_API_URL__.trim() || undefined
    : undefined;

export const env = resolveDesktopMainEnv(process.env, {
  embeddedApiUrl,
  isPackaged: app.isPackaged,
});
`;
}
