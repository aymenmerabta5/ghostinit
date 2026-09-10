import { uiUtilsContent } from "../ui/utils.js";
import { file, type TemplateFile } from "../shared.js";
import { expoAuthClientContent, expoOrpcClientContent } from "./fragments/expo/orpc.js";
import { identityPureClientFiles } from "./fragments/auth/client-validation.js";
import { platformSurfaceTranslationFiles } from "./fragments/platform-surface-translations.js";
import { nativeFormFieldFiles } from "./fragments/native-form-fields.js";
import {
  expoHeaderContent,
  expoSignOutButtonContent,
  expoShellFeatureFiles,
} from "./fragments/expo/header.js";
import { rnrAllFiles } from "./fragments/expo/rnr/index.js";
import {
  expoNativeQueryClientContent,
  expoOfflineHookContent,
  expoPushHookContent,
} from "./fragments/expo/native.js";
import { convexClientProviderExpoContent } from "./fragments/convex-providers.js";
import { expoAnalyticsFiles } from "./fragments/expo/analytics.js";
import { expoEveFiles, eveProtocolAcceptanceFile, eveProtocolFile } from "./fragments/eve/index.js";
import { platformI18nFiles } from "./fragments/platform-i18n.js";
import { resolveExpoCapabilities, type ExpoFeatureInput } from "./expo-core.js";
import { nativeQueryRegressionFile } from "./fragments/expo/query-tests.js";
import { canonicalQueryAuthHookContent } from "./fragments/query-auth.js";

function headerContent(
  hasBilling: boolean,
  hasI18n: boolean,
  hasEve: boolean,
  hasPdf: boolean,
): string {
  const content = expoHeaderContent(hasI18n, hasEve, hasPdf);
  if (hasBilling) return content;
  const billingLabel = hasI18n ? '{t("billing")}' : "Billing";
  return content.replace(
    `          <Link href="/billing" asChild><Button variant="ghost" size="sm"><Text>${billingLabel}</Text></Button></Link>\n`,
    "",
  );
}

export function expoComponentFiles(input: ExpoFeatureInput = false): TemplateFile[] {
  const capabilities = resolveExpoCapabilities(input, true);
  const files: TemplateFile[] = [
    file("apps/mobile/src/lib/utils.ts", uiUtilsContent()),
    file("apps/mobile/src/lib/query-client.ts", expoNativeQueryClientContent()),
    nativeQueryRegressionFile(),
    ...rnrAllFiles(),
    file("apps/mobile/src/hooks/use-copy.ts", expoUseCopyHook()),
    file("apps/mobile/src/hooks/use-offline.ts", expoOfflineHookContent()),
  ];

  if (capabilities.hasAuth) {
    files.push(
      ...identityPureClientFiles("apps/mobile/src"),
      ...platformSurfaceTranslationFiles("apps/mobile/src", capabilities.hasI18n),
      ...nativeFormFieldFiles("apps/mobile/src"),
      file(
        "apps/mobile/src/lib/auth-client.ts",
        expoAuthClientContent(
          "__PROJECT_NAME__",
          capabilities.isConvex,
          "monorepo",
          capabilities.hasEmail,
        ),
      ),
      ...expoShellFeatureFiles(
        "apps/mobile/src",
        headerContent(
          capabilities.hasBilling,
          capabilities.hasI18n,
          capabilities.hasEve,
          capabilities.hasPdf,
        ),
        capabilities.hasI18n,
      ),
      file(
        "apps/mobile/src/components/sign-out-button.tsx",
        expoSignOutButtonContent(capabilities.hasI18n),
      ),
      file("apps/mobile/src/hooks/use-auth.ts", expoUseAuthHook()),
    );
  }
  if (capabilities.hasApi) {
    files.push(
      file("apps/mobile/src/lib/orpc.ts", expoOrpcClientContent({ hasAuth: capabilities.hasAuth })),
    );
  }
  if (capabilities.hasAuth && capabilities.hasApi) {
    files.push(file("apps/mobile/src/lib/query-auth-scope.ts", canonicalQueryAuthHookContent()));
  }
  if (capabilities.hasBilling) {
    files.push(file("apps/mobile/src/hooks/use-billing.ts", expoUseBillingHook()));
  }
  if (capabilities.hasAnalytics) {
    files.push(...expoAnalyticsFiles("monorepo"));
  }
  if (capabilities.hasEve) {
    files.push(
      eveProtocolFile("expo", "monorepo"),
      ...expoEveFiles("monorepo", capabilities.hasI18n),
      eveProtocolAcceptanceFile("expo", "monorepo"),
    );
  }
  if (capabilities.hasI18n) {
    files.push(...platformI18nFiles("expo", "monorepo"));
  }
  if (capabilities.hasNotifications) {
    files.push(file("apps/mobile/src/hooks/use-push.ts", expoPushHookContent()));
  }
  if (capabilities.isConvex) {
    files.push(
      file(
        "apps/mobile/src/components/convex-client-provider.tsx",
        convexClientProviderExpoContent(capabilities.hasAuth),
      ),
    );
  }

  return files;
}

function expoUseAuthHook(): string {
  return `import { authClient } from "../lib/auth-client";

export function useAuth() {
  const { data: session, isPending, error, refetch } = authClient.useSession();

  return {
    session: session ?? null,
    user: session?.user ?? null,
    isPending,
    isAuthenticated: !!session?.user,
    error: error ?? null,
    refetch,
  };
}
`;
}

function expoUseBillingHook(): string {
  return `import * as React from "react";
import type { BillingSubscription, UseBillingReturn } from "@repo/kernel";
import { orpcClient } from "../lib/orpc";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | null | undefined {
  return value === null || typeof value === "string" ? value : undefined;
}

function toBillingSubscription(value: unknown): BillingSubscription | undefined {
  if (!isRecord(value)) return undefined;
  const id = typeof value.id === "string" ? value.id : typeof value._id === "string" ? value._id : null;
  if (!id || typeof value.provider !== "string" || typeof value.status !== "string") return undefined;
  return {
    id,
    provider: value.provider,
    status: value.status,
    currentPeriodEnd: optionalString(value.currentPeriodEnd),
    priceId: optionalString(value.priceId),
  };
}

export function useBilling(): UseBillingReturn {
  const [subscriptions, setSubscriptions] = React.useState<BillingSubscription[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const refresh = React.useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const data = await orpcClient.billing.subscriptions();
      setSubscriptions(data.subscriptions.flatMap((value) => {
        const subscription = toBillingSubscription(value);
        return subscription ? [subscription] : [];
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load billing");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const hasActiveSubscription = React.useMemo(
    () => subscriptions.some((s) => s.status === "active" || s.status === "trialing"),
    [subscriptions],
  );

  return { subscriptions, loading, error, refresh, hasActiveSubscription, isLoading: loading };
}
`;
}

function expoUseCopyHook(): string {
  return `import * as React from "react";
import * as Clipboard from "expo-clipboard";
import type { UseCopyReturn } from "@repo/kernel";

export function useCopy(): UseCopyReturn {
  const [copied, setCopied] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const copy = React.useCallback(async (text: string): Promise<boolean> => {
    setError(null);
    try {
      await Clipboard.setStringAsync(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Copy failed");
      return false;
    }
  }, []);

  return { copy, copied, error };
}
`;
}
