import { describe, expect, test } from "bun:test";
import { parseSync } from "oxc-parser";
import { projectConfigSchema } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";
import type { TemplateFile } from "../../src/templates/shared.js";

type Mode = "monorepo" | "single";
type Database = "postgres" | "convex";
type ServerOnlyDispatch = { name: string; callback: string };

function generate(mode: Mode, database: Database): TemplateFile[] {
  return generateProjectFiles(
    projectConfigSchema.parse({
      name: "tanstack-server-boundary",
      runtime: "bun",
      mode,
      framework: "tanstack-start",
      database,
      apps: ["web"],
      preset: "custom",
      auth: true,
      api: true,
      email: true,
      analytics: true,
      billing: ["stripe", "chargily", "paddle", "polar"],
      messaging: true,
      storage: true,
      notifications: true,
      featureFlags: "posthog",
      jobs: true,
      pdf: true,
      cache: "redis",
      deploy: "none",
      features: ["i18n"],
    }),
    { dryRun: true },
  );
}

function read(files: readonly TemplateFile[], path: string): string {
  const entry = files.find((file) => file.path === path);
  if (!entry) throw new Error(`Missing generated file: ${path}`);
  return entry.content;
}

function expectThinRoute(source: string, path: string, serverImport: string): void {
  expectServerOnlyDispatchRoute(source, path, serverImport);
  expect(source).not.toContain(`from "${serverImport}"`);
  expect(source).toContain("server:");
  expect(source).toContain("handlers:");
  expect(source).not.toContain('import "server-only"');
  expect(source).not.toContain("node:");
  expect(source).not.toContain("drizzle-orm");
  expect(source).not.toContain("@repo/api");
  expect(source).not.toContain("@repo/auth");
  expect(source).not.toContain("@repo/database");
  expect(source).not.toContain("@repo/storage");
  expect(source).not.toMatch(/from ["']@\/server\/(?:api|auth|db|storage)["'/]/);
  expect(source).not.toMatch(/export\s+(?:async\s+)?function\s+(?:handle|upload|download)/);
}

function staticImportSpecifiers(source: string, path: string): string[] {
  const parsed = parseSync(path, source);
  expect(parsed.errors, path).toEqual([]);
  return parsed.program.body.flatMap((statement) => {
    if (statement.type !== "ImportDeclaration") return [];
    return typeof statement.source.value === "string" ? [statement.source.value] : [];
  });
}

function dynamicImportSpecifiers(source: string): string[] {
  return [...source.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)].map((match) => match[1] ?? "");
}

function serverOnlyDispatches(source: string, path: string): ServerOnlyDispatch[] {
  const parsed = parseSync(path, source);
  expect(parsed.errors, path).toEqual([]);

  const dispatches: ServerOnlyDispatch[] = [];
  for (const statement of parsed.program.body) {
    if (statement.type !== "VariableDeclaration") continue;
    for (const declaration of statement.declarations) {
      if (declaration.id.type !== "Identifier" || !declaration.id.name.startsWith("dispatch")) {
        continue;
      }
      const init = declaration.init;
      if (
        init?.type !== "CallExpression" ||
        init.callee.type !== "Identifier" ||
        init.callee.name !== "createServerOnlyFn"
      ) {
        continue;
      }
      const callback = init.arguments[0];
      if (!callback || callback.type !== "ArrowFunctionExpression") {
        throw new Error(`${path}: ${declaration.id.name} must wrap an arrow callback`);
      }
      dispatches.push({
        name: declaration.id.name,
        callback: source.slice(callback.start, callback.end),
      });
    }
  }
  return dispatches;
}

function expectServerOnlyDispatchRoute(
  source: string,
  path: string,
  expectedServerImport?: string,
): void {
  expect(staticImportSpecifiers(source, path), path).toEqual([
    "@tanstack/react-start",
    "@tanstack/react-router",
  ]);
  expect(source, path).toContain('import { createServerOnlyFn } from "@tanstack/react-start"');

  const dispatches = serverOnlyDispatches(source, path);
  expect(dispatches.length, `${path}: top-level dispatch wrappers`).toBeGreaterThan(0);
  const wrapperImports = dispatches.flatMap(({ callback, name }) => {
    const imports = dynamicImportSpecifiers(callback);
    expect(imports, `${path}: ${name} owns its dynamic import`).toHaveLength(1);
    return imports;
  });
  const allDynamicImports = dynamicImportSpecifiers(source);
  expect(wrapperImports, `${path}: no dynamic import outside a dispatch wrapper`).toEqual(
    allDynamicImports,
  );
  expect(
    wrapperImports.every(
      (specifier) =>
        specifier.endsWith(".server") &&
        (expectedServerImport === undefined || specifier === expectedServerImport),
    ),
    path,
  ).toBe(true);

  const routeStart = source.indexOf("export const Route");
  expect(routeStart, `${path}: exported route`).toBeGreaterThanOrEqual(0);
  const handlers = source.slice(routeStart);
  expect(dynamicImportSpecifiers(handlers), `${path}: no handler-local dynamic import`).toEqual([]);
  for (const { name } of dispatches) {
    expect(handlers, `${path}: handler calls ${name}`).toMatch(new RegExp(`\\b${name}\\(`));
  }
}

describe("TanStack server route boundaries", () => {
  for (const mode of ["monorepo", "single"] as const) {
    for (const database of ["postgres", "convex"] as const) {
      test(`${mode}/${database} keeps every server dependency outside the physical route tree`, () => {
        const files = generate(mode, database);
        const root = mode === "monorepo" ? "apps/web/" : "";

        const apiRoutes = files.filter(
          ({ path }) => path.startsWith(`${root}src/routes/api/`) && path.endsWith(".ts"),
        );
        expect(apiRoutes).toHaveLength(database === "postgres" ? 14 : 13);
        for (const route of apiRoutes) {
          const dynamicImports = dynamicImportSpecifiers(route.content);
          if (route.path.endsWith("/api/health.ts")) {
            expect(staticImportSpecifiers(route.content, route.path), route.path).toEqual([
              "@tanstack/react-router",
            ]);
            expect(dynamicImports, route.path).toEqual([]);
            expect(route.content, route.path).not.toContain("createServerOnlyFn");
          } else {
            expectServerOnlyDispatchRoute(route.content, route.path);
            expect(
              dynamicImports.every((specifier) => specifier.startsWith("@/server/http/")),
              route.path,
            ).toBe(true);
          }
        }

        const rpcRoutePath = `${root}src/routes/api/rpc/$.ts`;
        const rpcServerPath = `${root}src/server/http/rpc.server.ts`;
        const rpcRoute = read(files, rpcRoutePath);
        const rpcServer = read(files, rpcServerPath);
        expectThinRoute(rpcRoute, rpcRoutePath, "@/server/http/rpc.server");
        expect(rpcRoute.match(/handleRpcRequest\(request\)/g)).toHaveLength(1);
        expect(rpcRoute.match(/dispatchRpcRequest\(request\)/g)).toHaveLength(5);
        expect(rpcServer).toContain('import "server-only"');
        expect(rpcServer).toContain("new RPCHandler(appRouter");
        expect(rpcServer).toContain('prefix: "/api/rpc"');
        expect(rpcServer).toContain(
          mode === "monorepo" ? 'from "@repo/api"' : 'from "@/server/api"',
        );

        for (const [routePath, serverImport, serverPath] of [
          [
            `${root}src/routes/api/auth/$.ts`,
            "@/server/http/auth.server",
            `${root}src/server/http/auth.server.ts`,
          ],
          [
            `${root}src/routes/api/openapi.ts`,
            "@/server/http/openapi.server",
            `${root}src/server/http/openapi.server.ts`,
          ],
          [
            `${root}src/routes/api/$.ts`,
            "@/server/http/openapi-operations.server",
            `${root}src/server/http/openapi-operations.server.ts`,
          ],
          [
            `${root}src/routes/api/pdf.ts`,
            "@/server/http/pdf.server",
            `${root}src/server/http/pdf.server.ts`,
          ],
          [
            `${root}src/routes/api/ingest.ts`,
            "@/server/http/analytics-ingest.server",
            `${root}src/server/http/analytics-ingest.server.ts`,
          ],
          [
            `${root}src/routes/api/ingest/$.ts`,
            "@/server/http/analytics-ingest.server",
            `${root}src/server/http/analytics-ingest.server.ts`,
          ],
        ] as const) {
          expectThinRoute(read(files, routePath), routePath, serverImport);
          expect(read(files, serverPath), serverPath).toContain('import "server-only"');
        }

        for (const provider of ["stripe", "chargily", "paddle", "polar"] as const) {
          const routePath = `${root}src/routes/api/webhooks/${provider}.ts`;
          const serverPath = `${root}src/server/http/webhooks/${provider}.server.ts`;
          expectThinRoute(
            read(files, routePath),
            routePath,
            `@/server/http/webhooks/${provider}.server`,
          );
          expect(read(files, serverPath), serverPath).toContain('import "server-only"');
        }

        const uploadRoutePath = `${root}src/routes/api/messaging/attachments.ts`;
        const uploadServerPath = `${root}src/server/http/messaging/attachments-upload.server.ts`;
        const uploadRoute = read(files, uploadRoutePath);
        const uploadServer = read(files, uploadServerPath);
        expectThinRoute(
          uploadRoute,
          uploadRoutePath,
          "@/server/http/messaging/attachments-upload.server",
        );
        expect(uploadRoute).toMatch(
          database === "postgres"
            ? /return await uploadAttachment\(\s*request,?\s*\)/
            : /return await uploadConvexAttachment\(\s*request,?\s*\)/,
        );
        expect(uploadServer).toContain('import "server-only"');

        const downloadRoutePath = `${root}src/routes/api/messaging/attachments.$attachmentId.ts`;
        const downloadServerPath = `${root}src/server/http/messaging/attachments-download.server.ts`;
        if (database === "postgres") {
          const downloadRoute = read(files, downloadRoutePath);
          const downloadServer = read(files, downloadServerPath);
          expectThinRoute(
            downloadRoute,
            downloadRoutePath,
            "@/server/http/messaging/attachments-download.server",
          );
          expect(downloadRoute).toMatch(
            /return await downloadAttachment\(\s*request,\s*attachmentId,?\s*\)/,
          );
          expect(downloadRoute).toMatch(
            /dispatchAttachmentDownload\(\s*request,\s*params\.attachmentId,?\s*\)/,
          );
          const attachmentAdapter = read(
            files,
            `${root}src/server/messaging/attachment-storage.ts`,
          );
          expect(attachmentAdapter).toContain('from "node:crypto"');
          expect(downloadServer).toContain('import "server-only"');
          expect(downloadServer).toContain(".innerJoin(");
          expect(downloadServer).toContain("getFile(authorized.storageKey)");
        } else {
          expect(files.some(({ path }) => path === downloadRoutePath)).toBe(false);
          expect(files.some(({ path }) => path === downloadServerPath)).toBe(false);
          expect(uploadServer).toContain("api.messagingServer.authorizeUpload");
          expect(uploadServer).toContain("api.messagingServer.upload");
        }
      });
    }
  }
});
