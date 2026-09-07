import { identityClientAdapterContent } from "../../../apps/fragments/auth/client-adapter.js";
import { authNetworkSecurityHelpers, durableAuthRateLimitConfig } from "../../../auth-security.js";

function authNetworkSecurityLines(): string[] {
  return [
    ...authNetworkSecurityHelpers.split("\n"),
    "",
    "const authNetworkSecurity = resolveAuthNetworkSecurity(",
    "  env.BETTER_AUTH_URL,",
    "  env.TRUSTED_PROXY,",
    ");",
    "",
  ];
}

function durableAuthRateLimitLines(): string[] {
  return [
    ...durableAuthRateLimitConfig.split("\n"),
    "  advanced: {",
    "    trustedProxyHeaders: authNetworkSecurity.trustedProxyHeaders,",
    "    ipAddress: authNetworkSecurity.ipAddress,",
    "  },",
  ];
}

function socialProviderLines(): string[] {
  return [
    "  socialProviders: {",
    '    ...(env.GOOGLE_CLIENT_ID && !env.GOOGLE_CLIENT_ID.startsWith("REPLACE_WITH") && env.GOOGLE_CLIENT_SECRET && !env.GOOGLE_CLIENT_SECRET.startsWith("REPLACE_WITH") ? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } } : {}),',
    '    ...(env.GITHUB_CLIENT_ID && !env.GITHUB_CLIENT_ID.startsWith("REPLACE_WITH") && env.GITHUB_CLIENT_SECRET && !env.GITHUB_CLIENT_SECRET.startsWith("REPLACE_WITH") ? { github: { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET } } : {}),',
    "  },",
  ];
}

function secureAccountLinkingLines(hasEmail: boolean): string[] {
  return [
    "  account: {",
    "    encryptOAuthTokens: true,",
    "    accountLinking: {",
    `      enabled: ${hasEmail ? "true" : "false"},`,
    "      requireLocalEmailVerified: true,",
    hasEmail
      ? '      trustedProviders: ["google", "github"],'
      : "      disableImplicitLinking: true,",
    "    },",
    "  },",
  ];
}

function secureSessionLines(): string[] {
  return [
    "  session: {",
    "    // Sensitive passkey enrollment and OAuth-only deletion require a recent, persisted session.",
    "    freshAge: 60 * 5,",
    "    cookieCache: { enabled: false },",
    "  },",
  ];
}

const secureOrganizationPlugin =
  "    organization({ allowUserToCreateOrganization: false, disableOrganizationDeletion: true, teams: { enabled: true }, dynamicAccessControl: { enabled: true } }),";

export interface SingleServerAuthOptions {
  expoScheme?: string;
}

function normalizedExpoScheme(options: SingleServerAuthOptions): string | null {
  if (options.expoScheme === undefined) return null;
  return options.expoScheme.toLowerCase().replace(/[^a-z0-9]/g, "") || "app";
}

export function authClientSingle(
  hasEmail = true,
  target: "nextjs" | "tanstack-start" = "nextjs",
): string {
  return [
    "import { createAuthClient } from 'better-auth/react';",
    "import { passkeyClient } from '@better-auth/passkey/client';",
    `import { adminClient, organizationClient, twoFactorClient${hasEmail ? ", magicLinkClient" : ""} } from 'better-auth/client/plugins';`,
    "import { z } from 'zod';",
    "",
    "export const authClient = createAuthClient({",
    "  plugins: [",
    "    twoFactorClient({",
    "      onTwoFactorRedirect(context) {",
    "        if (context.twoFactorMethods?.includes('totp') && typeof window !== 'undefined') {",
    "          window.location.href = '/2fa';",
    "        }",
    "      },",
    "    }),",
    "    adminClient(),",
    "    passkeyClient(),",
    "    organizationClient(),",
    ...(hasEmail ? ["    magicLinkClient(),"] : []),
    "  ],",
    "});",
    "",
    identityClientAdapterContent({
      database: "postgres",
      emailPassword: hasEmail,
      target,
    }),
  ].join("\n");
}

export function authClientSingleConvex(
  hasEmail = true,
  target: "nextjs" | "tanstack-start" = "nextjs",
): string {
  return [
    "import { createAuthClient } from 'better-auth/react';",
    "import { convexClient } from '@convex-dev/better-auth/client/plugins';",
    `import { twoFactorClient${hasEmail ? ", magicLinkClient" : ""} } from 'better-auth/client/plugins';`,
    "import { z } from 'zod';",
    "",
    "export const authClient = createAuthClient({",
    "  plugins: [",
    "    convexClient(),",
    "    twoFactorClient({",
    "      onTwoFactorRedirect(context) {",
    "        if (context.twoFactorMethods?.includes('totp') && typeof window !== 'undefined') {",
    "          window.location.href = '/2fa';",
    "        }",
    "      },",
    "    }),",
    ...(hasEmail ? ["    magicLinkClient(),"] : []),
    "  ],",
    "});",
    "",
    identityClientAdapterContent({
      database: "convex",
      emailPassword: hasEmail,
      target,
    }),
  ].join("\n");
}

export function serverAuthSingle(hasEmail = true, options: SingleServerAuthOptions = {}): string {
  const expoScheme = normalizedExpoScheme(options);
  return [
    "import { betterAuth, type Auth as BetterAuthServer, type BetterAuthOptions } from 'better-auth';",
    "import { drizzleAdapter } from 'better-auth/adapters/drizzle';",
    "import { nextCookies } from 'better-auth/next-js';",
    ...(expoScheme ? ["import { expo } from '@better-auth/expo';"] : []),
    "import { passkey } from '@better-auth/passkey';",
    "import { admin, type AdminOptions } from 'better-auth/plugins/admin';",
    "import { organization } from 'better-auth/plugins/organization';",
    "import { twoFactor } from 'better-auth/plugins/two-factor';",
    ...(hasEmail ? ["import { magicLink } from 'better-auth/plugins/magic-link';"] : []),
    "import { db } from '@/server/db';",
    "import * as schema from '@/server/db/schema/auth';",
    "import { env } from '@/lib/env/server';",
    ...(hasEmail
      ? [
          'import { resolveEmailLocale, sendEmail, transactionalEmailSubject } from "@/server/email";',
          'import ResetPasswordEmail from "@/server/email/templates/ResetPassword";',
          'import VerifyEmail from "@/server/email/templates/VerifyEmail";',
          'import MagicLinkEmail from "@/server/email/templates/MagicLink";',
        ]
      : []),
    "",
    "const _authSecret = env.BETTER_AUTH_SECRET;",
    'if (!_authSecret || _authSecret.length < 32 || _authSecret.startsWith("REPLACE_WITH") || _authSecret === "REPLACE_WITH_A_STRONG_SECRET_AT_LEAST_32_CHARS") {',
    '  throw new Error("BETTER_AUTH_SECRET must be set to a strong random value, not placeholder, at least 32 chars");',
    "}",
    "",
    "export const selectedIdentityPlugins = ['admin', 'two-factor', 'passkey', 'organization'] as const;",
    "type AdminPlugin = ReturnType<typeof admin<AdminOptions>>;",
    "type PortableAuthOptions = BetterAuthOptions & { plugins: [AdminPlugin] };",
    "interface AdminCreationAuthContext {",
    '  generateId(options: { model: "user" | "account"; size?: number }): string | false;',
    "  password: {",
    "    hash(password: string): Promise<string>;",
    "    config: { minPasswordLength: number; maxPasswordLength: number };",
    "  };",
    "}",
    'export type Auth = Pick<BetterAuthServer<PortableAuthOptions>, "handler" | "api"> & {',
    "  readonly $context: Promise<AdminCreationAuthContext>;",
    "};",
    "",
    ...authNetworkSecurityLines(),
    "const configuredAuth = betterAuth({",
    "  appName: env.APP_NAME ?? 'GhostInit',",
    "  secret: _authSecret,",
    "  baseURL: env.BETTER_AUTH_URL,",
    ...(expoScheme ? [`  trustedOrigins: [env.BETTER_AUTH_URL, '${expoScheme}://'],`] : []),
    "  database: drizzleAdapter(db, {",
    "    provider: 'pg',",
    "    schema: {",
    "      user: schema.users,",
    "      account: schema.accounts,",
    "      session: schema.sessions,",
    "      verification: schema.verifications,",
    "      rateLimit: schema.rateLimits,",
    "      twoFactor: schema.twoFactors,",
    "      passkey: schema.passkeys,",
    "      organization: schema.organizations,",
    "      member: schema.members,",
    "      invitation: schema.invitations,",
    "      team: schema.teams,",
    "      teamMember: schema.teamMembers,",
    "      organizationRole: schema.organizationRoles,",
    "    },",
    "  }),",
    "  emailAndPassword: {",
    `    enabled: ${hasEmail ? "true" : "false"},`,
    "    autoSignInAfterRegistration: false,",
    "    revokeSessionsOnPasswordReset: true,",
    ...(hasEmail ? ["    requireEmailVerification: true,"] : []),
    ...(hasEmail
      ? [
          "    sendResetPassword: async ({ user, url }, request) => {",
          "      const appName = env.APP_NAME ?? 'GhostInit';",
          "      const locale = resolveEmailLocale(request?.headers);",
          '      const subject = transactionalEmailSubject("password-reset", locale, appName);',
          "      await sendEmail(user.email, subject, ResetPasswordEmail,",
          "        { link: url, appName, locale },",
          "      );",
          "    },",
        ]
      : []),
    "  },",
    ...(hasEmail
      ? [
          "  emailVerification: {",
          "    sendOnSignUp: true,",
          "    autoSignInAfterVerification: true,",
          "    sendVerificationEmail: async ({ user, url }, request) => {",
          "      const appName = env.APP_NAME ?? 'GhostInit';",
          "      const locale = resolveEmailLocale(request?.headers);",
          '      await sendEmail(user.email, transactionalEmailSubject("verification", locale, appName), VerifyEmail, { link: url, appName, locale });',
          "    },",
          "  },",
        ]
      : []),
    ...socialProviderLines(),
    ...secureAccountLinkingLines(hasEmail),
    ...secureSessionLines(),
    ...durableAuthRateLimitLines(),
    "  plugins: [",
    ...(expoScheme ? ["    expo(),"] : []),
    "    admin(),",
    "    twoFactor({ issuer: env.BETTER_AUTH_URL, twoFactorCookieMaxAge: 600, accountLockout: { enabled: true, maxFailedAttempts: 5, durationSeconds: 900 } }),",
    "    passkey(),",
    secureOrganizationPlugin,
    ...(hasEmail
      ? [
          "    magicLink({",
          '      storeToken: "hashed",',
          "      sendMagicLink: async ({ email, url }, context) => {",
          "        const appName = env.APP_NAME ?? 'GhostInit';",
          "        const locale = resolveEmailLocale(context?.request?.headers);",
          '        await sendEmail(email, transactionalEmailSubject("magic-link", locale, appName), MagicLinkEmail, { link: url, appName, locale });',
          "      },",
          "    }),",
        ]
      : []),
    "    nextCookies(),",
    "  ],",
    "});",
    "",
    "export const auth: Auth = configuredAuth;",
    "",
    "export async function getRequestUser(headers: Headers) {",
    "  const session = await auth.api.getSession({ headers });",
    "  return session?.user ?? null;",
    "}",
    "",
  ].join("\n");
}

export function serverAuthTanstackSingle(
  hasEmail = true,
  options: SingleServerAuthOptions = {},
): string {
  const expoScheme = normalizedExpoScheme(options);
  return [
    "import { betterAuth, type Auth as BetterAuthServer, type BetterAuthOptions } from 'better-auth';",
    "import { drizzleAdapter } from 'better-auth/adapters/drizzle';",
    "import { tanstackStartCookies } from 'better-auth/tanstack-start';",
    ...(expoScheme ? ["import { expo } from '@better-auth/expo';"] : []),
    "import { passkey } from '@better-auth/passkey';",
    "import { admin, type AdminOptions } from 'better-auth/plugins/admin';",
    "import { organization } from 'better-auth/plugins/organization';",
    "import { twoFactor } from 'better-auth/plugins/two-factor';",
    ...(hasEmail ? ["import { magicLink } from 'better-auth/plugins/magic-link';"] : []),
    "import { db } from '@/server/db';",
    "import * as schema from '@/server/db/schema/auth';",
    "import { env } from '@/lib/env/server';",
    ...(hasEmail
      ? [
          'import { resolveEmailLocale, sendEmail, transactionalEmailSubject } from "@/server/email";',
          'import ResetPasswordEmail from "@/server/email/templates/ResetPassword";',
          'import VerifyEmail from "@/server/email/templates/VerifyEmail";',
          'import MagicLinkEmail from "@/server/email/templates/MagicLink";',
        ]
      : []),
    "",
    "const _authSecret = env.BETTER_AUTH_SECRET;",
    'if (!_authSecret || _authSecret.length < 32 || _authSecret.startsWith("REPLACE_WITH") || _authSecret === "REPLACE_WITH_A_STRONG_SECRET_AT_LEAST_32_CHARS") {',
    '  throw new Error("BETTER_AUTH_SECRET must be set to a strong random value, not placeholder, at least 32 chars");',
    "}",
    "",
    "export const selectedIdentityPlugins = ['admin', 'two-factor', 'passkey', 'organization'] as const;",
    "type AdminPlugin = ReturnType<typeof admin<AdminOptions>>;",
    "type PortableAuthOptions = BetterAuthOptions & { plugins: [AdminPlugin] };",
    "interface AdminCreationAuthContext {",
    '  generateId(options: { model: "user" | "account"; size?: number }): string | false;',
    "  password: {",
    "    hash(password: string): Promise<string>;",
    "    config: { minPasswordLength: number; maxPasswordLength: number };",
    "  };",
    "}",
    'export type Auth = Pick<BetterAuthServer<PortableAuthOptions>, "handler" | "api"> & {',
    "  readonly $context: Promise<AdminCreationAuthContext>;",
    "};",
    "",
    ...authNetworkSecurityLines(),
    "const configuredAuth = betterAuth({",
    "  appName: env.APP_NAME ?? 'GhostInit',",
    "  secret: _authSecret,",
    "  baseURL: env.BETTER_AUTH_URL,",
    ...(expoScheme ? [`  trustedOrigins: [env.BETTER_AUTH_URL, '${expoScheme}://'],`] : []),
    "  database: drizzleAdapter(db, {",
    "    provider: 'pg',",
    "    schema: {",
    "      user: schema.users,",
    "      account: schema.accounts,",
    "      session: schema.sessions,",
    "      verification: schema.verifications,",
    "      rateLimit: schema.rateLimits,",
    "      twoFactor: schema.twoFactors,",
    "      passkey: schema.passkeys,",
    "      organization: schema.organizations,",
    "      member: schema.members,",
    "      invitation: schema.invitations,",
    "      team: schema.teams,",
    "      teamMember: schema.teamMembers,",
    "      organizationRole: schema.organizationRoles,",
    "    },",
    "  }),",
    "  emailAndPassword: {",
    `    enabled: ${hasEmail ? "true" : "false"},`,
    "    autoSignInAfterRegistration: false,",
    "    revokeSessionsOnPasswordReset: true,",
    ...(hasEmail ? ["    requireEmailVerification: true,"] : []),
    ...(hasEmail
      ? [
          "    sendResetPassword: async ({ user, url }, request) => {",
          "      const appName = env.APP_NAME ?? 'GhostInit';",
          "      const locale = resolveEmailLocale(request?.headers);",
          '      const subject = transactionalEmailSubject("password-reset", locale, appName);',
          "      await sendEmail(user.email, subject, ResetPasswordEmail,",
          "        { link: url, appName, locale },",
          "      );",
          "    },",
        ]
      : []),
    "  },",
    ...(hasEmail
      ? [
          "  emailVerification: {",
          "    sendOnSignUp: true,",
          "    autoSignInAfterVerification: true,",
          "    sendVerificationEmail: async ({ user, url }, request) => {",
          "      const appName = env.APP_NAME ?? 'GhostInit';",
          "      const locale = resolveEmailLocale(request?.headers);",
          '      await sendEmail(user.email, transactionalEmailSubject("verification", locale, appName), VerifyEmail, { link: url, appName, locale });',
          "    },",
          "  },",
        ]
      : []),
    ...socialProviderLines(),
    ...secureAccountLinkingLines(hasEmail),
    ...secureSessionLines(),
    ...durableAuthRateLimitLines(),
    "  plugins: [",
    ...(expoScheme ? ["    expo(),"] : []),
    "    admin(),",
    "    twoFactor({ issuer: env.BETTER_AUTH_URL, twoFactorCookieMaxAge: 600, accountLockout: { enabled: true, maxFailedAttempts: 5, durationSeconds: 900 } }),",
    "    passkey(),",
    secureOrganizationPlugin,
    ...(hasEmail
      ? [
          "    magicLink({",
          '      storeToken: "hashed",',
          "      sendMagicLink: async ({ email, url }, context) => {",
          "        const appName = env.APP_NAME ?? 'GhostInit';",
          "        const locale = resolveEmailLocale(context?.request?.headers);",
          '        await sendEmail(email, transactionalEmailSubject("magic-link", locale, appName), MagicLinkEmail, { link: url, appName, locale });',
          "      },",
          "    }),",
        ]
      : []),
    "    tanstackStartCookies(),",
    "  ],",
    "});",
    "",
    "export const auth: Auth = configuredAuth;",
    "",
    "export async function getRequestUser(headers: Headers) {",
    "  const session = await auth.api.getSession({ headers });",
    "  return session?.user ?? null;",
    "}",
    "",
  ].join("\n");
}

type SingleConvexAuthFramework = "nextjs" | "tanstack-start";

function serverAuthSingleConvexContent(framework: SingleConvexAuthFramework): string {
  const isNext = framework === "nextjs";
  const wrapper = isNext ? "convexBetterAuthNextJs" : "convexBetterAuthReactStart";
  const wrapperModule = isNext
    ? "@convex-dev/better-auth/nextjs"
    : "@convex-dev/better-auth/react-start";

  return [
    `import { ${wrapper} } from "${wrapperModule}";`,
    ...(isNext
      ? [
          'import type { Preloaded } from "convex/react";',
          'import type { FunctionReference, FunctionReturnType, OptionalRestArgs } from "convex/server";',
        ]
      : []),
    'import { api } from "../../../convex/_generated/api";',
    'import { env } from "@/lib/env/server";',
    "",
    "function requireEnv(name: string, ...candidates: (string | undefined)[]): string {",
    '  const found = candidates.find((value) => !!value && value.trim() !== "");',
    "  if (!found) {",
    '    throw new Error(name + " must be set for Convex Better Auth. Run bunx convex dev");',
    "  }",
    "  return found;",
    "}",
    "",
    "const convexUrl = requireEnv(",
    '  "CONVEX_URL",',
    "  env.CONVEX_URL,",
    ");",
    "",
    "const convexSiteUrl = requireEnv(",
    '  "CONVEX_SITE_URL / SITE_URL",',
    "  env.CONVEX_SITE_URL,",
    "  env.SITE_URL,",
    ");",
    "",
    "const authSecret = env.BETTER_AUTH_SECRET;",
    'if (!authSecret || authSecret.length < 32 || authSecret.startsWith("REPLACE_WITH") || authSecret === "REPLACE_WITH_A_STRONG_SECRET_AT_LEAST_32_CHARS") {',
    '  throw new Error("BETTER_AUTH_SECRET must be set to a strong random value, not placeholder, at least 32 chars");',
    "}",
    "",
    ...(isNext ? ["const convexAuth = convexBetterAuthNextJs({"] : ["export const {"]),
    ...(isNext
      ? []
      : [
          "  handler,",
          "  getToken,",
          "  fetchAuthQuery,",
          "  fetchAuthMutation,",
          "  fetchAuthAction,",
          `} = ${wrapper}({`,
        ]),
    "  convexUrl,",
    "  convexSiteUrl,",
    "});",
    ...(isNext
      ? [
          "",
          "type AuthHandler = {",
          "  GET: (request: Request) => Promise<Response>;",
          "  POST: (request: Request) => Promise<Response>;",
          "};",
          'type PreloadAuthQuery = <Query extends FunctionReference<"query">>(',
          "  query: Query,",
          "  ...args: OptionalRestArgs<Query>",
          ") => Promise<Preloaded<Query>>;",
          'type FetchAuthQuery = <Query extends FunctionReference<"query">>(',
          "  query: Query,",
          "  ...args: OptionalRestArgs<Query>",
          ") => Promise<FunctionReturnType<Query>>;",
          'type FetchAuthMutation = <Mutation extends FunctionReference<"mutation">>(',
          "  mutation: Mutation,",
          "  ...args: OptionalRestArgs<Mutation>",
          ") => Promise<FunctionReturnType<Mutation>>;",
          'type FetchAuthAction = <Action extends FunctionReference<"action">>(',
          "  action: Action,",
          "  ...args: OptionalRestArgs<Action>",
          ") => Promise<FunctionReturnType<Action>>;",
          "",
          "// Explicit public signatures prevent @convex-dev/better-auth's private",
          "// convex-helpers EmptyObject alias from leaking into this app's declarations.",
          "export const handler: AuthHandler = convexAuth.handler;",
          "export const preloadAuthQuery: PreloadAuthQuery = convexAuth.preloadAuthQuery;",
          "export const isAuthenticated: () => Promise<boolean> = convexAuth.isAuthenticated;",
          "export const getToken: () => Promise<string | undefined> = convexAuth.getToken;",
          "export const fetchAuthQuery: FetchAuthQuery = convexAuth.fetchAuthQuery;",
          "export const fetchAuthMutation: FetchAuthMutation = convexAuth.fetchAuthMutation;",
          "export const fetchAuthAction: FetchAuthAction = convexAuth.fetchAuthAction;",
        ]
      : []),
    "",
    "export async function getRequestUser() {",
    "  return await fetchAuthQuery(api.users.me, {});",
    "}",
    "",
    "type RequestHandler = (request: Request) => Response | Promise<Response>;",
    "function isRequestHandler(value: unknown): value is RequestHandler {",
    '  return typeof value === "function";',
    "}",
    "function isHandlerMap(value: unknown): value is Record<string, unknown> {",
    '  return typeof value === "object" && value !== null;',
    "}",
    "async function dispatchAuthHandler(candidate: unknown, request: Request): Promise<Response> {",
    "  if (isRequestHandler(candidate)) return candidate(request);",
    "  if (isHandlerMap(candidate)) {",
    "    const methodHandler = candidate[request.method.toUpperCase()];",
    "    if (isRequestHandler(methodHandler)) return methodHandler(request);",
    "  }",
    '  return new Response("Method not allowed", { status: 405 });',
    "}",
    "",
    "export const auth = {",
    "  handler: (request: Request): Promise<Response> => dispatchAuthHandler(handler, request),",
    "};",
    "",
  ].join("\n");
}

export function serverAuthSingleConvex(): string {
  return serverAuthSingleConvexContent("nextjs");
}

export function serverAuthTanstackSingleConvex(): string {
  return serverAuthSingleConvexContent("tanstack-start");
}
