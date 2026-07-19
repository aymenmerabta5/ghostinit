import { codeScripts, file, packageJson, tsconfig, type TemplateFile } from "./shared.js";
import * as v from "./versions.js";

export interface AuthSecrets {
  authSecret: string;
  postgresPassword: string;
}

export type AuthFramework = "nextjs" | "tanstack-start";

type AuthFrameworkInput =
  | AuthFramework
  | { framework?: AuthFramework; addons?: Record<string, { inUse: boolean } | boolean> }
  | Record<string, { inUse: boolean } | boolean>
  | undefined;

function resolveAuthFramework(input: AuthFrameworkInput): AuthFramework {
  if (!input) return "nextjs";
  if (typeof input === "string") {
    if (input === "tanstack-start" || input === "nextjs") return input;
    return "nextjs";
  }
  if (typeof input === "object") {
    const obj = input as Record<string, unknown>;
    // direct { framework }
    if (
      typeof obj.framework === "string" &&
      (obj.framework === "tanstack-start" || obj.framework === "nextjs")
    ) {
      return obj.framework as AuthFramework;
    }
    // addon map detection
    const anyObj = obj as Record<string, any>;
    const addons =
      (anyObj.addons as Record<string, any> | undefined) ?? (anyObj as Record<string, any>);
    if (addons) {
      if (addons["tanstack-start"]?.inUse === true || addons["tanstack-start"] === true)
        return "tanstack-start";
      if (addons["nextjs"]?.inUse === true || addons["nextjs"] === true) return "nextjs";
    }
  }
  return "nextjs";
}

export function authPackage(frameworkOrAddons?: AuthFrameworkInput): TemplateFile[] {
  const framework = resolveAuthFramework(frameworkOrAddons);
  const isTanstack = framework === "tanstack-start";
  const cookieImport = isTanstack
    ? `import { tanstackStartCookies } from "better-auth/tanstack-start";`
    : `import { nextCookies } from "better-auth/next-js";`;
  const cookiePlugin = isTanstack ? "tanstackStartCookies()" : "nextCookies()";

  return [
    file(
      "packages/auth/package.json",
      packageJson({
        name: "@repo/auth",
        scripts: codeScripts(),
        exports: {
          ".": "./src/index.ts",
          "./client": "./src/client.ts",
        },
        dependencies: {
          "better-auth": `^${v.auth["better-auth"]}`,
          "@repo/config": "workspace:*",
          "@repo/database": "workspace:*",
          "@repo/email": "workspace:*",
        },
        devDependencies: {
          "@types/node": `^${v.runtime["@types/node"]}`,
          typescript: `^${v.typescript.typescript}`,
        },
      }),
    ),
    file("packages/auth/tsconfig.json", tsconfig({ include: ["src/**/*"] })),
    file(
      "packages/auth/src/index.ts",
      `import { betterAuth } from "better-auth";

declare global {
  // eslint-disable-next-line no-var
  var waitUntil: ((promise: Promise<unknown>) => void) | undefined;
}

import { drizzleAdapter } from "better-auth/adapters/drizzle";
${cookieImport}
import { admin, twoFactor } from "better-auth/plugins";
import { env } from "@repo/config";
import {
  db,
  accounts,
  sessions,
  users,
  verifications,
  twoFactor as twoFactorTable,
} from "@repo/database";
import { forgotPasswordTemplate } from "@repo/email";

if (env.BETTER_AUTH_URL.includes("localhost")) {
  console.warn(
    "[ghostinit] BETTER_AUTH_URL is still set to localhost. Change it to your production URL before deploying.",
  );
}

if (env.BETTER_AUTH_SECRET.length < 32) {
  throw new Error("BETTER_AUTH_SECRET must be at least 32 characters");
}

const isHttps = env.BETTER_AUTH_URL.startsWith("https://");

export const auth = betterAuth({
  appName: env.APP_NAME,
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: users,
      session: sessions,
      account: accounts,
      verification: verifications,
      twoFactor: twoFactorTable,
    },
  }),
  emailAndPassword: {
    enabled: true,
    // SECURITY: do not auto-sign-in after registration. Require explicit
    // credential verification to reduce session-fixation and redirect risks.
    autoSignInAfterRegistration: false,
    // Better Auth handles token generation: short expiry (1h), single use, hashed storage
    // Resend delivers via server-only RESEND_API_KEY + EMAIL_FROM - verified via Context7 /better-auth/better-auth + /websites/resend
    sendResetPassword: async ({ user, url, token }) => {
      const { sendEmail } = await import("@repo/email");
      await sendEmail({
        to: user.email,
        subject: \`Reset your password - \${env.APP_NAME}\`,
        html: forgotPasswordTemplate({
          url,
          token,
          appName: env.APP_NAME,
          email: user.email,
        }),
      });
    },
  },
  user: {
    deleteUser: {
      enabled: true,
    },
  },
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5,
      strategy: "compact",
    },
  },
  // SECURITY: review these flags before going to production.
  cookie: {
    httpOnly: true,
    secure: isHttps,
    sameSite: "lax",
  },
  rateLimit: {
    enabled: true,
    storage: "memory",
    window: 60,
    max: 100,
  },
  advanced: {
    ipAddress: {
      // SECURITY: IP tracking is disabled by default. Header-based IP extraction
      // is only enabled when TRUSTED_PROXY=true (set in .env.local). In
      // untrusted environments these headers are trivially spoofed and can be
      // used to bypass rate limits.
      ...(env.TRUSTED_PROXY === "true"
        ? {
            ipAddressHeaders: ["x-forwarded-for", "x-real-ip"],
            disableIpTracking: false,
          }
        : { disableIpTracking: true }),
    },
    backgroundTasks: {
      handler: (promise) => {
        if (typeof globalThis.waitUntil === "function") {
          globalThis.waitUntil(promise);
        }
      },
    },
  },
  plugins: [admin(), twoFactor({ issuer: env.BETTER_AUTH_URL }), ${cookiePlugin}],
});

export type Auth = typeof auth;
`,
    ),
    file(
      "packages/auth/src/client.ts",
      `import { createAuthClient } from "better-auth/react";
import { adminClient, twoFactorClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  plugins: [
    twoFactorClient({
      onTwoFactorRedirect(context) {
        if (context.twoFactorMethods?.includes("totp") && typeof window !== "undefined") {
          window.location.href = "/2fa";
        }
      },
    }),
    adminClient(),
  ],
});
`,
    ),
  ];
}
