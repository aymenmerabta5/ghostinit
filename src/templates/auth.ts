import { codeScripts, file, packageJson, tsconfig, type TemplateFile } from "./shared.js";
import * as v from "./versions.js";

export interface AuthSecrets {
  authSecret: string;
  postgresPassword: string;
}

export function authPackage(): TemplateFile[] {
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
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
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

if (env.BETTER_AUTH_URL.includes("localhost")) {
  console.warn(
    "[ghostinit] BETTER_AUTH_URL is still set to localhost. Change it to your production URL before deploying.",
  );
}

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
    autoSignInAfterRegistration: true,
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
    secure: process.env.NODE_ENV === "production",
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
      // WARNING: ipAddressHeaders trusts the listed headers. Only enable this
      // when your app is behind a trusted proxy (e.g. Vercel, Cloudflare, nginx).
      // In untrusted environments these headers can be spoofed by clients.
      // disableIpTracking is true by default for safety; set to false only when
      // you have verified the proxy chain.
      ipAddressHeaders: ["x-forwarded-for", "x-real-ip"],
      disableIpTracking: true,
    },
    backgroundTasks: {
      handler: (promise) => {
        if ("waitUntil" in globalThis && typeof (globalThis as unknown as { waitUntil?: (p: Promise<unknown>) => void }).waitUntil === "function") {
          (globalThis as unknown as { waitUntil: (p: Promise<unknown>) => void }).waitUntil(promise);
        }
      },
    },
  },
  plugins: [admin(), twoFactor({ issuer: env.BETTER_AUTH_URL }), nextCookies()],
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
