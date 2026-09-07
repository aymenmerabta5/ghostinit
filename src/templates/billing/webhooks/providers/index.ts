/**
 * Webhook providers factory — composes webhook route content from provider fragments.
 *
 * SSOT: BillingProviderName and BILLING_PROVIDER_NAMES derived from
 * providers/interface/types.ts (template) which mirrors BILLING_PROVIDERS
 * from src/lib/constants.ts (CLI). Adding 5th provider:
 *   - add folder src/templates/billing/providers/<name>/ with core files
 *   - update BILLING_PROVIDER_NAMES in providers/interface/types.ts
 *   - add src/templates/billing/webhooks/<name>.ts or providers/<name>.ts
 *   - register in contentFor switch + contentMap if needed
 *   - loop registry in allWebhookFiles already uses SSOT
 *   - tests/unit/billing-barrel.test.ts validates fs matches SSOT
 *
 * Codegen note: shared/env/billing.ts billingEnvLines() loops over BILLING_PROVIDERS
 * for env vars — same loop pattern could generate webhook barrel, but test safety-net
 * is sufficient vs full codegen.
 */

import { file, type TemplateFile } from "../../../shared.js";
import { BILLING_PROVIDER_NAMES } from "../../providers/interface/types.js";
import {
  getDbImports,
  getPath,
  convexApiImport,
  type WebhookFramework,
  type WebhookMode,
  type DbImports,
  type ConvexImports,
  type BillingProviderName,
} from "./shared.js";
import { stripeNextContent, stripeTanstackContent } from "./stripe.js";
import { chargilyNextContent, chargilyTanstackContent } from "./chargily.js";
import { paddleNextContent, paddleTanstackContent } from "./paddle.js";
import { polarNextContent, polarTanstackContent } from "./polar.js";

// Registry of framework-pair contents — explicit map keyed by provider.
// For a new provider, add here + add files in ./<name>.ts or ./polar.ts shim style.
// Could be loop-generated, but explicit switch keeps <300 and type-safe.
type ContentGenerators = {
  next: (imp: DbImports) => string;
  tanstack: (imp: DbImports) => string;
};

const providerContentMap: Record<BillingProviderName, ContentGenerators | undefined> = {
  stripe: { next: stripeNextContent, tanstack: stripeTanstackContent },
  chargily: { next: chargilyNextContent, tanstack: chargilyTanstackContent },
  paddle: { next: paddleNextContent, tanstack: paddleTanstackContent },
  polar: { next: polarNextContent, tanstack: polarTanstackContent },
} as Record<BillingProviderName, ContentGenerators | undefined>;

export type DatabaseProvider = "postgres" | "convex" | "none";

function resolveIsConvexDatabase(database?: DatabaseProvider | string): boolean {
  return database === "convex";
}

export function webhookContent(
  provider: BillingProviderName,
  framework: WebhookFramework,
  mode: WebhookMode = "monorepo",
  database: DatabaseProvider | string = "postgres",
  emittedPath?: string,
): TemplateFile {
  const effectiveMode: WebhookMode = framework === "single" ? "single" : mode;
  const effectiveFramework: WebhookFramework = framework === "single" ? "next" : framework;
  const isMonorepo = effectiveMode === "monorepo";
  const imp = getDbImports(isMonorepo);
  const path = emittedPath ?? getPath(provider, effectiveFramework, effectiveMode);
  const isConvex = resolveIsConvexDatabase(database as DatabaseProvider);
  const content = contentFor(provider, effectiveFramework, imp, isConvex, isMonorepo, path);
  return file(path, content);
}

function tanstackWebhookServerPath(provider: BillingProviderName, mode: WebhookMode): string {
  const root = mode === "monorepo" ? "apps/web/" : "";
  return `${root}src/server/http/webhooks/${provider}.server.ts`;
}

function tanstackWebhookRouteContent(provider: BillingProviderName): string {
  return `import { createServerOnlyFn } from "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";

const dispatchWebhook = createServerOnlyFn(
  async (context: { request: Request }): Promise<Response> => {
    const { POST } = await import("@/server/http/webhooks/${provider}.server");
    return await POST(context);
  },
);

export const Route = createFileRoute("/api/webhooks/${provider}")({
  server: {
    handlers: {
      POST: (context) => dispatchWebhook(context),
    },
  },
});
`;
}

function tanstackWebhookServerContent(content: string, provider: BillingProviderName): string {
  const routeImport = 'import { createFileRoute } from "@tanstack/react-router";\n';
  const routeRegistration = `export const Route = createFileRoute("/api/webhooks/${provider}")({ server: { handlers: { POST } } });`;
  if (!content.startsWith(routeImport) || !content.includes(routeRegistration)) {
    throw new Error(`Unable to split the ${provider} TanStack webhook server implementation`);
  }
  const server = content
    .slice(routeImport.length)
    .replace(routeRegistration, "")
    .replace("async function POST(", "export async function POST(");
  if (!server.includes("export async function POST(")) {
    throw new Error(`The ${provider} TanStack webhook has no server POST handler`);
  }
  return `import "server-only";\n${server.trim()}\n`;
}

/** Production route files; TanStack handlers live outside the client-discovered route tree. */
export function webhookRouteFiles(
  provider: BillingProviderName,
  framework: WebhookFramework,
  mode: WebhookMode = "monorepo",
  database: DatabaseProvider | string = "postgres",
): TemplateFile[] {
  if (framework !== "tanstack") return [webhookContent(provider, framework, mode, database)];
  const routePath = getPath(provider, framework, mode);
  const serverPath = tanstackWebhookServerPath(provider, mode);
  const isMonorepo = mode === "monorepo";
  const imp = getDbImports(isMonorepo);
  const serverSource = contentFor(
    provider,
    framework,
    imp,
    resolveIsConvexDatabase(database),
    isMonorepo,
    serverPath,
  );
  return [
    file(routePath, tanstackWebhookRouteContent(provider)),
    file(serverPath, tanstackWebhookServerContent(serverSource, provider)),
  ];
}

type ConvexContentGenerators = ContentGenerators & {
  nextConvex?: (imp: ConvexImports) => string;
  tanstackConvex?: (imp: ConvexImports) => string;
};

function contentFor(
  provider: BillingProviderName,
  framework: WebhookFramework,
  imp: DbImports,
  isConvex = false,
  isMonorepo = true,
  routePath = "",
): string {
  const isTanstack = framework === "tanstack";
  const entry = providerContentMap[provider] as ConvexContentGenerators | undefined;
  if (!entry) return "";
  if (isConvex) {
    // convexApi is resolved from the route's own path so provider fragments
    // never hardcode a `../../` depth — see convexApiImport in ./shared.ts.
    const convexImp: ConvexImports = {
      ...imp,
      isConvex: true,
      isMonorepo,
      convexApi: convexApiImport(routePath),
    };
    if (isTanstack && entry.tanstackConvex) {
      return entry.tanstackConvex(convexImp);
    }
    if (!isTanstack && entry.nextConvex) {
      return entry.nextConvex(convexImp);
    }
    // Fallback: providers themselves check imp.isConvex flag (e.g., stripeNextContent branches)
    const fallback = isTanstack ? entry.tanstack : entry.next;
    return fallback(convexImp);
  }
  return isTanstack ? entry.tanstack(imp) : entry.next(imp);
}

export function webhookFilesForProvider(
  provider: BillingProviderName,
  mode: WebhookMode = "monorepo",
  frameworks: WebhookFramework[] = ["next", "tanstack"],
): TemplateFile[] {
  return frameworks.map((fw) => webhookContent(provider, fw, mode));
}

export function allWebhookFiles(
  mode: WebhookMode = "monorepo",
  frameworks: WebhookFramework[] = ["next", "tanstack"],
): TemplateFile[] {
  // SSOT loop — mirrors billing/index.ts loadBillingRegistry pattern
  const providers: BillingProviderName[] = [...BILLING_PROVIDER_NAMES] as BillingProviderName[];
  const out: TemplateFile[] = [];
  for (const p of providers) {
    for (const fw of frameworks) {
      out.push(webhookContent(p, fw, mode));
    }
  }
  return out;
}

export function webhookFilesFiltered(
  selected: BillingProviderName[],
  mode: WebhookMode,
  framework: WebhookFramework,
): TemplateFile[] {
  return selected.map((p) => webhookContent(p, framework, mode));
}

export type { BillingProviderName, WebhookFramework, WebhookMode } from "./shared.js";
export { BILLING_PROVIDER_NAMES } from "../../providers/interface/types.js";
