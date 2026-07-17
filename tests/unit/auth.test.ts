import { describe, it, expect } from "bun:test";
import { authPackage } from "../../src/templates/auth";

describe("auth package template", () => {
  it("configures cookie security flags", () => {
    const files = authPackage();
    const index = files.find((f) => f.path === "packages/auth/src/index.ts")?.content ?? "";
    expect(index).toContain("httpOnly: true");
    expect(index).toContain('secure: process.env.NODE_ENV === "production"');
    expect(index).toContain('sameSite: "lax"');
  });

  it("uses BETTER_AUTH_URL as twoFactor issuer", () => {
    const files = authPackage();
    const index = files.find((f) => f.path === "packages/auth/src/index.ts")?.content ?? "";
    expect(index).toContain("twoFactor({ issuer: env.BETTER_AUTH_URL })");
  });

  it("warns about trusted proxy headers", () => {
    const files = authPackage();
    const index = files.find((f) => f.path === "packages/auth/src/index.ts")?.content ?? "";
    expect(index).toContain("trusted proxy");
    expect(index).toContain("disableIpTracking: true");
  });

  it("warns when BETTER_AUTH_URL is localhost", () => {
    const files = authPackage();
    const index = files.find((f) => f.path === "packages/auth/src/index.ts")?.content ?? "";
    expect(index).toContain("BETTER_AUTH_URL is still set to localhost");
  });
});
