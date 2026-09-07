import { describe, expect, test } from "bun:test";
import { projectConfigSchema, type ProjectConfig } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";

type AuthHandler = (request: Request) => Promise<Response>;

type ExecutableAuthRoute = {
  readonly delegatedRequests: Request[];
  readonly handle: AuthHandler;
};

function config(
  mode: "monorepo" | "single",
  framework: "nextjs" | "tanstack-start",
  deploy: "cloudflare" | "none" = "cloudflare",
): ProjectConfig {
  return projectConfigSchema.parse({
    name: `auth-ip-${mode}-${framework}`,
    runtime: "bun",
    mode,
    framework,
    database: "convex",
    preset: "saas",
    billing: [],
    features: [],
    apps: ["web"],
    deploy,
  });
}

function generatedAuthHandler(
  mode: "monorepo" | "single",
  framework: "nextjs" | "tanstack-start",
  deploy: "cloudflare" | "none" = "cloudflare",
): string {
  const files = generateProjectFiles(config(mode, framework, deploy));
  const path =
    mode === "monorepo"
      ? framework === "nextjs"
        ? "apps/web/src/app/api/auth/[...all]/route.ts"
        : "apps/web/src/server/http/auth.server.ts"
      : framework === "nextjs"
        ? "src/app/api/auth/[...all]/route.ts"
        : "src/server/http/auth.server.ts";
  const source = files.find((file) => file.path === path)?.content;
  if (!source) throw new Error(`Missing generated auth handler: ${path}`);
  return source;
}

function executableAuthRoute(source: string): ExecutableAuthRoute {
  const executableSource = source
    .replace(/^import[^\n]*\n/gm, "")
    .replace(/\bexport\s+(?=(?:async\s+)?function|const)/g, "");
  const javascript = new Bun.Transpiler({ loader: "ts" }).transformSync(executableSource);
  const delegatedRequests: Request[] = [];
  const auth = {
    handler: async (request: Request): Promise<Response> => {
      delegatedRequests.push(request);
      return Response.json({ forwardedFor: request.headers.get("x-forwarded-for") });
    },
  };
  const factory = new Function(
    "auth",
    `${javascript}\nreturn typeof handleAuthRequest === "function" ? handleAuthRequest : handle;`,
  ) as (auth: typeof auth) => AuthHandler;
  return { delegatedRequests, handle: factory(auth) };
}

function authRequest(headers: HeadersInit, url = "https://app.example.test"): Request {
  return new Request(`${url}/api/auth/sign-in/email`, {
    method: "POST",
    headers,
  });
}

async function forwardedFor(response: Response): Promise<string | null> {
  return ((await response.json()) as { forwardedFor: string | null }).forwardedFor;
}

describe("generated Cloudflare auth client-IP boundary", () => {
  for (const mode of ["monorepo", "single"] as const) {
    for (const framework of ["nextjs", "tanstack-start"] as const) {
      test(`${mode}/${framework} overwrites a spoofed forwarding chain before delegation`, async () => {
        const source = generatedAuthHandler(mode, framework);
        const nonCloudflareSource = generatedAuthHandler(mode, framework, "none");
        expect(source).toContain("const TRUSTED_CLOUDFLARE_RUNTIME = true");
        expect(nonCloudflareSource).toContain("const TRUSTED_CLOUDFLARE_RUNTIME = false");
        expect(source).toContain("prepareAuthRequestForRuntime(request)");
        expect(source).toContain("auth.handler(preparedAuthRequest.request)");
        expect(source).not.toContain("hasCloudflareRuntimeMetadata");
        expect(source).not.toContain("(request as RuntimeAuthRequest).cf");

        const route = executableAuthRoute(source);
        // OpenNext's Cloudflare-to-Node converter drops request.cf before the
        // Next route executes. The generated deployment policy must still run.
        const original = authRequest({
          "cf-connecting-ip": "203.0.113.41",
          "x-forwarded-for": "198.51.100.2, 10.0.0.9",
        });
        expect("cf" in original).toBe(false);
        const response = await route.handle(original);

        expect(response.status).toBe(200);
        expect(await forwardedFor(response)).toBe("203.0.113.41");
        expect(route.delegatedRequests).toHaveLength(1);
        expect(route.delegatedRequests[0]).not.toBe(original);
        expect(original.headers.get("x-forwarded-for")).toBe("198.51.100.2, 10.0.0.9");
      });

      test(`${mode}/${framework} preserves the strict auth rejection policy across deployment targets`, async () => {
        for (const deploy of ["cloudflare", "none"] as const) {
          const route = executableAuthRoute(generatedAuthHandler(mode, framework, deploy));
          for (const path of ["/api/auth/admin/list-users", "/api/auth/organization/create"]) {
            for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"]) {
              const response = await route.handle(
                new Request(`https://app.example.test${path}`, { method }),
              );
              expect(response.status, `${deploy}/${method}/${path}`).toBe(404);
              expect(await response.text()).toBe("Not found");
              expect(response.headers.get("cache-control")).toBe(
                "private, no-cache, no-store, max-age=0, must-revalidate",
              );
            }
          }
          expect(route.delegatedRequests).toHaveLength(0);
        }
      });
    }
  }

  test("accepts one valid IPv4 or IPv6 Cloudflare address", async () => {
    for (const address of ["203.0.113.7", "2001:db8:85a3::8a2e:370:7334", "::ffff:192.0.2.128"]) {
      const route = executableAuthRoute(generatedAuthHandler("monorepo", "nextjs"));
      const response = await route.handle(
        authRequest({
          "cf-connecting-ip": address,
          "x-forwarded-for": "192.0.2.99",
        }),
      );

      expect(response.status, address).toBe(200);
      expect(await forwardedFor(response), address).toBe(address);
      expect(route.delegatedRequests, address).toHaveLength(1);
    }
  });

  test("rejects a Cloudflare request with a missing, chained, or invalid address", async () => {
    const invalidAddresses = [
      undefined,
      "not-an-ip",
      "203.0.113.7, 198.51.100.4",
      "256.1.1.1",
      "01.2.3.4",
      "2001:db8::1%eth0",
    ] as const;

    for (const address of invalidAddresses) {
      const route = executableAuthRoute(generatedAuthHandler("monorepo", "nextjs"));
      const headers = new Headers({ "x-forwarded-for": "203.0.113.200" });
      if (address !== undefined) headers.set("cf-connecting-ip", address);
      const response = await route.handle(authRequest(headers));

      expect(response.status, address ?? "missing").toBe(400);
      expect(response.headers.get("cache-control"), address ?? "missing").toBe(
        "private, no-cache, no-store, max-age=0, must-revalidate",
      );
      expect(route.delegatedRequests, address ?? "missing").toHaveLength(0);
    }
  });

  test("uses a fixed loopback identity for local Cloudflare development and preview", async () => {
    for (const origin of ["http://localhost:3000", "http://127.0.0.1:8787", "http://[::1]:8787"]) {
      const route = executableAuthRoute(generatedAuthHandler("single", "tanstack-start"));
      const response = await route.handle(
        authRequest({ "x-forwarded-for": "198.51.100.8, 10.0.0.8" }, origin),
      );

      expect(response.status, origin).toBe(200);
      expect(await forwardedFor(response), origin).toBe("127.0.0.1");
      expect(route.delegatedRequests, origin).toHaveLength(1);
    }
  });

  test("non-Cloudflare output never trusts Cloudflare headers or an attached cf field", async () => {
    const source = generatedAuthHandler("single", "tanstack-start", "none");
    expect(source).toContain("const TRUSTED_CLOUDFLARE_RUNTIME = false");
    const route = executableAuthRoute(source);
    const request = authRequest({
      "cf-connecting-ip": "203.0.113.8",
      "x-forwarded-for": "198.51.100.8, 10.0.0.8",
    });
    Object.defineProperty(request, "cf", { value: { colo: "LHR" } });
    const response = await route.handle(request);

    expect(response.status).toBe(200);
    expect(await forwardedFor(response)).toBe("198.51.100.8, 10.0.0.8");
    expect(route.delegatedRequests).toEqual([request]);
  });
});
