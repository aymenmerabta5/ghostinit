import { describe, it, expect } from "bun:test";
import { authPackage } from "../../src/templates/auth";

describe("auth package template", () => {
  it("configures cookie security flags", () => {
    const files = authPackage();
    const index = files.find((f) => f.path === "packages/auth/src/index.ts")?.content ?? "";
    expect(index).toContain("httpOnly: true");
    expect(index).toContain("secure: isHttps");
    expect(index).toContain('sameSite: "lax"');
  });

  it("uses BETTER_AUTH_URL as twoFactor issuer", () => {
    const files = authPackage();
    const index = files.find((f) => f.path === "packages/auth/src/index.ts")?.content ?? "";
    expect(index).toContain("twoFactor({ issuer: env.BETTER_AUTH_URL })");
  });

  it("keeps IP tracking enabled so the rate limiter actually runs", () => {
    const files = authPackage();
    const index = files.find((f) => f.path === "packages/auth/src/index.ts")?.content ?? "";
    const lower = index.toLowerCase();
    expect(lower.includes("trusted proxy") || lower.includes("trusted_proxy")).toBe(true);

    // Regression: this used to assert `disableIpTracking: true`, pinning the bug.
    // better-auth keys its limiter on the client IP, so disabling IP tracking made
    // rateLimit.enabled:true completely inert — 0 of 300 sign-in attempts blocked.
    expect(index).not.toContain("disableIpTracking: true");
    expect(index).toContain("disableIpTracking: false");
    expect(index).toContain("rateLimit");

    // Without a trusted proxy the forwarded headers must NOT be honoured, or an
    // attacker rotates X-Forwarded-For for a fresh bucket per request.
    expect(index).toContain("ipAddressHeaders: []");
  });

  it("warns when BETTER_AUTH_URL is localhost", () => {
    const files = authPackage();
    const index = files.find((f) => f.path === "packages/auth/src/index.ts")?.content ?? "";
    expect(index).toContain("BETTER_AUTH_URL is still set to localhost");
  });
});
