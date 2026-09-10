import { describe, expect, test } from "bun:test";
import { parseSync } from "oxc-parser";
import { projectConfigSchema, type ProjectConfig } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";
import type { TemplateFile } from "../../src/templates/shared.js";

function generate(
  mode: "monorepo" | "single",
  app: "mobile" | "desktop",
  enabled: boolean,
): TemplateFile[] {
  return generateProjectFiles(
    projectConfigSchema.parse({
      name: `platform-parity-${mode}-${app}`,
      runtime: "bun",
      mode,
      framework: "nextjs",
      database: "none",
      preset: "custom",
      apps: [app],
      auth: false,
      api: false,
      email: false,
      analytics: enabled,
      i18n: enabled,
      notifications: false,
      featureFlags: "none",
      billing: [],
      features: enabled ? ["i18n"] : [],
    } satisfies ProjectConfig),
    { dryRun: true },
  );
}

function read(files: readonly TemplateFile[], path: string): string {
  const entry = files.find((file) => file.path === path);
  if (!entry) throw new Error(`Missing generated file: ${path}`);
  return entry.content;
}

function packageJson(files: readonly TemplateFile[], mode: "monorepo" | "single", app: string) {
  const path = mode === "monorepo" ? `apps/${app}/package.json` : "package.json";
  return JSON.parse(read(files, path)) as { dependencies: Record<string, string> };
}

describe("Expo and Electron platform feature parity", () => {
  test("Expo emits EN/FR/AR detection, persistence, switching, and RTL only with i18n", () => {
    for (const mode of ["monorepo", "single"] as const) {
      const enabled = generate(mode, "mobile", true);
      const disabled = generate(mode, "mobile", false);
      const root = mode === "monorepo" ? "apps/mobile/src" : "src";
      const layout =
        mode === "monorepo"
          ? "apps/mobile/src/components/providers.tsx"
          : "src/components/providers.tsx";
      const runtimePath = `${root}/lib/i18n.tsx`;
      const runtime = read(enabled, runtimePath);

      expect(parseSync(runtimePath, runtime).errors).toEqual([]);
      for (const locale of ["en", "fr", "ar"] as const) {
        const messagesPath = `${root}/i18n/messages/${locale}.json`;
        expect(
          enabled.some(({ path }) => path === messagesPath),
          `${mode}: ${locale}`,
        ).toBe(true);
        const messages = JSON.parse(read(enabled, messagesPath)) as {
          header: { home: string };
          localeSwitcher: { label: string };
        };
        expect(messages.header.home.length).toBeGreaterThan(0);
        expect(messages.localeSwitcher.label.length).toBeGreaterThan(0);
      }
      expect(runtime).toContain("Localization.getLocales()[0]?.languageCode");
      expect(runtime).toContain("AsyncStorage.getItem(STORAGE_KEY)");
      expect(runtime).toContain("AsyncStorage.setItem(STORAGE_KEY, nextLocale)");
      expect(runtime).toContain("I18nManager.allowRTL(true)");
      expect(runtime).toContain("I18nManager.forceRTL(rtl)");
      expect(runtime).toContain("<View style={{ flex: 1, direction }}>");
      expect(runtime).toContain('accessibilityRole="radiogroup"');
      expect(read(enabled, layout)).toContain("<PlatformI18nProvider>");
      const marketingPath =
        mode === "monorepo"
          ? "apps/mobile/src/features/marketing/screen.tsx"
          : "src/features/marketing/screen.tsx";
      expect(read(enabled, marketingPath)).toContain("<LocaleSwitcher />");
      expect(read(disabled, marketingPath)).not.toContain("LocaleSwitcher");
      expect(read(disabled, layout)).not.toContain("PlatformI18nProvider");
      expect(disabled.some(({ path }) => path === runtimePath)).toBe(false);

      const enabledManifest = packageJson(enabled, mode, "mobile");
      const disabledManifest = packageJson(disabled, mode, "mobile");
      expect(enabledManifest.dependencies["expo-localization"]).toBe("~57.0.1");
      expect(disabledManifest.dependencies["expo-localization"]).toBeUndefined();
      expect(enabledManifest.dependencies["next-intl"]).toBeUndefined();
      expect(disabledManifest.dependencies["next-intl"]).toBeUndefined();
    }
  });

  test("Electron emits native locale IPC, catalogs, provider, switcher, and RTL in both modes", () => {
    for (const mode of ["monorepo", "single"] as const) {
      const enabled = generate(mode, "desktop", true);
      const disabled = generate(mode, "desktop", false);
      const root = mode === "monorepo" ? "apps/desktop/src/renderer" : "src/renderer";
      const mainPath = mode === "monorepo" ? "apps/desktop/src/main.ts" : "src/main.ts";
      const preloadPath = mode === "monorepo" ? "apps/desktop/src/preload.ts" : "src/preload.ts";
      const providersPath = `${root}/lib/providers.tsx`;
      const rootRoutePath = `${root}/features/app-shell/app-shell.tsx`;
      const runtimePath = `${root}/lib/i18n.tsx`;
      const runtime = read(enabled, runtimePath);

      expect(parseSync(runtimePath, runtime).errors).toEqual([]);
      for (const locale of ["en", "fr", "ar"] as const) {
        expect(enabled.some(({ path }) => path === `${root}/i18n/messages/${locale}.json`)).toBe(
          true,
        );
      }
      expect(runtime).toContain("window.desktopBridge.getSystemLocale()");
      expect(runtime).toContain("window.desktopBridge.getClientSettings()");
      expect(runtime).toContain(
        "window.desktopBridge.setClientSettings({ ...settings, locale: nextLocale })",
      );
      expect(runtime).toContain("document.documentElement.dir = localeDirection[locale]");
      expect(runtime).toContain('role="radiogroup"');
      expect(read(enabled, mainPath)).toContain("app.getLocale()");
      expect(read(enabled, preloadPath)).toContain("getSystemLocale: () => ipcRenderer.invoke");
      expect(read(enabled, providersPath)).toContain("<PlatformI18nProvider>");
      expect(read(enabled, rootRoutePath)).toContain("<LocaleSwitcher />");
      const scrollerPath =
        mode === "monorepo"
          ? "apps/desktop/src/renderer/components/ui/chat/scroller.tsx"
          : "src/components/ui/chat/scroller.tsx";
      expect(read(enabled, scrollerPath)).toContain('const t = useTranslations("messaging")');
      expect(read(enabled, scrollerPath)).toContain('aria-label={t("jumpToLatest")}');
      expect(read(disabled, scrollerPath)).toContain('aria-label="Jump to latest message"');

      expect(disabled.some(({ path }) => path === runtimePath)).toBe(false);
      expect(read(disabled, mainPath)).not.toContain("desktop:get-system-locale");
      expect(read(disabled, preloadPath)).not.toContain("getSystemLocale");
      expect(read(disabled, providersPath)).not.toContain("PlatformI18nProvider");
    }
  });

  test("Electron analytics is capability-gated, scoped, typed, and tracks router screens", () => {
    for (const mode of ["monorepo", "single"] as const) {
      const enabled = generate(mode, "desktop", true);
      const disabled = generate(mode, "desktop", false);
      const root = mode === "monorepo" ? "apps/desktop/src/renderer" : "src/renderer";
      const analyticsPath = `${root}/lib/analytics.tsx`;
      const routePath = `${root}/features/app-shell/app-shell.tsx`;
      const source = read(enabled, analyticsPath);

      expect(parseSync(analyticsPath, source).errors).toEqual([]);
      expect(source).toContain(
        mode === "monorepo" ? 'from "@repo/config/vite"' : 'from "@/lib/env/vite"',
      );
      expect(source).toContain("type PostHogInterface");
      expect(source).toContain("useRouterState({ select: (state) => state.location.pathname })");
      expect(source).toContain('posthog.capture("$screen"');
      expect(source).toContain("opt_out_capturing()");
      expect(source).toContain("opt_in_capturing()");
      expect(source).toContain("opt_out_capturing_by_default: initiallyOptedOut");
      expect(source).toContain("autocapture: false");
      expect(source).toContain("disable_session_recording: true");
      expect(source).not.toContain("@repo/config/server");
      expect(source).not.toContain("POSTHOG_API_KEY");
      expect(read(enabled, routePath)).toContain("<DesktopAnalyticsProvider>");
      expect(enabled.some(({ path }) => path === analyticsPath)).toBe(true);
      expect(disabled.some(({ path }) => path === analyticsPath)).toBe(false);
      expect(read(disabled, routePath)).not.toContain("DesktopAnalyticsProvider");
      expect(packageJson(enabled, mode, "desktop").dependencies["posthog-js"]).toBeDefined();
      expect(packageJson(disabled, mode, "desktop").dependencies["posthog-js"]).toBeUndefined();
    }
  });

  test("disabled platform capabilities leave no notification, flag, or analytics skeletons", () => {
    for (const mode of ["monorepo", "single"] as const) {
      const mobile = generate(mode, "mobile", false);
      const mobileRoot = mode === "monorepo" ? "apps/mobile/" : "";
      const mobileManifest = packageJson(mobile, mode, "mobile");
      for (const dependency of ["expo-device", "expo-notifications", "posthog-react-native"]) {
        expect(mobileManifest.dependencies[dependency], `${mode}: ${dependency}`).toBeUndefined();
      }
      expect(mobile.some(({ path }) => path === `${mobileRoot}src/hooks/use-push.ts`)).toBe(false);
      expect(mobile.some(({ path }) => path.includes("feature-flag"))).toBe(false);
      const appConfig = JSON.parse(read(mobile, `${mobileRoot}app.json`)) as {
        expo: { plugins: string[] };
      };
      expect(appConfig.expo.plugins).not.toContain("expo-notifications");

      const desktop = generate(mode, "desktop", false);
      const desktopRoot = mode === "monorepo" ? "apps/desktop/" : "";
      expect(
        desktop.some(({ path }) => path.startsWith(`${desktopRoot}src/renderer/lib/analytics`)),
      ).toBe(false);
      expect(desktop.some(({ path }) => path.includes("feature-flag"))).toBe(false);
      expect(desktop.some(({ path }) => path.includes("notifications"))).toBe(false);
    }
  });
});
