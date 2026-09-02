// @allow-long 556: orchestrates all four providers x monorepo/single x drizzle/convex; splitting further would scatter the provider-selection logic that must stay in one place
/**
 * Billing package template generator — emits files for generated projects.
 * Refactored <300 line compliance: each provider now modular services.
 *
 * Monorepo: provider/domain sources plus a database-aware package barrel;
 * Postgres additionally gets the database-owned schema re-export.
 * Single: src/server/billing/... mirrored; Postgres owns schema definitions
 * under src/server/db/schema while Convex emits no Drizzle surface.
 * Framework-aware: detects nextjs vs tanstack-start from addon map. If tanstack-start,
 * webhook routes emit under src/routes/api/webhooks/... (*.ts) with createFileRoute handlers,
 * else under src/app/api/webhooks/.../route.ts with Next.js handlers.
 */

import {
  codeScripts,
  file,
  packageJson,
  tsconfig,
  normalizeTemplateArgs,
  type TemplateFile,
} from "./shared.js";
import * as v from "./versions.js";
import type { AddonInstallerMap, ProjectMode, FrameworkName } from "../lib/addons.js";
import { billingProviders as allBillingProviders, hasAddon } from "../lib/addons.js";

import {
  webhookContent,
  webhookRouteFiles,
  type BillingProviderName as WebhookProviderName,
} from "./billing/webhooks/factory.js";

import { billingUiFiles } from "./billing/ui/billing-page.js";
import { convexApiImport } from "./billing/webhooks/providers/shared.js";
import { convexBillingIndexContent } from "./billing/convex-index.js";
import { billingApplicationsFiles } from "./billing/applications/billing.js";
// Shared multi-root template resolver. This file used to carry a private
// near-verbatim copy, which meant host-only pragmas were not stripped here.
import { loadTemplate as load, tryLoadTemplate as tryLoad } from "./template-loader.js";

type Runtime = "node" | "bun";
type ProviderName = (typeof allBillingProviders)[number];

function convexAdapterContent(databaseImport: string, adapterPath: string): string {
  return `import { convexClient } from "${databaseImport}";
import { api } from "${convexApiImport(adapterPath)}";

type BillingServerOperation = "claimWebhookEvent" | "completeWebhookEvent" | "failWebhookEvent" | "claimCheckoutIntent" | "completeCheckoutIntent" | "upsertCustomer" | "upsertSubscription" | "updateSubscriptionStatus" | "claimProviderSubscriptionState" | "commitProviderSubscriptionState" | "cancelProviderSubscriptionState" | "createProviderSubscriptionState" | "upsertCheckout" | "upsertInvoice" | "recordUsageEvent" | "upsertProduct" | "upsertPrice";

function trustedServerToken(): string {
  const token = process.env.BETTER_AUTH_SECRET;
  if (!token || token.length < 32 || token.startsWith("REPLACE_WITH")) {
    throw new Error("BETTER_AUTH_SECRET is required for trusted billing mutations");
  }
  return token;
}

function mutate(operation: BillingServerOperation, input: Record<string, unknown>): Promise<unknown> {
  return convexClient.action(api.billingServer.mutate, {
    serverToken: trustedServerToken(),
    operation,
    input,
  });
}

export const billingConvex = {
  claimWebhookEvent: (input: Record<string, unknown>) => mutate("claimWebhookEvent", input),
  completeWebhookEvent: (input: Record<string, unknown>) => mutate("completeWebhookEvent", input),
  failWebhookEvent: (input: Record<string, unknown>) => mutate("failWebhookEvent", input),
  upsertCustomer: (input: Record<string, unknown>) => mutate("upsertCustomer", input),
  upsertSubscription: (input: Record<string, unknown>) => mutate("upsertSubscription", input),
  updateSubscriptionStatus: (input: Record<string, unknown>) => mutate("updateSubscriptionStatus", input),
  claimProviderSubscriptionState: (input: Record<string, unknown>) => mutate("claimProviderSubscriptionState", input),
  commitProviderSubscriptionState: (input: Record<string, unknown>) => mutate("commitProviderSubscriptionState", input),
  cancelProviderSubscriptionState: (input: Record<string, unknown>) => mutate("cancelProviderSubscriptionState", input),
  createProviderSubscriptionState: (input: Record<string, unknown>) => mutate("createProviderSubscriptionState", input),
  upsertCheckout: (input: Record<string, unknown>) => mutate("upsertCheckout", input),
  upsertInvoice: (input: Record<string, unknown>) => mutate("upsertInvoice", input),
  insertUsageEvent: (input: Record<string, unknown>) => mutate("recordUsageEvent", input),
  upsertProduct: (input: Record<string, unknown>) => mutate("upsertProduct", input),
  upsertPrice: (input: Record<string, unknown>) => mutate("upsertPrice", input),
};

export type BillingConvex = typeof billingConvex;
`;
}

function selectedBilling(map?: AddonInstallerMap): string[] {
  if (!map) return [...allBillingProviders];
  const sel: string[] = [];
  for (const p of allBillingProviders) {
    if (hasAddon(map, p)) sel.push(p);
  }
  if (hasAddon(map, "billing") && sel.length === 0) {
    return [...allBillingProviders];
  }
  return sel;
}

function detectFramework(
  map?: AddonInstallerMap | Record<string, { inUse: boolean }>,
): FrameworkName {
  if (!map) return "nextjs";
  if (hasAddon(map as AddonInstallerMap | undefined, "tanstack-start")) return "tanstack-start";
  if (hasAddon(map as AddonInstallerMap | undefined, "nextjs")) return "nextjs";
  // Also check if map has explicit framework field? addon map doesn't, but config framework passed via map detection in modes
  // Default to nextjs for backward compat
  return "nextjs";
}

function billingDeps(
  selected: string[],
  addonsPresent: boolean,
  addonMap?: AddonInstallerMap,
): Record<string, string> {
  const isConvex = Boolean(addonMap && hasAddon(addonMap, "convex"));
  const baseNonConvex = {
    // Stripe's TypeScript surface pins one LatestApiVersion literal per SDK
    // release. Exact pinning prevents a future minor from invalidating the
    // generated explicit apiVersion at install time.
    stripe: v.billing.stripe,
    "@chargily/chargily-pay": `^${v.billing["@chargily/chargily-pay"]}`,
    "@paddle/paddle-node-sdk": `^${v.billing["@paddle/paddle-node-sdk"]}`,
    "@paddle/paddle-js": `^${v.billing["@paddle/paddle-js"]}`,
    "@polar-sh/sdk": `^${v.billing["@polar-sh/sdk"]}`,
    zod: `^${v.validation.zod}`,
    "@repo/config": "workspace:*",
    "@repo/database": "workspace:*",
  };

  if (!addonsPresent) {
    return isConvex
      ? {
          ...baseNonConvex,
          convex: `^${v.convex.convex}`,
        }
      : {
          ...baseNonConvex,
          "drizzle-orm": `^${v.database["drizzle-orm"]}`,
        };
  }

  const deps: Record<string, string> = {
    zod: `^${v.validation.zod}`,
    "@repo/config": "workspace:*",
    "@repo/database": "workspace:*",
  };

  if (isConvex) {
    deps.convex = `^${v.convex.convex}`;
  } else {
    deps["drizzle-orm"] = `^${v.database["drizzle-orm"]}`;
  }

  const effective = selected.length === 0 ? [...allBillingProviders] : selected;
  if (effective.includes("stripe")) deps.stripe = v.billing.stripe;
  if (effective.includes("chargily"))
    deps["@chargily/chargily-pay"] = `^${v.billing["@chargily/chargily-pay"]}`;
  if (effective.includes("paddle")) {
    deps["@paddle/paddle-node-sdk"] = `^${v.billing["@paddle/paddle-node-sdk"]}`;
    deps["@paddle/paddle-js"] = `^${v.billing["@paddle/paddle-js"]}`;
  }
  if (effective.includes("polar")) {
    deps["@polar-sh/sdk"] = `^${v.billing["@polar-sh/sdk"]}`;
  }
  return deps;
}

function shouldEmitProvider(
  provider: string,
  selected: string[],
  addonsPresent: boolean,
  map?: AddonInstallerMap,
): boolean {
  if (!addonsPresent) return true;
  if (selected.length === 0) {
    const legacy = hasAddon(map, "billing");
    return Boolean(legacy);
  }
  return selected.includes(provider);
}

const PROVIDER_FACTORY_EXPORTS: Record<ProviderName, string> = {
  stripe: "createStripeProvider",
  chargily: "createChargilyProvider",
  paddle: "createPaddleProvider",
  polar: "createPolarProvider",
};

function providerRegistryContent(selected: readonly string[]): string {
  const selectedSet = new Set(selected);
  const loaderEntries = allBillingProviders
    .filter((provider) => selectedSet.has(provider))
    .map(
      (provider) =>
        `  ${provider}: async () => (await import("./providers/${provider}")).${PROVIDER_FACTORY_EXPORTS[provider]},`,
    )
    .join("\n");
  return `type BillingProviderLoader = () => Promise<BillingProviderFactory>;

const billingProviderLoaders: Partial<Record<BillingProviderName, BillingProviderLoader>> = {
${loaderEntries}
};

let registryCache: BillingProviderRegistry | null = null;

export async function loadBillingRegistry(): Promise<BillingProviderRegistry> {
  if (registryCache) return registryCache;
  const registry: BillingProviderRegistry = {};
  for (const provider of BILLING_PROVIDER_NAMES) {
    const loadProvider = billingProviderLoaders[provider];
    if (loadProvider) registry[provider] = await loadProvider();
  }
  registryCache = registry;
  return registry;
}

`;
}

/** Replace both the current source map and the pre-build embedded legacy loop. */
function withSelectedProviderRegistry(indexTemplate: string, selected: readonly string[]): string {
  const possibleStarts = [
    indexTemplate.indexOf("type BillingProviderLoader ="),
    indexTemplate.indexOf("let _registry: BillingProviderRegistry"),
    indexTemplate.indexOf("let registryCache: BillingProviderRegistry"),
  ].filter((index) => index >= 0);
  const start = possibleStarts.length > 0 ? Math.min(...possibleStarts) : -1;
  const end = indexTemplate.indexOf("export async function getBillingProvider", start);
  if (start < 0 || end < 0) {
    throw new Error("Billing index provider registry markers are missing");
  }
  return `${indexTemplate.slice(0, start)}${providerRegistryContent(selected)}${indexTemplate.slice(end)}`;
}

/* ------------------------------------------------------------------ */
/* Provider emitter — now modular services <300                      */
/* ------------------------------------------------------------------ */

const PROVIDER_SUBFILES: Record<ProviderName, string[]> = {
  stripe: [
    "api-version",
    "client",
    "mappers",
    "checkout",
    "customer",
    "portal",
    "webhook",
    "subscriptions",
  ],
  chargily: [
    "client",
    "product",
    "payment-link",
    "customer",
    "checkout",
    "operations",
    "webhook",
    "subscriptions",
  ],
  paddle: ["client", "mappers", "checkout", "customer", "portal", "webhook", "subscriptions"],
  polar: [
    "types",
    "sdk-loader",
    "mappers",
    "client",
    "checkout",
    "customer",
    "portal",
    "webhook",
    "subscriptions",
    "license",
    "usage",
    "constants",
  ],
};

function providerFiles(
  selected: string[],
  addonsPresent: boolean,
  map: AddonInstallerMap | undefined,
  mode: ProjectMode,
): TemplateFile[] {
  const out: TemplateFile[] = [];
  const base =
    mode === "monorepo" ? "packages/billing/src/providers/" : "src/server/billing/providers/";
  const candidates: { name: ProviderName; file: string }[] = [
    { name: "stripe", file: "./billing/providers/stripe.ts" },
    { name: "chargily", file: "./billing/providers/chargily.ts" },
    { name: "paddle", file: "./billing/providers/paddle.ts" },
    { name: "polar", file: "./billing/providers/polar.ts" },
  ];
  for (const { name, file: rel } of candidates) {
    if (!shouldEmitProvider(name, selected, addonsPresent, map)) continue;
    const content = tryLoad(rel);
    if (!content) continue;
    out.push(file(`${base}${name}.ts`, content));

    // Emit modular subfiles for <300 compliance
    const subfiles = PROVIDER_SUBFILES[name] ?? [];
    for (const sf of subfiles) {
      const subRel = `./billing/providers/${name}/${sf}.ts`;
      const subContent = tryLoad(subRel);
      if (!subContent) continue;
      out.push(file(`${base}${name}/${sf}.ts`, subContent));
    }
  }
  return out;
}

function interfaceSplitFiles(mode: ProjectMode): TemplateFile[] {
  const base =
    mode === "monorepo"
      ? "packages/billing/src/providers/interface/"
      : "src/server/billing/providers/interface/";
  const files: TemplateFile[] = [];
  const subfiles = ["types", "inputs", "ports"];
  for (const sf of subfiles) {
    const rel = `./billing/providers/interface/${sf}.ts`;
    const content = tryLoad(rel);
    if (content) files.push(file(`${base}${sf}.ts`, content));
  }
  return files;
}

/** Table modules that make up the billing schema, one pgTable file each. */
const BILLING_TABLE_FILES = [
  "products",
  "customers",
  "subscriptions",
  "checkouts",
  "invoices",
  "license_keys",
  "usage_events",
  "webhook_events",
] as const;

/** Every symbol the billing schema surface re-exports, in emission order. */
const BILLING_SCHEMA_EXPORTS = [
  "billingProviderEnum",
  "subscriptionStatusEnum",
  "checkoutStatusEnum",
  "invoiceStatusEnum",
  "licenseKeyStatusEnum",
  "recurringIntervalEnum",
  "products",
  "prices",
  "productRelations",
  "priceRelations",
  "customers",
  "customerRelations",
  "subscriptions",
  "subscriptionRelations",
  "checkouts",
  "checkoutRelations",
  "invoices",
  "invoiceRelations",
  "license_keys",
  "licenseKeyRelations",
  "usage_events",
  "webhook_events",
] as const;

/**
 * The Postgres billing schema surface, as re-exports from the database layer.
 *
 * The tables used to be emitted TWICE — a byte-identical copy under both
 * `packages/database/src/schema/` and `packages/billing/src/schema/` (20 files).
 * Two independent `pgTable` graphs describing the same physical tables is a
 * drift trap: editing one silently diverges from the other, and drizzle-kit can
 * see both.
 *
 * The old justification was avoiding a `database -> billing -> database` cycle,
 * but no such cycle is possible in Postgres projects: `@repo/billing` depends on
 * `@repo/database` (see billingPackageJson), never the reverse. So the database
 * layer owns the definitions and billing re-exports them — which is also the
 * correct direction under the layered architecture, where billing (Capabilities)
 * may import database (Supporting) but not the other way around.
 */
function schemaSplitFiles(mode: ProjectMode): TemplateFile[] {
  const out: TemplateFile[] = [];
  const schemaBase =
    mode === "monorepo" ? "packages/billing/src/schema/" : "src/server/billing/schema/";
  // Monorepo resolves through the workspace alias; single mode is a relative
  // hop from src/server/billing/schema/ up to src/server/db/schema/.
  const dbSpecifier = mode === "monorepo" ? "@repo/database/schema" : "../../db/schema/billing";

  // In single mode there is no @repo/database package, so the real definitions
  // are emitted here under src/server/db/schema/. In monorepo mode database.ts
  // owns them; emitting a second copy is what this whole change removes.
  if (mode === "single") {
    const dbBase = "src/server/db/schema/";
    const enums = tryLoad("./billing/schema/enums.ts");
    if (enums) out.push(file(`${dbBase}enums.ts`, enums));
    const index = tryLoad("./billing/schema/index.ts");
    if (index) out.push(file(`${dbBase}index.ts`, index));
    for (const table of BILLING_TABLE_FILES) {
      const content = tryLoad(`./billing/schema/tables/${table}.ts`);
      if (content) out.push(file(`${dbBase}tables/${table}.ts`, content));
    }
  }

  const header = `/**
 * Billing schema surface.
 *
 * These tables are DEFINED in the database layer and re-exported here so billing
 * code can import them from one place. Do not redeclare them — a second pgTable
 * for the same physical table drifts from the first and confuses drizzle-kit.
 */
`;
  const reexport = `${header}export {\n${BILLING_SCHEMA_EXPORTS.map((s) => `  ${s},`).join("\n")}\n} from "${dbSpecifier}";\n`;

  out.push(
    file(`${schemaBase}index.ts`, reexport),
    // Kept because packages/billing/src/index.ts imports "./schema/billing.js".
    file(`${schemaBase}billing.ts`, reexport),
  );
  return out;
}

/* ------------------------------------------------------------------ */
/* Framework-aware webhook route generation — now delegates to factory*/
/* Single source of truth: src/templates/billing/webhooks/factory.ts  */
/* Fixes optional chaining swallowing, ensures Buffer.from pattern    */
/* ------------------------------------------------------------------ */

function webhookRoutes(
  selected: string[],
  addonsPresent: boolean,
  map: AddonInstallerMap | undefined,
  mode: ProjectMode,
): TemplateFile[] {
  const out: TemplateFile[] = [];
  const framework = detectFramework(map);
  const isMonorepo = mode === "monorepo";
  const isTanstack = framework === "tanstack-start";
  const isConvex = Boolean(map && hasAddon(map, "convex"));
  const database = isConvex ? "convex" : "postgres";

  // Normalize provider names to BillingProviderName
  const allProviders: ProviderName[] = ["stripe", "chargily", "paddle", "polar"];

  if (isTanstack) {
    // TanStack Start: src/routes/api/webhooks/*.ts or apps/web/src/routes/api/webhooks/*.ts
    for (const name of allProviders) {
      if (!shouldEmitProvider(name, selected, addonsPresent, map)) continue;
      const webhookFiles = webhookRouteFiles(
        name as WebhookProviderName,
        "tanstack",
        isMonorepo ? "monorepo" : "single",
        database,
      );
      out.push(...webhookFiles);
    }
    return out;
  }

  // Next.js: src/app/api/webhooks/*/route.ts (monorepo vs single)
  for (const name of allProviders) {
    if (!shouldEmitProvider(name, selected, addonsPresent, map)) continue;
    const wf = webhookContent(
      name as WebhookProviderName,
      "next",
      isMonorepo ? "monorepo" : "single",
      database,
    );
    out.push(wf);
  }
  return out;
}

export function billingFiles(
  modeOrOpts?: ProjectMode | string | Record<string, unknown>,
  runtimeOrAddons?: Runtime | string | AddonInstallerMap | Record<string, unknown>,
  maybeAddons?: AddonInstallerMap | Record<string, unknown>,
): TemplateFile[] {
  const { mode, runtime, addons } = normalizeTemplateArgs(modeOrOpts, runtimeOrAddons, maybeAddons);
  const selected = selectedBilling(addons);
  const addonsPresent = addons !== undefined;
  // Framework drives provider webhook and UI placement. Billing application
  // traffic itself is exposed only through the typed oRPC router.
  const billingFramework = detectFramework(addons);
  const explicitNone = addonsPresent && selected.length === 0 && !hasAddon(addons, "billing");
  if (explicitNone) {
    // TanStack Start owns its typed `/billing` file route in the app composer.
    // Emitting the Next-only UI template here would leak `src/app/billing/**`
    // into a Vite/TanStack project even when no provider was selected.
    return billingFramework === "tanstack-start"
      ? []
      : billingUiFiles({ mode, addons } as never, "bun" as Runtime);
  }
  const interfaceContent = load("./billing/providers/interface.ts");
  const domainContent = load("./billing/domain/types.ts");
  const isConvex = Boolean(addons && hasAddon(addons, "convex"));
  // The self-contained barrel: defines customerRelations and re-exports
  // ./enums + ./tables/*. billing.ts would instead re-export customerRelations
  // from "./index", which only resolves by accident depending on what else got
  // emitted next to it — see the same note in database.ts.
  const schemaContent = load("./billing/schema/index.ts");
  const indexTemplate = isConvex ? convexBillingIndexContent() : load("./billing/index.ts");
  const indexContent = withSelectedProviderRegistry(indexTemplate, selected);

  const files: TemplateFile[] = [];

  function billingConvexAdapterFiles(): TemplateFile[] {
    if (!isConvex) return [];
    // convex/ is emitted at the project root in both modes — derive the depth from
    // the adapter's own path rather than hardcoding it (both are 4 dirs deep).
    const monorepoAdapterPath = "packages/billing/src/adapters/convex.ts";
    const singleAdapterPath = "src/server/billing/adapters/convex.ts";
    const adapterContent = convexAdapterContent("@repo/database", monorepoAdapterPath);
    const singleAdapterContent = convexAdapterContent("@/server/db", singleAdapterPath);

    if (mode === "monorepo") {
      return [
        file(monorepoAdapterPath, adapterContent),
        file("packages/billing/src/adapters/index.ts", `export * from "./convex.js";`),
      ];
    } else {
      return [
        file(singleAdapterPath, singleAdapterContent),
        file("src/server/billing/adapters/index.ts", `export * from "./convex.js";`),
      ];
    }
  }

  if (mode === "monorepo") {
    const deps = billingDeps(selected, addonsPresent, addons);
    files.push(
      file(
        "packages/billing/package.json",
        packageJson({
          name: "@repo/billing",
          version: v.ghostinitVersion,
          type: "module",
          exports: {
            ".": "./src/index.ts",
            "./*": "./src/*/index.ts",
            "./providers/*": "./src/providers/*.ts",
            ...(!isConvex ? { "./schema/*": "./src/schema/*.ts" } : {}),
            "./domain/*": "./src/domain/*",
          },
          scripts: codeScripts({ test: "bun test" }),
          dependencies: deps,
          devDependencies: {
            // tsconfig declares types: ["node"] — must be depended on or TS2688.
            "@types/node": `^${v.runtime["@types/node"]}`,
            ...(runtime === "bun" ? { "bun-types": `^${v.runtime.bun}` } : {}),
            typescript: `^${v.typescript.typescript}`,
          },
        }),
      ),
      // A real assertion, not a placeholder: this package declared a `test` script
      // with zero test files, so `bun test` exited 1 ("No tests found!") and
      // `turbo run test` was red on every freshly generated project. Importing the
      // barrel also catches the broken re-export class of bug.
      file(
        "packages/billing/tests/barrel.test.ts",
        `import { describe, it, expect } from "bun:test";
import * as mod from "../src/index.js";

describe("@repo/billing barrel", () => {
  it("loads and exposes its public API", () => {
    expect(Array.isArray(mod.BILLING_PROVIDER_NAMES)).toBe(true);
  });
});
`,
      ),
      file(
        "packages/billing/tsconfig.json",
        tsconfig({
          include: ["src/**/*"],
          // rootDir must be explicit alongside declaration output (TS5011 on TS6).
          compilerOptions: {
            types: ["node"],
            outDir: "./dist",
            rootDir: "./src",
            declaration: true,
          },
        }),
      ),
      file("packages/billing/src/index.ts", indexContent),
      file("packages/billing/src/providers/interface.ts", interfaceContent),
      file("packages/billing/src/domain/types.ts", domainContent),
      file(
        "packages/billing/src/providers/README.md",
        `# Billing providers - modular <300
See interface.ts port contract. Each provider now split into services:
- stripe/: client, mappers, checkout, customer, portal, webhook, subscriptions + barrel stripe.ts
- chargily/: client, product, payment-link, customer, checkout, operations, webhook, subscriptions
- paddle/: client, mappers, checkout, customer, portal, webhook, subscriptions
- polar/: types, sdk-loader, mappers, client, checkout, customer, portal, webhook, subscriptions, license, usage, constants
All webhooks Buffer.from(await req.arrayBuffer()) NOT req.json()
`,
      ),
      ...interfaceSplitFiles("monorepo"),
      ...(!isConvex ? schemaSplitFiles("monorepo") : []),
      ...providerFiles(selected, addonsPresent, addons, "monorepo"),
      ...webhookRoutes(selected, addonsPresent, addons, "monorepo"),
      ...billingConvexAdapterFiles(),
      ...(billingFramework === "tanstack-start"
        ? []
        : billingUiFiles({ mode: "monorepo", addons: addons ?? ({} as never) } as never, "bun")),
      file(
        "packages/billing/src/webhooks/README.md",
        `# Billing webhooks — raw body pattern
All 4 need Buffer.from(await req.arrayBuffer()) NOT req.json() else 403.
Idempotent via webhook_events unique(provider+providerEventId).
Framework-aware: Next.js emits app/api/webhooks/*/route.ts, TanStack Start emits routes/api/webhooks/*.ts with createFileRoute server.handlers.
Convex: public routes call api.billingServer.mutate; that trusted action delegates to internal.billing.* with leased composite idempotency [provider, providerEventId].
`,
      ),
    );
  } else {
    files.push(
      file("src/server/billing/providers/interface.ts", interfaceContent),
      file("src/server/billing/domain/types.ts", domainContent),
      file("src/server/billing/index.ts", indexContent),
      ...(isConvex ? [] : [file("src/server/db/schema/billing.ts", schemaContent)]),
      file(
        "src/server/billing/NOTE.md",
        `Single mode modular billing <300 — providers split into services:
stripe/: client,mappers,checkout,customer,portal,webhook,subscriptions
chargily/, paddle/, polar/ similar. Interface split into interface/types,inputs,ports.
Schema split into enums + tables/* + index.ts barrel.
Webhook routes: Next.js src/app/api/webhooks/*/route.ts vs TanStack Start src/routes/api/webhooks/*.ts
Convex: billing mutations go through the token-authenticated api.billingServer.mutate action; public reads stay actor-scoped api.billing queries.
`,
      ),
      ...interfaceSplitFiles("single"),
      ...(isConvex ? [] : schemaSplitFiles("single")),
      ...providerFiles(selected, addonsPresent, addons, "single"),
      ...webhookRoutes(selected, addonsPresent, addons, "single"),
      ...billingConvexAdapterFiles(),
      ...billingApplicationsFiles("single"),
      ...(billingFramework === "tanstack-start"
        ? []
        : billingUiFiles({ mode: "single", addons: addons ?? ({} as never) } as never, "bun")),
    );
  }

  files.sort((a, b) => a.path.localeCompare(b.path));
  return files;
}

export const billingPackage = billingFiles;
export const billingTemplateFiles = billingFiles;
