import { describe, expect, test } from "bun:test";
import { BodyLimitPlugin } from "@orpc/server/fetch";
import { MAX_ORPC_BODY_BYTES } from "../../src/templates/api/body-limits.js";
import {
  orpcFileContent,
  tanstackRpcServerHandlerContent,
} from "../../src/templates/apps/fragments/api/core.js";
import { standardApiRequestCode } from "../../src/templates/apps/fragments/api/http-request.js";
import {
  nextOpenApiOperationsRouteContent,
  tanstackOpenApiOperationsServerContent,
} from "../../src/templates/apps/fragments/api/openapi.js";
import {
  singleOpenApiOperationsRouteContent,
  singleOrpcRouteContent,
} from "../../src/templates/modes/single/api/routes.js";
import { singleRpcServerHandlerTanstackContent } from "../../src/templates/modes/single/tanstack/api.js";

const toStandardApiRequest = new Function(
  `${new Bun.Transpiler({ loader: "ts" }).transformSync(standardApiRequestCode)}; return toStandardApiRequest;`,
)() as (request: Request) => Request;

function frameworkProxy(request: Request): Request {
  return new Proxy(request, {
    get(target, property) {
      // Framework proxies expose bound Web API getters, not native internal slots.
      if (typeof property === "symbol")
        throw new Error("Native Request internals are inaccessible");
      if (["clone", "arrayBuffer", "bytes", "text", "json", "formData"].includes(property)) {
        throw new Error("Normalization must not clone or consume the body");
      }
      return Reflect.get(target, property, target);
    },
  });
}

async function boundedBody(request: Request): Promise<ArrayBuffer> {
  const plugin = new BodyLimitPlugin({ maxBodySize: MAX_ORPC_BODY_BYTES });
  const runtime = {} as Parameters<typeof plugin.initRuntimeAdapter>[0];
  plugin.initRuntimeAdapter(runtime);
  const interceptor = runtime.adapterInterceptors?.[0];
  if (!interceptor) throw new Error("BodyLimitPlugin interceptor is missing");
  return await (
    interceptor as unknown as (options: {
      request: Request;
      next: (options: { request: Request }) => Promise<ArrayBuffer>;
    }) => Promise<ArrayBuffer>
  )({
    request: toStandardApiRequest(frameworkProxy(request)),
    next: async ({ request: boundedRequest }) => await boundedRequest.arrayBuffer(),
  });
}

describe("generated oRPC standard Request boundary", () => {
  test("normalizes all eight transports after CSRF and upload admission", () => {
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
    for (const source of transports) {
      const dispatch = source.indexOf(".handle(toStandardApiRequest(request),");
      const csrfGuard = source.indexOf("if (requestBoundaryRejection)");
      const uploadAuthGuard = source.indexOf("if (isUnauthenticatedStorageUpload(");
      const uploadAdmissionGuard = source.indexOf("if (storageUploadActor &&");
      expect(source).toContain(standardApiRequestCode.trim());
      expect(dispatch).toBeGreaterThanOrEqual(0);
      expect(csrfGuard).toBeGreaterThanOrEqual(0);
      expect(uploadAuthGuard).toBeGreaterThanOrEqual(0);
      expect(uploadAdmissionGuard).toBeGreaterThanOrEqual(0);
      expect(dispatch).toBeGreaterThan(csrfGuard);
      expect(dispatch).toBeGreaterThan(uploadAuthGuard);
      expect(dispatch).toBeGreaterThan(uploadAdmissionGuard);
      expect(source).toContain("maxBodySize: MAX_ORPC_BODY_BYTES");
      expect(source).not.toContain(".handle(request,");
    }
  });

  for (const method of ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "PROPFIND"]) {
    test(`preserves ${method}, complete URL, headers, and body through a framework proxy`, async () => {
      const hasBody = method !== "GET" && method !== "HEAD";
      const payload = JSON.stringify({ text: "request payload", nested: { value: 4 } });
      const request = new Request("https://api.example.test:8443/api/rpc/example?tag=a%2Fb&tag=c", {
        method,
        headers: {
          "content-type": "application/json",
          authorization: "Bearer synthetic-test",
          cookie: "synthetic-session=test",
          origin: "https://api.example.test:8443",
          "x-request-id": "normalization-test",
        },
        body: hasBody ? payload : null,
      });
      const normalized = toStandardApiRequest(frameworkProxy(request));
      expect(normalized).not.toBe(request);
      expect(normalized.method).toBe(method);
      expect(normalized.url).toBe(request.url);
      expect([...normalized.headers]).toEqual([...request.headers]);
      // Bun transfers ownership of string-backed bodies into the new Request.
      // Lazy stream behavior is checked separately below.
      expect(normalized.bodyUsed).toBe(false);
      if (hasBody) expect(await normalized.text()).toBe(payload);
      else expect(normalized.body).toBeNull();
    });
  }

  test("passes through a lazy stream without cloning, buffering, or reading it", async () => {
    let pulls = 0;
    const body = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          pulls += 1;
          controller.enqueue(Uint8Array.of(1, 2, 3));
          controller.close();
        },
      },
      { highWaterMark: 0 },
    );
    const request = new Request("https://api.example.test/api/rpc/upload", {
      method: "POST",
      body,
      duplex: "half",
    });
    const normalized = toStandardApiRequest(frameworkProxy(request));
    expect(pulls).toBe(0);
    expect(normalized.body).toBe(body);
    expect(body.locked).toBe(false);
    expect(new Uint8Array(await normalized.arrayBuffer())).toEqual(Uint8Array.of(1, 2, 3));
    expect(pulls).toBe(1);
  });

  for (const abortBeforeNormalization of [false, true]) {
    test(`preserves abort ${abortBeforeNormalization ? "before" : "after"} normalization`, () => {
      const controller = new AbortController();
      const reason = new Error("synthetic client cancellation");
      const request = new Request("https://api.example.test/api/rpc/example", {
        signal: controller.signal,
      });
      if (abortBeforeNormalization) controller.abort(reason);
      const normalized = toStandardApiRequest(frameworkProxy(request));
      if (!abortBeforeNormalization) controller.abort(reason);
      expect(normalized.signal.aborted).toBe(true);
      expect(normalized.signal.reason).toBe(reason);
    });
  }

  for (const extraBytes of [0, 1]) {
    test(`keeps the installed streaming body limit at 15 MiB ${extraBytes ? "plus one" : "exactly"}`, async () => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(MAX_ORPC_BODY_BYTES));
          if (extraBytes) controller.enqueue(Uint8Array.of(1));
          controller.close();
        },
      });
      const request = new Request("https://api.example.test/api/rpc/upload", {
        method: "POST",
        body,
        duplex: "half",
      });
      if (extraBytes) {
        await expect(boundedBody(request)).rejects.toMatchObject({ code: "PAYLOAD_TOO_LARGE" });
      } else {
        expect((await boundedBody(request)).byteLength).toBe(MAX_ORPC_BODY_BYTES);
      }
    });
  }
});
