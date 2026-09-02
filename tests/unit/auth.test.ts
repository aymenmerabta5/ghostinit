import { describe, it, expect } from "bun:test";
import {
  ADMIN_USER_PERMISSIONS,
  SESSION_PERMISSIONS,
  SUPER_ADMIN_USER_PERMISSIONS,
} from "../../src/templates/access";
import { authPackage } from "../../src/templates/auth";
import {
  compiledAdminUserPermissions,
  compiledSessionPermissions,
  compiledSuperAdminUserPermissions,
} from "../fixtures/compatibility/drizzle-betterauth-orpc/src/access-contract";

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
