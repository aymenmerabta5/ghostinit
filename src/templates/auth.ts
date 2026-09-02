// @allow-long 491: Better Auth server+client config emitted for both modes, kept together so cookie/session/2FA settings stay reviewable side by side
import { codeScripts, file, packageJson, tsconfig, type TemplateFile } from "./shared.js";
import * as v from "./versions.js";
import type { AddonInstallerMap } from "../lib/addons.js";
import { hasAddon } from "../lib/addons.js";
import { authNetworkSecurityHelpers, durableAuthRateLimitConfig } from "./auth-security.js";
import {
  identityCapabilityFor,
  identityPasskeyClientCapabilityFor,
  identityDataModelBlueprint,
  renderBetterAuthSchemaBindings,
  type DataModelTarget,
} from "../domain/data-model/index.js";

export interface AuthSecrets {
  authSecret: string;
  postgresPassword: string;
}

export type AuthFramework = "nextjs" | "tanstack-start";

function identityCapabilityContent(target: DataModelTarget): string {
  const capability = identityCapabilityFor(target);
  const passkeyClientBindings = Object.fromEntries(
    (["nextjs", "tanstack-start", "expo", "electron"] as const).map((clientTarget) => [
      clientTarget,
      identityPasskeyClientCapabilityFor(target, clientTarget),
    ]),
  );
  return `// Generated from GhostInit's versioned identity data-model blueprint.
export const identityTarget = ${JSON.stringify(target)} as const;
export const selectedIdentityPlugins = ${JSON.stringify(capability.selectedPlugins)} as const;
export const rejectedIdentityPlugins = ${JSON.stringify(capability.rejectedPlugins, null, 2)} as const;
export const identitySchemaLimitations = ${JSON.stringify(capability.limitations, null, 2)} as const;
export const identityPasskeyClientBindings = ${JSON.stringify(passkeyClientBindings, null, 2)} as const;
`;
}

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

function postgresPackageFiles(
  framework: AuthFramework,
  hasMobile = false,
  hasEmail = true,
): TemplateFile[] {
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
  const emailImports = hasEmail
    ? `
import {
  resolveEmailLocale,
  sendEmail,
  transactionalEmailSubject,
  ResetPasswordEmail,
  VerifyEmail,
  MagicLinkEmail,
} from "@repo/email/server";`
    : "";
  const resetPasswordHook = hasEmail
    ? `
    sendResetPassword: async ({ user, url }, request) => {
      const appName = env.APP_NAME;
      const locale = resolveEmailLocale(request?.headers);
      const subject = transactionalEmailSubject("password-reset", locale, appName);
      await sendEmail(user.email, subject, ResetPasswordEmail, { link: url, appName, locale });
    },`
    : "";
  const verificationConfig = hasEmail
    ? `
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }, request) => {
      const locale = resolveEmailLocale(request?.headers);
      await sendEmail(user.email, transactionalEmailSubject("verification", locale, env.APP_NAME), VerifyEmail, { link: url, appName: env.APP_NAME, locale });
    },
  },`
    : "";
  const magicLinkPlugin = hasEmail
    ? `
    magicLink({
      storeToken: "hashed",
      sendMagicLink: async ({ email, url }, context) => {
        const locale = resolveEmailLocale(context?.request?.headers);
        await sendEmail(email, transactionalEmailSubject("magic-link", locale, env.APP_NAME), MagicLinkEmail, { link: url, appName: env.APP_NAME, locale });
      },
    }),`
    : "";
  const emailPluginImport = hasEmail
    ? 'import { magicLink } from "better-auth/plugins/magic-link";'
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
          "./server": "./src/server.ts",
          "./access": "./src/access.ts",
          "./identity-capabilities": "./src/identity-capabilities.ts",
        },
        dependencies: {
          "@better-auth/passkey": `^${v.auth["@better-auth/passkey"]}`,
          "better-auth": `^${v.auth["better-auth"]}`,
          ...(hasMobile ? { "@better-auth/expo": `^${v.auth["@better-auth/expo"]}` } : {}),
          "@repo/config": "workspace:*",
          "@repo/database": "workspace:*",
          ...(hasEmail ? { "@repo/email": "workspace:*" } : {}),
        },
        devDependencies: {
          "@types/node": `^${v.runtime["@types/node"]}`,
          typescript: `^${v.typescript.typescript}`,
        },
      }),
    ),
    file(
      "packages/auth/tsconfig.json",
      tsconfig({
        compilerOptions: {
          types: ["node"],
          ...(hasEmail ? { jsx: "react-jsx" } : {}),
        },
        include: ["src/**/*"],
      }),
    ),
    file(
      "packages/auth/src/server.ts",
      `import { betterAuth, type Auth as BetterAuthServer, type BetterAuthOptions } from "better-auth";

declare global {
  // eslint-disable-next-line no-var
  var waitUntil: ((promise: Promise<unknown>) => void) | undefined;
}

import { drizzleAdapter } from "better-auth/adapters/drizzle";
${cookieImport}${expoImport}
import { passkey } from "@better-auth/passkey";
import { admin } from "better-auth/plugins/admin";
import { organization } from "better-auth/plugins/organization";
import { twoFactor } from "better-auth/plugins/two-factor";
${emailPluginImport}
import { ac, roles } from "./access.js";
import { env } from "@repo/config/server";
${emailImports}
import {
  db,
  accounts,
  invitations,
  members,
  organizationRoles,
  organizations,
  passkeys,
  rateLimits,
  sessions,
  teamMembers,
  teams,
  users,
  verifications,
  twoFactors,
} from "@repo/database";

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

type AppAdminOptions = {
  ac: typeof ac;
  roles: typeof roles;
  adminRoles: ("admin" | "superAdmin")[];
};
type AdminPlugin = ReturnType<typeof admin<AppAdminOptions>>;
type PortableAuthOptions = BetterAuthOptions & { plugins: [AdminPlugin] };
interface AdminCreationAuthContext {
  generateId(options: { model: "user" | "account"; size?: number }): string | false;
  password: {
    hash(password: string): Promise<string>;
    config: { minPasswordLength: number; maxPasswordLength: number };
  };
}
export type Auth = Pick<BetterAuthServer<PortableAuthOptions>, "handler" | "api"> & {
  readonly $context: Promise<AdminCreationAuthContext>;
};

${authNetworkSecurityHelpers}

const authNetworkSecurity = resolveAuthNetworkSecurity(
  env.BETTER_AUTH_URL,
  env.TRUSTED_PROXY,
);

const configuredAuth = betterAuth({
  appName: env.APP_NAME,
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
${renderBetterAuthSchemaBindings(identityDataModelBlueprint)}
    },
  }),
  emailAndPassword: {
    enabled: ${hasEmail ? "true" : "false"},
    autoSignInAfterRegistration: false,
    revokeSessionsOnPasswordReset: true,
${hasEmail ? "    requireEmailVerification: true," : ""}${resetPasswordHook}
  },${verificationConfig}
  socialProviders: {
    ...(env.GOOGLE_CLIENT_ID && !env.GOOGLE_CLIENT_ID.startsWith("REPLACE_WITH") && env.GOOGLE_CLIENT_SECRET && !env.GOOGLE_CLIENT_SECRET.startsWith("REPLACE_WITH") ? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } } : {}),
    ...(env.GITHUB_CLIENT_ID && !env.GITHUB_CLIENT_ID.startsWith("REPLACE_WITH") && env.GITHUB_CLIENT_SECRET && !env.GITHUB_CLIENT_SECRET.startsWith("REPLACE_WITH") ? { github: { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET } } : {}),
  },
  account: {
    encryptOAuthTokens: true,
    accountLinking: {
      enabled: ${hasEmail ? "true" : "false"},
      requireLocalEmailVerified: true,
      ${hasEmail ? 'trustedProviders: ["google", "github"],' : "disableImplicitLinking: true,"}
    },
  },
  user: {
    deleteUser: {
      enabled: true,
    },
    changeEmail: {
      enabled: true,
    },
  },
  session: {
    // Passkey enrollment and OAuth-only deletion are sensitive operations.
    // Keep the freshness window explicit and force their middleware to read the
    // authoritative persisted session instead of a five-minute cookie snapshot.
    freshAge: 60 * 5,
    cookieCache: {
      enabled: false,
    },
  },
  cookie: {
    httpOnly: true,
    secure: isHttps,
    sameSite: "lax",
  },
${durableAuthRateLimitConfig}
  advanced: {
    trustedProxyHeaders: authNetworkSecurity.trustedProxyHeaders,
    ipAddress: authNetworkSecurity.ipAddress,
    backgroundTasks: {
      handler: (promise) => {
        if (typeof globalThis.waitUntil === "function") {
          globalThis.waitUntil(promise);
        }
      },
    },
  },
  plugins: [
    ${expoPlugin}admin({ ac, roles, adminRoles: ["admin", "superAdmin"] }),
    twoFactor({
      issuer: env.BETTER_AUTH_URL,
      twoFactorCookieMaxAge: 600,
      accountLockout: { enabled: true, maxFailedAttempts: 5, durationSeconds: 900 },
    }),
${magicLinkPlugin}
    passkey(),
    organization({
      allowUserToCreateOrganization: false,
      disableOrganizationDeletion: true,
      teams: { enabled: true },
      dynamicAccessControl: { enabled: true },
    }),
    ${cookiePlugin},
  ],${trustedOrigins}
});

export const auth: Auth = configuredAuth;

export async function getRequestUser(headers: Headers) {
  const session = await auth.api.getSession({ headers });
  return session?.user ?? null;
}

`,
    ),
    file(
      "packages/auth/src/client.ts",
      `import { createAuthClient } from "better-auth/react";
import { passkeyClient } from "@better-auth/passkey/client";
import { adminClient, twoFactorClient${hasEmail ? ", magicLinkClient" : ""}, organizationClient } from "better-auth/client/plugins";
import { ac, roles } from "./access.js";

export const authClient = createAuthClient({
  plugins: [
    twoFactorClient({
      onTwoFactorRedirect(context) {
        if (context.twoFactorMethods?.includes("totp") && typeof window !== "undefined") {
          window.location.href = "/2fa";
        }
      },
    }),
    adminClient({ ac, roles }),
${hasEmail ? "    magicLinkClient(),\n" : ""}    passkeyClient(),
    organizationClient(),
  ],
});
`,
    ),
    file(
      "packages/auth/src/index.ts",
      `export { auth, getRequestUser, type Auth } from "./server.js";
export {
  ac,
  roles,
  ADMIN_ROLE_NAMES,
  isAdminRole,
  type AccessRole,
  type AdminRole,
} from "./access.js";
export {
  identitySchemaLimitations,
  identityPasskeyClientBindings,
  identityTarget,
  rejectedIdentityPlugins,
  selectedIdentityPlugins,
} from "./identity-capabilities.js";
`,
    ),
    file("packages/auth/src/identity-capabilities.ts", identityCapabilityContent("postgres")),
  ];
}

function convexClientContent(framework: AuthFramework, hasEmail = true): string {
  const publicEntry = framework === "tanstack-start" ? "vite" : "next";
  const publicKey = framework === "tanstack-start" ? "VITE_APP_URL" : "NEXT_PUBLIC_APP_URL";
  return [
    `import { createAuthClient } from "better-auth/react";`,
    `import { convexClient } from "@convex-dev/better-auth/client/plugins";`,
    `import { twoFactorClient${hasEmail ? ", magicLinkClient" : ""} } from "better-auth/client/plugins";`,
    `import { env } from "@repo/config/${publicEntry}";`,
    ``,
    `// Convex mode – client includes convexClient() plugin for ConvexBetterAuthProvider`,
    `// Only the framework's statically public app URL may cross this client boundary.`,
    `const publicAuthBaseURL = env.${publicKey};`,
    ``,
    `export const authClient = createAuthClient({`,
    `  baseURL: publicAuthBaseURL,`,
    `  plugins: [`,
    `    convexClient(),`,
    `    twoFactorClient({`,
    `      onTwoFactorRedirect(context) {`,
    `        if (context.twoFactorMethods?.includes("totp") && typeof window !== "undefined") {`,
    `          window.location.href = "/2fa";`,
    `        }`,
    `      },`,
    `    }),`,
    ...(hasEmail ? [`    magicLinkClient(),`] : []),
    `  ],`,
    `});`,
    ``,
  ].join("\n");
}

function convexServerNextContent(hasMobile = false): string {
  const expoNote = hasMobile
    ? `\n// Mobile enabled: ensure @better-auth/expo is installed and trustedOrigins includes scheme\nimport { expo } from "@better-auth/expo";`
    : "";
  return [
    `import { convexBetterAuthNextJs } from "@convex-dev/better-auth/nextjs";${expoNote}`,
    `import type { Preloaded } from "convex/react";`,
    `import type { FunctionReference, FunctionReturnType, OptionalRestArgs } from "convex/server";`,
    `import { api } from "../../../convex/_generated/api";`,
    `import { env } from "@repo/config/server";`,
    ``,
    `function requireEnv(name: string, ...candidates: (string | undefined)[]): string {`,
    `  const found = candidates.find((v) => !!v && v.trim() !== "");`,
    `  if (!found) {`,
    `    throw new Error(name + " must be set for Convex Better Auth. Run bunx convex dev");`,
    `  }`,
    `  return found;`,
    `}`,
    ``,
    `const convexUrl = requireEnv(`,
    `  "CONVEX_URL",`,
    `  env.CONVEX_URL,`,
    `);`,
    ``,
    `const convexSiteUrl = requireEnv(`,
    `  "CONVEX_SITE_URL / SITE_URL",`,
    `  env.CONVEX_SITE_URL,`,
    `  env.SITE_URL,`,
    `);`,
    ``,
    `const _secret = env.BETTER_AUTH_SECRET;`,
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
    `const convexAuth = convexBetterAuthNextJs({`,
    `  convexUrl,`,
    `  convexSiteUrl,`,
    `});`,
    ``,
    `type AuthHandler = {`,
    `  GET: (request: Request) => Promise<Response>;`,
    `  POST: (request: Request) => Promise<Response>;`,
    `};`,
    `type PreloadAuthQuery = <Query extends FunctionReference<"query">>(`,
    `  query: Query,`,
    `  ...args: OptionalRestArgs<Query>`,
    `) => Promise<Preloaded<Query>>;`,
    `type FetchAuthQuery = <Query extends FunctionReference<"query">>(`,
    `  query: Query,`,
    `  ...args: OptionalRestArgs<Query>`,
    `) => Promise<FunctionReturnType<Query>>;`,
    `type FetchAuthMutation = <Mutation extends FunctionReference<"mutation">>(`,
    `  mutation: Mutation,`,
    `  ...args: OptionalRestArgs<Mutation>`,
    `) => Promise<FunctionReturnType<Mutation>>;`,
    `type FetchAuthAction = <Action extends FunctionReference<"action">>(`,
    `  action: Action,`,
    `  ...args: OptionalRestArgs<Action>`,
    `) => Promise<FunctionReturnType<Action>>;`,
    ``,
    `// Explicit public signatures prevent @convex-dev/better-auth's private`,
    `// convex-helpers EmptyObject alias from leaking into this package's declarations.`,
    `export const handler: AuthHandler = convexAuth.handler;`,
    `export const preloadAuthQuery: PreloadAuthQuery = convexAuth.preloadAuthQuery;`,
    `export const isAuthenticated: () => Promise<boolean> = convexAuth.isAuthenticated;`,
    `export const getToken: () => Promise<string | undefined> = convexAuth.getToken;`,
    `export const fetchAuthQuery: FetchAuthQuery = convexAuth.fetchAuthQuery;`,
    `export const fetchAuthMutation: FetchAuthMutation = convexAuth.fetchAuthMutation;`,
    `export const fetchAuthAction: FetchAuthAction = convexAuth.fetchAuthAction;`,
    ``,
    `export async function getRequestUser() {`,
    `  return await fetchAuthQuery(api.users.me, {});`,
    `}`,
    ``,
    `type RequestHandler = (request: Request) => Response | Promise<Response>;`,
    `function isRequestHandler(value: unknown): value is RequestHandler {`,
    `  return typeof value === "function";`,
    `}`,
    `function isHandlerMap(value: unknown): value is Record<string, unknown> {`,
    `  return typeof value === "object" && value !== null;`,
    `}`,
    `async function dispatchAuthHandler(candidate: unknown, request: Request): Promise<Response> {`,
    `  if (isRequestHandler(candidate)) return candidate(request);`,
    `  if (isHandlerMap(candidate)) {`,
    `    const methodHandler = candidate[request.method.toUpperCase()];`,
    `    if (isRequestHandler(methodHandler)) return methodHandler(request);`,
    `  }`,
    `  return new Response("Method not allowed", { status: 405 });`,
    `}`,
    ``,
    `// Backwards compatible shim for code that does import { auth } from "@repo/auth" expecting auth.handler(req)`,
    `export const auth = {`,
    `  handler: (request: Request): Promise<Response> => dispatchAuthHandler(handler, request),`,
    `};`,
    ``,
    `export type Auth = typeof auth;`,
    ``,
  ].join("\n");
}

function convexServerTanstackContent(hasMobile = false): string {
  const expoNote = hasMobile
    ? `\n// Mobile enabled: ensure @better-auth/expo is installed\nimport { expo } from "@better-auth/expo";`
    : "";
  return [
    `import { convexBetterAuthReactStart } from "@convex-dev/better-auth/react-start";${expoNote}`,
    `import { api } from "../../../convex/_generated/api";`,
    `import { env } from "@repo/config/server";`,
    ``,
    `function requireEnv(name: string, ...candidates: (string | undefined)[]): string {`,
    `  const found = candidates.find((v) => !!v && v.trim() !== "");`,
    `  if (!found) {`,
    `    throw new Error(name + " must be set for Convex Better Auth. Run bunx convex dev");`,
    `  }`,
    `  return found;`,
    `}`,
    ``,
    `const convexUrl = requireEnv(`,
    `  "CONVEX_URL",`,
    `  env.CONVEX_URL,`,
    `);`,
    ``,
    `const convexSiteUrl = requireEnv(`,
    `  "CONVEX_SITE_URL / SITE_URL",`,
    `  env.CONVEX_SITE_URL,`,
    `  env.SITE_URL,`,
    `);`,
    ``,
    `const _secret = env.BETTER_AUTH_SECRET;`,
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
    `export async function getRequestUser() {`,
    `  return await fetchAuthQuery(api.users.me, {});`,
    `}`,
    ``,
    `type RequestHandler = (request: Request) => Response | Promise<Response>;`,
    `function isRequestHandler(value: unknown): value is RequestHandler {`,
    `  return typeof value === "function";`,
    `}`,
    `function isHandlerMap(value: unknown): value is Record<string, unknown> {`,
    `  return typeof value === "object" && value !== null;`,
    `}`,
    `async function dispatchAuthHandler(candidate: unknown, request: Request): Promise<Response> {`,
    `  if (isRequestHandler(candidate)) return candidate(request);`,
    `  if (isHandlerMap(candidate)) {`,
    `    const methodHandler = candidate[request.method.toUpperCase()];`,
    `    if (isRequestHandler(methodHandler)) return methodHandler(request);`,
    `  }`,
    `  return new Response("Method not allowed", { status: 405 });`,
    `}`,
    ``,
    `export const auth = {`,
    `  handler: (request: Request): Promise<Response> => dispatchAuthHandler(handler, request),`,
    `};`,
    ``,
    `export type Auth = typeof auth;`,
    ``,
  ].join("\n");
}

function convexPackageFiles(
  framework: AuthFramework,
  hasMobile = false,
  hasEmail = true,
): TemplateFile[] {
  const isTanstack = framework === "tanstack-start";
  const serverContent = isTanstack
    ? convexServerTanstackContent(hasMobile)
    : convexServerNextContent(hasMobile);

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
          "./access": "./src/access.ts",
          "./identity-capabilities": "./src/identity-capabilities.ts",
        },
        dependencies: {
          "better-auth": `^${v.auth["better-auth"]}`,
          ...(hasMobile ? { "@better-auth/expo": `^${v.auth["@better-auth/expo"]}` } : {}),
          "@repo/config": "workspace:*",
          ...(hasEmail ? { "@repo/email": "workspace:*" } : {}),
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
    file(
      "packages/auth/src/index.ts",
      `export { auth, getRequestUser, type Auth } from "./server.js";
export {
  ac,
  roles,
  ADMIN_ROLE_NAMES,
  isAdminRole,
  type AccessRole,
  type AdminRole,
} from "./access.js";
export {
  identitySchemaLimitations,
  identityPasskeyClientBindings,
  identityTarget,
  rejectedIdentityPlugins,
  selectedIdentityPlugins,
} from "./identity-capabilities.js";
`,
    ),
    file("packages/auth/src/identity-capabilities.ts", identityCapabilityContent("convex")),
    file("packages/auth/src/client.ts", convexClientContent(framework, hasEmail)),
    file("packages/auth/src/server.ts", serverContent),
  ];
}

export function authPackage(
  frameworkOrAddons?: AuthFrameworkInput,
  maybeAddons?: Record<string, { inUse: boolean } | boolean> | AddonInstallerMap,
  options: { hasEmail?: boolean } = {},
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
  const hasEmail = options.hasEmail ?? true;
  if (isConvex) {
    return convexPackageFiles(framework, hasMobile, hasEmail);
  }
  return postgresPackageFiles(framework, hasMobile, hasEmail);
}
