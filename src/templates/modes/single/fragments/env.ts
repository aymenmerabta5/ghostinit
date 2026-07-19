import { file, type TemplateFile } from "../../../shared.js";

export function singleEnvContent(): string {
  return `import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
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
    // TRUSTED_PROXY can be set to "true" when the app is behind a proxy that
    // sanitizes x-forwarded-for. Never enable this in untrusted environments.
    TRUSTED_PROXY: z.enum(["true", "false"]).default("false"),
    RESEND_API_KEY: z.string().min(1).default("REPLACE_WITH_RESEND_API_KEY"),
    EMAIL_FROM: z.string().min(1).default("noreply@example.com"),
    EMAIL_FROM_NAME: z.string().min(1).optional(),
    // Billing — server-only secrets NEVER client except NEXT_PUBLIC_ / VITE_ publishable/client tokens
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
    // Analytics — server-side PostHog ingestion / proxy
    POSTHOG_HOST: z.string().min(1).optional().default("https://us.i.posthog.com"),
    POSTHOG_API_KEY: z.string().min(1).optional().default("REPLACE_WITH_POSTHOG_KEY"),
  },
  client: {
    NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().min(1).default("pk_test_REPLACE"),
    NEXT_PUBLIC_PADDLE_CLIENT_TOKEN: z.string().min(1).default("pdl_ntf_REPLACE"),
    NEXT_PUBLIC_PADDLE_ENVIRONMENT: z.enum(["sandbox", "production"]).default("sandbox"),
    NEXT_PUBLIC_POSTHOG_KEY: z.string().min(1).default("phc_REPLACE_WITH_POSTHOG_KEY"),
    NEXT_PUBLIC_POSTHOG_HOST: z.string().min(1).default("/ingest"),
    NEXT_PUBLIC_POSTHOG_SESSION_RECORDING: z.enum(["true", "false"]).default("false"),
    NEXT_PUBLIC_POSTHOG_AUTOCAPTURE: z.enum(["true", "false"]).default("true"),
    NEXT_PUBLIC_ANALYTICS_DISABLED: z.enum(["true", "false"]).default("false"),
    // TanStack Start / Vite client vars — mirrors NEXT_PUBLIC_ for Vite compatibility
    VITE_APP_URL: z.string().url().default("http://localhost:3000").optional(),
    VITE_STRIPE_PUBLISHABLE_KEY: z.string().min(1).default("pk_test_REPLACE").optional(),
    VITE_PADDLE_CLIENT_TOKEN: z.string().min(1).default("pdl_ntf_REPLACE").optional(),
    VITE_PADDLE_ENVIRONMENT: z.enum(["sandbox", "production"]).default("sandbox").optional(),
    VITE_POSTHOG_KEY: z.string().min(1).default("phc_REPLACE_WITH_POSTHOG_KEY").optional(),
    VITE_POSTHOG_HOST: z.string().min(1).default("/ingest").optional(),
    VITE_POSTHOG_SESSION_RECORDING: z.enum(["true", "false"]).default("false").optional(),
    VITE_POSTHOG_AUTOCAPTURE: z.enum(["true", "false"]).default("true").optional(),
    VITE_ANALYTICS_DISABLED: z.enum(["true", "false"]).default("false").optional(),
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
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    VITE_APP_URL: process.env.VITE_APP_URL,
    DATABASE_SSL: process.env.DATABASE_SSL,
    DATABASE_SSL_CA: process.env.DATABASE_SSL_CA,
    DATABASE_POOL_SIZE: process.env.DATABASE_POOL_SIZE,
    TRUSTED_PROXY: process.env.TRUSTED_PROXY,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    EMAIL_FROM: process.env.EMAIL_FROM,
    EMAIL_FROM_NAME: process.env.EMAIL_FROM_NAME,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    VITE_STRIPE_PUBLISHABLE_KEY: process.env.VITE_STRIPE_PUBLISHABLE_KEY,
    CHARGILY_API_KEY: process.env.CHARGILY_API_KEY,
    CHARGILY_SECRET_KEY: process.env.CHARGILY_SECRET_KEY,
    CHARGILY_MODE: process.env.CHARGILY_MODE,
    PADDLE_API_KEY: process.env.PADDLE_API_KEY,
    PADDLE_WEBHOOK_SECRET: process.env.PADDLE_WEBHOOK_SECRET,
    PADDLE_ENVIRONMENT: process.env.PADDLE_ENVIRONMENT,
    NEXT_PUBLIC_PADDLE_CLIENT_TOKEN: process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN,
    NEXT_PUBLIC_PADDLE_ENVIRONMENT: process.env.NEXT_PUBLIC_PADDLE_ENVIRONMENT,
    VITE_PADDLE_CLIENT_TOKEN: process.env.VITE_PADDLE_CLIENT_TOKEN,
    VITE_PADDLE_ENVIRONMENT: process.env.VITE_PADDLE_ENVIRONMENT,
    POLAR_ACCESS_TOKEN: process.env.POLAR_ACCESS_TOKEN,
    POLAR_WEBHOOK_SECRET: process.env.POLAR_WEBHOOK_SECRET,
    POLAR_ORG_ID: process.env.POLAR_ORG_ID,
    POLAR_ENVIRONMENT: process.env.POLAR_ENVIRONMENT,
    POSTHOG_HOST: process.env.POSTHOG_HOST,
    POSTHOG_API_KEY: process.env.POSTHOG_API_KEY,
    NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
    NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    NEXT_PUBLIC_POSTHOG_SESSION_RECORDING: process.env.NEXT_PUBLIC_POSTHOG_SESSION_RECORDING,
    NEXT_PUBLIC_POSTHOG_AUTOCAPTURE: process.env.NEXT_PUBLIC_POSTHOG_AUTOCAPTURE,
    NEXT_PUBLIC_ANALYTICS_DISABLED: process.env.NEXT_PUBLIC_ANALYTICS_DISABLED,
    VITE_POSTHOG_KEY: process.env.VITE_POSTHOG_KEY,
    VITE_POSTHOG_HOST: process.env.VITE_POSTHOG_HOST,
    VITE_POSTHOG_SESSION_RECORDING: process.env.VITE_POSTHOG_SESSION_RECORDING,
    VITE_POSTHOG_AUTOCAPTURE: process.env.VITE_POSTHOG_AUTOCAPTURE,
    VITE_ANALYTICS_DISABLED: process.env.VITE_ANALYTICS_DISABLED,
  },
});

export type Env = typeof env;
`;
}

export function singleEnvFile(): TemplateFile {
  return file("src/lib/env.ts", singleEnvContent());
}
