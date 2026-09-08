import { describe, expect, test } from "bun:test";
import { parseSync } from "oxc-parser";
import { projectConfigSchema } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";
import type { TemplateFile } from "../../src/templates/shared.js";

type Mode = "monorepo" | "single";
type Framework = "nextjs" | "tanstack-start";
type Database = "postgres" | "convex";

interface AuthRateLimitRule {
  window: number;
  max: number;
}

interface AuthNetworkSecurityPolicy {
  trustedProxyHeaders: boolean;
  ipAddress: { ipAddressHeaders: string[]; disableIpTracking: false };
}

interface LoadedNetworkPolicy {
  resolveAuthNetworkSecurity(
    baseURL: string,
    trustedProxyValue: string | undefined,
  ): AuthNetworkSecurityPolicy;
  enforceTrustedAuthClientIp(
    request: Request,
    currentRule: AuthRateLimitRule,
    policy: AuthNetworkSecurityPolicy,
  ): AuthRateLimitRule;
}

function generate(mode: Mode, framework: Framework, database: Database): TemplateFile[] {
  return generateProjectFiles(
    projectConfigSchema.parse({
      name: "auth-hardening",
      runtime: "bun",
      mode,
      framework,
      database,
      preset: "saas",
      apps: ["web"],
      billing: [],
      features: [],
    }),
    { dryRun: true },
  );
}

function read(files: readonly TemplateFile[], path: string): string {
  const match = files.find((file) => file.path === path);
  if (!match) throw new Error(`Missing generated file: ${path}`);
  return match.content;
}

function loadNetworkPolicy(source: string): LoadedNetworkPolicy {
  const start = source.indexOf("type AuthRateLimitRule");
  const functionStart = source.indexOf("function enforceTrustedAuthClientIp", start);
  const closing = "  return currentRule;\n}";
  const end = source.indexOf(closing, functionStart);
  if (start < 0 || functionStart < 0 || end < 0) {
    throw new Error("Generated Better Auth network policy was not found");
  }
  const typescript = source.slice(start, end + closing.length);
  const javascript = new Bun.Transpiler({ loader: "ts" }).transformSync(typescript);
  const loaded: unknown = new Function(
    `${javascript}; return { resolveAuthNetworkSecurity, enforceTrustedAuthClientIp };`,
  )();
  if (!loaded || typeof loaded !== "object") throw new Error("Unable to load network policy");
  return loaded as LoadedNetworkPolicy;
}

describe("generated Better Auth hardening matrix", () => {
  for (const mode of ["monorepo", "single"] as const) {
    for (const framework of ["nextjs", "tanstack-start"] as const) {
      for (const database of ["postgres", "convex"] as const) {
        test(`${mode}/${framework}/${database} uses durable fail-closed auth security`, () => {
          const files = generate(mode, framework, database);
          const serverPath =
            database === "convex"
              ? "convex/auth.ts"
              : mode === "monorepo"
                ? "packages/auth/src/server.ts"
                : "src/server/auth/index.ts";
          const server = read(files, serverPath);

          expect(parseSync(serverPath, server).errors, serverPath).toEqual([]);
          expect(server).toContain("profileUpdateValidation(),");
          expect(server).toContain('context.path === "/update-user"');
          expect(server).toContain("name.length < 1 || name.length > 50");
          expect(server).toContain("revokeSessionsOnPasswordReset: true");
          expect(server).toContain("encryptOAuthTokens: true");
          expect(server).toContain("socialProviders: {");
          expect(server).toContain("GOOGLE_CLIENT_ID");
          expect(server).toContain("GOOGLE_CLIENT_SECRET");
          expect(server).toContain("GITHUB_CLIENT_ID");
          expect(server).toContain("GITHUB_CLIENT_SECRET");

          expect(server).toContain('storage: "database"');
          expect(server).not.toContain('storage: "memory"');
          expect(server).toContain('"/two-factor/*": (request) =>');
          expect(server).toContain("{ window: 60, max: 5 }");
          expect(server).toContain('"*": (request, currentRule) =>');
          expect(server).toContain("enforceTrustedAuthClientIp(request, currentRule");
          expect(server).toContain("trustedProxyHeaders: authNetworkSecurity.trustedProxyHeaders");
          expect(server).toContain("ipAddress: authNetworkSecurity.ipAddress");
          expect(server).toContain(
            'ipAddressHeaders: trustedProxyHeaders ? ["x-forwarded-for"] : []',
          );
          expect(server).not.toContain('ipAddressHeaders: ["x-forwarded-for", "x-real-ip"]');
          expect(server).not.toContain("disableIpTracking: true");

          const policy = loadNetworkPolicy(server);
          const local = policy.resolveAuthNetworkSecurity("http://localhost:3000", "false");
          expect(local).toEqual({
            trustedProxyHeaders: false,
            ipAddress: { ipAddressHeaders: [], disableIpTracking: false },
          });
          expect(policy.resolveAuthNetworkSecurity("http://127.0.0.42:3000/", "false")).toEqual(
            local,
          );
          for (const trustedProxyValue of ["false", "true"] as const) {
            expect(() =>
              policy.resolveAuthNetworkSecurity("http://app.example.com", trustedProxyValue),
            ).toThrow("BETTER_AUTH_URL must use HTTPS");
          }
          for (const unsafeUrl of [
            "http://0.0.0.0:3000",
            "http://127.attacker.example:3000",
            "ftp://app.example.com",
            "https://user:password@app.example.com",
            "https://app.example.com/auth",
            "https://app.example.com?tenant=one",
            "https://app.example.com?",
            "https://app.example.com#fragment",
            "https://app.example.com#",
          ]) {
            expect(
              () => policy.resolveAuthNetworkSecurity(unsafeUrl, "true"),
              `${mode}/${framework}/${database}: ${unsafeUrl}`,
            ).toThrow();
          }
          expect(() =>
            policy.resolveAuthNetworkSecurity("https://app.example.com", "false"),
          ).toThrow("TRUSTED_PROXY must be true");

          const proxied = policy.resolveAuthNetworkSecurity("https://app.example.com", "true");
          expect(proxied).toEqual({
            trustedProxyHeaders: true,
            ipAddress: { ipAddressHeaders: ["x-forwarded-for"], disableIpTracking: false },
          });
          const rule = { window: 10, max: 3 };
          expect(
            policy.enforceTrustedAuthClientIp(
              new Request("http://localhost:3000/api/auth/sign-in/email", {
                headers: { "x-forwarded-for": "attacker-controlled" },
              }),
              rule,
              local,
            ),
          ).toBe(rule);
          expect(
            policy.enforceTrustedAuthClientIp(
              new Request("https://app.example.com/api/auth/sign-in/email", {
                headers: { "x-forwarded-for": "203.0.113.7" },
              }),
              rule,
              proxied,
            ),
          ).toBe(rule);
          expect(
            policy.enforceTrustedAuthClientIp(
              new Request("https://app.example.com/api/auth/two-factor/verify-totp", {
                headers: { "x-forwarded-for": "2001:db8::7" },
              }),
              rule,
              proxied,
            ),
          ).toBe(rule);
          for (const headers of [
            {},
            { "x-real-ip": "203.0.113.7" },
            { "x-forwarded-for": "203.0.113.7, 10.0.0.2" },
            { "x-forwarded-for": "attacker.example" },
            { "x-forwarded-for": "001.002.003.004" },
          ]) {
            expect(() =>
              policy.enforceTrustedAuthClientIp(
                new Request("https://app.example.com/api/auth/sign-in/email", { headers }),
                rule,
                proxied,
              ),
            ).toThrow("trusted proxy did not supply one valid X-Forwarded-For");
          }

          if (database === "postgres") {
            const schemaPath =
              mode === "monorepo"
                ? "packages/database/src/schema/auth.ts"
                : "src/server/db/schema/auth.ts";
            const schema = read(files, schemaPath);
            expect(server).toContain(
              mode === "monorepo" ? "rateLimit: rateLimits" : "rateLimit: schema.rateLimits",
            );
            expect(schema).toMatch(/export const rateLimits = pgTable\(["']rate_limits["']/);
            const rateLimitSchema = schema.slice(schema.indexOf("export const rateLimits ="));
            expect(rateLimitSchema).toMatch(/id: text\(["']id["']\)\.primaryKey\(\)/);
            expect(rateLimitSchema).toMatch(/key: text\(["']key["']\)\.notNull\(\)/);
            expect(rateLimitSchema).toMatch(/uniqueIndex\(["']rate_limits_key_idx["']\)/);
            expect(schema).toMatch(
              /lastRequest: bigint\(["']last_request["'], \{ mode: "number" \}\)\.notNull\(\)/,
            );
            expect(server).toContain("accountLockout: {");
            expect(server).toContain("enabled: true");
            expect(server).toContain("maxFailedAttempts: 5");
            expect(server).toContain("durationSeconds: 900");
          } else {
            expect(server).toContain("five-attempt signed-challenge lockout");
            expect(server).toContain("accountLockout: { enabled: false }");
          }
          expect(server).toContain("twoFactorCookieMaxAge: 600");
        });
      }
    }
  }
});
