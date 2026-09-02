import { file, type TemplateFile } from "../shared.js";
import { GLOBAL_ENV_KEYS } from "../../lib/env-manifest.js";

/**
 * Test-only server environment for generated Bun suites.
 *
 * This preload is referenced explicitly by package test scripts. It is never
 * loaded by dev, build, or start, so production continues to fail closed when
 * required environment variables are absent. Reserved domains and placeholders
 * also prevent an accidental unit-test call from authorizing a real operation.
 */
export function testEnvironmentFile(): TemplateFile {
  const applicationEnvironmentNames = [
    ...new Set(GLOBAL_ENV_KEYS.filter((name) => !name.endsWith("*"))),
  ];
  const serializedEnvironmentNames = `[
${applicationEnvironmentNames.map((name) => `  ${JSON.stringify(name)},`).join("\n")}
]`;
  return file(
    "scripts/test-env.ts",
    `// Bun can inherit .env.local before this package-level preload executes.
// Clear every generated application variable (including public-prefix values)
// before installing inert values so unit tests can never reuse developer or CI
// provider credentials. Bun/Turbo controls such as TEMP and the install cache
// are intentionally left untouched.
const applicationEnvironmentNames = new Set(${serializedEnvironmentNames});
const applicationEnvironmentPrefix = /^(?:NEXT_PUBLIC_|VITE_|EXPO_PUBLIC_|DESKTOP_|ELECTRON_)/;
for (const name of Object.keys(process.env)) {
  if (applicationEnvironmentNames.has(name) || applicationEnvironmentPrefix.test(name)) {
    delete process.env[name];
  }
}

const testEnvironment: Readonly<Record<string, string>> = {
  NODE_ENV: "test",
  APP_NAME: "GhostInit Test",
  SITE_URL: "http://127.0.0.1:3000",
  DATABASE_URL: "postgresql://ghostinit_test:ghostinit_test@127.0.0.1:1/ghostinit_test",
  POSTGRES_USER: "ghostinit_test",
  POSTGRES_PASSWORD: "ghostinit-test-only-postgres-password",
  POSTGRES_HOST: "127.0.0.1",
  POSTGRES_PORT: "1",
  POSTGRES_DB: "ghostinit_test",
  DATABASE_SSL: "false",
  DATABASE_POOL_SIZE: "1",
  BETTER_AUTH_SECRET: "ghostinit-test-only-auth-secret-0123456789abcdef",
  BETTER_AUTH_URL: "http://127.0.0.1:3000",
  GOOGLE_CLIENT_ID: "REPLACE_WITH_TEST_GOOGLE_CLIENT_ID",
  GOOGLE_CLIENT_SECRET: "REPLACE_WITH_TEST_GOOGLE_CLIENT_SECRET",
  GITHUB_CLIENT_ID: "REPLACE_WITH_TEST_GITHUB_CLIENT_ID",
  GITHUB_CLIENT_SECRET: "REPLACE_WITH_TEST_GITHUB_CLIENT_SECRET",
  CONVEX_URL: "https://ghostinit-test.convex.example.test",
  CONVEX_SITE_URL: "https://ghostinit-test.convex.example.test",
  CONVEX_DEPLOYMENT: "dev:ghostinit-test",
  ANALYTICS_DISABLED: "true",
  POSTHOG_HOST: "https://posthog.example.test",
  POSTHOG_API_KEY: "REPLACE_WITH_TEST_POSTHOG_KEY",
  RESEND_API_KEY: "REPLACE_WITH_TEST_RESEND_API_KEY",
  EMAIL_FROM: "noreply@example.test",
  STRIPE_SECRET_KEY: "sk_test_ghostinit_test_only",
  STRIPE_WEBHOOK_SECRET: "whsec_ghostinit_test_only",
  BILLING_STRIPE_PRO_PRICE_ID: "price_ghostinit_test_only",
  CHARGILY_API_KEY: "REPLACE_WITH_TEST_CHARGILY_API_KEY",
  CHARGILY_SECRET_KEY: "REPLACE_WITH_TEST_CHARGILY_SECRET_KEY",
  CHARGILY_MODE: "test",
  CHARGILY_WEBHOOK_SECRET: "REPLACE_WITH_TEST_CHARGILY_WEBHOOK_SECRET",
  BILLING_CHARGILY_PRO_PRICE_ID: "REPLACE_WITH_TEST_CHARGILY_PRICE_ID",
  PADDLE_API_KEY: "REPLACE_WITH_TEST_PADDLE_API_KEY",
  PADDLE_WEBHOOK_SECRET: "REPLACE_WITH_TEST_PADDLE_WEBHOOK_SECRET",
  PADDLE_ENVIRONMENT: "sandbox",
  BILLING_PADDLE_PRO_PRICE_ID: "REPLACE_WITH_TEST_PADDLE_PRICE_ID",
  POLAR_ACCESS_TOKEN: "REPLACE_WITH_TEST_POLAR_ACCESS_TOKEN",
  POLAR_WEBHOOK_SECRET: "REPLACE_WITH_TEST_POLAR_WEBHOOK_SECRET",
  POLAR_ORG_ID: "REPLACE_WITH_TEST_POLAR_ORG_ID",
  POLAR_ENVIRONMENT: "sandbox",
  BILLING_POLAR_PRO_PRODUCT_ID: "REPLACE_WITH_TEST_POLAR_PRODUCT_ID",
  NOTIFICATION_TOKEN_ENCRYPTION_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  UPSTASH_REDIS_REST_URL: "https://redis.example.test",
  UPSTASH_REDIS_REST_TOKEN: "ghostinit-test-only-token",
  AI_GATEWAY_API_KEY: "REPLACE_WITH_TEST_AI_GATEWAY_API_KEY",
  EVE_INTERNAL_AUTH_SECRET: "ghostinit-test-only-eve-secret-0123456789abcdef",
  EVE_NEXT_PRODUCTION_ORIGIN: "http://127.0.0.1:3000",
  STORAGE_DRIVER: "local",
  STORAGE_BUCKET: "ghostinit-test-only",
  S3_BUCKET: "ghostinit-test-only",
  S3_REGION: "us-east-1",
  S3_ACCESS_KEY_ID: "REPLACE_WITH_TEST_S3_ACCESS_KEY_ID",
  S3_SECRET_ACCESS_KEY: "REPLACE_WITH_TEST_S3_SECRET_ACCESS_KEY",
  S3_ENDPOINT: "https://s3.example.test",
  S3_PUBLIC_URL: "https://assets.example.test",
  UPLOADS_DIR: "./.tmp/ghostinit-tests/uploads",
};

for (const [name, value] of Object.entries(testEnvironment)) {
  process.env[name] = value;
}
`,
  );
}
