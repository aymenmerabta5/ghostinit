import { file, type TemplateFile } from "../../../shared.js";
import type { DesktopCapabilities, DesktopMode } from "../model.js";
import { nativeI18nImportPath, nativeI18nTemplate } from "../../fragments/native-i18n.js";

export function desktopShellDataFiles(
  root: string,
  capabilities: DesktopCapabilities,
  mode: DesktopMode,
): TemplateFile[] {
  const i18n = nativeI18nTemplate(
    capabilities.hasI18n,
    "header",
    nativeI18nImportPath("desktop", mode),
  );
  return [
    file(
      `${root}/model.ts`,
      'export const defaultBranding = { name: "GhostInit Desktop", version: "" };\n',
    ),
    file(
      `${root}/queries.ts`,
      `import { useQuery } from "@tanstack/react-query";
import { defaultBranding } from "./model";
${capabilities.hasAuth ? 'import { useAuth } from "../../hooks/useAuth";\nimport { authClient } from "../../lib/auth";\nexport function useShellIdentity() { return useAuth(); }\nexport function readDesktopSession() { return authClient.getSession(); }' : ""}
export function useDesktopBranding() {
  const branding = useQuery({ queryKey: ["desktop", "branding"], queryFn: () => window.desktopBridge.getAppBranding(), retry: false, staleTime: Infinity, refetchOnWindowFocus: false, refetchOnReconnect: false });
  return branding.data ?? defaultBranding;
}
`,
    ),
    file(
      `${root}/mutations.ts`,
      `import { useMutation } from "@tanstack/react-query";
export function minimizeWindow(): void { void window.desktopBridge.windowMinimize(); }
export function maximizeWindow(): void { void window.desktopBridge.windowMaximize(); }
export function closeWindow(): void { void window.desktopBridge.windowClose(); }
export function useUpdateCheckMutation() { return useMutation({ mutationKey: ["desktop", "updates"], retry: false, mutationFn: () => window.desktopBridge.updatesCheck() }); }
`,
    ),
    file(
      `${root}/use-update-check.ts`,
      `import { useEffect, useRef } from "react";
import { useUpdateCheckMutation } from "./mutations";
${i18n.importLine}
export function useUpdateCheck() {
${i18n.hookLine}
  const mutation = useUpdateCheckMutation();
  const mounted = useRef(false);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; if (timeout.current) clearTimeout(timeout.current); }; }, []);
  async function check(): Promise<void> {
    try { await mutation.mutateAsync(); } catch { /* The mutation owns the error state. */ }
    if (!mounted.current) return;
    if (timeout.current) clearTimeout(timeout.current);
    timeout.current = setTimeout(mutation.reset, 3000);
  }
  const status = mutation.isPending ? ${i18n.value("updatesChecking", "Checking…")}
    : mutation.error ? ${capabilities.hasI18n ? i18n.value("updatesError", "Update check failed") : 'mutation.error instanceof Error ? mutation.error.message : "Update check failed"'}
    : mutation.data ? (mutation.data.isUpdateAvailable ? ${i18n.value("updatesAvailable", "Update available")} : ${i18n.value("updatesCurrent", "Up to date")}) : null;
  return { check, status };
}
`,
    ),
  ];
}
