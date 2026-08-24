export function authClientSingle(): string {
  return [
    "import { createAuthClient } from 'better-auth/react';",
    "import { adminClient, twoFactorClient } from 'better-auth/client/plugins';",
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
    "  ],",
    "});",
    "",
  ].join("\n");
}

export function authClientSingleConvex(): string {
  return [
    "import { createAuthClient } from 'better-auth/react';",
    "import { convexClient } from '@convex-dev/better-auth/client/plugins';",
    "import { adminClient, twoFactorClient } from 'better-auth/client/plugins';",
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
    "    adminClient(),",
    "  ],",
    "});",
    "",
  ].join("\n");
}

export function serverAuthSingle(hasEmail = true): string {
  return [
    "import { betterAuth } from 'better-auth';",
    "import { drizzleAdapter } from 'better-auth/adapters/drizzle';",
    "import { nextCookies } from 'better-auth/next-js';",
    "import { admin } from 'better-auth/plugins/admin';",
    "import { twoFactor } from 'better-auth/plugins';",
    "import { db } from '@/server/db';",
    "import * as schema from '@/server/db/schema/auth';",
    ...(hasEmail
      ? [
          'import { sendEmail } from "@/server/email";',
          'import ResetPasswordEmail from "@/server/email/templates/ResetPassword";',
          'import VerifyEmail from "@/server/email/templates/VerifyEmail";',
        ]
      : []),
    "",
    "const _authSecret = process.env.BETTER_AUTH_SECRET!;",
    'if (!_authSecret || _authSecret.length < 32 || _authSecret.startsWith("REPLACE_WITH") || _authSecret === "REPLACE_WITH_A_STRONG_SECRET_AT_LEAST_32_CHARS") {',
    '  throw new Error("BETTER_AUTH_SECRET must be set to a strong random value, not placeholder, at least 32 chars");',
    "}",
    "",
    "export const auth = betterAuth({",
    "  appName: process.env.APP_NAME ?? 'GhostInit',",
    "  secret: _authSecret,",
    "  baseURL: process.env.BETTER_AUTH_URL!,",
    "  database: drizzleAdapter(db, { provider: 'pg', schema }),",
    "  emailAndPassword: {",
    "    enabled: true,",
    "    autoSignInAfterRegistration: false,",
    ...(hasEmail
      ? [
          "    sendResetPassword: async ({ user, url }) => {",
          "      const appName = process.env.APP_NAME ?? 'GhostInit';",
          "      const subject = `Reset your password - ${appName}`;",
          "      await sendEmail(user.email, subject, ResetPasswordEmail,",
          "        { link: url, appName },",
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
          "    sendVerificationEmail: async ({ user, url }) => {",
          "      const appName = process.env.APP_NAME ?? 'GhostInit';",
          "      await sendEmail(user.email, `Verify your email - ${appName}`, VerifyEmail, { link: url, appName });",
          "    },",
          "  },",
        ]
      : []),
    "  plugins: [admin(), twoFactor({ issuer: process.env.BETTER_AUTH_URL! }), nextCookies()],",
    "});",
    "",
    "export async function getRequestUser(headers: Headers) {",
    "  const session = await auth.api.getSession({ headers });",
    "  return session?.user ?? null;",
    "}",
    "",
  ].join("\n");
}

export function serverAuthTanstackSingle(hasEmail = true): string {
  return [
    "import { betterAuth } from 'better-auth';",
    "import { drizzleAdapter } from 'better-auth/adapters/drizzle';",
    "import { tanstackStartCookies } from 'better-auth/tanstack-start';",
    "import { admin } from 'better-auth/plugins/admin';",
    "import { twoFactor } from 'better-auth/plugins';",
    "import { db } from '@/server/db';",
    "import * as schema from '@/server/db/schema/auth';",
    ...(hasEmail
      ? [
          'import { sendEmail } from "@/server/email";',
          'import ResetPasswordEmail from "@/server/email/templates/ResetPassword";',
          'import VerifyEmail from "@/server/email/templates/VerifyEmail";',
        ]
      : []),
    "",
    "const _authSecret = process.env.BETTER_AUTH_SECRET!;",
    'if (!_authSecret || _authSecret.length < 32 || _authSecret.startsWith("REPLACE_WITH") || _authSecret === "REPLACE_WITH_A_STRONG_SECRET_AT_LEAST_32_CHARS") {',
    '  throw new Error("BETTER_AUTH_SECRET must be set to a strong random value, not placeholder, at least 32 chars");',
    "}",
    "",
    "export const auth = betterAuth({",
    "  appName: process.env.APP_NAME ?? 'GhostInit',",
    "  secret: _authSecret,",
    "  baseURL: process.env.BETTER_AUTH_URL!,",
    "  database: drizzleAdapter(db, { provider: 'pg', schema }),",
    "  emailAndPassword: {",
    "    enabled: true,",
    "    autoSignInAfterRegistration: false,",
    ...(hasEmail
      ? [
          "    sendResetPassword: async ({ user, url }) => {",
          "      const appName = process.env.APP_NAME ?? 'GhostInit';",
          "      const subject = `Reset your password - ${appName}`;",
          "      await sendEmail(user.email, subject, ResetPasswordEmail,",
          "        { link: url, appName },",
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
          "    sendVerificationEmail: async ({ user, url }) => {",
          "      const appName = process.env.APP_NAME ?? 'GhostInit';",
          "      await sendEmail(user.email, `Verify your email - ${appName}`, VerifyEmail, { link: url, appName });",
          "    },",
          "  },",
        ]
      : []),
    "  plugins: [admin(), twoFactor({ issuer: process.env.BETTER_AUTH_URL! }), tanstackStartCookies()],",
    "});",
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
  const publicConvexUrl = isNext ? "NEXT_PUBLIC_CONVEX_URL" : "VITE_CONVEX_URL";
  const publicConvexSiteUrl = isNext ? "NEXT_PUBLIC_CONVEX_SITE_URL" : "VITE_CONVEX_SITE_URL";

  return [
    `import { ${wrapper} } from "${wrapperModule}";`,
    'import { api } from "../../../convex/_generated/api";',
    "",
    "function requireEnv(name: string, ...candidates: (string | undefined)[]): string {",
    '  const found = candidates.find((value) => !!value && value.trim() !== "");',
    "  if (!found) {",
    '    throw new Error(name + " must be set for Convex Better Auth. Run npx convex dev");',
    "  }",
    "  return found;",
    "}",
    "",
    "const convexUrl = requireEnv(",
    '  "CONVEX_URL",',
    `  process.env.${publicConvexUrl},`,
    "  process.env.CONVEX_URL,",
    ");",
    "",
    "const convexSiteUrl = requireEnv(",
    '  "CONVEX_SITE_URL / SITE_URL",',
    `  process.env.${publicConvexSiteUrl},`,
    "  process.env.CONVEX_SITE_URL,",
    "  process.env.SITE_URL,",
    ");",
    "",
    "const authSecret = process.env.BETTER_AUTH_SECRET;",
    'if (!authSecret || authSecret.length < 32 || authSecret.startsWith("REPLACE_WITH") || authSecret === "REPLACE_WITH_A_STRONG_SECRET_AT_LEAST_32_CHARS") {',
    '  throw new Error("BETTER_AUTH_SECRET must be set to a strong random value, not placeholder, at least 32 chars");',
    "}",
    "",
    "export const {",
    "  handler,",
    ...(isNext ? ["  preloadAuthQuery,", "  isAuthenticated,"] : []),
    "  getToken,",
    "  fetchAuthQuery,",
    "  fetchAuthMutation,",
    "  fetchAuthAction,",
    `} = ${wrapper}({`,
    "  convexUrl,",
    "  convexSiteUrl,",
    "});",
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
