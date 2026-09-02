import { Buffer } from "node:buffer";
import { describe, expect, test } from "bun:test";
import { parseSync } from "oxc-parser";
import { parseFile } from "../../src/lib/architecture/parsers/imports.js";
import { projectConfigSchema } from "../../src/lib/config.js";
import {
  proxyCatchAllRouteContent,
  proxyRouteContent,
} from "../../src/templates/analytics/proxy.js";
import { generateProjectFiles } from "../../src/templates/default.js";
import type { TemplateFile } from "../../src/templates/shared.js";

type Mode = "monorepo" | "single";
type ProxyContext = { params: Promise<{ path?: string[] }> };
type CapturedProxyRequest = { url: string; headers: Array<[string, string]> };
type ExecutableProxy = {
  POST(request: Request, context?: ProxyContext): Promise<Response>;
  __capturedProxyRequests: CapturedProxyRequest[];
};

const MODES = ["monorepo", "single"] as const;
const SPOOFABLE_NETWORK_HEADERS = ["x-forwarded-for", "x-real-ip", "cf-connecting-ip"] as const;

function expectHardenedProxy(source: string, path: string): void {
  expect(parseSync(path, source).errors, path).toEqual([]);
  expect(source).toContain("request.body");
  expect(source).toContain("body.getReader()");
  expect(source).toContain('reader.cancel("body limit exceeded")');
  expect(source).toContain('reader.cancel("body read timeout")');
  expect(source).toContain("MAX_REQUEST_BODY_SIZE");
  expect(source).toContain("MAX_RESPONSE_BODY_SIZE");
  expect(source).toContain("BODY_READ_TIMEOUT_MS");
  expect(source).toContain("new AbortController()");
  expect(source).toContain("signal: controller.signal");
  expect(source).toContain('upstream.headers.get("content-length")');
  expect(source).toContain("readBoundedBody(upstream.body");
  expect(source).toContain("safeUpstreamLogData(error)");
  expect(source).toContain("MAX_CONCURRENT_PROXY_REQUESTS");
  expect(source).toContain("const release = admitProxyRequest()");
  expect(source).toContain("release();");
  expect(source).toContain('provider: "posthog"');
  expect(source).toContain("Compressed request bodies are not supported");
  expect(source).toContain("parsed.username || parsed.password || parsed.search || parsed.hash");
  expect(source).toContain('parsed.pathname !== "/" && parsed.pathname !== ""');
  expect(source).toContain("parsed.origin === allowed");
  expect(source).toContain('redirect: "manual"');
  expect(source).not.toContain('"accept-encoding"');
  expect(source).not.toContain("request.arrayBuffer()");
  expect(source).not.toContain("upstream.arrayBuffer()");
  expect(source).not.toContain("{ targetUrl, err }");
  expect(source).not.toContain('POSTHOG_HOST "${configured}"');
  expect(source).not.toContain("target: parsed.origin + parsed.pathname");
  expect(source).not.toContain("normalized.startsWith(allowed +");
}

function generateTanstackAnalytics(mode: Mode): TemplateFile[] {
  return generateProjectFiles(
    projectConfigSchema.parse({
      name: "analytics-proxy-security",
      runtime: "bun",
      version: "0.1.0",
      mode,
      framework: "tanstack-start",
      database: "postgres",
      apps: ["web"],
      preset: "custom",
      auth: false,
      api: false,
      email: false,
      analytics: true,
      billing: [],
      features: [],
    }),
    { dryRun: true },
  );
}

function read(files: readonly TemplateFile[], path: string): string {
  const entry = files.find((file) => file.path === path);
  if (!entry) throw new Error(`Missing generated analytics proxy file: ${path}`);
  return entry.content;
}

function importReferences(source: string) {
  return parseFile(source, ".ts").importReferences.map(({ specifier, kind, typeOnly }) => ({
    specifier,
    kind,
    typeOnly,
  }));
}

async function loadExecutableProxy(source: string, mode: Mode, label: string) {
  const configImport =
    mode === "monorepo"
      ? 'import { env } from "@repo/config/server";'
      : 'import { env } from "@/lib/env/server";';
  if (!source.includes(configImport)) {
    throw new Error(`${label}: missing expected server env import`);
  }

  let transformed = source
    .replace('import { NextRequest, NextResponse } from "next/server";\n', "")
    .replace('import "server-only";\n', "")
    .replace(configImport, 'const env = { POSTHOG_HOST: "https://eu.i.posthog.com" };')
    .replaceAll("NextRequest", "Request")
    .replaceAll("NextResponse", "Response");
  const fetchCall = "upstream = await fetch(targetUrl, {";
  if (!transformed.includes(fetchCall)) {
    throw new Error(`${label}: missing proxy fetch call`);
  }
  transformed = transformed.replace(fetchCall, "upstream = await __proxyTestFetch(targetUrl, {");
  transformed = `const __proxyTestLabel = ${JSON.stringify(label)};
const __capturedProxyRequests: Array<{ url: string; headers: Array<[string, string]> }> = [];
const __proxyTestFetch: typeof fetch = async (input, init) => {
  void __proxyTestLabel;
  __capturedProxyRequests.push({
    url: String(input),
    headers: [...new Headers(init?.headers).entries()],
  });
  return new Response("ok", { status: 200, headers: { "content-type": "text/plain" } });
};
${transformed}
export { __capturedProxyRequests };
`;

  const javascript = new Bun.Transpiler({ loader: "ts" }).transformSync(transformed);
  const dataUrl = `data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`;
  return (await import(dataUrl)) as unknown as ExecutableProxy;
}

describe("generated PostHog ingest proxy admission", () => {
  for (const mode of MODES) {
    for (const [name, render] of [
      ["root", proxyRouteContent],
      ["catch-all", proxyCatchAllRouteContent],
    ] as const) {
      test(`${mode}/${name} bounds both directions and the upstream deadline`, () => {
        const source = render(mode);
        expectHardenedProxy(source, `${mode}-${name}.ts`);
      });

      test(`${mode}/${name} drops caller-controlled network identity headers`, async () => {
        const source = render(mode);
        for (const header of SPOOFABLE_NETWORK_HEADERS) {
          expect(source, `${mode}/${name}: ${header}`).not.toContain(`"${header}"`);
        }

        const executable = await loadExecutableProxy(source, mode, `${mode}-${name}`);
        const request = new Request("http://localhost/api/ingest/e/?test=identity", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-forwarded-for": "203.0.113.10",
            "x-real-ip": "203.0.113.11",
            "cf-connecting-ip": "203.0.113.12",
          },
          body: "{}",
        });
        const context =
          name === "catch-all" ? { params: Promise.resolve({ path: ["e"] }) } : undefined;

        expect((await executable.POST(request, context)).status).toBe(200);
        expect(executable.__capturedProxyRequests).toHaveLength(1);
        const headers = new Headers(executable.__capturedProxyRequests[0]?.headers);
        expect(headers.get("content-type")).toBe("application/json");
        for (const header of SPOOFABLE_NETWORK_HEADERS) {
          expect(headers.get(header), `${mode}/${name}: ${header}`).toBeNull();
        }
      });
    }
  }
});

describe("generated TanStack PostHog proxy boundary", () => {
  for (const mode of MODES) {
    test(`${mode} emits thin root and catch-all routes with one server-only implementation`, async () => {
      const files = generateTanstackAnalytics(mode);
      const root = mode === "monorepo" ? "apps/web/" : "";
      const serverImport = "@/server/http/analytics-ingest.server";
      const serverPath = `${root}src/server/http/analytics-ingest.server.ts`;
      const server = read(files, serverPath);

      for (const [routePath, routeId] of [
        [`${root}src/routes/api/ingest.ts`, "/api/ingest"],
        [`${root}src/routes/api/ingest/$.ts`, "/api/ingest/$"],
      ] as const) {
        const route = read(files, routePath);
        expect(parseSync(routePath, route).errors, routePath).toEqual([]);
        expect(route).toContain(`createFileRoute("${routeId}")`);
        expect(importReferences(route), routePath).toEqual([
          { specifier: "@tanstack/react-start", kind: "import", typeOnly: false },
          { specifier: "@tanstack/react-router", kind: "import", typeOnly: false },
          { specifier: serverImport, kind: "dynamic-import", typeOnly: false },
          { specifier: serverImport, kind: "dynamic-import", typeOnly: false },
          { specifier: serverImport, kind: "dynamic-import", typeOnly: false },
        ]);

        expect(route, routePath).toContain(
          'import { createServerOnlyFn } from "@tanstack/react-start"',
        );
        const routeStart = route.indexOf("export const Route");
        expect(routeStart, `${routePath}: exported route`).toBeGreaterThanOrEqual(0);
        const handlers = route.slice(routeStart);
        const dispatches = [
          ["GET", "dispatchAnalyticsGet"],
          ["POST", "dispatchAnalyticsPost"],
          ["OPTIONS", "dispatchAnalyticsOptions"],
        ] as const;
        for (const [index, [method, dispatch]] of dispatches.entries()) {
          const marker = `const ${dispatch} = createServerOnlyFn`;
          const wrapperStart = route.indexOf(marker);
          expect(wrapperStart, `${routePath}: top-level ${dispatch}`).toBeGreaterThanOrEqual(0);
          expect(wrapperStart, `${routePath}: ${dispatch} precedes route handlers`).toBeLessThan(
            routeStart,
          );
          const nextDispatch = dispatches[index + 1]?.[1];
          const wrapperEnd = nextDispatch
            ? route.indexOf(`const ${nextDispatch} = createServerOnlyFn`)
            : routeStart;
          const wrapper = route.slice(wrapperStart, wrapperEnd);
          expect(wrapper, `${routePath}: ${dispatch} owns the server import`).toContain(
            `const { ${method} } = await import("${serverImport}");`,
          );
          expect(wrapper, `${routePath}: ${dispatch} delegates to ${method}`).toContain(
            `return await ${method}(request);`,
          );
          expect(handlers, `${routePath}: ${method} calls ${dispatch}`).toContain(
            `${method}: ({ request }: { request: Request }) => ${dispatch}(request),`,
          );
        }
        expect(handlers, `${routePath}: no handler-local dynamic import`).not.toContain("import(");
        expect(route, `${routePath}: old handler-local dispatch form`).not.toContain(
          `(await import("${serverImport}"))`,
        );
        expect(route).not.toContain('import "server-only"');
      }

      expect(server.startsWith('import "server-only";\n')).toBe(true);
      expect(importReferences(server), serverPath).toEqual([
        { specifier: "server-only", kind: "import", typeOnly: false },
        {
          specifier: mode === "monorepo" ? "@repo/config/server" : "@/lib/env/server",
          kind: "import",
          typeOnly: false,
        },
      ]);
      expect(server).not.toContain("next/server");
      expect(server).not.toContain("NextRequest");
      expect(server).not.toContain("NextResponse");
      expect(server).toContain("export async function GET(request: Request): Promise<Response>");
      expect(server).toContain("export async function POST(request: Request): Promise<Response>");
      expect(server).toContain(
        "export async function OPTIONS(_request: Request): Promise<Response>",
      );
      expect(server).toContain('const idx = pathname.indexOf("/api/ingest");');
      expect(server).toContain('const after = pathname.slice(idx + "/api/ingest".length);');
      expect(server).toContain('path = after || "/";');
      expect(server).toContain("return host + path + search;");
      expectHardenedProxy(server, serverPath);

      const executable = await loadExecutableProxy(server, mode, `${mode}-tanstack-server`);
      const response = await executable.POST(
        new Request("http://localhost/api/ingest/e/?ip=1&x=%2F", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        }),
      );
      expect(response.status).toBe(200);
      expect(executable.__capturedProxyRequests).toEqual([
        {
          url: "https://eu.i.posthog.com/e/?ip=1&x=%2F",
          headers: [["content-type", "application/json"]],
        },
      ]);
    });
  }
});
