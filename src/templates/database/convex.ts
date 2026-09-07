// @allow-long 320: one renderer keeps the Convex deployment, client, health probe, and schema package coherent
import { codeScripts, file, packageJson, tsconfig, type TemplateFile } from "../shared.js";
import { convexSchemaContent } from "./convex/schema.js";
import { convexAuthContent } from "./convex/auth.js";
import { convexAuthEmailContent } from "./convex/auth-email.js";
import { convexHttpContent } from "./convex/http.js";
import { convexLibAuthContent } from "./convex/lib.js";
import { convexPostsContent } from "./convex/posts.js";
import { convexUsersContent } from "./convex/users.js";
import { convexBillingContent } from "./convex/billing.js";
import { convexBillingServerContent } from "./convex/billing-server.js";
import { convexGeneratedBootstrapFiles } from "./convex/generated.js";
import * as v from "../versions.js";
import type { ProjectMode } from "../../lib/addons.js";

type Runtime = "node" | "bun";

export interface ConvexDatabaseFeatures {
  auth?: boolean;
  billing?: boolean;
  email?: boolean;
  i18n?: boolean;
  mobile?: boolean;
  posts?: boolean;
}

export function convexStartDatabaseFiles(_projectName: string): TemplateFile[] {
  return [
    file(
      "start-database.sh",
      [
        "#!/usr/bin/env bash",
        "set -euo pipefail",
        "",
        "# start-database.sh — Convex variant (no Postgres required)",
        'echo "[ghostinit] Convex mode — no local Postgres required."',
        'echo "  1) Set CONVEX_DEPLOYMENT and CONVEX_URL / NEXT_PUBLIC_CONVEX_URL in .env.local"',
        'echo "  2) Run: bunx --no-install convex dev"',
        'echo "  3) Schema lives in convex/schema.ts — edited and pushed via convex dev"',
        'echo "  4) Deploy: bunx --no-install convex deploy"',
        'echo ""',
        'echo "Convex dashboard: https://dashboard.convex.dev"',
        "exit 0",
      ].join("\n"),
    ),
  ];
}

export function convexDatabaseFiles(
  _projectName: string,
  runtime: Runtime,
  mode: ProjectMode,
  features: ConvexDatabaseFeatures = {},
): TemplateFile[] {
  void _projectName;
  void runtime;
  const hasAuth = features.auth ?? true;
  const hasBilling = features.billing ?? true;
  const hasEmail = features.email ?? true;
  const hasI18n = features.i18n ?? false;
  const hasMobile = features.mobile ?? false;
  const hasPosts = hasAuth && (features.posts ?? true);

  // ------------------------------------------------------------------
  // convex/schema.ts — hardened, composite indexes, tight validators
  // ------------------------------------------------------------------
  const schemaContent = convexSchemaContent({
    auth: hasAuth,
    billing: hasBilling,
    posts: hasPosts,
  });

  const authConfigContent = [
    'import type { AuthConfig } from "convex/server";',
    'import { getAuthConfigProvider } from "@convex-dev/better-auth/auth-config";',
    "",
    "// Convex auth config — Better Auth adapter",
    "// Requires CONVEX_SITE_URL + SITE_URL env to be set. No insecure fallback.",
    "export default {",
    "  providers: [getAuthConfigProvider()],",
    "} satisfies AuthConfig;",
    "",
  ].join("\n");

  const convexConfigContent = [
    'import { defineApp } from "convex/server";',
    ...(hasAuth ? ['import betterAuth from "@convex-dev/better-auth/convex.config";'] : []),
    "",
    "const app = defineApp();",
    ...(hasAuth ? ["app.use(betterAuth);"] : []),
    "",
    "export default app;",
    "",
  ].join("\n");

  const authTsContent = hasAuth ? convexAuthContent(mode, hasEmail, hasI18n, hasMobile) : "";

  const authAdapterContent = [
    'import { createApi } from "@convex-dev/better-auth";',
    'import { createAuthOptions } from "./auth";',
    'import schema from "./schema";',
    "",
    "// SECURITY: These are internalMutation/internalQuery under the hood (via createApi).",
    "// Do NOT expose as public query/mutation — auth bypass risk if exposed publicly.",
    "// They are used only by authComponent.adapter(ctx) internally.",
    "export const {",
    "  create,",
    "  findOne,",
    "  findMany,",
    "  updateOne,",
    "  updateMany,",
    "  deleteOne,",
    "  deleteMany,",
    "} = createApi(schema, createAuthOptions);",
    "",
  ].join("\n");

  const httpRouterContent = convexHttpContent(hasAuth);

  const libAuthContent = hasAuth ? convexLibAuthContent() : "";

  const postsContent = hasPosts ? convexPostsContent() : "";

  const usersContent = hasAuth ? convexUsersContent() : "";

  const billingContent = hasBilling ? convexBillingContent() : "";

  const healthContent = [
    'import { query } from "./_generated/server";',
    "",
    "// Public and data-free: invoking this function proves that the configured",
    "// deployment accepted and executed a query. The package client applies a",
    "// strict timeout and validates this response before reporting healthy.",
    "export const check = query({",
    "  args: {},",
    "  handler: () => ({ ok: true, timestamp: Date.now() }),",
    "});",
    "",
  ].join("\n");

  const convexJsonContent = JSON.stringify(
    { functions: "convex/", generateCommonJSApi: false },
    null,
    2,
  );

  const pkgJson = packageJson({
    name: "@repo/database",
    exports: { ".": "./src/index.ts" },
    scripts: { ...codeScripts() },
    dependencies: {
      convex: `^${v.convex.convex}`,
      ...(hasAuth
        ? {
            "@convex-dev/better-auth": `^${v.convex["@convex-dev/better-auth"]}`,
            "better-auth": `^${v.auth["better-auth"]}`,
          }
        : {}),
      "@repo/config": "workspace:*",
    },
    devDependencies: {
      // tsconfig declares types: ["node"] — the dependency must exist or TS2688.
      "@types/node": `^${v.runtime["@types/node"]}`,
      typescript: `^${v.typescript.typescript}`,
    },
  });

  const tsconfigContent = tsconfig({
    include: ["src/**/*"],
    // types/rootDir explicit: consumers typecheck @repo/config's source (which uses
    // `process`) under their own options, and TS6 raises TS5011 without rootDir.
    compilerOptions: {
      types: ["node"],
      outDir: "./dist",
      rootDir: "./src",
      declaration: true,
    },
  });

  // ------------------------------------------------------------------
  // packages/database/src/index.ts — real ConvexHttpClient only, no Proxy stubs
  // ------------------------------------------------------------------
  const dbIndexContent = [
    'import { ConvexHttpClient } from "convex/browser";',
    'import { makeFunctionReference } from "convex/server";',
    'import { env } from "@repo/config/server";',
    "",
    "function resolveConvexUrl(): string {",
    "  const url = env.CONVEX_URL;",
    '  if (!url || url.startsWith("REPLACE_WITH")) {',
    '    throw new Error("[@repo/database] CONVEX_URL is not set. Run bunx convex dev and update the server environment.");',
    "  }",
    '  if (!url.startsWith("http")) {',
    "    throw new Error(`[@repo/database] Invalid CONVEX_URL: ${url}. Must start with https://`);",
    "  }",
    "  return url;",
    "}",
    "",
    "const url = resolveConvexUrl();",
    "export const convexClient = new ConvexHttpClient(url);",
    "",
    "export function getConvexClient(): ConvexHttpClient {",
    "  return convexClient;",
    "}",
    "",
    "export type ConvexClient = ConvexHttpClient;",
    "",
    'const deploymentHealthQuery = makeFunctionReference<"query", Record<string, never>, unknown>("health:check");',
    "const HEALTH_CHECK_TIMEOUT_MS = 5_000;",
    "",
    "async function withinHealthDeadline<T>(operation: Promise<T>): Promise<T> {",
    "  let timeout: ReturnType<typeof setTimeout> | undefined;",
    "  const deadline = new Promise<never>((_resolve, reject) => {",
    '    timeout = setTimeout(() => reject(new Error("Convex health query timed out")), HEALTH_CHECK_TIMEOUT_MS);',
    "  });",
    "  try {",
    "    return await Promise.race([operation, deadline]);",
    "  } finally {",
    "    if (timeout !== undefined) clearTimeout(timeout);",
    "  }",
    "}",
    "",
    "function isDeploymentHealthy(value: unknown): boolean {",
    '  if (!value || typeof value !== "object") return false;',
    '  const timestamp = Reflect.get(value, "timestamp");',
    '  return Reflect.get(value, "ok") === true && typeof timestamp === "number" && Number.isFinite(timestamp);',
    "}",
    "",
    "export async function healthCheck(): Promise<{ ok: boolean; url: string; timestamp: number }> {",
    "  try {",
    "    const result = await withinHealthDeadline(convexClient.query(deploymentHealthQuery, {}));",
    "    return { ok: isDeploymentHealthy(result), url, timestamp: Date.now() };",
    "  } catch {",
    "    return { ok: false, url, timestamp: Date.now() };",
    "  }",
    "}",
    "",
    "// Canonical schema lives in convex/schema.ts — not in this package.",
    '// This package previously emitted fake tables like { id: "users" } masking type errors;',
    "// those stubs have been removed. Use convexClient.query(api.*) instead of db.query.",
    "// For backwards compat, we re-export empty schema barrel with explicit deprecation notice.",
    'export * from "./schema/index.js";',
    "",
  ].join("\n");

  const schemaIndexContent = [
    "// In Convex mode canonical schema is convex/schema.ts",
    "// This barrel previously re-exported fake any tables masking runtime errors.",
    "// Now it exports nothing — use convexClient.query(api.*) and convex/schema.ts validators.",
    "// If you need drizzle types, switch database to postgres.",
    "export {};",
    "",
  ].join("\n");

  const schemaAuthContent = [
    "// Auth tables live in convex/schema.ts for Convex mode.",
    '// Previous stub exported { id: "users" } as unknown as string, masking type errors while runtime returned null.',
    "// Removed — use convexClient.query(api.users.me) and authComponent.getAuthUser.",
    "export {};",
    "",
  ].join("\n");

  const schemaBillingContent = [
    "// Billing tables live in convex/schema.ts for Convex mode.",
    '// Previous stub exported fake objects { id: "products" } with any type.',
    "// Removed — trusted server writes use api.billingServer.mutate, which delegates to internal.billing.*.",
    "// Postgres: db.query.webhook_events with unique(provider, providerEventId)",
    "// Convex: uses by_provider_event composite index + a leased claim/complete/fail protocol.",
    "export {};",
    "",
  ].join("\n");

  const schemaPostsContent = [
    "// Posts table lives in convex/schema.ts",
    '// Previous stub: export const posts: any = { id: "posts" } — runtime did nothing.',
    "// Now use convexClient.query(api.posts.list) / mutation(api.posts.create) with auth guard.",
    "export {};",
    "",
  ].join("\n");

  const schemaEnumsContent = [
    "// Enums are v.union(v.literal(...)) in Convex mode, not pgEnum.",
    "// Tight validators defined in convex/schema.ts and convex/billing.ts:",
    "// billingProvider, subscriptionStatus, checkoutStatus, invoiceStatus, licenseKeyStatus, recurringInterval",
    "// Previous file exported any enumValues masking validation — removed.",
    "export {};",
    "",
  ].join("\n");

  return [
    file("convex/schema.ts", schemaContent),
    file("convex/convex.config.ts", convexConfigContent),
    file("convex/health.ts", healthContent),
    file("convex/http.ts", httpRouterContent),
    ...(hasAuth
      ? [
          file("convex/auth.config.ts", authConfigContent),
          file("convex/auth.ts", authTsContent),
          file("convex/auth.adapter.ts", authAdapterContent),
          ...(hasEmail ? [file("convex/authEmail.ts", convexAuthEmailContent(hasI18n))] : []),
          file("convex/lib/auth.ts", libAuthContent),
          file("convex/users.ts", usersContent),
        ]
      : []),
    ...(hasPosts ? [file("convex/posts.ts", postsContent)] : []),
    ...(hasBilling ? [file("convex/billing.ts", billingContent)] : []),
    ...(hasBilling ? [file("convex/billingServer.ts", convexBillingServerContent())] : []),
    ...convexGeneratedBootstrapFiles(),
    file("convex.json", `${convexJsonContent}\n`),
    file("packages/database/package.json", pkgJson),
    file("packages/database/tsconfig.json", tsconfigContent),
    file("packages/database/src/index.ts", dbIndexContent),
    file("packages/database/src/schema/index.ts", schemaIndexContent),
    ...(hasAuth ? [file("packages/database/src/schema/auth.ts", schemaAuthContent)] : []),
    ...(hasBilling
      ? [
          file("packages/database/src/schema/billing.ts", schemaBillingContent),
          file("packages/database/src/schema/enums.ts", schemaEnumsContent),
        ]
      : []),
    ...(hasPosts ? [file("packages/database/src/schema/posts.ts", schemaPostsContent)] : []),
  ];
}
