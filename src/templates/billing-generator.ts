/**
 * Billing package template generator — emits files for generated projects.
 * Refactored <300 line compliance: each provider now modular services.
 *
 * Monorepo: packages/billing/src/providers/interface.ts + interface/* + domain/types.ts + schema/billing.ts + schema/enums + schema/tables/* + index.ts + providers/*.ts + providers/<provider>/*.ts
 * Single:   src/server/billing/... mirrored
 * Framework-aware: detects nextjs vs tanstack-start from addon map. If tanstack-start,
 * webhook routes emit under src/routes/api/webhooks/... (*.ts) with createFileRoute handlers,
 * else under src/app/api/webhooks/.../route.ts with Next.js handlers.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
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
  type BillingProviderName as WebhookProviderName,
} from "./billing/webhooks/factory.js";

import { billingUiFiles } from "./billing/ui/billing-page.js";

type Runtime = "node" | "bun";

const thisFile = fileURLToPath(import.meta.url);
const thisDir = dirname(thisFile);

function resolveTemplateCandidates(rel: string): string[] {
  const clean = rel.replace(/^\.\//, "");
  const list: string[] = [];
  const add = (p: string) => {
    if (!list.includes(p)) list.push(p);
  };

  // Original behavior – works when running from src/templates
  add(join(thisDir, rel));
  add(join(thisDir, clean));
  add(resolve(thisDir, rel));
  add(resolve(thisDir, clean));

  // Bundled case: thisDir = dist, we ship src/**/* in package
  // So ../src/templates/billing/... should exist when installed or local
  add(join(thisDir, "../src/templates", clean));
  add(join(thisDir, "../src/templates", rel));
  add(join(thisDir, "../../src/templates", clean));
  add(join(thisDir, "../../src/templates", rel));

  // When running via bun src/cli.ts from project root
  add(join(process.cwd(), "src/templates", clean));
  add(join(process.cwd(), "src/templates", rel));

  // Resolve relative to this file's absolute location (handles symlink/binary edge)
  add(resolve(thisFile, "../../src/templates", clean));
  add(resolve(thisFile, "../../src/templates", rel));
  add(join(dirname(thisFile), "../../src/templates", clean));

  // Extra safety: parent of thisDir is often package root
  add(resolve(thisDir, "../src/templates", clean));
  add(resolve(thisDir, "../src/templates", rel));

  return list;
}

function findTemplateFile(rel: string): string | null {
  for (const p of resolveTemplateCandidates(rel)) {
    try {
      if (existsSync(p)) return p;
    } catch {
      // ignore permission errors
    }
  }
  return null;
}

function load(rel: string): string {
  const found = findTemplateFile(rel);
  if (!found) {
    const tried = resolveTemplateCandidates(rel).join("\n  - ");
    throw new Error(
      `[ghostinit] billing template not found: ${rel}\n` +
        `Tried:\n  - ${tried}\n` +
        `thisDir=${thisDir}\nthisFile=${thisFile}\ncwd=${process.cwd()}`,
    );
  }
  return readFileSync(found, "utf-8");
}

function tryLoad(rel: string): string | null {
  const found = findTemplateFile(rel);
  if (!found) return null;
  try {
    return readFileSync(found, "utf-8");
  } catch {
    return null;
  }
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

function billingDeps(selected: string[], addonsPresent: boolean): Record<string, string> {
  if (!addonsPresent) {
    return {
      stripe: `^${v.billing.stripe}`,
      "@chargily/chargily-pay": `^${v.billing["@chargily/chargily-pay"]}`,
      "@paddle/paddle-node-sdk": `^${v.billing["@paddle/paddle-node-sdk"]}`,
      "@paddle/paddle-js": `^${v.billing["@paddle/paddle-js"]}`,
      "@polar-sh/sdk": `^${v.billing["@polar-sh/sdk"]}`,
      "@polar-sh/nextjs": `^${v.billing["@polar-sh/nextjs"]}`,
      zod: `^${v.validation.zod}`,
      "drizzle-orm": `^${v.database["drizzle-orm"]}`,
      "@repo/config": "workspace:*",
      "@repo/database": "workspace:*",
    };
  }
  const deps: Record<string, string> = {
    zod: `^${v.validation.zod}`,
    "drizzle-orm": `^${v.database["drizzle-orm"]}`,
    "@repo/config": "workspace:*",
    "@repo/database": "workspace:*",
  };
  const effective = selected.length === 0 ? [...allBillingProviders] : selected;
  if (effective.includes("stripe")) deps.stripe = `^${v.billing.stripe}`;
  if (effective.includes("chargily"))
    deps["@chargily/chargily-pay"] = `^${v.billing["@chargily/chargily-pay"]}`;
  if (effective.includes("paddle")) {
    deps["@paddle/paddle-node-sdk"] = `^${v.billing["@paddle/paddle-node-sdk"]}`;
    deps["@paddle/paddle-js"] = `^${v.billing["@paddle/paddle-js"]}`;
  }
  if (effective.includes("polar")) {
    deps["@polar-sh/sdk"] = `^${v.billing["@polar-sh/sdk"]}`;
    deps["@polar-sh/nextjs"] = `^${v.billing["@polar-sh/nextjs"]}`;
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

/* ------------------------------------------------------------------ */
/* Provider emitter — now modular services <300                      */
/* ------------------------------------------------------------------ */

type ProviderName = "stripe" | "chargily" | "paddle" | "polar";

const PROVIDER_SUBFILES: Record<ProviderName, string[]> = {
  stripe: ["client", "mappers", "checkout", "customer", "portal", "webhook", "subscriptions"],
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

function schemaSplitFiles(mode: ProjectMode): TemplateFile[] {
  const out: TemplateFile[] = [];
  const schemaBase =
    mode === "monorepo" ? "packages/billing/src/schema/" : "src/server/billing/schema/";
  const enumsContent = tryLoad("./billing/schema/enums.ts");
  if (enumsContent) out.push(file(`${schemaBase}enums.ts`, enumsContent));

  const indexContent = tryLoad("./billing/schema/index.ts");
  if (indexContent) out.push(file(`${schemaBase}index.ts`, indexContent));

  const tableFiles = [
    "products",
    "customers",
    "subscriptions",
    "checkouts",
    "invoices",
    "license_keys",
    "usage_events",
    "webhook_events",
  ];
  const tableBase = `${schemaBase}tables/`;
  for (const tf of tableFiles) {
    const rel = `./billing/schema/tables/${tf}.ts`;
    const content = tryLoad(rel);
    if (content) out.push(file(`${tableBase}${tf}.ts`, content));
  }

  if (mode === "single") {
    const dbBase = "src/server/db/schema/";
    if (enumsContent) out.push(file(`${dbBase}enums.ts`, enumsContent));
    if (indexContent) out.push(file(`${dbBase}index.ts`, indexContent));
    for (const tf of tableFiles) {
      const rel = `./billing/schema/tables/${tf}.ts`;
      const content = tryLoad(rel);
      if (content) out.push(file(`${dbBase}tables/${tf}.ts`, content));
    }
  }

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

  // Normalize provider names to BillingProviderName
  const allProviders: ProviderName[] = ["stripe", "chargily", "paddle", "polar"];

  if (isTanstack) {
    // TanStack Start: src/routes/api/webhooks/*.ts or apps/web/src/routes/api/webhooks/*.ts
    for (const name of allProviders) {
      if (!shouldEmitProvider(name, selected, addonsPresent, map)) continue;
      const wf = webhookContent(
        name as WebhookProviderName,
        "tanstack",
        isMonorepo ? "monorepo" : "single",
      );
      out.push(wf);
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
  const explicitNone = addonsPresent && selected.length === 0 && !hasAddon(addons, "billing");
  if (explicitNone) {
    return billingUiFiles({ mode, addons } as never, "bun" as Runtime);
  }
  const interfaceContent = load("./billing/providers/interface.ts");
  const domainContent = load("./billing/domain/types.ts");
  const schemaContent = load("./billing/schema/billing.ts");
  const indexContent = load("./billing/index.ts");

  const files: TemplateFile[] = [];

  if (mode === "monorepo") {
    const deps = billingDeps(selected, addonsPresent);
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
            "./schema/*": "./src/schema/*.ts",
            "./domain/*": "./src/domain/*",
          },
          scripts: codeScripts({ test: runtime === "bun" ? "bun test" : "npm run test:unit" }),
          dependencies: deps,
          devDependencies: {
            ...(runtime === "bun" ? { "bun-types": `^${v.runtime.bun}` } : {}),
            typescript: `^${v.typescript.typescript}`,
          },
        }),
      ),
      file(
        "packages/billing/tsconfig.json",
        tsconfig({
          include: ["src/**/*"],
          compilerOptions: { outDir: "./dist", declaration: true },
        }),
      ),
      file("packages/billing/src/index.ts", indexContent),
      file("packages/billing/src/providers/interface.ts", interfaceContent),
      file("packages/billing/src/domain/types.ts", domainContent),
      file("packages/billing/src/schema/billing.ts", schemaContent),
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
      ...schemaSplitFiles("monorepo"),
      ...providerFiles(selected, addonsPresent, addons, "monorepo"),
      ...webhookRoutes(selected, addonsPresent, addons, "monorepo"),
      ...billingUiFiles({ mode: "monorepo", addons: addons ?? ({} as never) } as never, "bun"),
      file(
        "packages/billing/src/webhooks/README.md",
        `# Billing webhooks — raw body pattern
All 4 need Buffer.from(await req.arrayBuffer()) NOT req.json() else 403.
Idempotent via webhook_events unique(provider+providerEventId).
Framework-aware: Next.js emits app/api/webhooks/*/route.ts, TanStack Start emits routes/api/webhooks/*.ts with createFileRoute server.handlers.
`,
      ),
    );
  } else {
    files.push(
      file("src/server/billing/providers/interface.ts", interfaceContent),
      file("src/server/billing/domain/types.ts", domainContent),
      file("src/server/billing/schema/billing.ts", schemaContent),
      file("src/server/billing/index.ts", indexContent),
      file("src/server/db/schema/billing.ts", schemaContent),
      file(
        "src/server/billing/NOTE.md",
        `Single mode modular billing <300 — providers split into services:
stripe/: client,mappers,checkout,customer,portal,webhook,subscriptions
chargily/, paddle/, polar/ similar. Interface split into interface/types,inputs,ports.
Schema split into enums + tables/* + index.ts barrel.
Webhook routes: Next.js src/app/api/webhooks/*/route.ts vs TanStack Start src/routes/api/webhooks/*.ts
`,
      ),
      ...interfaceSplitFiles("single"),
      ...schemaSplitFiles("single"),
      ...providerFiles(selected, addonsPresent, addons, "single"),
      ...webhookRoutes(selected, addonsPresent, addons, "single"),
      ...billingUiFiles({ mode: "single", addons: addons ?? ({} as never) } as never, "bun"),
    );
  }

  files.sort((a, b) => a.path.localeCompare(b.path));
  return files;
}

export const billingPackage = billingFiles;
export const billingTemplateFiles = billingFiles;
