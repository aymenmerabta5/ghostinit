import { codeScripts, file, packageJson, tsconfig, type TemplateFile } from "../shared.js";
import * as v from "../versions.js";

export type ConfigFramework = "nextjs" | "tanstack-start";

/**
 * Public (client-exposed) env vars, per framework.
 *
 * t3-env validates that every key in `client` carries the framework's public
 * prefix. `@t3-oss/env-nextjs` hardcodes NEXT_PUBLIC_, so listing VITE_* keys
 * alongside it was a hard type error ("VITE_APP_URL is not prefixed with
 * NEXT_PUBLIC_.") and the generated @repo/config never typechecked. Each project
 * targets exactly one framework, so emit exactly that framework's public vars.
 */
export const NEXT_PUBLIC_CLIENT_VARS = [
  `    NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),`,
  `    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().min(1).default("pk_test_REPLACE"),`,
  `    NEXT_PUBLIC_PADDLE_CLIENT_TOKEN: z.string().min(1).default("pdl_ntf_REPLACE"),`,
  `    NEXT_PUBLIC_PADDLE_ENVIRONMENT: z.enum(["sandbox","production"]).default("sandbox"),`,
  `    NEXT_PUBLIC_POSTHOG_KEY: z.string().min(1).default("phc_REPLACE_WITH_POSTHOG_KEY"),`,
  `    NEXT_PUBLIC_POSTHOG_HOST: z.string().min(1).default("/ingest"),`,
  `    NEXT_PUBLIC_POSTHOG_SESSION_RECORDING: z.enum(["true","false"]).default("false"),`,
  `    NEXT_PUBLIC_POSTHOG_AUTOCAPTURE: z.enum(["true","false"]).default("true"),`,
  `    NEXT_PUBLIC_ANALYTICS_DISABLED: z.enum(["true","false"]).default("false"),`,
].join("\n");

export const VITE_CLIENT_VARS = [
  `    VITE_APP_URL: z.string().url().default("http://localhost:3000"),`,
  `    VITE_STRIPE_PUBLISHABLE_KEY: z.string().min(1).default("pk_test_REPLACE"),`,
  `    VITE_PADDLE_CLIENT_TOKEN: z.string().min(1).default("pdl_ntf_REPLACE"),`,
  `    VITE_PADDLE_ENVIRONMENT: z.enum(["sandbox","production"]).default("sandbox"),`,
  `    VITE_POSTHOG_KEY: z.string().min(1).default("phc_REPLACE_WITH_POSTHOG_KEY"),`,
  `    VITE_POSTHOG_HOST: z.string().min(1).default("/ingest"),`,
  `    VITE_POSTHOG_SESSION_RECORDING: z.enum(["true","false"]).default("false"),`,
  `    VITE_POSTHOG_AUTOCAPTURE: z.enum(["true","false"]).default("true"),`,
  `    VITE_ANALYTICS_DISABLED: z.enum(["true","false"]).default("false"),`,
].join("\n");

export function clientRuntimeEnvLines(prefix: "NEXT_PUBLIC_" | "VITE_"): string {
  const names = [
    "APP_URL",
    "STRIPE_PUBLISHABLE_KEY",
    "PADDLE_CLIENT_TOKEN",
    "PADDLE_ENVIRONMENT",
    "POSTHOG_KEY",
    "POSTHOG_HOST",
    "POSTHOG_SESSION_RECORDING",
    "POSTHOG_AUTOCAPTURE",
    "ANALYTICS_DISABLED",
  ];
  return names.map((n) => `    ${prefix}${n}: process.env.${prefix}${n},`).join("\n");
}

/**
 * Convex deployment vars. packages/database (Convex variant) reads env.CONVEX_URL,
 * NEXT_PUBLIC_CONVEX_URL, VITE_CONVEX_URL and EXPO_PUBLIC_CONVEX_URL, but @repo/config
 * declared none of them — so every one was a TS error and a runtime undefined.
 *
 * Only the framework's own public prefix may live in `client` (t3-env enforces it);
 * EXPO_PUBLIC_* and the bare names go in `server`.
 */
const CONVEX_SERVER_VARS = [
  `    CONVEX_DEPLOYMENT: z.string().min(1).optional(),`,
  `    CONVEX_URL: z.string().url(),`,
  `    CONVEX_SITE_URL: z.string().url().optional(),`,
  `    SITE_URL: z.string().url().default("http://localhost:3000"),`,
  `    EXPO_PUBLIC_CONVEX_URL: z.string().url().optional(),`,
].join("\n");

const CONVEX_SERVER_RUNTIME = [
  `    CONVEX_DEPLOYMENT: process.env.CONVEX_DEPLOYMENT,`,
  `    CONVEX_URL: process.env.CONVEX_URL,`,
  `    CONVEX_SITE_URL: process.env.CONVEX_SITE_URL,`,
  `    SITE_URL: process.env.SITE_URL,`,
  `    EXPO_PUBLIC_CONVEX_URL: process.env.EXPO_PUBLIC_CONVEX_URL,`,
].join("\n");

export function configPackageFiles(
  framework: ConfigFramework = "nextjs",
  database: "postgres" | "convex" | "none" = "postgres",
): TemplateFile[] {
  const isConvex = database === "convex";
  const isTanstack = framework === "tanstack-start";
  const convexServer = isConvex ? `\n${CONVEX_SERVER_VARS}` : "";
  const convexServerRuntime = isConvex ? `\n${CONVEX_SERVER_RUNTIME}` : "";
  const convexClient = isConvex
    ? `\n    ${isTanstack ? "VITE_CONVEX_URL" : "NEXT_PUBLIC_CONVEX_URL"}: z.string().url(),`
    : "";
  const convexClientRuntime = isConvex
    ? `\n    ${isTanstack ? "VITE_CONVEX_URL: process.env.VITE_CONVEX_URL," : "NEXT_PUBLIC_CONVEX_URL: process.env.NEXT_PUBLIC_CONVEX_URL,"}`
    : "";
  const envPackage = isTanstack ? "@t3-oss/env-core" : "@t3-oss/env-nextjs";
  const envVersion = isTanstack
    ? v.validation["@t3-oss/env-core"]
    : v.validation["@t3-oss/env-nextjs"];
  const clientVars = isTanstack ? VITE_CLIENT_VARS : NEXT_PUBLIC_CLIENT_VARS;
  const clientRuntime = clientRuntimeEnvLines(isTanstack ? "VITE_" : "NEXT_PUBLIC_");
  // env-core has no implicit prefix; env-nextjs supplies NEXT_PUBLIC_ itself.
  const clientPrefixLine = isTanstack ? `  clientPrefix: "VITE_",\n` : "";

  return [
    file(
      "packages/config/package.json",
      packageJson({
        name: "@repo/config",
        exports: { ".": "./src/index.ts" },
        scripts: codeScripts(),
        dependencies: {
          [envPackage]: `^${envVersion}`,
          zod: `^${v.validation.zod}`,
        },
        devDependencies: {
          "@types/node": `^${v.runtime["@types/node"]}`,
          typescript: `^${v.typescript.typescript}`,
        },
      }),
    ),
    file(
      "packages/config/tsconfig.json",
      tsconfig({
        include: ["src/**/*"],
        compilerOptions: {
          types: ["node"],
          composite: true,
          incremental: true,
          declaration: true,
          declarationMap: true,
          sourceMap: true,
          outDir: "./dist",
          rootDir: "./src",
          paths: { "@/*": ["./src/*"], "@repo/*": ["../../packages/*/src"] },
        },
      }),
    ),
    file(
      "packages/config/src/env.ts",
      `import { createEnv } from "${envPackage}";
import { z } from "zod";
export const env = createEnv({
${clientPrefixLine}  server: {${convexServer}
    NODE_ENV: z.enum(["development","production","test"]).default("development"),
    APP_NAME: z.string().min(1).default("GhostInit App"),
    DATABASE_URL: z.string().min(1).optional(),
    POSTGRES_USER: z.string().min(1).default("postgres"),
    POSTGRES_PASSWORD: z.string().min(1),
    POSTGRES_HOST: z.string().min(1).default("localhost"),
    POSTGRES_PORT: z.string().regex(/^\\d+$/).default("5432"),
    POSTGRES_DB: z.string().min(1).default("ghostinit"),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.string().url(),
    DATABASE_SSL: z.enum(["true","false"]).default("false"),
    DATABASE_SSL_CA: z.string().optional(),
    DATABASE_POOL_SIZE: z.string().regex(/^\\d+$/).default("20").transform((s) => Number.parseInt(s, 10)),
    TRUSTED_PROXY: z.enum(["true","false"]).default("false"),
    RESEND_API_KEY: z.string().min(1).default("REPLACE_WITH_RESEND_API_KEY"),
    EMAIL_FROM: z.string().min(1).default("noreply@example.com"),
    EMAIL_FROM_NAME: z.string().min(1).optional(),
    STRIPE_SECRET_KEY: z.string().min(1).default("REPLACE_WITH_STRIPE_SECRET_KEY"),
    STRIPE_WEBHOOK_SECRET: z.string().min(1).default("REPLACE_WITH_STRIPE_WEBHOOK_SECRET"),
    CHARGILY_API_KEY: z.string().min(1).default("REPLACE_WITH_CHARGILY_API_KEY"),
    CHARGILY_SECRET_KEY: z.string().min(1).default("REPLACE_WITH_CHARGILY_SECRET_KEY"),
    CHARGILY_MODE: z.enum(["test","live"]).default("test"),
    PADDLE_API_KEY: z.string().min(1).default("REPLACE_WITH_PADDLE_API_KEY"),
    PADDLE_WEBHOOK_SECRET: z.string().min(1).default("REPLACE_WITH_PADDLE_WEBHOOK_SECRET"),
    PADDLE_ENVIRONMENT: z.enum(["sandbox","production"]).default("sandbox"),
    POLAR_ACCESS_TOKEN: z.string().min(1).default("REPLACE_WITH_POLAR_ACCESS_TOKEN"),
    POLAR_WEBHOOK_SECRET: z.string().min(1).default("REPLACE_WITH_POLAR_WEBHOOK_SECRET"),
    POLAR_ORG_ID: z.string().min(1).default("REPLACE_WITH_POLAR_ORG_ID"),
    POLAR_ENVIRONMENT: z.enum(["sandbox","production"]).default("sandbox"),
    POSTHOG_HOST: z.string().min(1).optional().default("https://us.i.posthog.com"),
    POSTHOG_API_KEY: z.string().min(1).optional().default("REPLACE_WITH_POSTHOG_KEY"),
  },
  client: {
${clientVars}${convexClient}
  },
  runtimeEnv: {${convexServerRuntime}
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
${clientRuntime}${convexClientRuntime}
    DATABASE_SSL: process.env.DATABASE_SSL,
    DATABASE_SSL_CA: process.env.DATABASE_SSL_CA,
    DATABASE_POOL_SIZE: process.env.DATABASE_POOL_SIZE,
    TRUSTED_PROXY: process.env.TRUSTED_PROXY,
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
`,
    ),
    file("packages/config/src/index.ts", `export { env, type Env } from "./env";\n`),
  ];
}
