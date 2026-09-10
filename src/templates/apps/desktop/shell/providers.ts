import { fullDesktopCapabilities, type DesktopCapabilities, type DesktopMode } from "../model.js";
import { convexAuthBridgeContent } from "../../fragments/convex-providers.js";

export function desktopProvidersContent(
  capabilities: DesktopCapabilities = fullDesktopCapabilities,
  mode: DesktopMode = "monorepo",
): string {
  void mode;
  const hasConvexAuth = capabilities.isConvex && capabilities.hasAuth;
  // Local IPC branding and updates use the query owner even without a backend.
  const hasQueries = true;
  const imports = [
    `import * as React from "react";`,
    hasQueries
      ? `import { QueryClientProvider } from "@tanstack/react-query";\nimport { getQueryClient } from "./query-client";`
      : "",
    capabilities.hasAuth ? `import { QueryAuthCacheBoundary } from "./query-auth-boundary";` : "",
    capabilities.hasAuth ? `import { Toaster } from "sonner";` : "",
    hasConvexAuth
      ? `import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react";\nimport { authClient } from "./auth";`
      : "",
    capabilities.hasI18n ? `import { PlatformI18nProvider } from "./i18n";` : "",
    `import { ThemeProvider } from "./theme";`,
  ]
    .filter(Boolean)
    .join("\n");
  const setup = [
    hasQueries ? `  const queryClient = getQueryClient();` : "",
    hasConvexAuth
      ? `  const convex = React.useMemo(() => {
    const url = window.desktopBridge.convexUrl;
    if (!url) throw new Error("The main process must provide the configured desktop Convex origin");
    return new ConvexReactClient(url);
  }, []);`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  let providerTree = `{children}`;
  if (capabilities.hasAuth) {
    providerTree = `<QueryAuthCacheBoundary queryClient={queryClient}>${providerTree}</QueryAuthCacheBoundary>`;
  }
  providerTree = `<ThemeProvider>${providerTree}${capabilities.hasAuth ? "<Toaster />" : ""}</ThemeProvider>`;
  if (hasQueries) {
    providerTree = `<QueryClientProvider client={queryClient}>\n        ${providerTree}\n      </QueryClientProvider>`;
  }
  if (hasConvexAuth) {
    providerTree = `<ConvexProviderWithAuth client={convex} useAuth={useConvexBetterAuth}>\n      ${providerTree}\n    </ConvexProviderWithAuth>`;
  }
  if (capabilities.hasI18n) {
    providerTree = `<PlatformI18nProvider>\n      ${providerTree}\n    </PlatformI18nProvider>`;
  }

  const authBridge = hasConvexAuth ? convexAuthBridgeContent() : "";

  return `${imports}

${authBridge}

export function Providers({ children }: { children: React.ReactNode }) {
${setup}
  return (
    ${providerTree}
  );
}
`;
}

export function desktopUseAuthContent(): string {
  return `import { authClient } from "../lib/auth";

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

export function useSession() {
  return useAuth();
}
`;
}
