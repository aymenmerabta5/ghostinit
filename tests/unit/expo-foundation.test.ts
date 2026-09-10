import { describe, expect, test } from "bun:test";
import { parseSync } from "oxc-parser";
import {
  convex,
  orpc as orpcVersions,
  tanstack,
  typescript,
} from "../../packages/versions/src/index.js";
import { projectConfigSchema, type ProjectConfig } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";
import type { TemplateFile } from "../../src/templates/shared.js";

const MODES = ["monorepo", "single"] as const;

function generateMobile(
  mode: (typeof MODES)[number],
  overrides: Partial<ProjectConfig>,
): TemplateFile[] {
  return generateProjectFiles(
    projectConfigSchema.parse({
      name: "demo",
      mode,
      framework: "nextjs",
      database: "convex",
      preset: "custom",
      auth: true,
      api: true,
      email: false,
      analytics: false,
      notifications: true,
      billing: [],
      apps: ["mobile"],
      ...overrides,
    }),
  );
}

function generatedPath(mode: (typeof MODES)[number], path: string): string {
  return mode === "monorepo" ? `apps/mobile/${path}` : path;
}

function content(files: TemplateFile[], path: string): string {
  const generated = files.find((candidate) => candidate.path === path);
  expect(generated, `missing generated file: ${path}`).toBeDefined();
  return generated?.content ?? "";
}

function unrange(version: string | undefined): string | undefined {
  return version?.replace(/^[~^]/, "");
}

function expectGeneratedTypeScriptToParse(files: TemplateFile[], label: string): void {
  const errors = files
    .filter((file) => /\.tsx?$/.test(file.path))
    .flatMap((file) =>
      parseSync(file.path, file.content).errors.map(
        (error) => `${label}: ${file.path}: ${error.message}`,
      ),
    );
  expect(errors).toEqual([]);
}

describe("generated Expo foundation", () => {
  test("emits SDK 57-safe app config and Metro-only Uniwind integration", () => {
    for (const mode of MODES) {
      const files = generateMobile(mode, { billing: [] });
      const appConfig = JSON.parse(content(files, generatedPath(mode, "app.json"))) as {
        expo: {
          android?: Record<string, unknown>;
          updates?: unknown;
          plugins?: string[];
          experiments?: { typedRoutes?: boolean };
        };
      };
      expect(appConfig.expo.android?.useNextNotificationsApi, mode).toBeUndefined();
      expect(appConfig.expo.updates, mode).toBeUndefined();
      expect(appConfig.expo.plugins, mode).toEqual([
        "expo-router",
        "expo-secure-store",
        ...(mode === "monorepo" ? ["expo-notifications"] : []),
      ]);
      expect(appConfig.expo.experiments?.typedRoutes, mode).toBe(true);

      const metro = content(files, generatedPath(mode, "metro.config.js"));
      expect(metro, mode).toContain("withUniwindConfig(config, {");
      expect(metro, mode).toContain("cssEntryFile: './global.css'");
      expect(metro, mode).toContain("dtsFile: './uniwind-types.d.ts'");
      const babel = content(files, generatedPath(mode, "babel.config.js"));
      expect(babel, mode).toContain("presets:['babel-preset-expo']");
      expect(babel, mode).not.toContain("uniwind");

      const tsconfigPath =
        mode === "monorepo" ? "packages/typescript-config/expo.json" : "tsconfig.json";
      const tsconfig = JSON.parse(content(files, tsconfigPath)) as {
        compilerOptions: { lib: string[] };
      };
      expect(tsconfig.compilerOptions.lib, mode).toEqual(["ES2024", "DOM", "DOM.Iterable"]);
    }
  });

  test("keeps native primitives and Query persistence on installed-compatible types", () => {
    const files = generateMobile("monorepo", { billing: ["stripe"] });
    const manifest = JSON.parse(content(files, "apps/mobile/package.json")) as {
      dependencies: Record<string, string>;
    };
    expect(unrange(manifest.dependencies["@tanstack/react-query"])).toBe(
      tanstack["@tanstack/react-query"],
    );
    expect(unrange(manifest.dependencies["@tanstack/query-async-storage-persister"])).toBe(
      tanstack["@tanstack/query-async-storage-persister"],
    );
    expect(unrange(manifest.dependencies["@tanstack/query-persist-client-core"])).toBe(
      tanstack["@tanstack/query-persist-client-core"],
    );

    const dialog = ["dialog.tsx", "dialog-context.ts", "dialog-content.tsx"]
      .map((name) => content(files, `apps/mobile/src/components/ui/${name}`))
      .join("\n");
    expect(dialog).toContain("BackHandler.addEventListener");
    expect(dialog).toContain("<Modal");
    expect(dialog).not.toContain("document");
    expect(dialog).not.toContain("KeyboardEvent");
    expect(dialog).not.toContain("Platform");
    expect(dialog).toContain("AccessibilityInfo.sendAccessibilityEvent");
    expect(dialog).not.toContain("setAccessibilityFocus");
    expect(dialog).not.toContain("findNodeHandle");

    const copy = content(files, "apps/mobile/src/hooks/use-copy.ts");
    const kernel = content(files, "packages/kernel/src/hooks.ts");
    expect(kernel).toContain("error: string | null");
    expect(copy).toContain("return { copy, copied, error }");

    const push = content(files, "apps/mobile/src/hooks/use-push.ts");
    expect(push).toContain('import Constants from "expo-constants"');
    expect(push).toContain("shouldShowBanner: true");
    expect(push).toContain("shouldShowList: true");
    expect(push).not.toContain("shouldShowAlert");
    expect(push).toContain("Constants.expoConfig?.extra?.eas?.projectId");
    expect(push).toContain("Constants.easConfig?.projectId");
    expect(push).toContain("getExpoPushTokenAsync({ projectId })");
    expect(push.indexOf("setNotificationChannelAsync")).toBeLessThan(
      push.indexOf("getPermissionsAsync"),
    );
  });

  test("declares native dependencies and emits typed oRPC, Query, and Convex providers", async () => {
    const versions = await import("../../packages/versions/src/index.js");
    expect(versions.expo.expo).toBe("57.0.16");
    expect(versions.expoReact).toEqual({
      react: "19.2.3",
      "react-dom": "19.2.3",
      "@types/react": "19.2.18",
    });
    expect(versions.expo["react-native"]).toBe("0.86.3");
    expect(versions.reanimated["react-native-reanimated"]).toBe("4.5.1");
    expect(versions.worklets["react-native-worklets"]).toBe("0.10.1");

    for (const mode of MODES) {
      const files = generateMobile(mode, { billing: ["stripe"] });
      expectGeneratedTypeScriptToParse(files, `${mode}/enabled`);
      const manifest = JSON.parse(content(files, generatedPath(mode, "package.json"))) as {
        dependencies: Record<string, string>;
        devDependencies: Record<string, string>;
      };
      for (const [dependency, version] of Object.entries({
        "@expo/metro-runtime": "57.0.13",
        expo: "57.0.16",
        "expo-constants": "57.0.14",
        "expo-linking": "57.0.7",
        "expo-network": "57.0.1",
        "expo-router": "57.0.16",
        "expo-secure-store": "57.0.1",
        "expo-status-bar": "57.0.1",
        "expo-web-browser": "57.0.2",
        "expo-clipboard": "57.0.1",
        "react-native-safe-area-context": "5.7.0",
        "react-native-screens": "4.26.2",
        "react-native-gesture-handler": "2.32.0",
        "react-native-web": "0.21.2",
      })) {
        expect(manifest.dependencies[dependency], `${mode}: ${dependency}`).toBe(`~${version}`);
      }
      for (const [dependency, version] of Object.entries({
        "expo-device": "57.0.1",
        "expo-notifications": "57.0.14",
      })) {
        if (mode === "monorepo") {
          expect(manifest.dependencies[dependency], `${mode}: ${dependency}`).toBe(`~${version}`);
        } else {
          expect(manifest.dependencies[dependency], `${mode}: ${dependency}`).toBeUndefined();
        }
      }
      expect(manifest.dependencies.react, mode).toBe("19.2.3");
      expect(manifest.dependencies["react-dom"], mode).toBe("19.2.3");
      expect(manifest.dependencies["react-native"], mode).toBe("0.86.3");
      expect(manifest.dependencies["react-native-reanimated"], mode).toBe("4.5.1");
      expect(manifest.dependencies["react-native-worklets"], mode).toBe("0.10.1");
      expect(manifest.dependencies["@react-native-community/netinfo"], mode).toBe("12.0.1");
      expect(manifest.dependencies["@react-native-async-storage/async-storage"], mode).toBe(
        "2.2.0",
      );
      expect(manifest.dependencies["expo-updates"], mode).toBeUndefined();
      expect(manifest.dependencies["expo-localization"], mode).toBeUndefined();
      expect(unrange(manifest.dependencies["@tanstack/query-async-storage-persister"]), mode).toBe(
        tanstack["@tanstack/query-async-storage-persister"],
      );
      expect(unrange(manifest.dependencies["@tanstack/query-persist-client-core"]), mode).toBe(
        tanstack["@tanstack/query-persist-client-core"],
      );
      expect(manifest.devDependencies["@types/react"], mode).toBe("~19.2.18");
      expect(manifest.devDependencies["babel-preset-expo"], mode).toBe("~57.0.8");
      expect(manifest.devDependencies.typescript, mode).toBe(`~${typescript.typescript}`);
      expect(unrange(manifest.dependencies["@orpc/react-query"]), mode).toBe(
        orpcVersions["@orpc/react-query"],
      );
      expect(unrange(manifest.dependencies.convex), mode).toBe(convex.convex);
      expect(unrange(manifest.dependencies["@convex-dev/better-auth"]), mode).toBe(
        convex["@convex-dev/better-auth"],
      );

      const orpc = content(files, generatedPath(mode, "src/lib/orpc.ts"));
      expect(orpc).toContain("export const orpcClient:");
      expect(orpc).toContain("export const orpc = createORPCReactQueryUtils(orpcClient)");
      expect(orpc).toContain('if (Platform.OS === "web") return {}');
      expect(orpc).toContain('credentials: "include"');
      expect(orpc).not.toContain("as unknown as");

      const queryClient = content(files, generatedPath(mode, "src/lib/query-client.ts"));
      expect(queryClient).toContain("export function makeNativeQueryClient(): QueryClient");
      expect(queryClient).toContain("staleTime: STALE_TIME_MS");
      expect(queryClient).toContain("refetchOnReconnect: true");
      expect(queryClient).toContain("mutations:");
      expect(queryClient).toContain("retry: false");
      expect(files.some(({ path }) => path === generatedPath(mode, "src/hooks/use-push.ts"))).toBe(
        mode === "monorepo",
      );
      expect(
        files.some(({ path }) => path === generatedPath(mode, "src/hooks/use-offline.ts")),
      ).toBe(true);
      const offline = content(files, generatedPath(mode, "src/hooks/use-offline.ts"));
      expect(offline).toContain('AsyncStorage from "@react-native-async-storage/async-storage"');
      expect(offline).toContain("const [unsubscribe, restorePromise] = persistQueryClient");
      expect(offline).toContain("restorePromise.catch");
      expect(offline).toContain("unsubscribe();");
      expect(offline).not.toContain("expo-secure-store");

      const provider = content(
        files,
        generatedPath(mode, "src/components/convex-client-provider.tsx"),
      );
      expect(provider).toContain("ConvexProviderWithAuth");
      expect(provider).toContain("useAuth={useConvexBetterAuth}");
      expect(provider).toContain("betterAuthSessionId(session.data)");
      expect(provider).toContain('authClient } from "@/lib/auth-client"');
      expect(provider).not.toContain("ConvexBetterAuthProvider");
      expect(provider).not.toContain("as unknown as");
      expect(provider).not.toContain("orpc");
      const layout = content(files, generatedPath(mode, "src/components/providers.tsx"));
      expect(content(files, generatedPath(mode, "app/_layout.tsx"))).toContain(
        'from "@/components/providers"',
      );
      expect(layout).toContain("<ConvexClientProvider>");
      expect(layout).toContain("useMemo(() => makeNativeQueryClient(), [])");
      expect(layout).toContain(
        "useCanonicalQueryAuthScope(queryClient, session, sessionPending, readCurrentApplication)",
      );
      expect(layout).toContain("canonical.isPending || isRestoring");
      expect(layout).toContain("nativeQueryCacheScope(canonical.scope)");
      expect(offline).toContain('key: "ghostinit-query-cache:" + cacheScope');
      expect(layout).toContain('import { Header } from "@/components/header"');
      expect(layout).toContain("<Stack.Protected guard={isAuthenticated}>");
      expect(layout).toContain("useOfflineSync(queryClient");
      const header = content(files, generatedPath(mode, "src/features/app-shell/header.tsx"));
      expect(header).toContain(
        'horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-1 px-4 pb-2"',
      );
      expect(header).not.toContain("ml-2");
      expect(offline).toContain("buster: cacheScope");
      expect(offline).toContain("invalidateQueryAuthScope(queryClient)");
      if (mode === "monorepo") {
        const dialog = content(files, "apps/mobile/src/components/ui/dialog.tsx");
        expect(dialog).toContain("sm:text-start");
        expect(dialog).not.toContain("sm:text-left");
      }
    }

    const singleFiles = generateMobile("single", { billing: [] });
    expect(content(singleFiles, "global.css")).toStartWith(
      '@import "uniwind";\n@import "./src/platform/ui/styles/adapters/expo/v1.css";\n',
    );
    expect(content(singleFiles, "global.css")).not.toContain("@repo/ui");
    expect(content(singleFiles, "src/platform/ui/styles/theme.css")).toContain("@theme inline");
    expect(singleFiles.some(({ path }) => path === "src/styles/theme.css")).toBe(false);
  });

  test("authenticated navigation includes billing exactly when its route is emitted", () => {
    for (const mode of MODES)
      for (const i18n of [false, true])
        for (const billing of [[], ["stripe"]] as const) {
          const files = generateMobile(mode, {
            auth: true,
            api: true,
            billing: [...billing],
            i18n,
            features: i18n ? ["i18n"] : [],
          });
          const header = content(files, generatedPath(mode, "src/features/app-shell/header.tsx"));
          const selected = billing.length > 0;
          expect(header.includes('href="/billing"'), `${mode}/${i18n}`).toBe(selected);
          expect(files.some(({ path }) => path === generatedPath(mode, "app/billing.tsx"))).toBe(
            selected,
          );
        }
  });

  test("removes API, auth, and billing files and dependencies when disabled", () => {
    for (const mode of MODES) {
      const files = generateMobile(mode, {
        database: "none",
        auth: false,
        api: false,
        notifications: false,
        billing: [],
      });
      expectGeneratedTypeScriptToParse(files, `${mode}/disabled`);
      const paths = new Set(files.map((file) => file.path));
      const manifest = JSON.parse(content(files, generatedPath(mode, "package.json"))) as {
        dependencies: Record<string, string>;
      };

      for (const dependency of [
        "@better-auth/expo",
        "@orpc/client",
        "@orpc/react-query",
        "@orpc/server",
        "better-auth",
        "expo-network",
      ]) {
        expect(manifest.dependencies[dependency], `${mode}: ${dependency}`).toBeUndefined();
      }
      expect(paths.has(generatedPath(mode, "src/lib/auth-client.ts")), mode).toBe(false);
      expect(paths.has(generatedPath(mode, "src/lib/orpc.ts")), mode).toBe(false);
      expect(paths.has(generatedPath(mode, "app/billing.tsx")), mode).toBe(false);
      expect(paths.has(generatedPath(mode, "app/(auth)/sign-in.tsx")), mode).toBe(false);
      expect(paths.has(generatedPath(mode, "app/dashboard.tsx")), mode).toBe(false);

      const layout = content(files, generatedPath(mode, "src/components/providers.tsx"));
      expect(content(files, generatedPath(mode, "app/_layout.tsx"))).toContain(
        'from "@/components/providers"',
      );
      expect(layout).not.toContain('name="(auth)"');
      expect(layout).not.toContain('name="billing"');
      const marketing = content(files, generatedPath(mode, "src/features/marketing/screen.tsx"));
      expect(marketing).not.toContain('href="/(auth)');
      expect(marketing).not.toContain('href="/billing"');
    }
  });

  test("uses native Convex without Better Auth when identity is disabled", () => {
    for (const mode of MODES) {
      const files = generateMobile(mode, {
        auth: false,
        api: false,
        notifications: false,
        billing: [],
      });
      expectGeneratedTypeScriptToParse(files, `${mode}/convex-native`);
      const manifest = JSON.parse(content(files, generatedPath(mode, "package.json"))) as {
        dependencies: Record<string, string>;
      };
      expect(unrange(manifest.dependencies.convex), mode).toBe(convex.convex);
      expect(manifest.dependencies["@convex-dev/better-auth"], mode).toBeUndefined();
      expect(manifest.dependencies["better-auth"], mode).toBeUndefined();

      const provider = content(
        files,
        generatedPath(mode, "src/components/convex-client-provider.tsx"),
      );
      expect(provider).toContain("<ConvexProvider client={convexClient}>");
      expect(provider).not.toContain("ConvexBetterAuthProvider");
      expect(provider).not.toContain("ConvexProviderWithAuth");
      expect(provider).not.toContain("authClient");
      expect(files.some((file) => file.path === generatedPath(mode, "src/lib/orpc.ts"))).toBe(
        false,
      );
    }
  });

  test("API-only output keeps transport without inventing identity", () => {
    for (const mode of MODES) {
      const files = generateMobile(mode, {
        database: "postgres",
        auth: false,
        api: true,
        notifications: false,
        billing: [],
      });
      expectGeneratedTypeScriptToParse(files, `${mode}/api-only`);
      const prefix = generatedPath(mode, "");
      const paths = new Set(files.map(({ path }) => path));
      const manifest = JSON.parse(content(files, generatedPath(mode, "package.json"))) as {
        dependencies: Record<string, string>;
      };

      expect(paths.has(`${prefix}src/lib/orpc.ts`), mode).toBe(true);
      expect(paths.has(`${prefix}src/lib/query-client.ts`), mode).toBe(true);
      expect(paths.has(`${prefix}src/lib/auth-client.ts`), mode).toBe(false);
      expect(paths.has(`${prefix}app/(auth)/sign-in.tsx`), mode).toBe(false);
      expect(paths.has(`${prefix}app/dashboard.tsx`), mode).toBe(false);
      expect(manifest.dependencies["@orpc/react-query"], mode).toBeDefined();
      expect(manifest.dependencies["better-auth"], mode).toBeUndefined();
      expect(manifest.dependencies["@better-auth/expo"], mode).toBeUndefined();
      expect(manifest.dependencies["@tanstack/react-form"], mode).toBeUndefined();
    }
  });
});
