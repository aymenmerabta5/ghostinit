import {
  file,
  packageJson,
  tsconfig,
  normalizeTemplateArgs,
  mergeFiles,
  type TemplateFile,
} from "../shared.js";
import type { AddonInstallerMap, ProjectMode } from "../../lib/addons.js";
import * as v from "../versions.js";
import * as c from "./all.js";

type Runtime = "node" | "bun";
const jsVer = v.analytics["posthog-js"];
const nodeVer = v.analytics["posthog-node"];
const zodVer = v.validation.zod;

function monorepoList(_mode: ProjectMode, runtime: Runtime, testCmd: string): TemplateFile[] {
  return [
    file(
      "packages/analytics/package.json",
      packageJson({
        name: "@repo/analytics",
        type: "module",
        scripts: {
          test: testCmd,
          "test:unit": testCmd,
          typecheck: "tsc --noEmit",
          lint: "oxlint .",
          format: "oxfmt --write .",
          "format:check": "oxfmt --check .",
        },
        exports: {
          ".": "./src/index.ts",
          "./client": "./src/client/index.ts",
          "./server": "./src/server/index.ts",
          "./shared": "./src/shared/index.ts",
          "./testing": "./src/testing/mocks.ts",
          "./proxy": "./src/proxy/README.md",
        },
        dependencies: {
          "posthog-js": `^${jsVer}`,
          "posthog-node": `^${nodeVer}`,
          zod: `^${zodVer}`,
          "@repo/config": "workspace:*",
          "@repo/observability": "workspace:*",
        },
        devDependencies: {
          "@types/node": `^${v.runtime["@types/node"]}`,
          typescript: `^${v.typescript.typescript}`,
          ...(runtime === "bun" ? { "bun-types": `^${v.runtime.bun}` } : {}),
          oxlint: `^${v.tooling.oxlint}`,
          oxfmt: `^${v.tooling.oxfmt}`,
        },
      }),
    ),
    file("packages/analytics/tsconfig.json", tsconfig({ include: ["src/**/*"] })),
    file("packages/analytics/src/index.ts", c.monorepoRootIndexContent()),
    file("packages/analytics/src/config.ts", c.configContent("monorepo")),
    file("packages/analytics/src/types.ts", c.typesContent("monorepo")),
    file("packages/analytics/src/shared/index.ts", c.monorepoSharedBarrel()),
    file("packages/analytics/src/shared/events.ts", c.sharedEventsContent("monorepo")),
    file("packages/analytics/src/shared/properties.ts", c.sharedPropertiesContent("monorepo")),
    file("packages/analytics/src/shared/consent.ts", c.sharedConsentContent("monorepo")),
    file("packages/analytics/src/client/index.ts", c.monorepoClientIndexContent()),
    file(
      "packages/analytics/src/client/posthog-client.ts",
      c.clientPosthogClientContent("monorepo"),
    ),
    file("packages/analytics/src/client/provider.tsx", c.clientProviderContent("monorepo")),
    file("packages/analytics/src/client/pageview.tsx", c.clientPageViewContent("monorepo")),
    file("packages/analytics/src/client/hooks.ts", c.clientHooksContent("monorepo")),
    file("packages/analytics/src/client/components.tsx", c.clientComponentsContent("monorepo")),
    file("packages/analytics/src/server/index.ts", c.monorepoServerIndexContent()),
    file(
      "packages/analytics/src/server/posthog-server.ts",
      c.serverPosthogServerContent("monorepo"),
    ),
    file("packages/analytics/src/server/utils.ts", c.serverUtilsContent("monorepo")),
    file("packages/analytics/src/server/bootstrap.ts", c.serverBootstrapContent("monorepo")),
    file("packages/analytics/src/integrations/auth.ts", c.integrationsAuthContent("monorepo")),
    file(
      "packages/analytics/src/integrations/billing.ts",
      c.integrationsBillingContent("monorepo"),
    ),
    file("packages/analytics/src/testing/mocks.ts", c.testingMocksContent("monorepo")),
    file("packages/analytics/src/proxy/README.md", c.proxyReadmeContent()),
    file("apps/web/src/app/api/ingest/route.ts", c.proxyRouteContent("monorepo")),
    file("apps/web/src/app/api/ingest/[...path]/route.ts", c.proxyCatchAllRouteContent("monorepo")),
    file("apps/web/src/components/analytics/README.md", c.webComponentsAnalyticsReadme()),
  ];
}

function singleList(_mode: ProjectMode): TemplateFile[] {
  return [
    file("src/server/analytics/config.ts", c.configContent("single")),
    file("src/server/analytics/types.ts", c.typesContent("single")),
    file("src/server/analytics/shared/events.ts", c.sharedEventsContent("single")),
    file("src/server/analytics/shared/properties.ts", c.sharedPropertiesContent("single")),
    file("src/server/analytics/shared/consent.ts", c.sharedConsentContent("single")),
    file("src/server/analytics/posthog-server.ts", c.serverPosthogServerContent("single")),
    file("src/server/analytics/utils.ts", c.serverUtilsContent("single")),
    file("src/server/analytics/bootstrap.ts", c.serverBootstrapContent("single")),
    file("src/server/analytics/index.ts", c.singleRootIndexContent()),
    file("src/server/analytics/testing/mocks.ts", c.testingMocksContent("single")),
    file("src/server/analytics/integrations/auth.ts", c.integrationsAuthContent("single")),
    file("src/server/analytics/integrations/billing.ts", c.integrationsBillingContent("single")),
    file("src/lib/analytics.ts", c.singleLibAnalyticsContent()),
    file("src/components/analytics/posthog-provider.tsx", c.singleComponentsProviderContent()),
    file("src/components/analytics/posthog-pageview.tsx", c.singlePageViewContent()),
    file("src/components/analytics/feature-flag-gate.tsx", c.singleFeatureFlagGateContent()),
    file("src/components/analytics/index.ts", c.singleComponentsIndexContent()),
    file("src/hooks/use-analytics.ts", c.singleHooksContent()),
    file("src/app/api/ingest/route.ts", c.proxyRouteContent("single")),
    file("src/app/api/ingest/[...path]/route.ts", c.proxyCatchAllRouteContent("single")),
  ];
}

export function analyticsFiles(
  modeOrOpts?: ProjectMode | string | Record<string, unknown>,
  runtimeOrAddons?: Runtime | string | AddonInstallerMap | Record<string, unknown>,
  maybeAddons?: AddonInstallerMap | Record<string, unknown>,
): TemplateFile[] {
  const { mode, runtime } = normalizeTemplateArgs(modeOrOpts, runtimeOrAddons, maybeAddons);
  const testCmd = runtime === "bun" ? "bun test" : "npm run test:unit";
  const files = mode === "monorepo" ? monorepoList(mode, runtime, testCmd) : singleList(mode);
  files.sort((a, b) => a.path.localeCompare(b.path));
  return mergeFiles(files);
}

export const analyticsPackage = analyticsFiles;
export const analyticsTemplateFiles = analyticsFiles;
export default analyticsFiles;
