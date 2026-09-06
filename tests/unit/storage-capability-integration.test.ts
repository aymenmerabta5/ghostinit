import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { projectConfigSchema } from "../../src/lib/config.js";
import { storageAdapterIntegrationGuide } from "../../src/templates/adapters/storage/index.js";
import { generateProjectFiles } from "../../src/templates/default.js";

function byPath(files: ReadonlyArray<{ path: string; content: string }>) {
  return new Map(files.map((entry) => [entry.path, entry.content]));
}

describe("standalone storage capability integration", () => {
  test("documents the durable Postgres cleanup queue in the adapter integration contract", () => {
    expect(
      storageAdapterIntegrationGuide({ mode: "monorepo", database: "postgres" }).schemaBarrelLine,
    ).toContain("storageBlobCleanupQueue");
  });

  for (const mode of ["monorepo", "single"] as const) {
    for (const framework of ["nextjs", "tanstack-start"] as const) {
      for (const database of ["postgres", "convex"] as const) {
        test(`${mode}/${framework}/${database} composes an actor-owned storage slice`, () => {
          const files = byPath(
            generateProjectFiles(
              projectConfigSchema.parse({
                name: "storage-slice",
                mode,
                framework,
                database,
                preset: "custom",
                auth: true,
                api: true,
                storage: true,
                messaging: false,
                email: false,
                analytics: false,
                billing: [],
                apps: ["web"],
                features: [],
              }),
            ),
          );
          const apiRoot = mode === "monorepo" ? "packages/api/src" : "src/server/api";
          const serviceRoot =
            mode === "monorepo" ? "packages/services/src/storage" : "src/server/services/storage";
          const policy = files.get(`${serviceRoot}/policy.ts`) ?? "";
          const ownedService = files.get(`${serviceRoot}/owned-service.ts`) ?? "";
          const contract = files.get(`${apiRoot}/storage/contract.ts`) ?? "";
          const actions = files.get(`${apiRoot}/storage/actions.ts`) ?? "";
          const procedures = files.get(`${apiRoot}/storage/procedures.ts`) ?? "";
          const composition = files.get(`${apiRoot}/composition/storage.ts`) ?? "";
          const cleanupWorkerPath =
            mode === "monorepo"
              ? "packages/api/src/workers/storage/cleanup.ts"
              : "src/server/workers/storage/cleanup.ts";
          const cleanupWorker = files.get(cleanupWorkerPath) ?? "";
          const rootPackage = JSON.parse(files.get("package.json") ?? "{}") as {
            scripts?: Record<string, string>;
          };

          expect(files.has(`${serviceRoot}/owned-service.ts`)).toBe(true);
          expect(policy).toContain("maxObjectsPerOwner: 100");
          expect(policy).toContain("maxBytesPerOwner: 104857600");
          expect(ownedService).toContain("code === 0x2f || code === 0x5c");
          expect(ownedService).toContain("code <= 0x1f || code === 0x7f");
          expect(ownedService).not.toContain("u0000");
          expect(contract).toContain("oz.file()");
          expect(actions).toContain("input: { file: unknown }");
          expect(actions).toContain("input.file instanceof File");
          expect(procedures).toContain("implementer.upload.handler(actions.upload)");
          expect(contract).not.toMatch(/ownerId|storageKey/);
          expect(composition).toContain("createOwnedStorageService");
          expect(files.has(`${serviceRoot}/facade.ts`)).toBe(false);
          expect(
            files.has(
              database === "convex"
                ? "convex/storage.ts"
                : mode === "monorepo"
                  ? "packages/database/src/schema/storage.ts"
                  : "src/server/db/schema/storage.ts",
            ),
          ).toBe(true);
          const webRoot = mode === "monorepo" ? "apps/web/" : "";
          const rpcRoutePath =
            framework === "nextjs"
              ? `${webRoot}src/app/api/rpc/[...path]/route.ts`
              : `${webRoot}src/routes/api/rpc/$.ts`;
          const rpcRoute = files.get(rpcRoutePath) ?? "";
          const rpcAdmission =
            framework === "nextjs"
              ? rpcRoute
              : (files.get(`${webRoot}src/server/http/rpc.server.ts`) ?? "");
          if (framework === "tanstack-start") {
            expect(rpcRoute).toContain(
              'import { createServerOnlyFn } from "@tanstack/react-start"',
            );
            expect(rpcRoute).toMatch(
              /const dispatchRpcRequest = createServerOnlyFn\(async \(request: Request\): Promise<Response> => \{\s*const \{ handleRpcRequest \} = await import\("@\/server\/http\/rpc\.server"\);\s*return await handleRpcRequest\(request\);\s*\}\);/,
            );
            expect(rpcRoute.match(/dispatchRpcRequest\(request\)/g) ?? []).toHaveLength(5);
            expect(rpcRoute).not.toContain(
              '(await import("@/server/http/rpc.server")).handleRpcRequest(request)',
            );
            expect(rpcRoute).not.toContain("BodyLimitPlugin");
            expect(rpcAdmission).toContain('import "server-only"');
          }
          expect(rpcAdmission).toContain("BodyLimitPlugin");
          expect(rpcAdmission).toContain("const MAX_ORPC_BODY_BYTES = 15728640");
          expect(rpcAdmission).toContain("maxBodySize: MAX_ORPC_BODY_BYTES");
          if (database === "postgres") {
            const storageImplementationPath =
              mode === "monorepo" ? "packages/storage/src/index.ts" : "src/server/storage/index.ts";
            const storageImplementation = files.get(storageImplementationPath) ?? "";
            expect(storageImplementation).toContain("code === 0x2f || code === 0x5c");
            expect(storageImplementation).toContain("code <= 0x1f || code === 0x7f");
            expect(storageImplementation).not.toContain("u0000");
            const schemaPath =
              mode === "monorepo"
                ? "packages/database/src/schema/storage.ts"
                : "src/server/db/schema/storage.ts";
            const schemaIndexPath =
              mode === "monorepo"
                ? "packages/database/src/schema/index.ts"
                : "src/server/db/schema/index.ts";
            const adapterPath =
              mode === "monorepo"
                ? "packages/api/src/adapters/storage/postgres.ts"
                : "src/server/adapters/storage/postgres.ts";
            expect(files.get(schemaPath) ?? "").toContain("storageBlobCleanupQueue");
            expect(files.get(schemaPath) ?? "").toContain('status: text("status")');
            expect(files.get(schemaPath) ?? "").toContain("stored_objects_lifecycle_chk");
            expect(files.get(schemaPath) ?? "").toContain("storage_blob_cleanup_lease_pair_chk");
            expect(files.get(schemaIndexPath) ?? "").toContain("storageBlobCleanupQueue");
            expect(files.get(adapterPath) ?? "").toContain(".insert(storageBlobCleanupQueue)");
            expect(files.get(adapterPath) ?? "").not.toContain('kind: "postgres-local-or-s3"');
            expect(cleanupWorker).toContain("runPostgresStorageCleanupWorker");
            expect(cleanupWorker).toContain("CLEANUP_BATCH_LIMIT = 100");
            expect(rootPackage.scripts?.["storage:cleanup-worker"]).toContain(cleanupWorkerPath);
            if (mode === "monorepo") {
              const apiPackage = JSON.parse(files.get("packages/api/package.json") ?? "{}") as {
                exports?: Record<string, string>;
              };
              expect(apiPackage.exports?.["./workers/storage/cleanup"]).toBe(
                "./src/workers/storage/cleanup.ts",
              );
            }
          } else {
            expect(files.get("convex/storagePolicy.ts") ?? "").toBe(policy);
            expect(files.get("convex/schema/storage.ts") ?? "").toContain(
              '.index("by_owner", ["ownerId"])',
            );
            expect(files.has(cleanupWorkerPath)).toBe(false);
            expect(rootPackage.scripts?.["storage:cleanup-worker"]).toBeUndefined();
          }
        });
      }
    }
  }

  test("uses the runtime-aware TypeScript loader for a Node cleanup worker", () => {
    const files = byPath(
      generateProjectFiles(
        projectConfigSchema.parse({
          name: "storage-node-worker",
          runtime: "node",
          mode: "monorepo",
          framework: "nextjs",
          database: "postgres",
          preset: "custom",
          auth: true,
          api: true,
          storage: true,
          messaging: false,
          email: false,
          analytics: false,
          billing: [],
          apps: ["web"],
          features: [],
        }),
      ),
    );
    const rootPackage = JSON.parse(files.get("package.json") ?? "{}") as {
      scripts?: Record<string, string>;
    };
    expect(rootPackage.scripts?.["storage:cleanup-worker"]).toContain(
      "node --import ./scripts/typescript-worker-loader.mjs",
    );
    expect(files.has("scripts/typescript-worker-loader.mjs")).toBe(true);
  });

  test("Node cleanup loaders resolve source-authored explicit JavaScript specifiers", () => {
    const files = byPath(
      generateProjectFiles(
        projectConfigSchema.parse({
          name: "storage-node-loader",
          runtime: "node",
          mode: "monorepo",
          framework: "nextjs",
          database: "postgres",
          preset: "custom",
          auth: true,
          api: true,
          storage: true,
          messaging: true,
          email: false,
          analytics: false,
          billing: [],
          apps: ["web"],
          features: [],
        }),
      ),
    );
    const root = mkdtempSync(join(tmpdir(), "ghostinit-storage-node-loaders-"));
    try {
      writeFileSync(join(root, "value.ts"), "export const value: number = 42;\n");
      writeFileSync(
        join(root, "entry.ts"),
        'import { value } from "./value.js"; console.log(value);\n',
      );
      for (const [index, loaderPath] of [
        "scripts/typescript-worker-loader.mjs",
        "scripts/typescript-runtime-loader.mjs",
      ].entries()) {
        const loader = files.get(loaderPath);
        if (!loader) throw new Error(`Missing generated loader: ${loaderPath}`);
        const localLoader = join(root, `loader-${index}.mjs`);
        writeFileSync(localLoader, loader);
        const launched = spawnSync(
          "node",
          [
            "--import",
            pathToFileURL(localLoader).href,
            "--experimental-strip-types",
            join(root, "entry.ts"),
          ],
          { encoding: "utf8", cwd: root },
        );
        expect(launched.status, `${loaderPath}: ${launched.stderr}`).toBe(0);
        expect(launched.stdout.trim()).toBe("42");
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
