import { file, type TemplateFile } from "../../../shared.js";
/**
 * Expo fragments: React Native layout content - RNR + Uniwind className
 */
import { nativeI18nTemplate } from "../native-i18n.js";

export interface ExpoRootLayoutOptions {
  hasAuth?: boolean;
  hasApi?: boolean;
  hasMessaging?: boolean;
  hasBilling?: boolean;
  hasAnalytics?: boolean;
  hasEmail?: boolean;
  hasEve?: boolean;
  hasFeatureFlags?: boolean;
  hasI18n?: boolean;
  hasJobs?: boolean;
  hasNotifications?: boolean;
  hasPdf?: boolean;
  hasStorage?: boolean;
  isConvex?: boolean;
}

function expoProvidersContent(options: ExpoRootLayoutOptions = {}): string {
  const hasAuth = options.hasAuth ?? true;
  const hasApi = options.hasApi ?? true;
  const hasCanonicalAuth = hasAuth && hasApi;
  const hasMessaging = options.hasMessaging ?? false;
  const hasBilling = options.hasBilling ?? true;
  const hasAnalytics = options.hasAnalytics ?? false;
  const hasEmail = options.hasEmail ?? true;
  const hasEve = options.hasEve ?? false;
  const hasFeatureFlags = options.hasFeatureFlags ?? false;
  const hasI18n = options.hasI18n ?? false;
  const hasJobs = options.hasJobs ?? false;
  const hasNotifications = options.hasNotifications ?? false;
  const hasPdf = options.hasPdf ?? false;
  const hasStorage = options.hasStorage ?? false;
  const isConvex = options.isConvex ?? false;
  const i18n = nativeI18nTemplate(hasI18n, "navigation");
  const authScreens = hasAuth
    ? `        <Stack.Protected guard={!isAuthenticated}>
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        </Stack.Protected>\n`
    : "";
  const accountScreens = hasAuth
    ? `        <Stack.Screen name="dashboard" options={{ title: ${i18n.value("dashboard", "Dashboard")} }} />
        <Stack.Screen name="settings" options={{ title: ${i18n.value("settings", "Settings")} }} />
${hasApi ? `        <Stack.Screen name="workspace" options={{ title: ${i18n.value("workspace", "Organizations & teams")} }} />\n        <Stack.Screen name="admin" options={{ title: ${i18n.value("admin", "Admin")} }} />\n` : ""}
${hasMessaging ? `        <Stack.Screen name="(app)/messages" options={{ title: ${i18n.value("messages", "Messages")} }} />\n` : ""}`
    : "";
  const billingScreen = hasBilling
    ? `        <Stack.Screen name="billing" options={{ title: ${i18n.value("billing", "Billing")} }} />\n`
    : "";
  const eveScreen = hasEve
    ? `        <Stack.Screen name="agent" options={{ title: ${i18n.value("agent", "Eve agent")} }} />\n`
    : "";
  const pdfScreen = hasPdf
    ? `        <Stack.Screen name="pdf" options={{ title: ${i18n.value("pdf", "PDF")} }} />\n`
    : "";
  const notificationScreen = hasNotifications
    ? `        <Stack.Screen name="notifications" options={{ title: ${i18n.value("notifications", "Notifications")} }} />\n`
    : "";
  const storageScreen = hasStorage
    ? `        <Stack.Screen name="storage" options={{ title: ${i18n.value("storage", "Storage")} }} />\n`
    : "";
  const jobsScreen = hasJobs
    ? `        <Stack.Screen name="jobs" options={{ title: ${i18n.value("jobs", "Jobs")} }} />\n`
    : "";
  const featureFlagScreen = hasFeatureFlags
    ? `        <Stack.Screen name="feature-flags" options={{ title: ${i18n.value("featureFlags", "Feature flags")} }} />\n`
    : "";
  const twoFactorScreen =
    hasAuth && hasEmail
      ? `        <Stack.Screen name="2fa" options={{ title: ${i18n.value("twoFactor", "Two-factor authentication")} }} />\n`
      : "";
  const authenticatedScreens = `${accountScreens}${billingScreen}${eveScreen}${pdfScreen}${notificationScreen}${storageScreen}${jobsScreen}`;
  const protectedScreens =
    hasAuth && authenticatedScreens
      ? `        <Stack.Protected guard={isAuthenticated}>\n${authenticatedScreens}        </Stack.Protected>\n`
      : "";
  const providerImport = isConvex
    ? 'import { ConvexClientProvider } from "@/components/convex-client-provider";'
    : "";
  const analyticsImport = hasAnalytics
    ? 'import { ExpoAnalyticsProvider } from "@/lib/analytics";'
    : "";
  const pushObserverImport = hasNotifications
    ? 'import { PushNotificationObserver } from "@/hooks/use-push";'
    : "";
  const i18nImport = hasI18n
    ? 'import { PlatformI18nProvider, useTranslations } from "@/lib/i18n";'
    : "";
  const authImport = hasAuth ? 'import { authClient } from "@/lib/auth-client";' : "";
  const headerImport = hasAuth ? 'import { Header } from "@/components/header";' : "";
  const nativeImport = hasAuth ? 'import { ActivityIndicator, View } from "react-native";' : "";
  const canonicalAuthImports = hasCanonicalAuth
    ? `import { useCanonicalQueryAuthScope } from "@/lib/query-auth-scope";
import { orpcClient } from "@/lib/orpc";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";`
    : "";
  const analyticsAssignment = hasAnalytics
    ? `  const analyticsApp = (
    <ExpoAnalyticsProvider>
      {app}
    </ExpoAnalyticsProvider>
  );`
    : "  const analyticsApp = app;";
  const i18nAssignment = hasI18n
    ? `  const instrumentedApp = (
    <PlatformI18nProvider>
      {analyticsApp}
    </PlatformI18nProvider>
  );`
    : "  const instrumentedApp = analyticsApp;";
  const providerReturn = isConvex
    ? `  return (
    <ConvexClientProvider>
      {instrumentedApp}
    </ConvexClientProvider>
  );`
    : "  return instrumentedApp;";
  const commonHook = hasI18n && hasAuth ? '  const commonT = useTranslations("common");\n' : "";
  const navigationState = hasAuth
    ? [
        "  const { data: session, isPending: sessionPending } = authClient.useSession();",
        ...(hasCanonicalAuth
          ? [
              "  const queryClient = useMemo(() => makeNativeQueryClient(), []);",
              "  const canonical = useCanonicalQueryAuthScope(queryClient, session, sessionPending, readCurrentApplication);",
              "  const isAuthenticated = canonical.scope !== null;",
              "  const cacheScope = canonical.isPending || canonical.error ? null : nativeQueryCacheScope(canonical.scope);",
              "  const { isRestoring } = useOfflineSync(queryClient, cacheScope);",
              `  if (canonical.error) return <View className="flex-1 items-center justify-center gap-3 bg-background p-6"><Text accessibilityRole="alert">${hasI18n ? '{commonT("error")}' : "Could not load your account."}</Text><Button onPress={canonical.retry}><Text>${hasI18n ? '{commonT("retry")}' : "Retry"}</Text></Button></View>;`,
              `  if (canonical.isPending || isRestoring) return <View className="flex-1 items-center justify-center bg-background"><ActivityIndicator accessibilityLabel={${hasI18n ? 'commonT("loading")' : '"Loading account"'}} /></View>;`,
            ]
          : [
              "  const identityKey = queryAuthIdentitySignature(queryAuthIdentityFromSession(session));",
              "  const queryClient = useMemo(() => makeNativeQueryClient(), [identityKey]);",
              "  const isAuthenticated = Boolean(session?.user);",
              "  useOfflineSync(queryClient, null);",
              `  if (sessionPending) return <View className="flex-1 items-center justify-center bg-background"><ActivityIndicator accessibilityLabel={${hasI18n ? 'commonT("loading")' : '"Loading account"'}} /></View>;`,
            ]),
      ].join("\n") + "\n"
    : '  const queryClient = useMemo(() => makeNativeQueryClient(), []);\n  useOfflineSync(queryClient, "public");\n';

  const navigation = `function AppNavigation() {
${i18n.hookLine}${commonHook}${navigationState}
  return (
    <QueryClientProvider client={queryClient}>
      <Stack${hasAuth ? " screenOptions={{ header: () => <Header /> }}" : ""}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
${featureFlagScreen}${twoFactorScreen}${authScreens}${protectedScreens}      </Stack>
      ${hasNotifications ? "<PushNotificationObserver />" : ""}
      <StatusBar style="auto" />
    </QueryClientProvider>
  );
}
`;

  const app = `  const app = <AppNavigation />;`;

  return `import { Stack } from "expo-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";
import { useMemo } from "react";
import { makeNativeQueryClient${hasCanonicalAuth ? ", nativeQueryCacheScope" : hasAuth ? ", queryAuthIdentityFromSession, queryAuthIdentitySignature" : ""} } from "@/lib/query-client";
import { useOfflineSync } from "@/hooks/use-offline";
${providerImport}
${analyticsImport}
${pushObserverImport}
${i18nImport}
${authImport}
${headerImport}
${nativeImport}
${canonicalAuthImports}

${hasCanonicalAuth ? "const readCurrentApplication = () => orpcClient.me();" : ""}

${navigation}

export function ExpoRootLayout() {
${app}
${analyticsAssignment}
${i18nAssignment}

${providerReturn}
}
`;
}

export function expoRootLayoutContent(_options: ExpoRootLayoutOptions = {}): string {
  return 'import "../global.css";\nexport { ExpoRootLayout as default } from "@/components/providers";\n';
}
export function expoProviderFiles(
  sourceRoot: string,
  options: ExpoRootLayoutOptions,
): TemplateFile[] {
  return [file(`${sourceRoot}/components/providers.tsx`, expoProvidersContent(options))];
}
