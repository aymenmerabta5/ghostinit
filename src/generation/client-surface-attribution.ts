import {
  getCapabilityDefinition,
  getEffectiveCapabilityClientBinding,
} from "../domain/capabilities/support-catalog.js";
import type { CapabilityId, ClientSurfaceArtifactKind } from "../domain/capabilities/types.js";
import type { ResolvedProjectApp, ResolvedProjectConfig } from "../domain/project/config.js";

export interface ClientFileAttribution {
  readonly appId: string | null;
  readonly target: ResolvedProjectApp["target"] | null;
  readonly capability: CapabilityId | null;
  readonly artifacts: readonly ClientSurfaceArtifactKind[];
  readonly acceptance: readonly string[];
  readonly contribution: readonly string[];
}

interface SurfacePaths {
  readonly route: readonly string[];
  readonly adapter: readonly string[];
}

function appRoot(config: ResolvedProjectConfig, app: ResolvedProjectApp): string {
  if (config.mode === "single") return "";
  if (app.target === "expo") return "apps/mobile/";
  if (app.target === "electron") return "apps/desktop/";
  return "apps/web/";
}

function appManifestPath(config: ResolvedProjectConfig, app: ResolvedProjectApp): string {
  return `${appRoot(config, app)}package.json`;
}

function webSurfacePaths(
  root: string,
  target: "nextjs" | "tanstack-start",
  capability: CapabilityId,
  database: "postgres" | "convex" | "none",
): SurfacePaths | null {
  const next = target === "nextjs";
  const clientFeature = (route: string, adapters: readonly string[]): SurfacePaths => ({
    route: [next ? `${root}src/app/${route}/page.tsx` : `${root}src/routes/${route}.tsx`],
    adapter: adapters.map((path) => `${root}src/features/${route}/${path}`),
  });
  if (capability === "notifications") {
    return clientFeature("notifications", ["queries.ts", "mutations.ts"]);
  }
  if (capability === "storage") return clientFeature("storage", ["mutations.ts"]);
  if (capability === "featureFlags") return clientFeature("feature-flags", ["queries.ts"]);
  if (capability === "jobs") return clientFeature("jobs", ["queries.ts", "mutations.ts"]);
  if (capability === "auth") {
    const signIn = next ? `${root}src/app/sign-in/page.tsx` : `${root}src/routes/sign-in.tsx`;
    const settings = next ? `${root}src/app/settings/page.tsx` : `${root}src/routes/settings.tsx`;
    return {
      route: [signIn, ...(database === "postgres" ? [settings] : [])],
      adapter: [`${root}src/lib/auth-client.ts`],
    };
  }
  if (capability === "billing") {
    return {
      route: [next ? `${root}src/app/billing/page.tsx` : `${root}src/routes/billing.tsx`],
      adapter: [
        next
          ? `${root}src/app/billing/hooks/use-billing-page.ts`
          : `${root}src/features/billing/use-billing.ts`,
      ],
    };
  }
  if (capability === "messaging") {
    const route = next
      ? `${root}src/app/(app)/messages/page.tsx`
      : `${root}src/routes/messages.tsx`;
    return {
      route: [route],
      adapter:
        database === "convex"
          ? [route]
          : [
              next
                ? `${root}src/app/(app)/messages/hooks/use-messaging.ts`
                : `${root}src/routes/-hooks/use-messaging.ts`,
            ],
    };
  }
  if (capability === "analytics") {
    const provider = `${root}src/components/providers.tsx`;
    return { route: [provider], adapter: [provider] };
  }
  if (capability === "i18n") {
    return {
      route: [next ? `${root}src/app/layout.tsx` : `${root}src/routes/__root.tsx`],
      adapter: [`${root}src/lib/translations.ts`],
    };
  }
  if (capability === "pdf") {
    const route = next ? `${root}src/app/pdf/page.tsx` : `${root}src/routes/pdf.tsx`;
    return {
      route: [route],
      adapter: root ? [route] : [`${root}src/hooks/usePdf.ts`],
    };
  }
  if (capability === "eve") {
    const page = next ? `${root}src/app/agent/page.tsx` : `${root}src/routes/agent.tsx`;
    return { route: [page], adapter: [page] };
  }
  return null;
}

function nativeSurfacePaths(
  root: string,
  target: "expo" | "electron",
  capability: CapabilityId,
  database: "postgres" | "convex" | "none",
): SurfacePaths | null {
  const nativeFeature = (route: string, adapters: readonly string[]): SurfacePaths => {
    const featureBase =
      target === "expo" ? `${root}src/features/${route}` : `${root}src/renderer/features/${route}`;
    return {
      route: [
        target === "expo" ? `${root}app/${route}.tsx` : `${root}src/renderer/routes/${route}.tsx`,
      ],
      adapter: adapters.map((path) => `${featureBase}/${path}`),
    };
  };
  if (capability === "notifications") {
    return nativeFeature("notifications", ["queries.ts", "mutations.ts"]);
  }
  if (capability === "storage") return nativeFeature("storage", ["mutations.ts"]);
  if (capability === "featureFlags") return nativeFeature("feature-flags", ["queries.ts"]);
  if (capability === "jobs") return nativeFeature("jobs", ["queries.ts", "mutations.ts"]);
  if (capability === "messaging" && database !== "none") {
    return target === "expo"
      ? {
          route: [`${root}app/(app)/messages.tsx`],
          adapter: [`${root}src/adapters/messaging/${database}.ts`],
        }
      : {
          route: [`${root}src/renderer/routes/messages.tsx`],
          adapter: [`${root}src/renderer/adapters/messaging/${database}.ts`],
        };
  }
  if (capability === "billing" && target === "expo") {
    return {
      route: [`${root}app/billing.tsx`],
      adapter: [`${root}src/lib/orpc.ts`],
    };
  }
  if (capability === "billing") {
    return {
      route: [`${root}src/renderer/routes/billing.tsx`],
      adapter: [`${root}src/renderer/lib/orpc.ts`],
    };
  }
  if (capability === "auth" && target === "expo") {
    return {
      route: [`${root}app/(auth)/sign-in.tsx`],
      adapter: [`${root}src/lib/auth-client.ts`],
    };
  }
  if (capability === "auth") {
    return {
      route: [`${root}src/renderer/routes/sign-in.tsx`],
      adapter: [`${root}src/renderer/lib/auth.ts`],
    };
  }
  if (capability === "analytics" && target === "expo") {
    const analytics = `${root}src/lib/analytics.tsx`;
    return {
      route: [analytics],
      adapter: [analytics],
    };
  }
  if (capability === "analytics") {
    const analytics = `${root}src/renderer/lib/analytics.tsx`;
    return { route: [analytics], adapter: [analytics] };
  }
  if (capability === "i18n" && target === "expo") {
    const i18n = `${root}src/lib/i18n.tsx`;
    return { route: [i18n], adapter: [i18n] };
  }
  if (capability === "eve" && target === "expo") {
    return {
      route: [`${root}app/agent.tsx`],
      adapter: [`${root}src/lib/eve-client.ts`],
    };
  }
  if (capability === "eve") {
    return {
      route: [`${root}src/renderer/routes/agent.tsx`],
      adapter: [`${root}src/renderer/lib/eve-client.ts`],
    };
  }
  if (capability === "i18n") {
    const i18n = `${root}src/renderer/lib/i18n.tsx`;
    return { route: [i18n], adapter: [i18n] };
  }
  if (capability === "pdf" && target === "expo") {
    return {
      route: [`${root}app/pdf.tsx`],
      adapter: [root ? `${root}src/hooks/usePdf.ts` : "src/hooks/usePdfMobile.ts"],
    };
  }
  if (capability === "pdf") {
    return {
      route: [`${root}src/renderer/routes/pdf.tsx`],
      adapter: [`${root}src/lib/pdf.ts`],
    };
  }
  return null;
}

function surfacePaths(
  config: ResolvedProjectConfig,
  app: ResolvedProjectApp,
  capability: CapabilityId,
): SurfacePaths | null {
  const root = appRoot(config, app);
  if (app.target === "nextjs" || app.target === "tanstack-start") {
    const database = config.backend === false ? "none" : config.backend.database;
    return webSurfacePaths(root, app.target, capability, database);
  }
  const database = config.backend === false ? "none" : config.backend.database;
  return nativeSurfacePaths(root, app.target, capability, database);
}

function appForPath(config: ResolvedProjectConfig, path: string): ResolvedProjectApp | null {
  if (config.mode === "single") {
    const app = config.apps[0];
    if (!app) return null;
    const clientPath =
      path === "package.json" ||
      path.startsWith("app/") ||
      path.startsWith("src/app/") ||
      path.startsWith("src/routes/") ||
      path.startsWith("src/renderer/") ||
      path.startsWith("src/features/") ||
      path.startsWith("src/components/") ||
      path.startsWith("src/hooks/") ||
      path.startsWith("src/lib/") ||
      path === "src/main.ts" ||
      path === "src/preload.ts";
    return clientPath ? app : null;
  }
  return config.apps.find((app) => path.startsWith(appRoot(config, app))) ?? null;
}

function routeAcceptance(
  capability: CapabilityId,
  path: string,
  requiredOperationIds: readonly string[],
): readonly string[] {
  if (capability !== "auth") return requiredOperationIds;
  const passkeyOperations = requiredOperationIds.filter((operation) =>
    operation.startsWith("identity.passkey."),
  );
  if (/(?:^|\/)sign-in(?:\/page)?\.tsx$/.test(path)) {
    return requiredOperationIds.filter(
      (operation) =>
        !operation.startsWith("identity.passkey.") ||
        operation === "identity.passkey.authenticate.v1",
    );
  }
  if (/(?:^|\/)settings(?:\/page)?\.tsx$/.test(path)) {
    return passkeyOperations.filter(
      (operation) => operation !== "identity.passkey.authenticate.v1",
    );
  }
  return [];
}

export function clientFileAttribution(
  config: ResolvedProjectConfig,
  path: string,
): ClientFileAttribution {
  const app = appForPath(config, path);
  if (!app) {
    return {
      appId: null,
      target: null,
      capability: null,
      artifacts: [],
      acceptance: [],
      contribution: [],
    };
  }

  if (path === appManifestPath(config, app)) {
    return {
      appId: app.id,
      target: app.target,
      capability: null,
      artifacts: ["manifest"],
      acceptance: [],
      contribution: [`client-surface.${app.target}.manifest.v1`],
    };
  }

  for (const capability of config.enabledCapabilities) {
    const definition = getCapabilityDefinition(capability);
    if (!definition.clientSurfaceRequired) continue;
    if (capability === "jobs" && !config.capabilities.jobs.userFacingApi) continue;
    const binding = getEffectiveCapabilityClientBinding({
      capability,
      target: app.target,
      database: config.backend === false ? "none" : config.backend.database,
      billingProviders: config.capabilities.billing.providers,
    });
    if (binding.status !== "supported") continue;
    const paths = surfacePaths(config, app, capability);
    if (!paths) continue;
    const route = paths.route.includes(path);
    const adapter = paths.adapter.includes(path);
    if (!route && !adapter) continue;
    const artifacts: ClientSurfaceArtifactKind[] = [];
    if (route) artifacts.push("route", "acceptance");
    if (adapter) artifacts.push("adapter");
    return {
      appId: app.id,
      target: app.target,
      capability,
      artifacts,
      acceptance: route ? routeAcceptance(capability, path, binding.requiredOperationIds) : [],
      contribution: [
        `client-surface.${capability.replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`)}.${app.target}.v1`,
      ],
    };
  }

  return {
    appId: app.id,
    target: app.target,
    capability: null,
    artifacts: [],
    acceptance: [],
    contribution: [],
  };
}
