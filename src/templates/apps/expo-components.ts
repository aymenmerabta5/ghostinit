import { file, type TemplateFile } from "../shared.js";
import { expoAuthClientContent, expoOrpcClientContent } from "./fragments/expo/orpc.js";
import { expoHeaderContent, expoSignOutButtonContent } from "./fragments/expo/header.js";
import { rnrAllFiles } from "./fragments/expo/rnr/index.js";
import { expoOfflineHookContent, expoPushHookContent } from "./fragments/expo/native.js";

export function expoComponentFiles(): TemplateFile[] {
  return [
    file("apps/mobile/src/lib/auth-client.ts", expoAuthClientContent()),
    file("apps/mobile/src/lib/orpc.ts", expoOrpcClientContent()),
    file("apps/mobile/src/lib/utils.ts", expoLibUtilsContent()),
    file("apps/mobile/src/components/header.tsx", expoHeaderContent()),
    file("apps/mobile/src/components/sign-out-button.tsx", expoSignOutButtonContent()),
    ...rnrAllFiles(),
    file("apps/mobile/src/hooks/use-auth.ts", expoUseAuthHook()),
    file("apps/mobile/src/hooks/use-billing.ts", expoUseBillingHook()),
    file("apps/mobile/src/hooks/use-copy.ts", expoUseCopyHook()),
    file("apps/mobile/src/hooks/use-push.ts", expoPushHookContent()),
    file("apps/mobile/src/hooks/use-offline.ts", expoOfflineHookContent()),
  ];
}

function expoLibUtilsContent(): string {
  return `import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
`;
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

export function useBilling(): UseBillingReturn {
  const [subscriptions, setSubscriptions] = React.useState<BillingSubscription[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  function getBaseUrl(): string {
    const env = (typeof process !== "undefined" ? process.env : {}) as Record<string, string | undefined>;
    const url = env.EXPO_PUBLIC_API_URL || env.EXPO_PUBLIC_APP_URL;
    if (!url) {
      if (typeof process !== "undefined" && process.env.NODE_ENV === "production") {
        throw new Error("EXPO_PUBLIC_API_URL must be set in production");
      }
      return "http://localhost:3000";
    }
    return url;
  }

  const refresh = React.useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(getBaseUrl() + "/api/billing/subscriptions", { method: "GET" });
      if (!res.ok) throw new Error("Failed to load billing: " + res.status);
      const data = (await res.json()) as { subscriptions?: BillingSubscription[] } | BillingSubscription[];
      const list = Array.isArray(data) ? data : (data.subscriptions ?? []);
      setSubscriptions(list);
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
import type { UseCopyReturn } from "@repo/kernel";

export function useCopy(): UseCopyReturn {
  const [copied, setCopied] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const copy = React.useCallback(async (text: string): Promise<boolean> => {
    try {
      let didCopy = false;
      try {
        const mod = await import("expo-clipboard").catch(() => null) as unknown as { setStringAsync?: (s: string) => Promise<void> } | null;
        if (mod && typeof mod.setStringAsync === "function") {
          await mod.setStringAsync(text);
          didCopy = true;
        }
      } catch {}
      if (!didCopy && typeof navigator !== "undefined") {
        const nav = navigator as unknown as { clipboard?: { writeText?: (t: string) => Promise<void> } };
        if (nav.clipboard && nav.clipboard.writeText) {
          await nav.clipboard.writeText(text);
          didCopy = true;
        }
      }
      if (!didCopy) {
        setError("Clipboard not available — copy failed");
        return false;
      }
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
