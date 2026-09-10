import { describe, it, expect } from "bun:test";
import {
  ADMIN_USER_PERMISSIONS,
  SESSION_PERMISSIONS,
  SUPER_ADMIN_USER_PERMISSIONS,
} from "../../src/templates/access";
import { authPackage } from "../../src/templates/auth";
import {
  serverAuthSingle,
  serverAuthTanstackSingle,
} from "../../src/templates/modes/single/server/auth.js";
import {
  compiledAdminUserPermissions,
  compiledSessionPermissions,
  compiledSuperAdminUserPermissions,
} from "../fixtures/compatibility/drizzle-betterauth-orpc/src/access-permissions";

describe("auth package template", () => {
  it("keeps compiled permission fixtures identical to the emitted access contract", () => {
    expect(compiledSuperAdminUserPermissions).toEqual(SUPER_ADMIN_USER_PERMISSIONS);
    expect(compiledAdminUserPermissions).toEqual(ADMIN_USER_PERMISSIONS);
    expect(compiledSessionPermissions).toEqual(SESSION_PERMISSIONS);
  });
  it("configures cookie security flags", () => {
    const files = authPackage();
    const server = files.find((f) => f.path === "packages/auth/src/server.ts")?.content ?? "";
    expect(server).toContain("httpOnly: true");
    expect(server).toContain("secure: isHttps");
    expect(server).toContain('sameSite: "lax"');
  });

  it("uses BETTER_AUTH_URL as twoFactor issuer", () => {
    const files = authPackage();
    const server = files.find((f) => f.path === "packages/auth/src/server.ts")?.content ?? "";
    expect(server).toContain("issuer: env.BETTER_AUTH_URL");
    expect(server).toContain("twoFactorCookieMaxAge: 600");
    expect(server).toContain("accountLockout: { enabled: true");
  });

  it("keeps IP tracking enabled so the rate limiter actually runs", () => {
    const files = authPackage();
    const server = files.find((f) => f.path === "packages/auth/src/server.ts")?.content ?? "";
    const lower = server.toLowerCase();
    expect(lower.includes("trusted proxy") || lower.includes("trusted_proxy")).toBe(true);

    // Regression: this used to assert `disableIpTracking: true`, pinning the bug.
    // better-auth keys its limiter on the client IP, so disabling IP tracking made
    // rateLimit.enabled:true completely inert — 0 of 300 sign-in attempts blocked.
    expect(server).not.toContain("disableIpTracking: true");
    expect(server).toContain("disableIpTracking: false");
    expect(server).toContain("rateLimit");

    expect(server).toContain('storage: "database"');
    expect(server).not.toContain('storage: "memory"');
    expect(server).toContain('ipAddressHeaders: trustedProxyHeaders ? ["x-forwarded-for"] : []');
    expect(server).toContain("TRUSTED_PROXY must be true for a non-local Better Auth URL");
    expect(server).toContain("enforceTrustedAuthClientIp(request, currentRule");
  });

  it("warns when BETTER_AUTH_URL is localhost", () => {
    const files = authPackage();
    const server = files.find((f) => f.path === "packages/auth/src/server.ts")?.content ?? "";
    expect(server).toContain("BETTER_AUTH_URL is still set to localhost");
  });

  it("uses an explicit server and access barrel", () => {
    const files = authPackage();
    const index = files.find((f) => f.path === "packages/auth/src/index.ts")?.content ?? "";
    expect(index).toBe(`export { auth, getRequestUser, type Auth } from "./server";
export {
  ac,
  roles,
  ADMIN_ROLE_NAMES,
  isAdminRole,
  type AccessRole,
  type AdminRole,
} from "./access";
export {
  identitySchemaLimitations,
  identityPasskeyClientBindings,
  identityTarget,
  rejectedIdentityPlugins,
  selectedIdentityPlugins,
} from "./identity-capabilities";
`);
  });

  it("enables JSX only when Postgres auth imports the email package source", () => {
    const postgresEmail = authPackage("nextjs", undefined, { hasEmail: true });
    const postgresNoEmail = authPackage("nextjs", undefined, { hasEmail: false });
    const convexEmail = authPackage("nextjs", { convex: true }, { hasEmail: true });

    const compilerOptions = (files: ReturnType<typeof authPackage>) => {
      const content = files.find((file) => file.path === "packages/auth/tsconfig.json")?.content;
      if (!content) throw new Error("Expected generated auth tsconfig");
      return (JSON.parse(content) as { compilerOptions: Record<string, unknown> }).compilerOptions;
    };

    expect(compilerOptions(postgresEmail).jsx).toBe("react-jsx");
    expect(compilerOptions(postgresNoEmail).jsx).toBeUndefined();
    expect(compilerOptions(convexEmail).jsx).toBeUndefined();
    expect(
      postgresNoEmail.find((file) => file.path === "packages/auth/src/server.ts")?.content ?? "",
    ).not.toContain("@repo/email");
  });
});

describe("explicit Drizzle auth minimal entrypoint", () => {
  for (const mode of ["monorepo", "single"] as const) {
    for (const framework of ["nextjs", "tanstack-start"] as const) {
      for (const hasEmail of [false, true]) {
        for (const hasExpo of [false, true]) {
          it(
            mode +
              "/" +
              framework +
              "/email-" +
              hasEmail +
              "/expo-" +
              hasExpo +
              " preserves its adapter and authentication policy",
            () => {
              const options = hasExpo ? { expoScheme: "nativefixture" } : {};
              const server =
                mode === "monorepo"
                  ? authPackage(framework, { mobile: { inUse: hasExpo } }, { hasEmail }).find(
                      (file) => file.path === "packages/auth/src/server.ts",
                    )?.content
                  : framework === "nextjs"
                    ? serverAuthSingle(hasEmail, options)
                    : serverAuthTanstackSingle(hasEmail, options);
              if (!server) throw new Error("Generated auth server is missing");
              expect(server).toMatch(
                /import \{ betterAuth, type BetterAuthOptions \} from ["']better-auth\/minimal["'];/,
              );
              expect(server).toMatch(
                /import type \{ Auth as BetterAuthServer \} from ["']better-auth["'];/,
              );
              const runtimeSource = new Bun.Transpiler({ loader: "ts" }).transformSync(server);
              expect(runtimeSource).toMatch(/\bfrom\s+["']better-auth\/minimal["']/);
              expect(runtimeSource).not.toMatch(/\bfrom\s+["']better-auth["']/);
              expect(server).toContain("BetterAuthServer<PortableAuthOptions>");
              expect(server).toContain("const configuredAuth = betterAuth({");
              expect(server).toContain("export const auth: Auth = configuredAuth;");
              const adapterStart = server.indexOf("database: drizzleAdapter(db, {");
              const adapterEnd = server.indexOf("emailAndPassword:", adapterStart);
              expect(adapterStart).toBeGreaterThanOrEqual(0);
              expect(adapterEnd).toBeGreaterThan(adapterStart);
              const adapter = server.slice(adapterStart, adapterEnd);
              expect(adapter).toMatch(/provider:\s*["']pg["']/);
              expect(adapter).toContain("transaction: true");
              for (const model of [
                "user",
                "account",
                "session",
                "verification",
                "rateLimit",
                "twoFactor",
                "passkey",
                "organization",
                "member",
                "invitation",
                "team",
                "teamMember",
                "organizationRole",
              ]) {
                expect(adapter).toMatch(new RegExp("\\b" + model + ":"));
              }
              for (const plugin of [
                "transactionalAccountDeletion",
                "profileUpdateValidation",
                "admin",
                "twoFactor",
                "passkey",
                "organization",
              ]) {
                expect(server).toMatch(new RegExp("\\b" + plugin + "\\("));
              }
              for (const path of [
                "better-auth/plugins/admin",
                "better-auth/plugins/organization",
                "better-auth/plugins/two-factor",
                "@better-auth/passkey",
              ]) {
                expect(server).toContain(path);
              }
              const cookiePlugin = framework === "nextjs" ? "nextCookies" : "tanstackStartCookies";
              expect(server).toContain(cookiePlugin + "()");
              expect(server).toContain("freshAge: 60 * 5");
              expect(server).toMatch(/cookieCache:\s*\{\s*enabled: false/);
              expect(server).toContain("autoSignInAfterRegistration: false");
              expect(server).toContain("revokeSessionsOnPasswordReset: true");
              expect(server).toContain("encryptOAuthTokens: true");
              expect(server).toContain("requireLocalEmailVerified: true");
              expect(server).toMatch(/storage:\s*["']database["']/);
              expect(server).toContain("disableIpTracking: false");
              expect(server).toContain("allowUserToCreateOrganization: false");
              expect(server).toContain("disableOrganizationDeletion: true");
              expect(server).toMatch(/teams:\s*\{\s*enabled: true/);
              expect(server).toMatch(/dynamicAccessControl:\s*\{\s*enabled: true/);
              expect(server).toMatch(
                new RegExp("emailAndPassword:\\s*\\{\\s*enabled: " + hasEmail),
              );
              expect(server.includes("requireEmailVerification: true")).toBe(hasEmail);
              expect(server.includes("sendResetPassword:")).toBe(hasEmail);
              expect(server.includes("sendVerificationEmail:")).toBe(hasEmail);
              expect(server.includes("better-auth/plugins/magic-link")).toBe(hasEmail);
              expect(server.includes("magicLink({")).toBe(hasEmail);
              expect(server.includes("disableImplicitLinking: true")).toBe(!hasEmail);
              expect(server.includes("@better-auth/expo")).toBe(hasExpo);
              expect(/\bexpo\(\)/.test(server)).toBe(hasExpo);
              if (hasExpo)
                expect(server).toContain(
                  mode === "monorepo" ? "__APP_SCHEME__://" : "nativefixture://",
                );
              expect(server).not.toMatch(/\b(?:runMigrations|getMigrations|kysely)\b/);
            },
          );
        }
      }
    }
  }
});
