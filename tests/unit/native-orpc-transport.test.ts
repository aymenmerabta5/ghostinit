import { afterAll, describe, expect, test } from "bun:test";
import { oc } from "@orpc/contract";
import { implement, os } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { projectConfigSchema, type ProjectConfig } from "../../src/lib/config.js";
import { MAX_ORPC_BODY_BYTES } from "../../src/templates/api/body-limits.js";
import { generateProjectFiles } from "../../src/templates/default.js";
import type { TemplateFile } from "../../src/templates/shared.js";

const temporaryRoots: string[] = [];

afterAll(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function config(mode: "monorepo" | "single", apps: ProjectConfig["apps"]): ProjectConfig {
  return projectConfigSchema.parse({
    name: "native-orpc-transport",
    runtime: "bun",
    version: "0.1.0",
    mode,
    framework: "nextjs",
    database: "postgres",
    billing: mode === "monorepo" ? ["stripe"] : [],
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

function generated(mode: "monorepo" | "single", apps: ProjectConfig["apps"]): TemplateFile[] {
  return generateProjectFiles(config(mode, apps), { dryRun: true });
}

function content(files: TemplateFile[], path: string): string {
  const value = files.find((entry) => entry.path === path)?.content;
  if (!value) throw new Error(`Missing generated file: ${path}`);
  return value;
}

async function temporaryModule<T>(source: string, name: string): Promise<T> {
  const root = mkdtempSync(join(tmpdir(), "ghostinit-native-orpc-"));
  temporaryRoots.push(root);
  const path = join(root, `${name}.ts`);
  writeFileSync(path, source);
  return (await import(`${pathToFileURL(path).href}?run=${crypto.randomUUID()}`)) as T;
}

describe("generated native oRPC transport", () => {
  test("uses the mounted RPC path and a trusted Electron main/preload bridge", () => {
    const files = generated("monorepo", ["web", "mobile", "desktop"]);
    const desktopOrpc = content(files, "apps/desktop/src/renderer/lib/orpc.ts");
    const desktopAuth = content(files, "apps/desktop/src/renderer/lib/auth.ts");
    const desktopFetch = content(files, "apps/desktop/src/renderer/adapters/desktop-fetch.ts");
    const main = content(files, "apps/desktop/src/main.ts");
    const mainTransport = content(files, "apps/desktop/src/server/transport/api-fetch.ts");
    const preload = content(files, "apps/desktop/src/preload.ts");
    const expoOrpc = content(files, "apps/mobile/src/lib/orpc.ts");

    expect(desktopOrpc).toContain("return window.desktopBridge.apiUrl");
    expect(desktopOrpc).toContain("url: `${getBaseUrl()}/api/rpc`");
    expect(desktopOrpc).not.toContain("env.VITE_API_URL");
    expect(desktopOrpc).toContain("desktopBridgeFetch(input");
    expect(desktopOrpc).not.toMatch(/\bfetch\(input/);
    expect(desktopAuth).toContain("customFetchImpl: desktopBridgeFetch");
    expect(desktopAuth).toContain("return window.desktopBridge.apiUrl");
    expect(desktopAuth).not.toContain("env.VITE_API_URL");
    expect(desktopFetch).toContain("window.desktopBridge.apiFetch");
    expect(desktopFetch).toContain("window.desktopBridge.apiUrl");
    expect(desktopFetch).toContain(`const MAX_DESKTOP_API_BODY_BYTES = ${MAX_ORPC_BODY_BYTES};`);
    expect(main).toMatch(
      /import \{ handleDesktopApiRequest \} from "\.\/server\/transport\/api-fetch(?:\.js)?"/,
    );
    expect(main).toContain('ipcMain.handle("desktop:api-fetch"');
    expect(main).toContain("--ghostinit-desktop-api-url=");
    expect(main).toContain("encodeURIComponent(env.DESKTOP_API_URL)");
    expect(mainTransport).toContain("session.defaultSession.fetch");
    expect(mainTransport).toMatch(/from "\.\/runtime-config(?:\.js)?"/);
    expect(mainTransport).not.toContain("@repo/config/server");
    expect(mainTransport).toContain('headers.set("X-Ghostinit-Native-Client", "desktop")');
    expect(mainTransport).toContain(`const MAX_DESKTOP_API_BODY_BYTES = ${MAX_ORPC_BODY_BYTES};`);
    expect(preload).toContain("readonly apiUrl: string");
    expect(preload).toContain("apiUrl: desktopApiUrl()");
    expect(preload).toContain(
      'apiFetch: (input) => ipcRenderer.invoke("desktop:api-fetch", input)',
    );
    expect(expoOrpc).toContain("url: `${getBaseUrl()}/api/rpc`");
    expect(expoOrpc).toContain('"x-ghostinit-native-client": "expo"');
  });

  test("main-process transport binds URL, headers, cookies, and response size", async () => {
    const files = generated("monorepo", ["web", "desktop"]);
    const source = content(files, "apps/desktop/src/server/transport/api-fetch.ts")
      .replace(
        'import { session } from "electron";',
        `export const capturedRequests: Array<{ url: string; init: RequestInit }> = [];
let responseBody: BodyInit = "created";
export function setResponseBody(value: BodyInit): void { responseBody = value; }
const session = { defaultSession: { fetch: async (url: string, init: RequestInit) => {
  capturedRequests.push({ url, init });
  return new Response(responseBody, {
    status: 201,
    statusText: "Created",
    headers: { "Content-Type": "text/plain", "Set-Cookie": "secret=hidden" },
  });
} } };`,
      )
      .replace(
        /import \{ env \} from "\.\/runtime-config(?:\.js)?";/,
        'const env = { DESKTOP_API_URL: "https://app.example.com" };',
      );
    const transport = await temporaryModule<{
      capturedRequests: Array<{ url: string; init: RequestInit }>;
      setResponseBody(value: BodyInit): void;
      handleDesktopApiRequest(value: unknown): Promise<{
        body: Uint8Array;
        headers: [string, string][];
        status: number;
      }>;
    }>(source, "desktop-api-transport");

    const response = await transport.handleDesktopApiRequest({
      url: "https://app.example.com/api/rpc/adminUsers/changeRole",
      method: "POST",
      headers: [
        ["content-type", "application/json"],
        ["accept", "application/json"],
      ],
      body: new TextEncoder().encode('{"json":{"userId":"user-1"}}'),
    });
    expect(response.status).toBe(201);
    expect(new TextDecoder().decode(response.body)).toBe("created");
    expect(new Headers(response.headers).has("set-cookie")).toBe(false);
    expect(transport.capturedRequests).toHaveLength(1);
    const captured = transport.capturedRequests[0];
    expect(captured?.url).toBe("https://app.example.com/api/rpc/adminUsers/changeRole");
    const headers = new Headers(captured?.init.headers);
    expect(headers.get("origin")).toBe("https://app.example.com");
    expect(headers.get("sec-fetch-site")).toBe("same-origin");
    expect(headers.get("x-ghostinit-native-client")).toBe("desktop");
    expect(captured?.init.credentials).toBe("include");
    expect(captured?.init.redirect).toBe("manual");

    for (const invalid of [
      {
        url: "https://evil.example/api/rpc/adminUsers/changeRole",
        method: "POST",
        headers: [],
        body: new Uint8Array(),
      },
      {
        url: "https://app.example.com/api/rpc/adminUsers/changeRole",
        method: "POST",
        headers: [["cookie", "better-auth.session_token=stolen"]],
        body: new Uint8Array(),
      },
      {
        url: "https://app.example.com/private",
        method: "POST",
        headers: [],
        body: new Uint8Array(),
      },
      {
        url: "https://app.example.com/api/rpc/health",
        method: "POST",
        headers: [["x-forwarded-for", "127.0.0.1"]],
        body: new Uint8Array(),
      },
      {
        url: "https://app.example.com/api/rpc/storage/uploadBase64",
        method: "POST",
        headers: [],
        body: new Uint8Array(MAX_ORPC_BODY_BYTES + 1),
      },
    ]) {
      await expect(transport.handleDesktopApiRequest(invalid)).rejects.toThrow();
    }
    expect(transport.capturedRequests).toHaveLength(1);

    transport.setResponseBody(new Uint8Array(MAX_ORPC_BODY_BYTES));
    const maximumResponse = await transport.handleDesktopApiRequest({
      url: "https://app.example.com/api/rpc/storage/download",
      method: "GET",
      headers: [],
      body: null,
    });
    expect(maximumResponse.body.byteLength).toBe(MAX_ORPC_BODY_BYTES);

    transport.setResponseBody(new Uint8Array(MAX_ORPC_BODY_BYTES + 1));
    await expect(
      transport.handleDesktopApiRequest({
        url: "https://app.example.com/api/rpc/storage/download",
        method: "GET",
        headers: [],
        body: null,
      }),
    ).rejects.toThrow("Desktop API response body is too large");
  });

  test("renderer adapter rebases through the authoritative main transport and admits storage payloads", async () => {
    const files = generated("monorepo", ["web", "desktop"]);
    const source = content(files, "apps/desktop/src/server/transport/api-fetch.ts")
      .replace(
        'import { session } from "electron";',
        `export const capturedRequests: Array<{ url: string; init: RequestInit }> = [];
const session = { defaultSession: { fetch: async (url: string, init: RequestInit) => {
  capturedRequests.push({ url, init });
  return new Response("ok", { status: 200, headers: { "Content-Type": "text/plain" } });
} } };`,
      )
      .replace(
        /import \{ env \} from "\.\/runtime-config(?:\.js)?";/,
        'const env = { DESKTOP_API_URL: "https://runtime.example.com" };',
      );
    const transport = await temporaryModule<{
      capturedRequests: Array<{ url: string; init: RequestInit }>;
      handleDesktopApiRequest(value: unknown): Promise<{
        body: Uint8Array;
        headers: [string, string][];
        status: number;
        statusText: string;
      }>;
    }>(source, "desktop-runtime-transport");
    const renderer = await temporaryModule<{
      desktopBridgeFetch(input: string | URL | Request, init?: RequestInit): Promise<Response>;
    }>(content(files, "apps/desktop/src/renderer/adapters/desktop-fetch.ts"), "desktop-fetch");
    const calls: unknown[] = [];
    const previousWindow = Reflect.get(globalThis, "window");
    Reflect.set(globalThis, "window", {
      desktopBridge: {
        apiUrl: "https://runtime.example.com",
        async apiFetch(input: unknown) {
          calls.push(input);
          return await transport.handleDesktopApiRequest(input);
        },
      },
    });
    try {
      const body = JSON.stringify({
        base64: "A".repeat(14 * 1024 * 1024),
        mimeType: "application/pdf",
        originalName: "maximum.pdf",
      });
      const response = await renderer.desktopBridgeFetch(
        "https://stale-renderer.example/api/rpc/storage/uploadBase64?source=desktop",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        },
      );
      expect(await response.text()).toBe("ok");
      expect(calls).toHaveLength(1);
      expect(calls[0]).toEqual(
        expect.objectContaining({
          method: "POST",
          url: "https://runtime.example.com/api/rpc/storage/uploadBase64?source=desktop",
        }),
      );
      const requestBody = Reflect.get(calls[0] as object, "body") as Uint8Array;
      expect(requestBody.byteLength).toBe(new TextEncoder().encode(body).byteLength);
      expect(requestBody.byteLength).toBeLessThan(MAX_ORPC_BODY_BYTES);
      expect(transport.capturedRequests).toHaveLength(1);
      expect(transport.capturedRequests[0]?.url).toBe(
        "https://runtime.example.com/api/rpc/storage/uploadBase64?source=desktop",
      );
    } finally {
      if (previousWindow === undefined) Reflect.deleteProperty(globalThis, "window");
      else Reflect.set(globalThis, "window", previousWindow);
    }
  });

  test("single Expo handler passes the same prefix required by the real oRPC adapter", async () => {
    const files = generated("single", ["mobile"]);
    const route = content(files, "app/api/rpc/[...path]+api.ts");
    expect(route).toContain('prefix: "/api/rpc"');
    expect(content(files, "src/lib/orpc.ts")).toContain("url: `${getBaseUrl()}/api/rpc`");

    const contract = { toggle: oc.route({ method: "POST", path: "/toggle" }) };
    const implementer = implement(contract);
    const router = os
      .prefix("/api")
      .router(
        implementer.router({ toggle: implementer.toggle.handler(async () => ({ enabled: true })) }),
      );
    const handler = new RPCHandler(router);
    const request = () =>
      new Request("https://app.example.com/api/rpc/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
    const correct = await handler.handle(request(), { prefix: "/api/rpc" });
    const missing = await handler.handle(request());
    expect(correct.matched).toBe(true);
    expect(correct.response?.status).toBe(200);
    expect(missing.matched).toBe(false);
  });
});
