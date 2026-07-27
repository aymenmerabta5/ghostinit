// @allow-long 491: Better Auth server+client config emitted for both modes, kept together so cookie/session/2FA settings stay reviewable side by side
import { codeScripts, file, packageJson, tsconfig, type TemplateFile } from "./shared.js";
import * as v from "./versions.js";
import type { AddonInstallerMap } from "../lib/addons.js";
import { hasAddon } from "../lib/addons.js";

export interface AuthSecrets {
  authSecret: string;
  postgresPassword: string;
}

export type AuthFramework = "nextjs" | "tanstack-start";

type AuthFrameworkInput =
  | AuthFramework
  | {
      framework?: AuthFramework;
      addons?: Record<string, { inUse: boolean } | boolean>;
      addonMap?: AddonInstallerMap;
    }
  | AddonInstallerMap
  | Record<string, { inUse: boolean } | boolean>
  | undefined;

function hasConvexFlag(map: unknown): boolean {
  if (!map || typeof map !== "object") return false;
  try {
    if (hasAddon(map as AddonInstallerMap, "convex")) return true;
  } catch {
    // ignore
  }
  const m = map as Record<string, unknown>;
  const c = m["convex"];
  if (c === undefined) return false;
  if (typeof c === "boolean") return c;
  if (typeof c === "object" && c !== null) {
    const obj = c as Record<string, unknown>;
    if ("inUse" in obj) return Boolean(obj.inUse);
    return true;
  }
  return false;
}

function resolveFrameworkAndConvex(
  input?: AuthFrameworkInput,
  maybeAddons?: Record<string, { inUse: boolean } | boolean> | AddonInstallerMap,
): { framework: AuthFramework; isConvex: boolean } {
  let framework: AuthFramework = "nextjs";
  let isConvex = false;

  if (maybeAddons && hasConvexFlag(maybeAddons)) isConvex = true;

  if (!input) return { framework, isConvex };

  if (typeof input === "string") {
    if (input === "tanstack-start" || input === "nextjs") framework = input as AuthFramework;
    return { framework, isConvex };
  }

  if (typeof input === "object") {
    const obj = input as Record<string, unknown>;

    if (
      typeof obj.framework === "string" &&
      (obj.framework === "tanstack-start" || obj.framework === "nextjs")
    ) {
      framework = obj.framework as AuthFramework;
    }

    // check addonMap / addons containers for convex and framework
    const candidateContainers: unknown[] = [];
    if (obj.addonMap) candidateContainers.push(obj.addonMap);
    if (obj.addons) candidateContainers.push(obj.addons);
    candidateContainers.push(obj);

    for (const cand of candidateContainers) {
      if (!cand || typeof cand !== "object") continue;
      if (hasConvexFlag(cand)) isConvex = true;
      // framework detection if not yet overridden by explicit prop
      if (!obj.framework) {
        try {
          if (hasAddon(cand as AddonInstallerMap, "tanstack-start")) {
            framework = "tanstack-start";
          }
        } catch {}
        const rec = cand as Record<string, unknown>;
        const ts = rec["tanstack-start"];
        if (ts !== undefined) {
          const isTs =
            typeof ts === "boolean"
              ? ts
              : Boolean((ts as Record<string, unknown> | undefined)?.inUse);
          if (isTs) framework = "tanstack-start";
        }
      }
    }
  }

  return { framework, isConvex };
}

function postgresPackageFiles(framework: AuthFramework, hasMobile = false): TemplateFile[] {
  const isTanstack = framework === "tanstack-start";
  const cookieImport = isTanstack
    ? `import { tanstackStartCookies } from "better-auth/tanstack-start";`
    : `import { nextCookies } from "better-auth/next-js";`;
  const cookiePlugin = isTanstack ? "tanstackStartCookies()" : "nextCookies()";
  // The Expo client registers expoClient({ scheme }); its server-side counterpart
  // is the expo() plugin. Without it (and without the scheme in trustedOrigins)
  // every authenticated request from a device is rejected with
  // MISSING_OR_NULL_ORIGIN. __APP_SCHEME__ is substituted by modes/monorepo/index.ts.
  const expoImport = hasMobile
    ? `
import { expo } from "@better-auth/expo";`
    : "";
  const expoPlugin = hasMobile ? "expo(), " : "";
  const trustedOrigins = hasMobile
    ? `
  trustedOrigins: [env.BETTER_AUTH_URL, "__APP_SCHEME__://"],`
    : "";

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
          ...(hasMobile ? { "@better-auth/expo": `^${v.auth["@better-auth/expo"]}` } : {}),
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
    file(
      "packages/auth/tsconfig.json",
      tsconfig({ compilerOptions: { types: ["node"] }, include: ["src/**/*"] }),
    ),
    file(
      "packages/auth/src/index.ts",
      `import { betterAuth } from "better-auth";

declare global {
  // eslint-disable-next-line no-var
  var waitUntil: ((promise: Promise<unknown>) => void) | undefined;
}

import { drizzleAdapter } from "better-auth/adapters/drizzle";
${cookieImport}${expoImport}
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

if (
  env.BETTER_AUTH_SECRET.length < 32 ||
  env.BETTER_AUTH_SECRET.startsWith("REPLACE_WITH") ||
  env.BETTER_AUTH_SECRET === "REPLACE_WITH_A_STRONG_SECRET_AT_LEAST_32_CHARS"
) {
  throw new Error("BETTER_AUTH_SECRET must be set to a strong random value, not placeholder, at least 32 characters");
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
    autoSignInAfterRegistration: false,
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
    // Assigned directly rather than spread into an empty object — the ternary
    // already yields the object (unicorn/no-useless-spread).
    // IP tracking must stay ON: better-auth keys its rate limiter on the client
    // IP, and disableIpTracking:true makes the limiter return before consuming a
    // bucket — rateLimit.enabled:true above was completely inert (measured 0 of
    // 300 sign-in attempts blocked).
    //
    // Behind a proxy (TRUSTED_PROXY=true) we read the forwarded headers. Without
    // one we deliberately do NOT trust them: an attacker could otherwise rotate
    // X-Forwarded-For to get a fresh bucket per request and bypass the limiter
    // entirely. Leaving the list empty falls back to the socket address.
    ipAddress:
      env.TRUSTED_PROXY === "true"
        ? {
            ipAddressHeaders: ["x-forwarded-for", "x-real-ip"],
            disableIpTracking: false,
          }
        : { ipAddressHeaders: [], disableIpTracking: false },
    backgroundTasks: {
      handler: (promise) => {
        if (typeof globalThis.waitUntil === "function") {
          globalThis.waitUntil(promise);
        }
      },
    },
  },
  plugins: [${expoPlugin}admin(), twoFactor({ issuer: env.BETTER_AUTH_URL }), ${cookiePlugin}],${trustedOrigins}
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

function convexClientContent(): string {
  return [
    `import { createAuthClient } from "better-auth/react";`,
    `import { convexClient } from "@convex-dev/better-auth/client/plugins";`,
    `import { adminClient, twoFactorClient } from "better-auth/client/plugins";`,
    ``,
    `// Convex mode – client includes convexClient() plugin for ConvexBetterAuthProvider`,
    `// baseURL uses CONVEX_SITE_URL / SITE_URL for crossDomain cookie flow`,
    `function resolveBaseURL(): string | undefined {`,
    `  if (typeof window !== "undefined") return undefined;`,
    `  if (typeof process !== "undefined" && process.env) {`,
    `    return (`,
    `      process.env.CONVEX_SITE_URL ??`,
    `      process.env.NEXT_PUBLIC_CONVEX_SITE_URL ??`,
    `      process.env.VITE_CONVEX_SITE_URL ??`,
    `      process.env.SITE_URL ??`,
    `      undefined`,
    `    );`,
    `  }`,
    `  return undefined;`,
    `}`,
    ``,
    `export const authClient = createAuthClient({`,
    `  baseURL: resolveBaseURL(),`,
    `  plugins: [`,
    `    convexClient(),`,
    `    twoFactorClient({`,
    `      onTwoFactorRedirect(context) {`,
    `        if (context.twoFactorMethods?.includes("totp") && typeof window !== "undefined") {`,
    `          window.location.href = "/2fa";`,
    `        }`,
    `      },`,
    `    }),`,
    `    adminClient(),`,
    `  ],`,
    `});`,
    ``,
  ].join("\n");
}

function convexServerNextContent(): string {
  return [
    `import { convexBetterAuthNextJs } from "@convex-dev/better-auth/nextjs";`,
    ``,
    `function requireEnv(name: string, ...candidates: (string | undefined)[]): string {`,
    `  const found = candidates.find((v) => !!v && v.trim() !== "");`,
    `  if (!found) {`,
    `    throw new Error(name + " must be set for Convex Better Auth. Expected one of: NEXT_PUBLIC_CONVEX_URL / CONVEX_URL / CONVEX_SITE_URL / SITE_URL. Run npx convex dev");`,
    `  }`,
    `  return found;`,
    `}`,
    ``,
    `const convexUrl = requireEnv(`,
    `  "CONVEX_URL",`,
    `  typeof process !== "undefined" ? process.env.NEXT_PUBLIC_CONVEX_URL : undefined,`,
    `  typeof process !== "undefined" ? process.env.VITE_CONVEX_URL : undefined,`,
    `  typeof process !== "undefined" ? process.env.CONVEX_URL : undefined,`,
    `);`,
    ``,
    `const convexSiteUrl = requireEnv(`,
    `  "CONVEX_SITE_URL / SITE_URL",`,
    `  typeof process !== "undefined" ? process.env.NEXT_PUBLIC_CONVEX_SITE_URL : undefined,`,
    `  typeof process !== "undefined" ? process.env.VITE_CONVEX_SITE_URL : undefined,`,
    `  typeof process !== "undefined" ? process.env.CONVEX_SITE_URL : undefined,`,
    `  typeof process !== "undefined" ? process.env.SITE_URL : undefined,`,
    `);`,
    ``,
    `const _secret = typeof process !== "undefined" ? process.env.BETTER_AUTH_SECRET : undefined;`,
    `if (!_secret || _secret.length < 32 || _secret.startsWith("REPLACE_WITH") || _secret === "REPLACE_WITH_A_STRONG_SECRET_AT_LEAST_32_CHARS") {`,
    `  throw new Error("BETTER_AUTH_SECRET must be set to a strong random value, at least 32 characters for convex mode");`,
    `}`,
    ``,
    `/**`,
    ` * Canonical Convex Better Auth Next.js wrapper.`,
    ` * Provides handler (GET/POST), getToken, fetchAuthQuery/Mutation/Action, preloadAuthQuery, isAuthenticated.`,
    ` * See https://labs.convex.dev/better-auth/framework-guides/next`,
    ` * Server auth logic lives in convex/auth.ts (createClient<DataModel>, createAuthOptions with crossDomain + convex plugins)`,
    ` * This package is the Next.js handler layer – avoids dual auth sources.`,
    ` */`,
    `export const {`,
    `  handler,`,
    `  preloadAuthQuery,`,
    `  isAuthenticated,`,
    `  getToken,`,
    `  fetchAuthQuery,`,
    `  fetchAuthMutation,`,
    `  fetchAuthAction,`,
    `} = convexBetterAuthNextJs({`,
    `  convexUrl,`,
    `  convexSiteUrl,`,
    `});`,
    ``,
    `// Backwards compatible shim for code that does import { auth } from "@repo/auth" expecting auth.handler(req)`,
    `export const auth = {`,
    `  handler: async (req: Request): Promise<Response> => {`,
    `    const h = handler as unknown as Record<string, (r: Request) => Promise<Response>> & ((r: Request) => Promise<Response>);`,
    `    if (typeof h === "function") return (h as (r: Request) => Promise<Response>)(req);`,
    `    const method = req.method.toUpperCase();`,
    `    if (method === "GET" && h.GET) return h.GET(req as any);`,
    `    if (method === "POST" && h.POST) return h.POST(req as any);`,
    `    if (method === "PUT" && (h as any).PUT) return (h as any).PUT(req as any);`,
    `    if (method === "PATCH" && (h as any).PATCH) return (h as any).PATCH(req as any);`,
    `    if (method === "DELETE" && (h as any).DELETE) return (h as any).DELETE(req as any);`,
    `    return new Response("Method not allowed", { status: 405 });`,
    `  },`,
    `};`,
    ``,
    `export type Auth = typeof auth;`,
    ``,
  ].join("\n");
}

function convexServerTanstackContent(): string {
  return [
    `import { convexBetterAuthReactStart } from "@convex-dev/better-auth/react-start";`,
    ``,
    `function requireEnv(name: string, ...candidates: (string | undefined)[]): string {`,
    `  const found = candidates.find((v) => !!v && v.trim() !== "");`,
    `  if (!found) {`,
    `    throw new Error(name + " must be set for Convex Better Auth. Expected VITE_CONVEX_URL / CONVEX_SITE_URL / SITE_URL");`,
    `  }`,
    `  return found;`,
    `}`,
    ``,
    `const convexUrl = requireEnv(`,
    `  "CONVEX_URL",`,
    `  typeof process !== "undefined" ? process.env.VITE_CONVEX_URL : undefined,`,
    `  typeof process !== "undefined" ? process.env.NEXT_PUBLIC_CONVEX_URL : undefined,`,
    `  typeof process !== "undefined" ? process.env.CONVEX_URL : undefined,`,
    `);`,
    ``,
    `const convexSiteUrl = requireEnv(`,
    `  "CONVEX_SITE_URL / SITE_URL",`,
    `  typeof process !== "undefined" ? process.env.VITE_CONVEX_SITE_URL : undefined,`,
    `  typeof process !== "undefined" ? process.env.NEXT_PUBLIC_CONVEX_SITE_URL : undefined,`,
    `  typeof process !== "undefined" ? process.env.CONVEX_SITE_URL : undefined,`,
    `  typeof process !== "undefined" ? process.env.SITE_URL : undefined,`,
    `);`,
    ``,
    `const _secret = typeof process !== "undefined" ? process.env.BETTER_AUTH_SECRET : undefined;`,
    `if (!_secret || _secret.length < 32 || _secret.startsWith("REPLACE_WITH") || _secret === "REPLACE_WITH_A_STRONG_SECRET_AT_LEAST_32_CHARS") {`,
    `  throw new Error("BETTER_AUTH_SECRET must be at least 32 chars for convex mode");`,
    `}`,
    ``,
    `export const {`,
    `  handler,`,
    `  getToken,`,
    `  fetchAuthQuery,`,
    `  fetchAuthMutation,`,
    `  fetchAuthAction,`,
    `} = convexBetterAuthReactStart({`,
    `  convexUrl,`,
    `  convexSiteUrl,`,
    `});`,
    ``,
    `export const auth = {`,
    `  handler: async (req: Request): Promise<Response> => {`,
    `    const h = handler as any;`,
    `    if (typeof h === "function") return h(req);`,
    `    const m = req.method.toUpperCase();`,
    `    if (m === "GET" && h.GET) return h.GET(req as any);`,
    `    if (m === "POST" && h.POST) return h.POST(req as any);`,
    `    if (m === "PUT" && h.PUT) return h.PUT(req as any);`,
    `    if (m === "PATCH" && h.PATCH) return h.PATCH(req as any);`,
    `    if (m === "DELETE" && h.DELETE) return h.DELETE(req as any);`,
    `    return new Response("Method not allowed", { status: 405 });`,
    `  },`,
    `};`,
    ``,
    `export type Auth = typeof auth;`,
    ``,
  ].join("\n");
}

function convexPackageFiles(framework: AuthFramework): TemplateFile[] {
  const isTanstack = framework === "tanstack-start";
  const serverContent = isTanstack ? convexServerTanstackContent() : convexServerNextContent();

  return [
    file(
      "packages/auth/package.json",
      packageJson({
        name: "@repo/auth",
        scripts: codeScripts(),
        exports: {
          ".": "./src/index.ts",
          "./client": "./src/client.ts",
          "./server": "./src/server.ts",
        },
        dependencies: {
          "better-auth": `^${v.auth["better-auth"]}`,
          "@repo/config": "workspace:*",
          "@repo/email": "workspace:*",
          convex: `^${v.convex.convex}`,
          "@convex-dev/better-auth": `^${v.convex["@convex-dev/better-auth"]}`,
        },
        devDependencies: {
          "@types/node": `^${v.runtime["@types/node"]}`,
          typescript: `^${v.typescript.typescript}`,
        },
      }),
    ),
    // types: ["node"] must match the non-Convex path above — dropping it only in
    // Convex mode was one of the ~48 typecheck errors in that path.
    file(
      "packages/auth/tsconfig.json",
      tsconfig({ compilerOptions: { types: ["node"] }, include: ["src/**/*"] }),
    ),
    file("packages/auth/src/index.ts", `export * from "./server.js";\n`),
    file("packages/auth/src/client.ts", convexClientContent()),
    file("packages/auth/src/server.ts", serverContent),
  ];
}

export function authPackage(
  frameworkOrAddons?: AuthFrameworkInput,
  maybeAddons?: Record<string, { inUse: boolean } | boolean> | AddonInstallerMap,
): TemplateFile[] {
  // Parameter types already line up with resolveFrameworkAndConvex — no cast needed.
  const { framework, isConvex } = resolveFrameworkAndConvex(frameworkOrAddons, maybeAddons);
  // The expo() server plugin is only emitted when the project actually has a
  // mobile app; @better-auth/expo is a mobile-only dependency.
  const hasMobile = [frameworkOrAddons, maybeAddons].some((c) => {
    if (!c || typeof c !== "object") return false;
    try {
      return hasAddon(c as AddonInstallerMap, "mobile");
    } catch {
      return false;
    }
  });
  if (isConvex) {
    return convexPackageFiles(framework);
  }
  return postgresPackageFiles(framework, hasMobile);
}
