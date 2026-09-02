import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { storageApiFiles } from "../../src/templates/api/storage/index.js";
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

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map(async (path) => await rm(path, { recursive: true, force: true })),
  );
});

async function loadGeneratedActions(): Promise<Record<string, unknown>> {
  const files = storageApiFiles("single");
  const context = files.find((entry) => entry.path.endsWith("/storage/context.ts"))?.content;
  const actions = files.find((entry) => entry.path.endsWith("/storage/actions.ts"))?.content;
  if (!context || !actions) throw new Error("Generated standalone storage API is incomplete");

  const contextRuntime = context
    .replace('import { StorageServiceError } from "@/server/services/storage";\n', "")
    .replace(
      'import type { OwnedStorageService, StorageActor } from "@/server/services/storage";\n',
      "",
    );
  const actionsRuntime = actions
    .replace('import { ORPCError } from "@orpc/server";\n', "")
    .replace('import { createServiceORPCError } from "../utils/service-error";\n', "")
    .replace('import type { OwnedStoredObject } from "@/server/services/storage";\n', "")
    .replace(
      `import {
  requireStorageActor,
  type ResolveStorageService,
  type StorageTransportContext,
} from "./context";
`,
      "",
    );
  const source = `
interface StorageActor { id: string; banned: boolean }
interface OwnedStoredObject {
  id: string;
  ownerId: string;
  mimeType: string;
  byteSize: number;
  originalName: string;
  createdAt: Date;
}
interface OwnedStorageService {
  upload(
    actor: StorageActor,
    input: { data: Uint8Array; mimeType: string; originalName: string },
  ): Promise<OwnedStoredObject>;
  download(actor: StorageActor, id: string): Promise<{ object: OwnedStoredObject; data: Uint8Array }>;
  remove(actor: StorageActor, id: string): Promise<{ ok: true }>;
}
class StorageServiceError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}
class ORPCError extends Error {
  constructor(readonly code: string, options: { message: string }) {
    super(options.message);
  }
}
function createServiceORPCError(error: unknown): never { throw error; }
${contextRuntime}
${actionsRuntime}
`;
  if (/^import\s/m.test(source)) throw new Error("The generated test module still has imports");

  const root = await mkdtemp(join(tmpdir(), "ghostinit-storage-admission-"));
  temporaryRoots.push(root);
  const path = join(root, "actions.ts");
  await writeFile(path, source);
  return (await import(`${pathToFileURL(path).href}?run=${crypto.randomUUID()}`)) as Record<
    string,
    unknown
  >;
}

function generatedStorageRoutes() {
  return [
    ["monorepo Next RPC", orpcFileContent("next")],
    ["monorepo Next OpenAPI", nextOpenApiOperationsRouteContent()],
    ["monorepo TanStack RPC", tanstackRpcServerHandlerContent()],
    ["monorepo TanStack OpenAPI", tanstackOpenApiOperationsServerContent()],
    ["single Next RPC", singleOrpcRouteContent()],
    ["single Next OpenAPI", singleOpenApiOperationsRouteContent()],
    ["single TanStack RPC", singleRpcServerHandlerTanstackContent()],
    ["single TanStack OpenAPI", tanstackOpenApiOperationsServerContent("@/server/api")],
  ] as const;
}

async function loadGeneratedRouteAdmission(
  source: string,
  name: string,
): Promise<(request: Request) => boolean> {
  const start = source.indexOf("const MAX_CONCURRENT_STORAGE_UPLOADS");
  const handlerName = source.includes("const rpcHandler") ? "rpcHandler" : "openApiHandler";
  const end = source.indexOf(`const ${handlerName}`, start);
  if (start < 0 || end < 0) throw new Error(`Generated ${name} storage admission is incomplete`);

  const root = await mkdtemp(join(tmpdir(), "ghostinit-storage-route-admission-"));
  temporaryRoots.push(root);
  const path = join(root, "admission.ts");
  await writeFile(path, `${source.slice(start, end)}\nexport { isStorageUploadRequest };\n`);
  const module = (await import(`${pathToFileURL(path).href}?run=${crypto.randomUUID()}`)) as Record<
    string,
    unknown
  >;
  return module.isStorageUploadRequest as (request: Request) => boolean;
}

interface TestActor {
  id: string;
  banned: boolean;
}

type UploadAction = (input: {
  context: { storageActor?: TestActor | null };
  input: { file: File };
}) => Promise<unknown>;

function testFile(name: string, onRead: () => void): File {
  const file = new File([name], name, { type: "text/plain" });
  Object.defineProperty(file, "arrayBuffer", {
    configurable: true,
    value: async () => {
      onRead();
      return new TextEncoder().encode(name).buffer;
    },
  });
  return file;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((accept, decline) => {
    resolve = accept;
    reject = decline;
  });
  return { promise, reject, resolve };
}

async function waitUntil(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("Timed out waiting for the generated upload action");
}

describe("standalone storage upload admission", () => {
  test("preflights authentication and admission before decoding storage upload bodies", () => {
    for (const [name, source] of generatedStorageRoutes()) {
      const handlerName = source.includes("const rpcHandler") ? "rpcHandler" : "openApiHandler";
      const contextIndex = source.indexOf("const context = await createContext(request.headers)");
      const guardIndex = source.indexOf(
        "isUnauthenticatedStorageUpload(request, context)",
        contextIndex,
      );
      const admissionIndex = source.indexOf(
        "acquireStorageUploadAdmission(storageUploadActor)",
        guardIndex,
      );
      const rateLimitIndex = source.indexOf("status: 429", admissionIndex);
      const tryIndex = source.indexOf("try {", rateLimitIndex);
      const decodeIndex = source.indexOf(`${handlerName}.handle(request`, contextIndex);
      const finallyIndex = source.indexOf("finally", decodeIndex);
      const releaseIndex = source.indexOf("releaseStorageUploadAdmission?.()", finallyIndex);
      expect(contextIndex, `${name} must authenticate request headers`).toBeGreaterThanOrEqual(0);
      expect(guardIndex, `${name} must guard the upload route`).toBeGreaterThan(contextIndex);
      expect(admissionIndex, `${name} must admit after authentication`).toBeGreaterThan(guardIndex);
      expect(rateLimitIndex, `${name} must reject exhausted admission`).toBeGreaterThan(
        admissionIndex,
      );
      expect(tryIndex, `${name} must guard handler execution with finally`).toBeGreaterThan(
        rateLimitIndex,
      );
      expect(decodeIndex, `${name} must admit before oRPC body decoding`).toBeGreaterThan(tryIndex);
      expect(finallyIndex, `${name} must release after handler execution`).toBeGreaterThan(
        decodeIndex,
      );
      expect(releaseIndex, `${name} must release route admission`).toBeGreaterThan(finallyIndex);
      expect(source).toContain("MAX_CONCURRENT_STORAGE_UPLOADS = 2");
      expect(source).toContain("activeStorageUploadActors.has(actorId)");
      expect(source).toMatch(/!\(["']storageActor["'] in context\)/);
      expect(source).toContain("decodeURIComponent(new URL(request.url).pathname)");
      expect(source).toContain("pathname.replace(/[/]+$/,");
      for (const path of [
        "/api/storage/upload",
        "/api/rpc/storage/upload",
        "/api/storage/objects",
        "/api/storage/objects/base64",
        "/api/rpc/storage/uploadBase64",
      ]) {
        expect(source, `${name} must protect ${path}`).toContain(path);
      }
    }
  });

  test("normalizes encoded and trailing-slash upload paths before matching", async () => {
    const protectedPaths = [
      "/api/storage/upload/",
      "/api/storage/%75pload",
      "/api/storage/%75%70%6c%6f%61%64///",
      "/api/rpc/storage/%75pload/",
      "/api/storage/%6fbjects/",
      "/api%2fstorage%2fobjects",
      "/api/storage/objects/%62ase64/",
      "/api/rpc/storage/%75ploadBase64/",
    ];

    for (const [name, source] of generatedStorageRoutes()) {
      const isStorageUploadRequest = await loadGeneratedRouteAdmission(source, name);
      for (const path of protectedPaths) {
        expect(
          isStorageUploadRequest(
            new Request(`https://app.example.test${path}`, { method: "POST" }),
          ),
          `${name} must normalize ${path}`,
        ).toBe(true);
      }
      expect(
        isStorageUploadRequest(
          new Request("https://app.example.test/api/storage/upload", { method: "GET" }),
        ),
      ).toBe(false);
      expect(
        isStorageUploadRequest(
          new Request("https://app.example.test/api/storage/uploaded", { method: "POST" }),
        ),
      ).toBe(false);
      expect(
        isStorageUploadRequest(
          new Request("https://app.example.test/api/storage/%ZZ", { method: "POST" }),
        ),
        `${name} must safely reject malformed encoding`,
      ).toBe(false);
    }
  });

  test("authenticates the actor before reading the uploaded file", async () => {
    const module = await loadGeneratedActions();
    const createStorageActions = module.createStorageActions as (
      resolveService: () => Promise<never>,
    ) => { upload: UploadAction };
    const upload = createStorageActions(async () => {
      throw new Error("The service must not resolve for an unauthenticated upload");
    }).upload;

    for (const storageActor of [null, { id: "", banned: false }] as const) {
      let reads = 0;
      await expect(
        upload({
          context: { storageActor },
          input: { file: testFile("unauthenticated.txt", () => (reads += 1)) },
        }),
      ).rejects.toMatchObject({ code: "STORAGE_UNAUTHENTICATED" });
      expect(reads).toBe(0);
    }
  });

  test("bounds global and per-actor uploads and releases admission after failure", async () => {
    const module = await loadGeneratedActions();
    const pending = new Map<string, ReturnType<typeof deferred<OwnedStoredObjectResult>>>();
    const service = {
      async upload(_actor: TestActor, input: { originalName: string }) {
        const operation = deferred<OwnedStoredObjectResult>();
        pending.set(input.originalName, operation);
        return await operation.promise;
      },
      async download(): Promise<never> {
        throw new Error("not used");
      },
      async remove(): Promise<never> {
        throw new Error("not used");
      },
    };
    const createStorageActions = module.createStorageActions as (
      resolveService: () => Promise<typeof service>,
    ) => { upload: UploadAction };
    const upload = createStorageActions(async () => service).upload;
    const actorA = { id: "actor-a", banned: false };
    const actorB = { id: "actor-b", banned: false };
    const actorC = { id: "actor-c", banned: false };

    const first = upload({
      context: { storageActor: actorA },
      input: { file: testFile("a-1.txt", () => undefined) },
    });
    await waitUntil(() => pending.has("a-1.txt"));

    let sameActorReads = 0;
    await expect(
      upload({
        context: { storageActor: actorA },
        input: {
          file: testFile("a-2-blocked.txt", () => {
            sameActorReads += 1;
            throw new Error("Per-actor admission read a blocked file");
          }),
        },
      }),
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    expect(sameActorReads).toBe(0);

    const second = upload({
      context: { storageActor: actorB },
      input: { file: testFile("b-1.txt", () => undefined) },
    });
    await waitUntil(() => pending.has("b-1.txt"));

    let globalLimitReads = 0;
    await expect(
      upload({
        context: { storageActor: actorC },
        input: {
          file: testFile("c-1-blocked.txt", () => {
            globalLimitReads += 1;
            throw new Error("Global admission read a blocked file");
          }),
        },
      }),
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    expect(globalLimitReads).toBe(0);

    const firstFailure = first.then(
      () => new Error("The first upload unexpectedly succeeded"),
      (error: unknown) => error,
    );
    pending.get("a-1.txt")?.reject(new Error("simulated storage failure"));
    await expect(firstFailure).resolves.toThrow("simulated storage failure");

    let retryReads = 0;
    const retry = upload({
      context: { storageActor: actorA },
      input: { file: testFile("a-2.txt", () => (retryReads += 1)) },
    });
    await waitUntil(() => pending.has("a-2.txt"));
    expect(retryReads).toBe(1);

    pending.get("b-1.txt")?.resolve(storedObject("b-1.txt"));
    pending.get("a-2.txt")?.resolve(storedObject("a-2.txt"));
    await expect(second).resolves.toMatchObject({ originalName: "b-1.txt" });
    await expect(retry).resolves.toMatchObject({ originalName: "a-2.txt" });
  });
});

interface OwnedStoredObjectResult {
  id: string;
  ownerId: string;
  mimeType: string;
  byteSize: number;
  originalName: string;
  createdAt: Date;
}

function storedObject(originalName: string): OwnedStoredObjectResult {
  return {
    id: crypto.randomUUID(),
    ownerId: "owner",
    mimeType: "text/plain",
    byteSize: 1,
    originalName,
    createdAt: new Date(),
  };
}
