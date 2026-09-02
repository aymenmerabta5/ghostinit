import { afterAll, describe, expect, test } from "bun:test";
import { BodyLimitPlugin } from "@orpc/server/fetch";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { MAX_ORPC_BODY_BYTES } from "../../src/templates/api/body-limits.js";
import {
  desktopApiTransportContent,
  desktopRendererFetchContent,
} from "../../src/templates/apps/desktop/api-transport.js";
import {
  orpcFileContent,
  tanstackRpcServerHandlerContent,
} from "../../src/templates/apps/fragments/api/core.js";
import {
  nextOpenApiOperationsRouteContent,
  tanstackOpenApiOperationsServerContent,
} from "../../src/templates/apps/fragments/api/openapi.js";
import {
  singleOpenApiOperationsRouteContent,
  singleOrpcRouteContent,
} from "../../src/templates/modes/single/api/routes.js";
import { singleRpcServerHandlerTanstackContent } from "../../src/templates/modes/single/tanstack/api.js";

type LimitInterceptor = (options: {
  request: Request;
  next: (options: { request: Request }) => Promise<number>;
}) => Promise<number>;

const temporaryRoots: string[] = [];

afterAll(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

async function temporaryModule<T>(source: string, name: string): Promise<T> {
  const root = mkdtempSync(join(tmpdir(), "ghostinit-electron-orpc-"));
  temporaryRoots.push(root);
  const path = join(root, `${name}.ts`);
  writeFileSync(path, source);
  return (await import(`${pathToFileURL(path).href}?run=${crypto.randomUUID()}`)) as T;
}

function bodyLimitInterceptor(): LimitInterceptor {
  const plugin = new BodyLimitPlugin({ maxBodySize: MAX_ORPC_BODY_BYTES });
  const runtime = {} as Parameters<typeof plugin.initRuntimeAdapter>[0];
  plugin.initRuntimeAdapter(runtime);
  const interceptor = runtime.adapterInterceptors?.[0];
  if (!interceptor) throw new Error("BodyLimitPlugin did not install its fetch interceptor");
  return interceptor as unknown as LimitInterceptor;
}

async function consumedBytes(request: Request): Promise<number> {
  return await bodyLimitInterceptor()({
    request,
    next: async ({ request: boundedRequest }) => (await boundedRequest.arrayBuffer()).byteLength,
  });
}

describe("generated oRPC transport body limit", () => {
  test("uses one documented 15 MiB bound in every reachable web transport", () => {
    const transports = [
      orpcFileContent("next"),
      nextOpenApiOperationsRouteContent(),
      tanstackRpcServerHandlerContent(),
      tanstackOpenApiOperationsServerContent(),
      singleOrpcRouteContent(),
      singleOpenApiOperationsRouteContent(),
      singleRpcServerHandlerTanstackContent(),
      tanstackOpenApiOperationsServerContent("@/server/api"),
    ];

    expect(MAX_ORPC_BODY_BYTES).toBe(15 * 1024 * 1024);
    for (const source of transports) {
      expect(source).toContain("15 MiB admits the 14 MiB base64 storage contract");
      expect(source).toContain(`const MAX_ORPC_BODY_BYTES = ${MAX_ORPC_BODY_BYTES};`);
      expect(source).toContain("maxBodySize: MAX_ORPC_BODY_BYTES");
      expect(source).not.toContain("maxBodySize: 11 * 1024 * 1024");
    }
  });

  test("uses the same bound for both directions of the Electron IPC bridge", () => {
    for (const source of [desktopApiTransportContent(), desktopRendererFetchContent()]) {
      expect(source).toContain(`const MAX_DESKTOP_API_BODY_BYTES = ${MAX_ORPC_BODY_BYTES};`);
      expect(source).not.toContain("12 * 1024 * 1024");
    }
    expect(desktopApiTransportContent()).toContain("declaredLength > MAX_DESKTOP_API_BODY_BYTES");
    expect(desktopApiTransportContent()).toContain("body.byteLength > MAX_DESKTOP_API_BODY_BYTES");
  });

  test("runs the generated renderer adapter through main validation at the main-process origin", async () => {
    const mainSource = desktopApiTransportContent()
      .replace(
        'import { session } from "electron";',
        `export const capturedRequests: Array<{ url: string; init: RequestInit }> = [];
let responseBody: BodyInit = "ok";
export function setResponseBody(value: BodyInit): void { responseBody = value; }
const session = { defaultSession: { fetch: async (url: string, init: RequestInit) => {
  capturedRequests.push({ url, init });
  return new Response(responseBody, { status: 200 });
} } };`,
      )
      .replace(
        /import \{ env \} from "\.\/runtime-config(?:\.js)?";/,
        'const env = { DESKTOP_API_URL: "https://runtime.example.com" };',
      );
    const main = await temporaryModule<{
      capturedRequests: Array<{ url: string; init: RequestInit }>;
      setResponseBody(value: BodyInit): void;
      handleDesktopApiRequest(value: unknown): Promise<{
        body: Uint8Array;
        headers: [string, string][];
        status: number;
        statusText: string;
      }>;
    }>(mainSource, "main-transport");
    const renderer = await temporaryModule<{
      desktopBridgeFetch(input: string | URL | Request, init?: RequestInit): Promise<Response>;
    }>(desktopRendererFetchContent(), "renderer-adapter");
    const previousWindow = Reflect.get(globalThis, "window");
    Reflect.set(globalThis, "window", {
      desktopBridge: {
        apiUrl: "https://runtime.example.com",
        apiFetch: async (input: unknown) => await main.handleDesktopApiRequest(input),
      },
    });
    try {
      const requestBody = JSON.stringify({
        base64: "A".repeat(14 * 1024 * 1024),
        mimeType: "application/pdf",
        originalName: "maximum.pdf",
      });
      const response = await renderer.desktopBridgeFetch(
        "https://stale-renderer.example/api/rpc/storage/uploadBase64?source=desktop",
        { method: "POST", body: requestBody },
      );
      expect(await response.text()).toBe("ok");
      expect(main.capturedRequests[0]?.url).toBe(
        "https://runtime.example.com/api/rpc/storage/uploadBase64?source=desktop",
      );
      expect(main.capturedRequests[0]?.init.credentials).toBe("include");

      await expect(
        renderer.desktopBridgeFetch("https://ignored.example/api/rpc/storage/uploadBase64", {
          method: "POST",
          body: new Uint8Array(MAX_ORPC_BODY_BYTES + 1),
        }),
      ).rejects.toThrow("Desktop API request body is too large");
      expect(main.capturedRequests).toHaveLength(1);

      main.setResponseBody(new Uint8Array(MAX_ORPC_BODY_BYTES));
      const maximumResponse = await renderer.desktopBridgeFetch(
        "https://ignored.example/api/rpc/storage/download",
      );
      expect((await maximumResponse.arrayBuffer()).byteLength).toBe(MAX_ORPC_BODY_BYTES);

      main.setResponseBody(new Uint8Array(MAX_ORPC_BODY_BYTES + 1));
      await expect(
        renderer.desktopBridgeFetch("https://ignored.example/api/rpc/storage/download"),
      ).rejects.toThrow("Desktop API response body is too large");
    } finally {
      if (previousWindow === undefined) Reflect.deleteProperty(globalThis, "window");
      else Reflect.set(globalThis, "window", previousWindow);
    }
  });

  test("admits the maximum base64 contract payload including its JSON envelope", async () => {
    const body = JSON.stringify({
      base64: "A".repeat(14 * 1024 * 1024),
      mimeType: "application/pdf",
      originalName: "maximum.pdf",
    });
    const byteLength = new TextEncoder().encode(body).byteLength;
    expect(byteLength).toBeLessThan(MAX_ORPC_BODY_BYTES);

    const request = new Request("https://app.example.test/api/rpc/storage/uploadBase64", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    await expect(consumedBytes(request)).resolves.toBe(byteLength);
  });

  test("rejects a streamed body as soon as it exceeds the transport cap", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(MAX_ORPC_BODY_BYTES));
        controller.enqueue(Uint8Array.of(1));
        controller.close();
      },
    });
    const request = new Request("https://app.example.test/api/rpc/storage/uploadBase64", {
      method: "POST",
      body,
      duplex: "half",
    });

    await expect(consumedBytes(request)).rejects.toMatchObject({ code: "PAYLOAD_TOO_LARGE" });
  });
});
