import { file, type TemplateFile } from "../../../shared.js";
import type { AddonInstallerMap } from "../../../../lib/addons.js";
import { hasAddon } from "../../../../lib/addons.js";
import {
  NEXT_PUBLIC_CLIENT_VARS,
  VITE_CLIENT_VARS,
  clientRuntimeEnvLines,
} from "../../../packages/config.js";

function isConvexMap(map?: AddonInstallerMap | Record<string, { inUse?: boolean }>): boolean {
  if (!map) return false;
  try {
    return hasAddon(map as AddonInstallerMap, "convex");
  } catch {
    return Boolean((map as Record<string, { inUse?: boolean }>).convex?.inUse);
  }
}

export type SingleEnvFramework = "nextjs" | "tanstack-start";

/**
 * Emits src/lib/env.ts.
 *
 * t3-env rejects any `client` key without the framework's public prefix, so the
 * NEXT_PUBLIC_* and VITE_* sets must never be listed together — doing so made
 * every single-mode project fail to typecheck. Reuses the same tables as the
 * monorepo @repo/config package so the two cannot drift.
 */
export function singleEnvContent(
  isConvex = false,
  framework: SingleEnvFramework = "nextjs",
): string {
  const isTanstack = framework === "tanstack-start";
  const envPackage = isTanstack ? "@t3-oss/env-core" : "@t3-oss/env-nextjs";
  const clientVars = isTanstack ? VITE_CLIENT_VARS : NEXT_PUBLIC_CLIENT_VARS;
  const clientRuntime = clientRuntimeEnvLines(isTanstack ? "VITE_" : "NEXT_PUBLIC_");
  const clientPrefixLine = isTanstack ? `  clientPrefix: "VITE_",\n` : "";

  if (isConvex) {
    return `import { createEnv } from "${envPackage}";
import { z } from "zod";

export const env = createEnv({
${clientPrefixLine}  server: {
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    APP_NAME: z.string().min(1).default("GhostInit App"),
    CONVEX_DEPLOYMENT: z.string().min(1).optional(),
    CONVEX_URL: z.string().url(),
    CONVEX_SITE_URL: z.string().url(),
    SITE_URL: z.string().url().default("http://localhost:3000"),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.string().url(),
    TRUSTED_PROXY: z.enum(["true", "false"]).default("false"),
    ANALYTICS_DISABLED: z.enum(["true", "false"]).default("false"),
    RESEND_API_KEY: z.string().min(1).default("REPLACE_WITH_RESEND_API_KEY"),
    EMAIL_FROM: z.string().min(1).default("noreply@example.com"),
    EMAIL_FROM_NAME: z.string().min(1).optional(),
    STRIPE_SECRET_KEY: z.string().min(1).default("REPLACE_WITH_STRIPE_SECRET_KEY"),
    STRIPE_WEBHOOK_SECRET: z.string().min(1).default("REPLACE_WITH_STRIPE_WEBHOOK_SECRET"),
    CHARGILY_API_KEY: z.string().min(1).default("REPLACE_WITH_CHARGILY_API_KEY"),
    CHARGILY_SECRET_KEY: z.string().min(1).default("REPLACE_WITH_CHARGILY_SECRET_KEY"),
    CHARGILY_MODE: z.enum(["test", "live"]).default("test"),
    PADDLE_API_KEY: z.string().min(1).default("REPLACE_WITH_PADDLE_API_KEY"),
    PADDLE_WEBHOOK_SECRET: z.string().min(1).default("REPLACE_WITH_PADDLE_WEBHOOK_SECRET"),
    PADDLE_ENVIRONMENT: z.enum(["sandbox", "production"]).default("sandbox"),
    POLAR_ACCESS_TOKEN: z.string().min(1).default("REPLACE_WITH_POLAR_ACCESS_TOKEN"),
    POLAR_WEBHOOK_SECRET: z.string().min(1).default("REPLACE_WITH_POLAR_WEBHOOK_SECRET"),
    POLAR_ORG_ID: z.string().min(1).default("REPLACE_WITH_POLAR_ORG_ID"),
    POLAR_ENVIRONMENT: z.enum(["sandbox", "production"]).default("sandbox"),
    POSTHOG_HOST: z.string().min(1).optional().default("https://us.i.posthog.com"),
    POSTHOG_API_KEY: z.string().min(1).optional().default("REPLACE_WITH_POSTHOG_KEY"),
  },
  client: {
${clientVars}
  },
  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    APP_NAME: process.env.APP_NAME,
    CONVEX_DEPLOYMENT: process.env.CONVEX_DEPLOYMENT,
    CONVEX_URL: process.env.CONVEX_URL,
    CONVEX_SITE_URL: process.env.CONVEX_SITE_URL,
    SITE_URL: process.env.SITE_URL,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
${clientRuntime}
    TRUSTED_PROXY: process.env.TRUSTED_PROXY,
    ANALYTICS_DISABLED: process.env.ANALYTICS_DISABLED,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    EMAIL_FROM: process.env.EMAIL_FROM,
    EMAIL_FROM_NAME: process.env.EMAIL_FROM_NAME,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    CHARGILY_API_KEY: process.env.CHARGILY_API_KEY,
    CHARGILY_SECRET_KEY: process.env.CHARGILY_SECRET_KEY,
    CHARGILY_MODE: process.env.CHARGILY_MODE,
    PADDLE_API_KEY: process.env.PADDLE_API_KEY,
    PADDLE_WEBHOOK_SECRET: process.env.PADDLE_WEBHOOK_SECRET,
    PADDLE_ENVIRONMENT: process.env.PADDLE_ENVIRONMENT,
    POLAR_ACCESS_TOKEN: process.env.POLAR_ACCESS_TOKEN,
    POLAR_WEBHOOK_SECRET: process.env.POLAR_WEBHOOK_SECRET,
    POLAR_ORG_ID: process.env.POLAR_ORG_ID,
    POLAR_ENVIRONMENT: process.env.POLAR_ENVIRONMENT,
    POSTHOG_HOST: process.env.POSTHOG_HOST,
    POSTHOG_API_KEY: process.env.POSTHOG_API_KEY,
  },
});

export type Env = typeof env;
`;
  }

  return `import { createEnv } from "${envPackage}";
import { z } from "zod";

export const env = createEnv({
${clientPrefixLine}  server: {
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    APP_NAME: z.string().min(1).default("GhostInit App"),
    DATABASE_URL: z.string().min(1).optional(),
    POSTGRES_USER: z.string().min(1).default("postgres"),
    POSTGRES_PASSWORD: z.string().min(1),
    POSTGRES_HOST: z.string().min(1).default("localhost"),
    POSTGRES_PORT: z.string().regex(/^\\d+$/).default("5432"),
    POSTGRES_DB: z.string().min(1).default("ghostinit"),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.string().url(),
    DATABASE_SSL: z.enum(["true", "false"]).default("false"),
    DATABASE_SSL_CA: z.string().optional(),
    DATABASE_POOL_SIZE: z
      .string()
      .regex(/^\\d+$/)
      .default("20")
      .transform((s) => Number.parseInt(s, 10)),
    TRUSTED_PROXY: z.enum(["true", "false"]).default("false"),
    ANALYTICS_DISABLED: z.enum(["true", "false"]).default("false"),
    RESEND_API_KEY: z.string().min(1).default("REPLACE_WITH_RESEND_API_KEY"),
    EMAIL_FROM: z.string().min(1).default("noreply@example.com"),
    EMAIL_FROM_NAME: z.string().min(1).optional(),
    STRIPE_SECRET_KEY: z.string().min(1).default("REPLACE_WITH_STRIPE_SECRET_KEY"),
    STRIPE_WEBHOOK_SECRET: z.string().min(1).default("REPLACE_WITH_STRIPE_WEBHOOK_SECRET"),
    CHARGILY_API_KEY: z.string().min(1).default("REPLACE_WITH_CHARGILY_API_KEY"),
    CHARGILY_SECRET_KEY: z.string().min(1).default("REPLACE_WITH_CHARGILY_SECRET_KEY"),
    CHARGILY_MODE: z.enum(["test", "live"]).default("test"),
    PADDLE_API_KEY: z.string().min(1).default("REPLACE_WITH_PADDLE_API_KEY"),
    PADDLE_WEBHOOK_SECRET: z.string().min(1).default("REPLACE_WITH_PADDLE_WEBHOOK_SECRET"),
    PADDLE_ENVIRONMENT: z.enum(["sandbox", "production"]).default("sandbox"),
    POLAR_ACCESS_TOKEN: z.string().min(1).default("REPLACE_WITH_POLAR_ACCESS_TOKEN"),
    POLAR_WEBHOOK_SECRET: z.string().min(1).default("REPLACE_WITH_POLAR_WEBHOOK_SECRET"),
    POLAR_ORG_ID: z.string().min(1).default("REPLACE_WITH_POLAR_ORG_ID"),
    POLAR_ENVIRONMENT: z.enum(["sandbox", "production"]).default("sandbox"),
    POSTHOG_HOST: z.string().min(1).optional().default("https://us.i.posthog.com"),
    POSTHOG_API_KEY: z.string().min(1).optional().default("REPLACE_WITH_POSTHOG_KEY"),
  },
  client: {
${clientVars}
  },
  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    APP_NAME: process.env.APP_NAME,
    DATABASE_URL: process.env.DATABASE_URL,
    POSTGRES_USER: process.env.POSTGRES_USER,
    POSTGRES_PASSWORD: process.env.POSTGRES_PASSWORD,
    POSTGRES_HOST: process.env.POSTGRES_HOST,
    POSTGRES_PORT: process.env.POSTGRES_PORT,
    POSTGRES_DB: process.env.POSTGRES_DB,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
${clientRuntime}
    DATABASE_SSL: process.env.DATABASE_SSL,
    DATABASE_SSL_CA: process.env.DATABASE_SSL_CA,
    DATABASE_POOL_SIZE: process.env.DATABASE_POOL_SIZE,
    TRUSTED_PROXY: process.env.TRUSTED_PROXY,
    ANALYTICS_DISABLED: process.env.ANALYTICS_DISABLED,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    EMAIL_FROM: process.env.EMAIL_FROM,
    EMAIL_FROM_NAME: process.env.EMAIL_FROM_NAME,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    CHARGILY_API_KEY: process.env.CHARGILY_API_KEY,
    CHARGILY_SECRET_KEY: process.env.CHARGILY_SECRET_KEY,
    CHARGILY_MODE: process.env.CHARGILY_MODE,
    PADDLE_API_KEY: process.env.PADDLE_API_KEY,
    PADDLE_WEBHOOK_SECRET: process.env.PADDLE_WEBHOOK_SECRET,
    PADDLE_ENVIRONMENT: process.env.PADDLE_ENVIRONMENT,
    POLAR_ACCESS_TOKEN: process.env.POLAR_ACCESS_TOKEN,
    POLAR_WEBHOOK_SECRET: process.env.POLAR_WEBHOOK_SECRET,
    POLAR_ORG_ID: process.env.POLAR_ORG_ID,
    POLAR_ENVIRONMENT: process.env.POLAR_ENVIRONMENT,
    POSTHOG_HOST: process.env.POSTHOG_HOST,
    POSTHOG_API_KEY: process.env.POSTHOG_API_KEY,
  },
});

export type Env = typeof env;
`;
}

export function singleEnvFile(
  addonMap?: AddonInstallerMap | Record<string, { inUse?: boolean }>,
  framework: SingleEnvFramework = "nextjs",
): TemplateFile {
  const isConvex = isConvexMap(addonMap);
  return file("src/lib/env.ts", singleEnvContent(isConvex, framework));
}
