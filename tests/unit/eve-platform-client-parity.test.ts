import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseSync } from "oxc-parser";
import { resolveCreateConfig } from "../../src/commands/create/resolution.js";
import { projectConfigSchema, type ProjectConfig } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";
import type { TemplateFile } from "../../src/templates/shared.js";

const temporaryRoots: string[] = [];

afterAll(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function generated(
  app: "mobile" | "desktop",
  overrides: Partial<ProjectConfig> = {},
): TemplateFile[] {
  return generateProjectFiles(
    projectConfigSchema.parse({
      name: `eve-platform-monorepo-${app}`,
      runtime: "bun",
      mode: "monorepo",
      framework: "nextjs",
      database: "postgres",
      preset: "custom",
      apps: ["web", app],
      auth: true,
      api: true,
      email: false,
      analytics: false,
      eve: true,
      i18n: false,
      pdf: false,
      messaging: false,
      storage: false,
      notifications: false,
      featureFlags: "none",
      jobs: false,
      cache: "none",
      billing: [],
      features: [],
      ...overrides,
    }),
    { dryRun: true },
  );
}

function resolveSingleNative(app: "mobile" | "desktop", eve: boolean) {
  return resolveCreateConfig({
    name: `eve-platform-single-${app}`,
    runtime: "bun",
    mode: "single",
    framework: "nextjs",
    database: "none",
    databaseWasExplicit: false,
    preset: eve ? "custom" : "frontend",
    apps: [app],
    billing: [],
    features: [],
    cache: "none",
    deploy: "none",
    withAnalytics: !eve,
    withI18n: !eve,
    withEve: eve,
  });
}

function read(files: readonly TemplateFile[], path: string): string {
  const value = files.find((entry) => entry.path === path)?.content;
  if (!value) throw new Error(`Missing generated file: ${path}`);
  return value;
}

function paths(app: "mobile" | "desktop") {
  const root = `apps/${app}/`;
  const renderer = app === "desktop" ? "src/renderer/" : "src/";
  return {
    acceptance: `${root}tests/eve-client.test.ts`,
    adapter: `${root}${renderer}lib/eve-client.ts`,
    manifest: `${root}package.json`,
    protocol: `${root}${renderer}lib/eve-protocol.ts`,
    route: app === "mobile" ? `${root}app/agent.tsx` : `${root}src/renderer/routes/agent.tsx`,
  } as const;
}

function expectParses(files: readonly TemplateFile[], path: string): void {
  expect(parseSync(path, read(files, path)).errors, path).toEqual([]);
}

describe("Eve Expo and Electron client parity", () => {
  test("monorepo Expo invokes Eve only through the authenticated application facade", () => {
    const files = generated("mobile");
    const expected = paths("mobile");
    for (const path of Object.values(expected))
      expect(
        files.some((entry) => entry.path === path),
        path,
      ).toBe(true);
    for (const path of [expected.adapter, expected.protocol, expected.route, expected.acceptance])
      expectParses(files, path);

    const adapter = read(files, expected.adapter);
    const protocol = read(files, expected.protocol);
    const route = read(files, expected.route);
    const manifest = JSON.parse(read(files, expected.manifest)) as {
      scripts?: Record<string, string>;
      dependencies?: Record<string, string>;
    };
    expect(adapter).toContain("authClient.getCookie()");
    expect(adapter).toContain('headers.set("Origin", origin)');
    expect(adapter).toContain('redirect: "manual"');
    expect(adapter).toContain('from "@repo/config/expo"');
    expect(`${adapter}\n${protocol}`).not.toContain("EVE_INTERNAL_AUTH_SECRET");
    expect(protocol).toContain('"/api/agent/eve/v1/session"');
    expect(protocol).toContain('"&includeTailIndex=1"');
    expect(route).toContain("eveClient.invoke(message, session");
    expect(route).toContain("useAuth()");
    expect(manifest.scripts?.test).toContain("bun test");
    expect(
      manifest.dependencies?.eve,
      "the native client must not bundle the Node-only Eve SDK",
    ).toBeUndefined();
  });

  test("monorepo Electron uses its validated preload bridge for Eve", () => {
    const files = generated("desktop");
    const expected = paths("desktop");
    const root = "apps/desktop/";
    const mainPath = `${root}src/main.ts`;
    const preloadPath = `${root}src/preload.ts`;
    for (const path of [
      expected.adapter,
      expected.protocol,
      expected.route,
      expected.acceptance,
      mainPath,
      preloadPath,
    ])
      expectParses(files, path);

    const adapter = read(files, expected.adapter);
    const main = read(files, mainPath);
    const preload = read(files, preloadPath);
    const rootRoute = read(files, `${root}src/renderer/routes/__root.tsx`);
    const routeTree = read(files, `${root}src/renderer/routeTree.gen.ts`);
    const manifest = JSON.parse(read(files, expected.manifest)) as {
      scripts?: Record<string, string>;
      dependencies?: Record<string, string>;
    };
    expect(adapter).toContain("window.desktopBridge.eveRequest");
    expect(main).toContain('ipcMain.handle("desktop:eve-request"');
    expect(main).toContain("desktopEveRequest(value)");
    expect(main).toContain("session.defaultSession.fetch");
    expect(main).toContain("Origin: origin");
    expect(main).toContain('credentials: "include"');
    expect(main).toContain('redirect: "manual"');
    expect(preload).toContain(
      'eveRequest: (input) => ipcRenderer.invoke("desktop:eve-request", input)',
    );
    expect(rootRoute).toContain('to="/agent"');
    expect(routeTree).toContain('from "./routes/agent"');
    expect(`${adapter}\n${main}\n${preload}`).not.toContain("EVE_INTERNAL_AUTH_SECRET");
    expect(manifest.scripts?.test).toBe("bun test tests");
    expect(manifest.dependencies?.eve).toBeUndefined();
  });

  test("monorepo TanStack exposes the same authenticated Eve facade to Expo and Electron", () => {
    for (const app of ["mobile", "desktop"] as const) {
      const files = generated(app, { framework: "tanstack-start" });
      const expected = paths(app);
      expect(
        files.some(({ path }) => path === expected.protocol),
        app,
      ).toBe(true);
      expect(read(files, expected.protocol)).toContain('"/api/agent/eve/v1/session"');
      expect(
        files.some(({ path }) => path === expected.route),
        app,
      ).toBe(true);
      expect(
        files.some(({ path }) => path === "apps/web/src/routes/api/agent/$.ts"),
        app,
      ).toBe(true);
      expect(
        files.some(
          ({ path }) => path === "apps/web/src/routes/api/agent/internal/eve-lifecycle.ts",
        ),
        app,
      ).toBe(true);
      expect(
        files.some(({ path }) => path === "apps/eve/agent/hooks/admission-lifecycle.ts"),
        app,
      ).toBe(true);
    }
  });

  test("single native Eve is rejected while frontend-only shells remain supported", () => {
    for (const app of ["mobile", "desktop"] as const) {
      const unsupported = resolveSingleNative(app, true);
      expect(unsupported.ok, app).toBe(false);
      if (unsupported.ok) throw new Error(`single ${app} Eve must remain unreachable`);
      expect(unsupported.reason).toBe("single-native-server-capabilities-unsupported");
      expect(unsupported.unsupportedSelections).toEqual(
        expect.arrayContaining(["auth", "api", "eve"]),
      );

      const frontend = resolveSingleNative(app, false);
      expect(frontend.ok, app).toBe(true);
      if (!frontend.ok) throw new Error(frontend.message);
      expect(frontend.config.analytics).toBe(true);
      expect(frontend.config.i18n).toBe(true);
      const files = generateProjectFiles(frontend.config, { dryRun: true });
      const basePath = app === "mobile" ? "app/index.tsx" : "src/renderer/routes/index.tsx";
      expect(files.some(({ path }) => path === basePath)).toBe(true);
      expect(files.some(({ path }) => /(?:^|\/)agent\.tsx$/.test(path))).toBe(false);
      expect(files.some(({ path }) => /(?:^|\/)lib\/eve-(?:client|protocol)\.ts$/.test(path))).toBe(
        false,
      );
    }
  });

  test("fails closed when Eve lacks auth, transport, or persistence prerequisites", () => {
    const unsupported = [
      generated("mobile", { eve: false }),
      generated("mobile", { auth: false }),
      generated("mobile", { database: "none" }),
      generated("desktop", { eve: false }),
      generated("desktop", { auth: false }),
      generated("desktop", { database: "none" }),
    ];
    for (const files of unsupported) {
      expect(files.some(({ path }) => /(?:^|\/)lib\/eve-(?:client|protocol)\.ts$/.test(path))).toBe(
        false,
      );
      expect(
        files.some(({ path }) => /(?:^|\/)agent\.tsx$/.test(path) && !path.includes("apps/eve/")),
      ).toBe(false);
      expect(files.some(({ path }) => path.endsWith("tests/eve-client.test.ts"))).toBe(false);
    }
  });

  test("the generated protocol follows create, catch-up, and fixed-session continuation semantics", async () => {
    const files = generated("mobile");
    const source = read(files, "apps/mobile/src/lib/eve-protocol.ts");
    const root = mkdtempSync(join(tmpdir(), "ghostinit-eve-platform-"));
    temporaryRoots.push(root);
    const modulePath = join(root, "eve-protocol.ts");
    writeFileSync(modulePath, source);
    const protocol = (await import(
      `${pathToFileURL(modulePath).href}?run=${crypto.randomUUID()}`
    )) as {
      createEveClient(transport: {
        request(path: string, input: { body?: string; method: "GET" | "POST" }): Promise<Response>;
      }): {
        invoke(
          message: string,
          previous?: { sessionId: string; nextIndex: number } | null,
        ): Promise<{ message: string; session: { sessionId: string; nextIndex: number } }>;
      };
    };
    const requests: string[] = [];
    const client = protocol.createEveClient({
      async request(path, input) {
        requests.push(`${input.method} ${path}`);
        if (input.method === "POST") {
          return Response.json({ sessionId: "wrun_native" }, { status: 202 });
        }
        return new Response(
          `${JSON.stringify({ type: "message.completed", data: { message: "Ready" } })}\n${JSON.stringify({ type: "session.waiting", data: {} })}\n`,
          { status: 200 },
        );
      },
    });
    const first = await client.invoke("start");
    expect(first.message).toBe("Ready");
    expect(first.session).toEqual({ sessionId: "wrun_native", nextIndex: 2 });
    await client.invoke("continue", first.session);
    expect(requests).toEqual([
      "POST /api/agent/eve/v1/session",
      "GET /api/agent/eve/v1/session/wrun_native/stream?startIndex=0&includeTailIndex=1",
      "POST /api/agent/eve/v1/session/wrun_native",
      "GET /api/agent/eve/v1/session/wrun_native/stream?startIndex=2&includeTailIndex=1",
    ]);
  });
});
