import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { projectConfigSchema, type ProjectConfig } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";
import type { TemplateFile } from "../../src/templates/shared.js";

type Mode = "monorepo" | "single";
type Framework = "nextjs" | "tanstack-start";

const temporaryRoots: string[] = [];

afterAll(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function config(
  mode: Mode,
  framework: Framework,
  apps: ProjectConfig["apps"] = ["web"],
): ProjectConfig {
  return projectConfigSchema.parse({
    name: "orpc-csrf-boundary",
    runtime: "bun",
    version: "0.1.0",
    mode,
    framework,
    database: "postgres",
    billing: [],
    features: [],
    apps,
    preset: "custom",
    auth: true,
    api: true,
    email: false,
    analytics: false,
    eve: false,
    i18n: false,
    pdf: false,
    messaging: false,
    storage: false,
    notifications: false,
    featureFlags: "none",
    jobs: false,
    cache: "none",
    deploy: "none",
  });
}

function generated(mode: Mode, framework: Framework, apps?: ProjectConfig["apps"]): TemplateFile[] {
  return generateProjectFiles(config(mode, framework, apps), { dryRun: true });
}

function content(files: TemplateFile[], path: string): string {
  const value = files.find((entry) => entry.path === path)?.content;
  if (!value) throw new Error(`Missing generated file: ${path}`);
  return value;
}

async function boundaryModule(source: string): Promise<{
  rejectUnsafeOrpcRequest(request: Request): Response | null;
}> {
  const root = mkdtempSync(join(tmpdir(), "ghostinit-orpc-csrf-"));
  temporaryRoots.push(root);
  const path = join(root, "request-security.ts");
  writeFileSync(path, source);
  return (await import(`${pathToFileURL(path).href}?run=${crypto.randomUUID()}`)) as {
    rejectUnsafeOrpcRequest(request: Request): Response | null;
  };
}

function mutationRequest(
  headers: HeadersInit,
  body: BodyInit = JSON.stringify({ userId: "victim", role: "admin" }),
): Request {
  return new Request("https://app.example.com/api/rpc/adminUsers/changeRole", {
    method: "POST",
    headers,
    body,
  });
}

describe("generated oRPC CSRF boundary", () => {
  test("emits one framework-neutral policy and runs it before context and body parsing", () => {
    const policies = new Set<string>();
    for (const mode of ["monorepo", "single"] as const) {
      for (const framework of ["nextjs", "tanstack-start"] as const) {
        const files = generated(mode, framework);
        const base = mode === "monorepo" ? "apps/web/" : "";
        const policyPath =
          mode === "monorepo"
            ? "packages/api/src/request-security.ts"
            : "src/server/api/request-security.ts";
        const handlerPath =
          framework === "nextjs"
            ? `${base}src/app/api/rpc/[...path]/route.ts`
            : `${base}src/server/http/rpc.server.ts`;
        const indexPath =
          mode === "monorepo" ? "packages/api/src/index.ts" : "src/server/api/index.ts";
        const policy = content(files, policyPath);
        const handler = content(files, handlerPath);
        policies.add(policy);

        expect(content(files, indexPath)).toContain("rejectUnsafeOrpcRequest");
        expect(handler).toContain("rejectUnsafeOrpcRequest(request)");
        expect(handler.indexOf("const requestBoundaryRejection")).toBeLessThan(
          handler.indexOf("const context = await createContext"),
        );
        expect(handler.indexOf("const requestBoundaryRejection")).toBeLessThan(
          handler.indexOf("rpcHandler.handle(toStandardApiRequest(request)"),
        );
        expect(handler).not.toContain("Access-Control-Allow-Origin");
        expect(handler).not.toMatch(/\bOPTIONS\b/);
        const client = content(files, `${base}src/lib/orpc.ts`);
        if (framework === "nextjs") {
          expect(client).not.toContain("createRequestApiClient");
          expect(files.some(({ path }) => path === `${base}src/lib/orpc.server.ts`)).toBe(false);
          expect(client).toContain("request application facade");
        } else {
          expect(client).toContain('["authorization", "cookie", "origin", "sec-fetch-site"]');
          expect(client).not.toContain('headers.set("origin", url.origin)');
        }
      }
    }
    expect(policies.size).toBe(1);
  });

  test("rejects hostile same-site JSON and multipart mutations without consuming bodies", async () => {
    const files = generated("single", "tanstack-start");
    const boundary = await boundaryModule(content(files, "src/server/api/request-security.ts"));

    const json = mutationRequest({
      Cookie: "better-auth.session_token=victim",
      Origin: "https://evil.example.com",
      "Sec-Fetch-Site": "same-site",
      "Content-Type": "application/json",
    });
    expect(boundary.rejectUnsafeOrpcRequest(json)?.status).toBe(403);
    expect(json.bodyUsed).toBe(false);

    const form = new FormData();
    form.set("data", JSON.stringify({ userId: "victim", role: "admin" }));
    const multipart = mutationRequest(
      {
        Cookie: "better-auth.session_token=victim",
        Origin: "https://evil.example.com",
        "Sec-Fetch-Site": "same-site",
      },
      form,
    );
    expect(multipart.headers.get("content-type")).toStartWith("multipart/form-data; boundary=");
    expect(boundary.rejectUnsafeOrpcRequest(multipart)?.status).toBe(403);
    expect(multipart.bodyUsed).toBe(false);
  });

  test("requires exact origin and safe Fetch Metadata for ordinary cookie mutations", async () => {
    const files = generated("monorepo", "nextjs");
    const boundary = await boundaryModule(content(files, "packages/api/src/request-security.ts"));
    const cookie = "better-auth.session_token=victim";

    expect(
      boundary.rejectUnsafeOrpcRequest(
        mutationRequest({
          Cookie: cookie,
          Origin: "https://evil.example.com",
          "Sec-Fetch-Site": "same-origin",
        }),
      )?.status,
    ).toBe(403);

    expect(
      boundary.rejectUnsafeOrpcRequest(
        mutationRequest({
          Cookie: cookie,
          Origin: "https://app.example.com",
          "Sec-Fetch-Site": "same-origin",
        }),
      ),
    ).toBeNull();
    expect(boundary.rejectUnsafeOrpcRequest(mutationRequest({ Cookie: cookie }))?.status).toBe(403);
    expect(
      boundary.rejectUnsafeOrpcRequest(mutationRequest({ Cookie: cookie, Origin: "null" }))?.status,
    ).toBe(403);

    for (const fetchSite of ["same-site", "cross-site", "none", "unexpected"]) {
      expect(
        boundary.rejectUnsafeOrpcRequest(
          mutationRequest({
            Cookie: cookie,
            Origin: "https://app.example.com",
            "Sec-Fetch-Site": fetchSite,
          }),
        )?.status,
        fetchSite,
      ).toBe(403);
    }

    const previousViteAppUrl = process.env.VITE_APP_URL;
    process.env.VITE_APP_URL = "https://trusted.example.net/app";
    try {
      expect(
        boundary.rejectUnsafeOrpcRequest(
          mutationRequest({ Cookie: cookie, Origin: "https://trusted.example.net" }),
        ),
      ).toBeNull();
      expect(
        boundary.rejectUnsafeOrpcRequest(
          mutationRequest({
            Cookie: cookie,
            Origin: "https://trusted.example.net",
            "Sec-Fetch-Site": "cross-site",
          }),
        )?.status,
      ).toBe(403);
    } finally {
      if (previousViteAppUrl === undefined) delete process.env.VITE_APP_URL;
      else process.env.VITE_APP_URL = previousViteAppUrl;
    }
  });

  test("allows only generated native CSRF signals for originless cookie clients", async () => {
    const files = generated("single", "nextjs");
    const boundary = await boundaryModule(content(files, "src/server/api/request-security.ts"));
    const cookie = "better-auth.session_token=victim";

    for (const client of ["expo", "desktop"]) {
      expect(
        boundary.rejectUnsafeOrpcRequest(
          mutationRequest({ Cookie: cookie, "X-Ghostinit-Native-Client": client }),
        ),
        client,
      ).toBeNull();
      expect(
        boundary.rejectUnsafeOrpcRequest(
          mutationRequest({ Cookie: cookie, Origin: "null", "X-Ghostinit-Native-Client": client }),
        ),
        client,
      ).toBeNull();
    }

    expect(
      boundary.rejectUnsafeOrpcRequest(
        mutationRequest({ Cookie: cookie, "X-Ghostinit-Native-Client": "browser" }),
      )?.status,
    ).toBe(403);
    expect(
      boundary.rejectUnsafeOrpcRequest(
        mutationRequest({ Cookie: cookie, "X-Ghostinit-Native-Client": "Expo" }),
      )?.status,
    ).toBe(403);
    expect(
      boundary.rejectUnsafeOrpcRequest(
        mutationRequest({
          Cookie: cookie,
          Origin: "https://evil.example.com",
          "X-Ghostinit-Native-Client": "expo",
        }),
      )?.status,
    ).toBe(403);
    expect(
      boundary.rejectUnsafeOrpcRequest(
        mutationRequest({
          Cookie: cookie,
          "Sec-Fetch-Site": "same-site",
          "X-Ghostinit-Native-Client": "desktop",
        }),
      )?.status,
    ).toBe(403);
  });

  test("does not let Authorization bypass a cookie and preserves cookie-free Bearer clients", async () => {
    const files = generated("single", "nextjs");
    const boundary = await boundaryModule(content(files, "src/server/api/request-security.ts"));

    expect(
      boundary.rejectUnsafeOrpcRequest(
        mutationRequest({ Authorization: "Bearer native.token-123" }),
      ),
    ).toBeNull();
    expect(
      boundary.rejectUnsafeOrpcRequest(mutationRequest({ Authorization: "Basic Zm9vOmJhcg==" }))
        ?.status,
    ).toBe(403);
    expect(
      boundary.rejectUnsafeOrpcRequest(
        mutationRequest({
          Authorization: "Bearer attacker-token",
          Cookie: "better-auth.session_token=victim",
        }),
      )?.status,
    ).toBe(403);
    expect(
      boundary.rejectUnsafeOrpcRequest(
        mutationRequest({
          Authorization: "not-a-supported-scheme",
          Cookie: "better-auth.session_token=victim",
          Origin: "https://app.example.com",
          "Sec-Fetch-Site": "same-origin",
        }),
      )?.status,
    ).toBe(403);
  });

  test("simple forms lack the native signal while generated native clients attach it", async () => {
    const files = generated("monorepo", "nextjs", ["web", "mobile", "desktop"]);
    const boundary = await boundaryModule(content(files, "packages/api/src/request-security.ts"));
    const simpleForm = mutationRequest(
      { Cookie: "better-auth.session_token=victim" },
      new URLSearchParams({ data: JSON.stringify({ role: "admin" }) }),
    );
    expect(simpleForm.headers.get("x-ghostinit-native-client")).toBeNull();
    expect(boundary.rejectUnsafeOrpcRequest(simpleForm)?.status).toBe(403);

    expect(content(files, "apps/mobile/src/lib/orpc.ts")).toContain(
      '"x-ghostinit-native-client": "expo"',
    );
    expect(content(files, "apps/desktop/src/server/transport/api-fetch.ts")).toContain(
      'headers.set("X-Ghostinit-Native-Client", "desktop")',
    );
  });
});
