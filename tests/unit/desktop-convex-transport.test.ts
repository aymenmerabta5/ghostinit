import { describe, expect, test } from "bun:test";
import { generateProjectFiles } from "../../src/templates/default.js";
import { projectConfigSchema } from "../../src/lib/config.js";
import { MAX_ORPC_BODY_BYTES } from "../../src/templates/api/body-limits.js";
import { desktopMainEnvContent } from "../../src/templates/packages/config-content.js";
import { parseFile } from "../../src/lib/architecture/parsers/imports.js";
import { posix } from "node:path";

function evaluate<T>(source: string, returned: string, bindings: Record<string, unknown> = {}): T {
  const isolated = source.replace(/^import[^\n]*\n/gm, "").replace(/^export /gm, "");
  const javascript = new Bun.Transpiler({ loader: "ts" }).transformSync(isolated);
  return new Function(...Object.keys(bindings), `${javascript}\nreturn ${returned};`)(
    ...Object.values(bindings),
  ) as T;
}

function generated(
  framework: "nextjs" | "tanstack-start",
  database: "convex" | "postgres" = "convex",
  messaging = true,
  storage = messaging,
) {
  return new Map(
    generateProjectFiles(
      projectConfigSchema.parse({
        name: "desktop-convex",
        runtime: "bun",
        mode: "monorepo",
        framework,
        database,
        apps: ["web", "desktop"],
        preset: "custom",
        auth: true,
        api: true,
        messaging,
        storage,
        email: false,
        analytics: false,
        billing: [],
        features: [],
      }),
    ).map((file) => [file.path, file.content]),
  );
}

function read(files: Map<string, string>, path: string): string {
  const content = files.get(path);
  if (!content) throw new Error("Missing generated file: " + path);
  return content;
}

function declaration(source: string, name: string): string {
  const start = source.indexOf(`function ${name}(`);
  const end = source.indexOf("\n}\n", start);
  if (start < 0 || end < 0) throw new Error("Missing function: " + name);
  return source.slice(start, end + 3);
}

describe("privileged desktop Convex integration", () => {
  const configured = "https://selected-deployment.convex.cloud";
  for (const framework of ["nextjs", "tanstack-start"] as const) {
    for (const [messaging, storage] of [
      [false, false],
      [false, true],
      [true, true],
    ] as const) {
      test(`${framework} closes desktop imports with messaging=${messaging}, storage=${storage}`, () => {
        const files = generated(framework, "convex", messaging, storage);
        const main = read(files, "apps/desktop/src/main.ts");
        const preload = read(files, "apps/desktop/src/preload.ts");
        expect(main).toContain("connections.push(convexUrl");
        expect(preload).toContain("readonly convexUrl: string");
        expect(files.has("apps/desktop/src/server/transport/convex-storage.ts")).toBe(messaging);
        expect(main.includes('"desktop:convex-storage-fetch"')).toBe(messaging);
        expect(preload.includes("convexStorageFetch:")).toBe(messaging);
        const unresolved: string[] = [];
        for (const [path, content] of files) {
          if (!path.startsWith("apps/desktop/src/") || !/\.tsx?$/.test(path)) continue;
          for (const specifier of parseFile(content, path.endsWith(".tsx") ? ".tsx" : ".ts")
            .imports) {
            if (!specifier.startsWith(".")) continue;
            const target = posix.normalize(
              posix.join(posix.dirname(path), specifier.replace(/\.js$/, "")),
            );
            // Convex codegen owns these two targets; permit only the root-level
            // references, never an app-local _generated directory.
            if (/^convex\/_generated\/(?:api|dataModel)$/.test(target)) continue;
            if (
              ![
                target,
                target + ".ts",
                target + ".tsx",
                target + "/index.ts",
                target + "/index.tsx",
              ].some((candidate) => files.has(candidate))
            ) {
              unresolved.push(path + " -> " + specifier);
            }
          }
        }
        expect(unresolved).toEqual([]);
      });
    }
    test(`${framework} binds packaging, runtime, preload, renderer and CSP to one exact origin`, () => {
      const files = generated(framework);
      const validators = evaluate<{
        resolveDesktopMainEnv: (env: Record<string, string>, options: object) => object;
        resolveDesktopConvexUrl: (value?: string) => string;
      }>(desktopMainEnvContent(), "({ resolveDesktopMainEnv, resolveDesktopConvexUrl })");
      expect(validators.resolveDesktopConvexUrl(configured + "/")).toBe(configured);
      expect(validators.resolveDesktopConvexUrl("https://convex.custom.example")).toBe(
        "https://convex.custom.example",
      );
      for (const invalid of [
        undefined,
        "",
        "http://selected-deployment.convex.cloud",
        "https://user:pass@selected-deployment.convex.cloud",
        configured + "/api",
        configured + "?key=value",
        configured + "#fragment",
      ]) {
        expect(() => validators.resolveDesktopConvexUrl(invalid)).toThrow();
      }
      const runtime = read(files, "apps/desktop/src/server/transport/runtime-config.ts");
      const runtimeBindings = {
        ...validators,
        app: { isPackaged: true },
        process: { env: {} },
        __GHOSTINIT_DESKTOP_EMBEDDED_API_URL__: "https://app.example.com",
        __GHOSTINIT_DESKTOP_EMBEDDED_CONVEX_URL__: configured,
      };
      const embedded = evaluate<{ convexUrl: string }>(
        runtime,
        "({ env, convexUrl })",
        runtimeBindings,
      );
      expect(embedded.convexUrl).toBe(configured);
      const managed = evaluate<{ convexUrl: string }>(runtime, "({ env, convexUrl })", {
        ...runtimeBindings,
        process: { env: { VITE_CONVEX_URL: "https://managed.convex.cloud" } },
      });
      expect(managed.convexUrl).toBe("https://managed.convex.cloud");
      const vite = read(files, "apps/desktop/electron.vite.config.ts");
      expect(vite).toContain('loadEnv(mode, environmentRoot, "VITE_CONVEX_URL")');
      expect(vite).toContain(
        "__GHOSTINIT_DESKTOP_EMBEDDED_CONVEX_URL__: JSON.stringify(embeddedConvexUrl)",
      );
      const main = read(files, "apps/desktop/src/main.ts");
      const csp = evaluate<() => string>(declaration(main, "desktopCsp"), "desktopCsp", {
        env: { DESKTOP_API_URL: "https://app.example.com" },
        convexUrl: configured,
      })();
      const connections = csp
        .split("; ")
        .find((entry) => entry.startsWith("connect-src"))!
        .split(" ")
        .slice(1);
      expect(connections).toEqual([
        "'self'",
        "https://app.example.com",
        "wss://app.example.com",
        configured,
        "wss://selected-deployment.convex.cloud",
      ]);
      expect(csp).not.toContain("*");
      expect(csp).not.toContain("other-deployment");
      expect(main).toMatch(
        /"desktop:convex-storage-fetch"[\s\S]*?assertTrustedIpc\(event\);[\s\S]*?handleDesktopConvexStorageRequest\(url\)/,
      );
      const calls: unknown[][] = [];
      let exposed:
        | { convexUrl: string; convexStorageFetch: (url: string) => Promise<unknown> }
        | undefined;
      evaluate(read(files, "apps/desktop/src/preload.ts"), "bridge", {
        process: {
          argv: [
            "--ghostinit-desktop-api-url=https%3A%2F%2Fapp.example.com",
            "--ghostinit-desktop-convex-url=" + encodeURIComponent(configured),
          ],
        },
        ipcRenderer: {
          invoke: async (...args: unknown[]) => {
            calls.push(args);
          },
        },
        contextBridge: {
          exposeInMainWorld: (_name: string, value: typeof exposed) => {
            exposed = value;
          },
        },
      });
      expect(exposed?.convexUrl).toBe(configured);
      void exposed?.convexStorageFetch(configured + "/api/storage/object-1");
      expect(calls).toEqual([
        ["desktop:convex-storage-fetch", configured + "/api/storage/object-1"],
      ]);
      const provider = read(files, "apps/desktop/src/renderer/lib/providers.tsx");
      expect(provider).toContain("window.desktopBridge.convexUrl");
      expect(provider).not.toContain("env.VITE_CONVEX_URL");
      const postgres = generated(framework, "postgres");
      expect(postgres.has("apps/desktop/src/server/transport/convex-storage.ts")).toBe(false);
      expect(read(postgres, "apps/desktop/src/main.ts")).not.toContain(
        "desktop:convex-storage-fetch",
      );
    });
  }

  test("downloads only configured Convex objects without credentials and refuses redirects and oversized streams", async () => {
    const files = generated("tanstack-start");
    const requests: Array<{ url: string; init: RequestInit }> = [];
    let response = () =>
      new Response("file", {
        headers: { "content-type": "text/plain", "set-cookie": "private=value" },
      });
    const download = evaluate<
      (value: unknown) => Promise<{ body: Uint8Array; headers: [string, string][] }>
    >(
      read(files, "apps/desktop/src/server/transport/convex-storage.ts"),
      "handleDesktopConvexStorageRequest",
      {
        convexUrl: configured,
        session: {
          defaultSession: {
            fetch: async (url: string, init: RequestInit) => {
              requests.push({ url, init });
              return response();
            },
          },
        },
      },
    );
    const value = await download(configured + "/api/storage/object-1");
    expect(new TextDecoder().decode(value.body)).toBe("file");
    expect(value.headers).toEqual([["content-type", "text/plain"]]);
    expect(requests[0]?.init.credentials).toBe("omit");
    expect(requests[0]?.init.redirect).toBe("manual");
    expect(requests[0]?.init.method).toBe("GET");
    expect([...new Headers(requests[0]?.init.headers)]).toEqual([]);
    for (const invalid of [
      "https://other-deployment.convex.cloud/api/storage/object-1",
      "https://selected-deployment.convex.cloud.evil.example/api/storage/object-1",
      "https://selected-deployment.convex.site/api/storage/object-1",
      "https://user:password@selected-deployment.convex.cloud/api/storage/object-1",
      "http://selected-deployment.convex.cloud/api/storage/object-1",
      configured + "/api/query",
      configured + "/api/storage/../query",
      configured + "/api/storage/object-1?token=app-secret",
      configured + "/api/storage/object-1#secret",
      configured + "/api/storage/object%2Fother",
      configured + "/api/storage/",
      { url: configured + "/api/storage/object-1", headers: { authorization: "Bearer secret" } },
    ])
      await expect(download(invalid)).rejects.toThrow();
    expect(requests).toHaveLength(1);
    response = () =>
      new Response(null, { status: 302, headers: { location: "https://evil.example/steal" } });
    await expect(download(configured + "/api/storage/object-1")).rejects.toThrow("redirects");
    expect(requests).toHaveLength(2);
    let cancelled = false;
    response = () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(MAX_ORPC_BODY_BYTES + 1));
          },
          cancel() {
            cancelled = true;
          },
        }),
      );
    await expect(download(configured + "/api/storage/object-1")).rejects.toThrow("too large");
    expect(cancelled).toBe(true);
  });

  test("messaging chooses credential-free Convex download while retaining authenticated backend routes", async () => {
    const files = generated("tanstack-start");
    const source = read(files, "apps/desktop/src/renderer/adapters/messaging/convex.ts");
    const bodyStart = source.indexOf("function desktopMessagingApiUrl(");
    const bodyEnd = source.indexOf("export type ConversationId", bodyStart);
    expect(bodyStart).toBeGreaterThanOrEqual(0);
    expect(bodyEnd).toBeGreaterThan(bodyStart);
    const calls: Array<{ kind: string; url: string; init?: RequestInit }> = [];
    const blobUrl = Object.assign(class extends URL {}, {
      createObjectURL: () => "blob:test",
      revokeObjectURL: () => {},
    });
    const download = evaluate<(url: string, name: string) => Promise<void>>(
      source.slice(bodyStart, bodyEnd),
      "downloadDesktopAttachment",
      {
        window: {
          desktopBridge: {
            apiUrl: "https://app.example.com",
            convexUrl: configured,
            convexStorageFetch: async (url: string) => {
              calls.push({ kind: "convex", url });
              return { body: new Uint8Array([65]), status: 200, statusText: "OK", headers: [] };
            },
          },
        },
        desktopBridgeFetch: async (url: string, init: RequestInit) => {
          calls.push({ kind: "backend", url, init });
          return new Response("file");
        },
        URL: blobUrl,
        document: {
          createElement: () => ({ click() {}, remove() {} }),
          body: { appendChild() {} },
        },
        setTimeout: () => 0,
      },
    );
    await download(configured + "/api/storage/object-1", "file.txt");
    await download("https://app.example.com/api/messaging/attachments/owned-id", "file.txt");
    expect(calls[0]).toEqual({ kind: "convex", url: configured + "/api/storage/object-1" });
    expect(calls[1]?.kind).toBe("backend");
    expect(calls[1]?.init?.credentials).toBe("include");
    await expect(
      download("https://evil.example/api/storage/object-1", "file.txt"),
    ).rejects.toThrow();
    expect(calls).toHaveLength(2);
  });
});
