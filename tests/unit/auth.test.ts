import { describe, it, expect } from "bun:test";
import { authPackage } from "../../src/templates/auth";

describe("auth package template", () => {
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
    expect(server).toContain("twoFactor({ issuer: env.BETTER_AUTH_URL })");
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

    // Without a trusted proxy the forwarded headers must NOT be honoured, or an
    // attacker rotates X-Forwarded-For for a fresh bucket per request.
    expect(server).toContain("ipAddressHeaders: []");
  });

  it("warns when BETTER_AUTH_URL is localhost", () => {
    const files = authPackage();
    const server = files.find((f) => f.path === "packages/auth/src/server.ts")?.content ?? "";
    expect(server).toContain("BETTER_AUTH_URL is still set to localhost");
  });

  it("uses an explicit server and access barrel", () => {
    const files = authPackage();
    const index = files.find((f) => f.path === "packages/auth/src/index.ts")?.content ?? "";
    expect(index).toBe(`export { auth, type Auth } from "./server";
export {
  ac,
  roles,
  ADMIN_ROLE_NAMES,
  isAdminRole,
  type AccessRole,
  type AdminRole,
} from "./access";
`);
  });
});
