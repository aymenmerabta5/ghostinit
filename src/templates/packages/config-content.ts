export type ConfigDatabase = "postgres" | "convex" | "none";

export interface ServerEnvTemplateOptions {
  database: ConfigDatabase;
  hasEmail: boolean;
  hasCache: boolean;
  hasNotifications: boolean;
  hasEve?: boolean;
}

const WEB_PUBLIC_NAMES = [
  "APP_URL",
  "API_URL",
  "STRIPE_PUBLISHABLE_KEY",
  "PADDLE_CLIENT_TOKEN",
  "PADDLE_ENVIRONMENT",
  "POSTHOG_KEY",
  "POSTHOG_HOST",
  "POSTHOG_SESSION_RECORDING",
  "POSTHOG_AUTOCAPTURE",
  "ANALYTICS_DISABLED",
  "WS_URL",
] as const;

export const NEXT_PUBLIC_CLIENT_VARS = [
  `    NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),`,
  `    NEXT_PUBLIC_API_URL: z.string().url().optional(),`,
  `    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().min(1).default("pk_test_REPLACE"),`,
  `    NEXT_PUBLIC_PADDLE_CLIENT_TOKEN: z.string().min(1).default("pdl_ntf_REPLACE"),`,
  `    NEXT_PUBLIC_PADDLE_ENVIRONMENT: z.enum(["sandbox","production"]).default("sandbox"),`,
  `    NEXT_PUBLIC_POSTHOG_KEY: z.string().min(1).default("phc_REPLACE_WITH_POSTHOG_KEY"),`,
  `    NEXT_PUBLIC_POSTHOG_HOST: z.string().min(1).default("/ingest"),`,
  `    NEXT_PUBLIC_POSTHOG_SESSION_RECORDING: z.enum(["true","false"]).default("false"),`,
  `    NEXT_PUBLIC_POSTHOG_AUTOCAPTURE: z.enum(["true","false"]).default("true"),`,
  `    NEXT_PUBLIC_ANALYTICS_DISABLED: z.enum(["true","false"]).default("false"),`,
  `    NEXT_PUBLIC_WS_URL: z.string().url().optional(),`,
].join("\n");

export const VITE_CLIENT_VARS = [
  `    VITE_APP_URL: z.string().url().default("http://localhost:3000"),`,
  `    VITE_API_URL: z.string().url().optional(),`,
  `    VITE_STRIPE_PUBLISHABLE_KEY: z.string().min(1).default("pk_test_REPLACE"),`,
  `    VITE_PADDLE_CLIENT_TOKEN: z.string().min(1).default("pdl_ntf_REPLACE"),`,
  `    VITE_PADDLE_ENVIRONMENT: z.enum(["sandbox","production"]).default("sandbox"),`,
  `    VITE_POSTHOG_KEY: z.string().min(1).default("phc_REPLACE_WITH_POSTHOG_KEY"),`,
  `    VITE_POSTHOG_HOST: z.string().min(1).default("/ingest"),`,
  `    VITE_POSTHOG_SESSION_RECORDING: z.enum(["true","false"]).default("false"),`,
  `    VITE_POSTHOG_AUTOCAPTURE: z.enum(["true","false"]).default("true"),`,
  `    VITE_ANALYTICS_DISABLED: z.enum(["true","false"]).default("false"),`,
  `    VITE_WS_URL: z.string().url().optional(),`,
].join("\n");

export const EXPO_CLIENT_VARS = [
  `    EXPO_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),`,
  `    EXPO_PUBLIC_API_URL: z.string().url().optional(),`,
  `    EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().min(1).default("pk_test_REPLACE"),`,
  `    EXPO_PUBLIC_PADDLE_CLIENT_TOKEN: z.string().min(1).optional(),`,
  `    EXPO_PUBLIC_PADDLE_ENVIRONMENT: z.enum(["sandbox","production"]).default("sandbox"),`,
  `    EXPO_PUBLIC_POSTHOG_KEY: z.string().min(1).optional(),`,
  `    EXPO_PUBLIC_POSTHOG_HOST: z.string().min(1).optional(),`,
  `    EXPO_PUBLIC_POSTHOG_SESSION_RECORDING: z.enum(["true","false"]).default("false"),`,
  `    EXPO_PUBLIC_POSTHOG_AUTOCAPTURE: z.enum(["true","false"]).default("true"),`,
  `    EXPO_PUBLIC_ANALYTICS_DISABLED: z.enum(["true","false"]).default("false"),`,
  `    EXPO_PUBLIC_WS_URL: z.string().url().optional(),`,
].join("\n");

export function clientRuntimeEnvLines(
  prefix: "NEXT_PUBLIC_" | "VITE_" | "EXPO_PUBLIC_",
  source: "process.env" | "viteEnv" = "process.env",
): string {
  const names =
    prefix === "EXPO_PUBLIC_"
      ? [
          "APP_URL",
          "API_URL",
          "STRIPE_PUBLISHABLE_KEY",
          "PADDLE_CLIENT_TOKEN",
          "PADDLE_ENVIRONMENT",
          "POSTHOG_KEY",
          "POSTHOG_HOST",
          "POSTHOG_SESSION_RECORDING",
          "POSTHOG_AUTOCAPTURE",
          "ANALYTICS_DISABLED",
          "WS_URL",
        ]
      : WEB_PUBLIC_NAMES;
  return names.map((name) => `    ${prefix}${name}: ${source}.${prefix}${name},`).join("\n");
}

export const EXPO_CLIENT_RUNTIME = clientRuntimeEnvLines("EXPO_PUBLIC_");

function publicEnvContent(runtime: "next" | "vite" | "expo", isConvex: boolean): string {
  const isNext = runtime === "next";
  const prefix = isNext ? "NEXT_PUBLIC_" : runtime === "vite" ? "VITE_" : "EXPO_PUBLIC_";
  const packageName = isNext ? "@t3-oss/env-nextjs" : "@t3-oss/env-core";
  const clientVars =
    runtime === "next"
      ? NEXT_PUBLIC_CLIENT_VARS
      : runtime === "vite"
        ? VITE_CLIENT_VARS
        : EXPO_CLIENT_VARS;
  const convexVar = isConvex ? `\n    ${prefix}CONVEX_URL: z.string().url(),` : "";
  const source = runtime === "vite" ? "viteEnv" : "process.env";
  const runtimeLines = clientRuntimeEnvLines(prefix, source);
  const convexRuntime = isConvex ? `\n    ${prefix}CONVEX_URL: ${source}.${prefix}CONVEX_URL,` : "";
  const prefixLine = isNext ? "" : `  clientPrefix: "${prefix}",\n`;
  const vitePrelude =
    runtime === "vite"
      ? `type ViteImportMeta = ImportMeta & {
  readonly env: {
    readonly DEV?: boolean;
${WEB_PUBLIC_NAMES.map((name) => `    readonly VITE_${name}?: string;`).join("\n")}${isConvex ? "\n    readonly VITE_CONVEX_URL?: string;" : ""}
  };
};

const viteEnv = (import.meta as ViteImportMeta).env;

`
      : "";
  const developmentExpression =
    runtime === "vite" ? "viteEnv.DEV === true" : 'process.env.NODE_ENV !== "production"';
  const typeName =
    runtime === "next" ? "NextPublicEnv" : runtime === "vite" ? "VitePublicEnv" : "ExpoPublicEnv";

  return `import { createEnv } from "${packageName}";
import { z } from "zod";

${vitePrelude}export const env = createEnv({
${prefixLine}  client: {
${clientVars}${convexVar}
  },
  runtimeEnv: {
${runtimeLines}${convexRuntime}
  },
});

export const isDevelopment = ${developmentExpression};
export type ${typeName} = typeof env;
`;
}

export function nextPublicEnvContent(isConvex: boolean): string {
  return publicEnvContent("next", isConvex);
}

export function vitePublicEnvContent(isConvex: boolean): string {
  return publicEnvContent("vite", isConvex);
}

export function expoPublicEnvContent(isConvex: boolean): string {
  return publicEnvContent("expo", isConvex);
}

/**
 * Electron's privileged main process is a client of the generated web API, not
 * an application server. Keep its runtime configuration deliberately separate
 * from the server schema so packaged applications never require (or encourage
 * bundling) database credentials, auth secrets, or provider keys.
 */
export function desktopMainEnvContent(): string {
  return `const DEFAULT_DESKTOP_API_URL = "http://localhost:3000";

export interface DesktopMainEnv {
  readonly DESKTOP_API_URL: string;
}

export interface DesktopMainEnvOptions {
  readonly embeddedApiUrl?: string;
  readonly isPackaged: boolean;
}

function configuredDesktopApiUrl(
  environment: Readonly<Record<string, string | undefined>>,
  options: DesktopMainEnvOptions,
): string {
  const runtimeOverride = environment.DESKTOP_API_URL?.trim();
  const embeddedApiUrl = options.embeddedApiUrl?.trim();
  const value = runtimeOverride || embeddedApiUrl || (options.isPackaged ? undefined : DEFAULT_DESKTOP_API_URL);
  if (!value) {
    throw new Error("DESKTOP_API_URL is required for packaged desktop applications");
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("DESKTOP_API_URL must be a valid URL");
  }
  const loopback = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
  if (
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    value.includes("?") ||
    value.includes("#")
  ) {
    throw new Error("DESKTOP_API_URL must not include credentials, a query, or a fragment");
  }
  if (
    parsed.protocol !== "https:" &&
    !(parsed.protocol === "http:" && !options.isPackaged && loopback.has(parsed.hostname))
  ) {
    throw new Error(
      options.isPackaged
        ? "DESKTOP_API_URL must use HTTPS in packaged desktop applications"
        : "DESKTOP_API_URL must be HTTPS or a loopback development origin",
    );
  }
  return parsed.origin;
}

export function resolveDesktopMainEnv(
  environment: Readonly<Record<string, string | undefined>> = process.env,
  options: DesktopMainEnvOptions = { isPackaged: false },
): DesktopMainEnv {
  return Object.freeze({ DESKTOP_API_URL: configuredDesktopApiUrl(environment, options) });
}
`;
}

function databaseServerSchema(database: ConfigDatabase): string {
  if (database === "convex") {
    return `    CONVEX_DEPLOYMENT: z.string().min(1).optional(),
    CONVEX_URL: z.string().url(),
    CONVEX_SITE_URL: z.string().url().optional(),
`;
  }
  if (database === "none") return "";
  return `    DATABASE_URL: z.string().min(1).optional(),
    POSTGRES_USER: z.string().min(1).default("postgres"),
    POSTGRES_PASSWORD: z.string().min(1),
    POSTGRES_HOST: z.string().min(1).default("localhost"),
    POSTGRES_PORT: z.string().regex(/^\\d+$/).default("5432"),
    POSTGRES_DB: z.string().min(1).default("ghostinit"),
    DATABASE_SSL: z.enum(["true", "false"]).default("false"),
    DATABASE_SSL_CA: z.string().optional(),
    DATABASE_POOL_SIZE: z.string().regex(/^\\d+$/).default("20").transform((value) => Number.parseInt(value, 10)),\n`;
}

function databaseServerRuntime(database: ConfigDatabase): string {
  if (database === "convex") {
    return `    CONVEX_DEPLOYMENT: process.env.CONVEX_DEPLOYMENT,
    CONVEX_URL: process.env.CONVEX_URL,
    CONVEX_SITE_URL: process.env.CONVEX_SITE_URL,
`;
  }
  if (database === "none") return "";
  return `    DATABASE_URL: process.env.DATABASE_URL,
    POSTGRES_USER: process.env.POSTGRES_USER,
    POSTGRES_PASSWORD: process.env.POSTGRES_PASSWORD,
    POSTGRES_HOST: process.env.POSTGRES_HOST,
    POSTGRES_PORT: process.env.POSTGRES_PORT,
    POSTGRES_DB: process.env.POSTGRES_DB,
    DATABASE_SSL: process.env.DATABASE_SSL,
    DATABASE_SSL_CA: process.env.DATABASE_SSL_CA,
    DATABASE_POOL_SIZE: process.env.DATABASE_POOL_SIZE,\n`;
}

export function serverSchemaContent(options: ServerEnvTemplateOptions): string {
  const emailSchema = options.hasEmail
    ? `    RESEND_API_KEY: z.string().min(1).default("REPLACE_WITH_RESEND_API_KEY"),
    EMAIL_FROM: z.string().min(1).default("noreply@example.com"),
    EMAIL_FROM_NAME: z.string().min(1).optional(),\n`
    : "";
  const cacheSchema = options.hasCache
    ? `    UPSTASH_REDIS_REST_URL: z.string().max(2_048).url().refine((value) => value === value.trim() && !value.startsWith("REPLACE_WITH"), "UPSTASH_REDIS_REST_URL must be configured without surrounding whitespace"),
    UPSTASH_REDIS_REST_TOKEN: z.string().min(1).max(4_096).regex(/^[\\x21-\\x7e]+$/).refine((value) => !value.startsWith("REPLACE_WITH"), "UPSTASH_REDIS_REST_TOKEN must be configured"),\n`
    : `    UPSTASH_REDIS_REST_URL: z.preprocess((value) => typeof value === "string" && (!value.trim() || value.trim().startsWith("REPLACE_WITH")) ? undefined : value, z.string().max(2_048).url().optional()),
    UPSTASH_REDIS_REST_TOKEN: z.preprocess((value) => typeof value === "string" && (!value.trim() || value.trim().startsWith("REPLACE_WITH")) ? undefined : value, z.string().min(1).max(4_096).regex(/^[\\x21-\\x7e]+$/).optional()),\n`;
  const notificationSchema = options.hasNotifications
    ? `    NOTIFICATION_TOKEN_ENCRYPTION_KEY: z.string().regex(/^[A-Za-z0-9_-]{43}$/),\n`
    : "";
  const eveSchema = options.hasEve
    ? `    AI_GATEWAY_API_KEY: z.string().min(1).default("REPLACE_WITH_AI_GATEWAY_API_KEY"),
    EVE_INTERNAL_AUTH_SECRET: z.string().min(32),
    EVE_NEXT_PRODUCTION_ORIGIN: z.preprocess((value) => value === "" ? undefined : value, z.string().url().optional()),
    EVE_NEXT_PRODUCTION_PORT: z.coerce.number().int().min(1).max(65535).default(4274),\n`
    : "";

  return `import { z } from "zod";

export const serverSchema = {
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    APP_NAME: z.string().min(1).default("GhostInit App"),
    SITE_URL: z.string().url().default("http://localhost:3000"),
${databaseServerSchema(options.database)}    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.string().url(),
    GOOGLE_CLIENT_ID: z.string().min(1).default("REPLACE_WITH_GOOGLE_CLIENT_ID"),
    GOOGLE_CLIENT_SECRET: z.string().min(1).default("REPLACE_WITH_GOOGLE_CLIENT_SECRET"),
    GITHUB_CLIENT_ID: z.string().min(1).default("REPLACE_WITH_GITHUB_CLIENT_ID"),
    GITHUB_CLIENT_SECRET: z.string().min(1).default("REPLACE_WITH_GITHUB_CLIENT_SECRET"),
    TRUSTED_PROXY: z.enum(["true", "false"]).default("false"),
    ANALYTICS_DISABLED: z.enum(["true", "false"]).default("false"),
${emailSchema}    STRIPE_SECRET_KEY: z.string().min(1).default("REPLACE_WITH_STRIPE_SECRET_KEY"),
    STRIPE_WEBHOOK_SECRET: z.string().min(1).default("REPLACE_WITH_STRIPE_WEBHOOK_SECRET"),
    BILLING_STRIPE_PRO_PRICE_ID: z.string().min(1).default("REPLACE_WITH_STRIPE_PRO_PRICE_ID"),
    CHARGILY_API_KEY: z.string().min(1).default("REPLACE_WITH_CHARGILY_API_KEY"),
    CHARGILY_SECRET_KEY: z.string().min(1).default("REPLACE_WITH_CHARGILY_SECRET_KEY"),
    CHARGILY_MODE: z.enum(["test", "live"]).default("test"),
    BILLING_CHARGILY_PRO_PRICE_ID: z.string().min(1).default("REPLACE_WITH_CHARGILY_PRO_PRICE_ID"),
    PADDLE_API_KEY: z.string().min(1).default("REPLACE_WITH_PADDLE_API_KEY"),
    PADDLE_WEBHOOK_SECRET: z.string().min(1).default("REPLACE_WITH_PADDLE_WEBHOOK_SECRET"),
    PADDLE_ENVIRONMENT: z.enum(["sandbox", "production"]).default("sandbox"),
    BILLING_PADDLE_PRO_PRICE_ID: z.string().min(1).default("REPLACE_WITH_PADDLE_PRO_PRICE_ID"),
    POLAR_ACCESS_TOKEN: z.string().min(1).default("REPLACE_WITH_POLAR_ACCESS_TOKEN"),
    POLAR_WEBHOOK_SECRET: z.string().min(1).default("REPLACE_WITH_POLAR_WEBHOOK_SECRET"),
    POLAR_ORG_ID: z.string().min(1).default("REPLACE_WITH_POLAR_ORG_ID"),
    POLAR_ENVIRONMENT: z.enum(["sandbox", "production"]).default("sandbox"),
    BILLING_POLAR_PRO_PRODUCT_ID: z.string().min(1).default("REPLACE_WITH_POLAR_PRO_PRODUCT_ID"),
    POSTHOG_HOST: z.string().min(1).optional().default("https://us.i.posthog.com"),
    POSTHOG_API_KEY: z.string().min(1).optional().default("REPLACE_WITH_POSTHOG_KEY"),
    FEATURE_FLAG_TIMEOUT_MS: z.coerce.number().int().min(100).max(30000).default(2500),
${notificationSchema}${eveSchema}    JOB_WORKER_ID: z.preprocess((value) => value === "" ? undefined : value, z.string().min(1).optional()),
    JOB_WORKER_POLL_MS: z.coerce.number().int().min(250).max(60000).default(1000),
    JOB_HEARTBEAT_MS: z.coerce.number().int().min(1000).max(60000).default(10000),
    JOB_LEASE_MS: z.coerce.number().int().min(3000).max(900000).default(30000),
    JOB_SCHEDULER_TICK_MS: z.coerce.number().int().min(1000).max(300000).default(30000),
${cacheSchema}    STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
    STORAGE_BUCKET: z.string().min(1).default("REPLACE_WITH_STORAGE_BUCKET"),
    S3_REGION: z.string().min(1).default("us-east-1"),
    S3_ACCESS_KEY_ID: z.string().min(1).optional(),
    S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
    S3_ENDPOINT: z.union([z.string().url(), z.literal("")]).optional(),
    S3_PUBLIC_URL: z.union([z.string().url(), z.literal("")]).optional(),
    UPLOADS_DIR: z.string().min(1).default("./data/uploads"),
    DESKTOP_API_URL: z.string().url().optional(),
} as const;
`;
}

export function serverRuntimeContent(options: ServerEnvTemplateOptions): string {
  const emailRuntime = options.hasEmail
    ? `    RESEND_API_KEY: process.env.RESEND_API_KEY,
    EMAIL_FROM: process.env.EMAIL_FROM,
    EMAIL_FROM_NAME: process.env.EMAIL_FROM_NAME,\n`
    : "";
  const notificationRuntime = options.hasNotifications
    ? `    NOTIFICATION_TOKEN_ENCRYPTION_KEY: process.env.NOTIFICATION_TOKEN_ENCRYPTION_KEY,\n`
    : "";
  const eveRuntime = options.hasEve
    ? `    AI_GATEWAY_API_KEY: process.env.AI_GATEWAY_API_KEY,
    EVE_INTERNAL_AUTH_SECRET: process.env.EVE_INTERNAL_AUTH_SECRET,
    EVE_NEXT_PRODUCTION_ORIGIN: process.env.EVE_NEXT_PRODUCTION_ORIGIN,
    EVE_NEXT_PRODUCTION_PORT: process.env.EVE_NEXT_PRODUCTION_PORT,\n`
    : "";
  return `import { createEnv } from "@t3-oss/env-core";
import { serverSchema } from "./server-schema.js";

export const env = createEnv({
  server: serverSchema,
  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    APP_NAME: process.env.APP_NAME,
    SITE_URL: process.env.SITE_URL,
${databaseServerRuntime(options.database)}    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET,
    TRUSTED_PROXY: process.env.TRUSTED_PROXY,
    ANALYTICS_DISABLED: process.env.ANALYTICS_DISABLED,
${emailRuntime}    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    BILLING_STRIPE_PRO_PRICE_ID: process.env.BILLING_STRIPE_PRO_PRICE_ID,
    CHARGILY_API_KEY: process.env.CHARGILY_API_KEY,
    CHARGILY_SECRET_KEY: process.env.CHARGILY_SECRET_KEY,
    CHARGILY_MODE: process.env.CHARGILY_MODE,
    BILLING_CHARGILY_PRO_PRICE_ID: process.env.BILLING_CHARGILY_PRO_PRICE_ID,
    PADDLE_API_KEY: process.env.PADDLE_API_KEY,
    PADDLE_WEBHOOK_SECRET: process.env.PADDLE_WEBHOOK_SECRET,
    PADDLE_ENVIRONMENT: process.env.PADDLE_ENVIRONMENT,
    BILLING_PADDLE_PRO_PRICE_ID: process.env.BILLING_PADDLE_PRO_PRICE_ID,
    POLAR_ACCESS_TOKEN: process.env.POLAR_ACCESS_TOKEN,
    POLAR_WEBHOOK_SECRET: process.env.POLAR_WEBHOOK_SECRET,
    POLAR_ORG_ID: process.env.POLAR_ORG_ID,
    POLAR_ENVIRONMENT: process.env.POLAR_ENVIRONMENT,
    BILLING_POLAR_PRO_PRODUCT_ID: process.env.BILLING_POLAR_PRO_PRODUCT_ID,
    POSTHOG_HOST: process.env.POSTHOG_HOST,
    POSTHOG_API_KEY: process.env.POSTHOG_API_KEY,
    FEATURE_FLAG_TIMEOUT_MS: process.env.FEATURE_FLAG_TIMEOUT_MS,
${notificationRuntime}${eveRuntime}    JOB_WORKER_ID: process.env.JOB_WORKER_ID,
    JOB_WORKER_POLL_MS: process.env.JOB_WORKER_POLL_MS,
    JOB_HEARTBEAT_MS: process.env.JOB_HEARTBEAT_MS,
    JOB_LEASE_MS: process.env.JOB_LEASE_MS,
    JOB_SCHEDULER_TICK_MS: process.env.JOB_SCHEDULER_TICK_MS,
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
    STORAGE_DRIVER: process.env.STORAGE_DRIVER,
    STORAGE_BUCKET: process.env.STORAGE_BUCKET,
    S3_REGION: process.env.S3_REGION,
    S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID,
    S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY,
    S3_ENDPOINT: process.env.S3_ENDPOINT,
    S3_PUBLIC_URL: process.env.S3_PUBLIC_URL,
    UPLOADS_DIR: process.env.UPLOADS_DIR,
    DESKTOP_API_URL: process.env.DESKTOP_API_URL,
  },
});

export type ServerEnv = typeof env;
`;
}

export function configSafeIndexContent(): string {
  return `export const CONFIG_ENTRYPOINTS = ["server", "next", "vite", "expo", "desktop-main"] as const;
export type ConfigEntrypoint = (typeof CONFIG_ENTRYPOINTS)[number];
export type { ServerEnv } from "./server.js";
export type { NextPublicEnv } from "./next.js";
export type { VitePublicEnv } from "./vite.js";
export type { ExpoPublicEnv } from "./expo.js";
export type { DesktopMainEnv, DesktopMainEnvOptions } from "./desktop-main.js";
`;
}
