import { fullDesktopCapabilities, type DesktopCapabilities, type DesktopMode } from "../model.js";

export function desktopProvidersContent(
  capabilities: DesktopCapabilities = fullDesktopCapabilities,
  mode: DesktopMode = "monorepo",
): string {
  const hasConvexAuth = capabilities.isConvex && capabilities.hasAuth;
  const imports = [
    `import * as React from "react";`,
    capabilities.hasApi
      ? `import { QueryClientProvider } from "@tanstack/react-query";\nimport { getQueryClient } from "./query-client";`
      : "",
    hasConvexAuth
      ? `import { ConvexReactClient } from "convex/react";\nimport { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";\nimport { authClient } from "./auth";\nimport { env } from "${mode === "monorepo" ? "@repo/config/vite" : "@/lib/env/vite"}";`
      : "",
    capabilities.hasI18n ? `import { PlatformI18nProvider } from "./i18n";` : "",
    `import { ThemeProvider } from "./theme";`,
  ]
    .filter(Boolean)
    .join("\n");
  const setup = [
    capabilities.hasApi ? `  const queryClient = getQueryClient();` : "",
    hasConvexAuth
      ? `  const convex = React.useMemo(() => {
    const url = env.VITE_CONVEX_URL;
    if (!url) throw new Error("VITE_CONVEX_URL must be set for desktop Convex mode");
    return new ConvexReactClient(url);
  }, []);`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  let providerTree = `<ThemeProvider>{children}</ThemeProvider>`;
  if (capabilities.hasApi) {
    providerTree = `<QueryClientProvider client={queryClient}>\n        ${providerTree}\n      </QueryClientProvider>`;
  }
  if (hasConvexAuth) {
    providerTree = `<ConvexBetterAuthProvider client={convex} authClient={authClient}>\n      ${providerTree}\n    </ConvexBetterAuthProvider>`;
  }
  if (capabilities.hasI18n) {
    providerTree = `<PlatformI18nProvider>\n      ${providerTree}\n    </PlatformI18nProvider>`;
  }

  return `${imports}

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
