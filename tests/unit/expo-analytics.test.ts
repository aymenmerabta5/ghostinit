import { describe, expect, test } from "bun:test";
import { parseSync } from "oxc-parser";
import { analytics } from "../../packages/versions/src/index.js";
import { projectConfigSchema, type ProjectConfig } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";
import type { TemplateFile } from "../../src/templates/shared.js";

function generateMobile(mode: "monorepo" | "single", enabled: boolean): TemplateFile[] {
  return generateProjectFiles(
    projectConfigSchema.parse({
      name: `expo-analytics-${mode}`,
      runtime: "bun",
      mode,
      framework: "nextjs",
      database: "none",
      preset: "custom",
      apps: ["mobile"],
      auth: false,
      api: false,
      email: false,
      analytics: enabled,
      billing: [],
      features: [],
    } satisfies ProjectConfig),
    { dryRun: true },
  );
}

function read(files: readonly TemplateFile[], path: string): string {
  const file = files.find((entry) => entry.path === path);
  if (!file) throw new Error(`Missing generated file: ${path}`);
  return file.content;
}

function manifest(files: readonly TemplateFile[], mode: "monorepo" | "single") {
  return JSON.parse(
    read(files, mode === "monorepo" ? "apps/mobile/package.json" : "package.json"),
  ) as {
    dependencies: Record<string, string>;
  };
}

describe("generated Expo PostHog analytics", () => {
  test("pins the audited React Native SDK and gates its full native implementation", () => {
    expect(analytics["posthog-react-native"]).toBe("4.64.2");
    for (const mode of ["monorepo", "single"] as const) {
      const enabled = generateMobile(mode, true);
      const disabled = generateMobile(mode, false);
      const path =
        mode === "monorepo" ? "apps/mobile/src/lib/analytics.tsx" : "src/lib/analytics.tsx";
      const layoutPath = mode === "monorepo" ? "apps/mobile/app/_layout.tsx" : "app/_layout.tsx";

      expect(manifest(enabled, mode).dependencies["posthog-react-native"], mode).toBe(
        analytics["posthog-react-native"],
      );
      expect(manifest(disabled, mode).dependencies["posthog-react-native"], mode).toBeUndefined();
      for (const dependency of ["posthog-js", "posthog-node"]) {
        expect(
          manifest(enabled, mode).dependencies[dependency],
          `${mode}: ${dependency}`,
        ).toBeUndefined();
        expect(
          manifest(disabled, mode).dependencies[dependency],
          `${mode}: ${dependency}`,
        ).toBeUndefined();
      }
      expect(
        enabled.some((file) => file.path === path),
        mode,
      ).toBe(true);
      expect(
        disabled.some((file) => file.path === path),
        mode,
      ).toBe(false);
      expect(read(enabled, layoutPath)).toContain("<ExpoAnalyticsProvider>");
      expect(read(disabled, layoutPath)).not.toContain("ExpoAnalyticsProvider");
    }
  });

  test("uses only scoped public Expo config and never imports the web SDK or server secrets", () => {
    for (const mode of ["monorepo", "single"] as const) {
      const files = generateMobile(mode, true);
      const path =
        mode === "monorepo" ? "apps/mobile/src/lib/analytics.tsx" : "src/lib/analytics.tsx";
      const source = read(files, path);
      expect(parseSync(path, source).errors).toEqual([]);
      expect(source).toContain(
        mode === "monorepo" ? 'from "@repo/config/expo"' : 'from "@/lib/env/expo"',
      );
      expect(source).not.toContain("@repo/config/server");
      expect(source).not.toContain("posthog-js");
      expect(source).not.toMatch(/\b(?:BETTER_AUTH_SECRET|POSTHOG_API_KEY|POSTGRES_PASSWORD)\b/);
      expect(source).not.toContain("process.env");
      expect(source).not.toContain("window.");
      expect(source).not.toContain("document.");
    }
  });

  test("implements the PostHog 4.x provider, opt-out, and manual Expo screen APIs", () => {
    const source = read(generateMobile("monorepo", true), "apps/mobile/src/lib/analytics.tsx");
    expect(source).toContain('PostHogProvider, usePostHog } from "posthog-react-native"');
    expect(source).toContain("new PostHog(config.apiKey");
    expect(source).toContain("clientInstance !== undefined");
    expect(source).toContain("customStorage: AsyncStorage");
    expect(source).toContain("defaultOptIn: !initiallyOptedOut");
    expect(source).toContain("captureAppLifecycleEvents: false");
    expect(source).toContain("capturePushNotificationSubscriptions: false");
    expect(source).toContain("capturePushNotificationOpened: false");
    expect(source).toContain("enableSessionReplay: false");
    expect(source).toContain("<PostHogProvider client={client} autocapture={false}");
    expect(source).toContain("const segments = useSegments()");
    expect(source).toContain("posthog.screen(screenName");
    expect(source).toContain("await posthog.optIn()");
    expect(source).toContain("await posthog.optOut()");
    expect(source).toContain("await posthog.flush()");
    expect(source).toContain("posthog.reset()");
  });

  test("fails closed for disabled, placeholder, or unsafe endpoint configuration", () => {
    const source = read(generateMobile("single", true), "src/lib/analytics.tsx");
    expect(source).toContain('env.EXPO_PUBLIC_ANALYTICS_DISABLED !== "true"');
    expect(source).toContain('!apiKey.includes("REPLACE")');
    expect(source).toContain('!apiKey.toLowerCase().includes("placeholder")');
    expect(source).toContain('if (!value || value.startsWith("/")) return DEFAULT_POSTHOG_HOST');
    expect(source).toContain(
      "if (parsed.username || parsed.password || parsed.search || parsed.hash) return null",
    );
    expect(source).toContain('parsed.protocol !== "https:" && !isLocalHttp');
    expect(source).toContain("if (!config.enabled) return null");
    expect(source).toContain("disabledAdapter");
  });
});
