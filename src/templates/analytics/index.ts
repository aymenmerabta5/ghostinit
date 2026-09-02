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

type AnalyticsFramework = "nextjs" | "tanstack-start";

function tanstackProxyServerContent(mode: ProjectMode): string {
  return `import "server-only";\n${c
    .proxyRouteContent(mode)
    .replace('import { NextRequest, NextResponse } from "next/server";\n', "")
    .replaceAll("NextRequest", "Request")
    .replaceAll("NextResponse", "Response")}`;
}

function tanstackProxyRouteContent(route: "/api/ingest" | "/api/ingest/$"): string {
  return `import { createServerOnlyFn } from "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";

const dispatchAnalyticsGet = createServerOnlyFn(async (request: Request): Promise<Response> => {
  const { GET } = await import("@/server/http/analytics-ingest.server");
  return await GET(request);
});

const dispatchAnalyticsPost = createServerOnlyFn(async (request: Request): Promise<Response> => {
  const { POST } = await import("@/server/http/analytics-ingest.server");
  return await POST(request);
});

const dispatchAnalyticsOptions = createServerOnlyFn(
  async (request: Request): Promise<Response> => {
    const { OPTIONS } = await import("@/server/http/analytics-ingest.server");
    return await OPTIONS(request);
  },
);

export const Route = createFileRoute("${route}")({
  server: {
    handlers: {
      GET: ({ request }: { request: Request }) => dispatchAnalyticsGet(request),
      POST: ({ request }: { request: Request }) => dispatchAnalyticsPost(request),
      OPTIONS: ({ request }: { request: Request }) => dispatchAnalyticsOptions(request),
    },
  },
});
`;
}

function proxyRouteFiles(mode: ProjectMode, framework: AnalyticsFramework): TemplateFile[] {
  const base = mode === "monorepo" ? "apps/web/src" : "src";
  const scope = mode === "monorepo" ? "monorepo" : "single";
  if (framework === "tanstack-start") {
    return [
      file(`${base}/routes/api/ingest.ts`, tanstackProxyRouteContent("/api/ingest")),
      file(`${base}/routes/api/ingest/$.ts`, tanstackProxyRouteContent("/api/ingest/$")),
      file(`${base}/server/http/analytics-ingest.server.ts`, tanstackProxyServerContent(scope)),
    ];
  }
  return [
    file(`${base}/app/api/ingest/route.ts`, c.proxyRouteContent(scope)),
    file(`${base}/app/api/ingest/[...path]/route.ts`, c.proxyCatchAllRouteContent(scope)),
  ];
}

/** Router peer differs per framework — see routerBinding in ./pageview.ts. */
function clientPeerDependencies(framework: AnalyticsFramework): Record<string, string> {
  const base = { react: `^${v.nextStack.react}` };
  return framework === "tanstack-start"
    ? { ...base, "@tanstack/react-router": `^${v.tanstackStart["@tanstack/react-router"]}` }
    : { ...base, next: `^${v.nextStack.next}` };
}

function monorepoList(
  _mode: ProjectMode,
  runtime: Runtime,
  testCmd: string,
  framework: AnalyticsFramework,
): TemplateFile[] {
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
          lint: "oxlint --deny-warnings .",
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
          "@base-ui/react": `^${v.ui["@base-ui/react"]}`,
          "posthog-js": `^${jsVer}`,
          "posthog-node": `^${nodeVer}`,
          "server-only": `^${v.runtime["server-only"]}`,
          zod: `^${zodVer}`,
          "@repo/config": "workspace:*",
          "@repo/observability": "workspace:*",
        },
        // src/client/*.tsx are React client components, and the pageview tracker
        // binds to the host router (next/navigation or @tanstack/react-router).
        // Declared as peers so the consuming app supplies the single copy.
        peerDependencies: clientPeerDependencies(framework),
        devDependencies: {
          "@types/node": `^${v.runtime["@types/node"]}`,
          // Needed for the client components; react itself is a peer dependency.
          "@types/react": `^${v.nextStack["@types/react"]}`,
          typescript: `^${v.typescript.typescript}`,
          ...(runtime === "bun" ? { "bun-types": `^${v.runtime.bun}` } : {}),
          oxlint: `^${v.tooling.oxlint}`,
          oxfmt: `^${v.tooling.oxfmt}`,
        },
      }),
    ),
    // The default barrel is deliberately environment-neutral. Server runtime
    // coverage runs separately with the react-server condition and an explicit
    // inert test environment; neither compromise is applied to client tests.
    file(
      "packages/analytics/tests/barrel.test.ts",
      `import { describe, it, expect } from "bun:test";
import * as mod from "../src/index.js";

describe("@repo/analytics barrel", () => {
  it("loads the environment-neutral public API", () => {
    expect(typeof mod.createEvent).toBe("function");
    expect(typeof mod.createMockPostHogClient).toBe("function");
    expect("getAnalyticsConfig" in mod).toBe(false);
  });
});
`,
    ),
    file(
      "packages/analytics/tests/server-barrel.test.ts",
      `import { describe, expect, it } from "bun:test";
import * as server from "../src/server/index.js";

describe("@repo/analytics/server barrel", () => {
  it("loads with a test-only validated server environment", () => {
    expect(typeof server.getAnalyticsConfig).toBe("function");
    expect(server.isAnalyticsEnabled()).toBe(false);
  });
});
`,
    ),
    file(
      "packages/analytics/tsconfig.json",
      // src/client/*.tsx are React components, and the package typechecks
      // @repo/config's source (which uses `process`) through the @repo/* path map.
      tsconfig({
        compilerOptions: { types: ["node", "react"], jsx: "react-jsx" },
        include: ["src/**/*"],
      }),
    ),
    file("packages/analytics/src/index.ts", c.monorepoRootIndexContent()),
    file("packages/analytics/src/config.ts", c.configContent("monorepo")),
    file("packages/analytics/src/types.ts", c.typesContent("monorepo")),
    file("packages/analytics/src/shared/index.ts", c.monorepoSharedBarrel()),
    file("packages/analytics/src/shared/events.ts", c.sharedEventsContent("monorepo")),
    file("packages/analytics/src/shared/properties.ts", c.sharedPropertiesContent("monorepo")),
    file("packages/analytics/src/shared/consent.ts", c.sharedConsentContent("monorepo")),
    file("packages/analytics/src/client/index.ts", c.monorepoClientIndexContent()),
    file("packages/analytics/src/client/config.ts", c.clientConfigContent("monorepo", framework)),
    file(
      "packages/analytics/src/client/posthog-client.ts",
      c.clientPosthogClientContent("monorepo"),
    ),
    file("packages/analytics/src/client/context.tsx", c.postHogContextContent()),
    file("packages/analytics/src/client/provider.tsx", c.clientProviderContent("monorepo")),
    file(
      "packages/analytics/src/client/pageview.tsx",
      c.clientPageViewContent("monorepo", framework),
    ),
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
    ...proxyRouteFiles("monorepo", framework),
    file("apps/web/src/components/analytics/README.md", c.webComponentsAnalyticsReadme()),
  ];
}

function singleList(_mode: ProjectMode, framework: AnalyticsFramework): TemplateFile[] {
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
    file("src/lib/analytics-config.ts", c.clientConfigContent("single", framework)),
    file("src/lib/analytics.ts", c.singleLibAnalyticsContent()),
    file("src/components/analytics/posthog-context.tsx", c.postHogContextContent()),
    file("src/components/analytics/posthog-hooks.ts", c.singleComponentsHooksContent()),
    file("src/components/analytics/posthog-provider.tsx", c.singleComponentsProviderContent()),
    file("src/components/analytics/posthog-pageview.tsx", c.singlePageViewContent(framework)),
    file("src/components/analytics/feature-flag-gate.tsx", c.singleFeatureFlagGateContent()),
    file("src/components/analytics/index.ts", c.singleComponentsIndexContent()),
    file("src/hooks/use-analytics.ts", c.singleHooksContent()),
    ...proxyRouteFiles("single", framework),
  ];
}

/** Framework defaults to nextjs — normalizeTemplateArgs does not carry it. */
function readFramework(
  modeOrOpts?: ProjectMode | string | Record<string, unknown>,
): AnalyticsFramework {
  if (modeOrOpts && typeof modeOrOpts === "object") {
    const fw = (modeOrOpts as Record<string, unknown>).framework;
    if (fw === "tanstack-start") return "tanstack-start";
  }
  return "nextjs";
}

export function analyticsFiles(
  modeOrOpts?: ProjectMode | string | Record<string, unknown>,
  runtimeOrAddons?: Runtime | string | AddonInstallerMap | Record<string, unknown>,
  maybeAddons?: AddonInstallerMap | Record<string, unknown>,
): TemplateFile[] {
  const { mode, runtime } = normalizeTemplateArgs(modeOrOpts, runtimeOrAddons, maybeAddons);
  const testCmd =
    "bun test tests/barrel.test.ts && bun --conditions=react-server test --preload ../../scripts/test-env.ts tests/server-barrel.test.ts";
  const framework = readFramework(modeOrOpts);
  const files =
    mode === "monorepo"
      ? monorepoList(mode, runtime, testCmd, framework)
      : singleList(mode, framework);
  files.sort((a, b) => a.path.localeCompare(b.path));
  return mergeFiles(files);
}

export const analyticsPackage = analyticsFiles;
export const analyticsTemplateFiles = analyticsFiles;
export default analyticsFiles;
