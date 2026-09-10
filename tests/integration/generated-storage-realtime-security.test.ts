import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rename, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";
import { messagingFilesFor } from "../../src/templates/apps/fragments/messaging/index.js";
import { messagingAttachmentRouteFiles } from "../../src/templates/apps/fragments/messaging/attachments.js";
import { realtimePackage } from "../../src/templates/realtime.js";
import { storagePackage } from "../../src/templates/storage.js";

const temporaryRoots: string[] = [];
const temporaryModuleCleanups: Array<() => void | Promise<void>> = [];

afterEach(async () => {
  for (const cleanup of temporaryModuleCleanups.splice(0).reverse()) await cleanup();
  await Promise.all(
    temporaryRoots.splice(0).map(async (path) => await rm(path, { recursive: true, force: true })),
  );
});

async function temporaryModule(
  source: string,
  name: string,
  companions: Readonly<Record<string, string>> = {},
): Promise<Record<string, unknown>> {
  const root = await mkdtemp(join(tmpdir(), "ghostinit-security-"));
  temporaryRoots.push(root);
  const path = join(root, `${name}.ts`);
  await writeFile(path, source);
  await Promise.all(
    Object.entries(companions).map(async ([relativePath, content]) => {
      const companionPath = join(root, relativePath);
      await mkdir(join(companionPath, ".."), { recursive: true });
      await writeFile(companionPath, content);
    }),
  );
  const loaded = (await import(`${pathToFileURL(path).href}?run=${crypto.randomUUID()}`)) as Record<
    string,
    unknown
  >;
  const cleanup = Reflect.get(loaded, "clearAll");
  if (typeof cleanup === "function") {
    temporaryModuleCleanups.push(() => Reflect.apply(cleanup, loaded, []));
  }
  return loaded;
}

describe("generated storage and realtime behavior", () => {
  test("authorizes uploads before reading and cancels chunked bodies at the bounded limit", async () => {
    const serverHandler = messagingAttachmentRouteFiles("tanstack", "single").find((entry) =>
      entry.path.endsWith("server/http/messaging/attachments-upload.server.ts"),
    )?.content;
    if (!serverHandler) throw new Error("single TanStack attachment server handler missing");
    const runtimeStart = serverHandler.indexOf(
      "const MAX_ATTACHMENT_BYTES = DEFAULT_STORAGE_QUOTA.maxObjectBytes;",
    );
    if (runtimeStart < 0) throw new Error("attachment runtime marker missing");
    const runtime = serverHandler.slice(runtimeStart);
    const source = `
import { randomUUID } from "node:crypto";
const DEFAULT_STORAGE_QUOTA = { maxObjectBytes: 10 * 1024 * 1024 };
function and(...values: unknown[]): unknown[] { return values; }
function eq(left: unknown, right: unknown): unknown[] { return [left, right]; }
let participantAllowed = false;
export function setParticipantAllowed(value: boolean): void { participantAllowed = value; }
const auth = {
  api: {
    getSession: async () => ({
      session: { id: "session-1" },
      user: { id: "user-1", banned: false },
    }),
  },
};
async function sessionUser(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user || session.user.banned === true) return null;
  return session.user;
}
const conversationParticipants = { conversationId: "conversationId", userId: "userId" };
const messageAttachments = new Proxy({}, { get: (_target, property) => String(property) });
const query = {
  from() { return query; },
  innerJoin() { return query; },
  where() { return query; },
  async limit() { return participantAllowed ? [{ conversationId: "conversation-1" }] : []; },
};
const db = {
  select() { return query; },
  async transaction() { throw new Error("transaction should not run in this test"); },
};
function isAllowedMime(): boolean { return true; }
async function putFile(): Promise<never> { throw new Error("putFile should not run in this test"); }
async function getFile(): Promise<null> { return null; }
async function authorizeMessageAttachmentUpload(): Promise<boolean> { return participantAllowed; }
async function storeMessageAttachment(): Promise<never> { throw new Error("store should not run in this test"); }
function messageAttachmentStorageErrorCode(): undefined { return undefined; }
${runtime}`;
    const module = await temporaryModule(source, "bounded-upload");
    const uploadAttachment = module.uploadAttachment as (request: Request) => Promise<Response>;
    const setParticipantAllowed = module.setParticipantAllowed as (value: boolean) => void;

    let unauthorizedPulls = 0;
    const unauthorizedBody = new ReadableStream<Uint8Array>({
      pull(controller) {
        unauthorizedPulls += 1;
        controller.enqueue(new Uint8Array(1024));
      },
    });
    const unauthorized = new Request("https://app.example.test/api/messaging/attachments", {
      method: "POST",
      headers: {
        "Content-Type": "multipart/form-data; boundary=test",
        "X-Ghostinit-Conversation-Id": "conversation-1",
      },
      body: unauthorizedBody,
      duplex: "half",
    } as RequestInit & { duplex: "half" });
    expect((await uploadAttachment(unauthorized)).status).toBe(403);
    // Web streams may perform one eager pull to their internal queue, but the
    // route must not acquire/consume a reader before authorization succeeds.
    expect(unauthorizedPulls).toBeLessThanOrEqual(1);
    expect(unauthorized.body?.locked).toBe(false);
    await unauthorized.body?.cancel();

    setParticipantAllowed(true);
    let pulls = 0;
    let cancelled = false;
    const oversizedBody = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        controller.enqueue(new Uint8Array(1024 * 1024));
      },
      cancel() {
        cancelled = true;
      },
    });
    const oversized = new Request("https://app.example.test/api/messaging/attachments", {
      method: "POST",
      headers: {
        "Content-Type": "multipart/form-data; boundary=test",
        "X-Ghostinit-Conversation-Id": "conversation-1",
      },
      body: oversizedBody,
      duplex: "half",
    } as RequestInit & { duplex: "half" });
    expect((await uploadAttachment(oversized)).status).toBe(413);
    expect(cancelled).toBe(true);
    expect(pulls).toBeLessThanOrEqual(12);
  });

  test("rejects traversal, encoded traversal, absolute keys, and symlink objects", async () => {
    const root = await mkdtemp(join(tmpdir(), "ghostinit-uploads-"));
    temporaryRoots.push(root);
    const uploads = join(root, "uploads");
    const implementation = storagePackage("single").find(
      (file) => file.path === "src/server/storage/index.ts",
    )?.content;
    if (!implementation) throw new Error("single storage implementation missing");
    const source = implementation.replace(
      'import { env } from "@/lib/env/server";',
      `const env = ${JSON.stringify({
        STORAGE_DRIVER: "local",
        STORAGE_BUCKET: "REPLACE_WITH_STORAGE_BUCKET",
        S3_REGION: "us-east-1",
        S3_ACCESS_KEY_ID: undefined,
        S3_SECRET_ACCESS_KEY: undefined,
        S3_ENDPOINT: "",
        UPLOADS_DIR: uploads,
      }).replace('"uploads"', JSON.stringify(uploads))};`,
    );
    const module = await temporaryModule(source, "storage");
    const assertSafeStorageKey = module.assertSafeStorageKey as (key: string) => string;
    const putFile = module.putFile as (
      data: Uint8Array,
      name: string,
      mime: string,
    ) => Promise<{ storageKey: string }>;
    const getFile = module.getFile as (key: string) => Promise<Uint8Array | null>;

    for (const unsafe of [
      "../outside",
      "..\\outside",
      "%2e%2e%2foutside",
      "%252e%252e%255coutside",
      "C:\\outside",
      "/outside",
      "file.txt",
    ]) {
      expect(() => assertSafeStorageKey(unsafe)).toThrow();
    }

    const stored = await putFile(new TextEncoder().encode("safe"), "../note.txt", "text/plain");
    expect(assertSafeStorageKey(stored.storageKey)).toBe(stored.storageKey);
    expect(new TextDecoder().decode(await getFile(stored.storageKey))).toBe("safe");

    const outside = join(root, "outside.txt");
    await writeFile(outside, "secret");
    const symlinkKey = "00000000-0000-4000-8000-000000000000";
    await mkdir(uploads, { recursive: true });
    let symlinkCreated = true;
    try {
      await symlink(outside, join(uploads, symlinkKey), "file");
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "EPERM")
        symlinkCreated = false;
      else throw error;
    }
    if (symlinkCreated) await expect(getFile(symlinkKey)).rejects.toThrow(/regular file/);
  });

  test("anchors monorepo local blobs to one generated root across web and cleanup cwd", async () => {
    const root = await mkdtemp(join(tmpdir(), "ghostinit-storage-root-"));
    temporaryRoots.push(root);
    const webRoot = join(root, "apps", "web");
    const storagePath = join(root, "packages", "storage", "src", "index.ts");
    await mkdir(join(root, "packages", "storage", "src"), { recursive: true });
    await mkdir(webRoot, { recursive: true });
    await writeFile(join(root, "ghostinit.config.json"), "{}\n");

    const implementation = storagePackage("monorepo").find(
      (file) => file.path === "packages/storage/src/index.ts",
    )?.content;
    if (!implementation) throw new Error("monorepo storage implementation missing");
    await writeFile(
      storagePath,
      implementation.replace(
        'import { env } from "@repo/config/server";',
        `const env = ${JSON.stringify({
          STORAGE_DRIVER: "local",
          STORAGE_BUCKET: "REPLACE_WITH_STORAGE_BUCKET",
          S3_REGION: "us-east-1",
          S3_ACCESS_KEY_ID: undefined,
          S3_SECRET_ACCESS_KEY: undefined,
          S3_ENDPOINT: "",
          UPLOADS_DIR: "./data/uploads",
        })};`,
      ),
    );
    const runner = join(root, "storage-runtime.ts");
    await writeFile(
      runner,
      `import { deleteFile, putFile } from "./packages/storage/src/index.ts";
const operation = process.argv[2];
if (operation === "put") {
  const stored = await putFile(new TextEncoder().encode("shared-root"), "shared.txt", "text/plain");
  process.stdout.write(stored.storageKey);
} else if (operation === "delete" && process.argv[3]) {
  await deleteFile(process.argv[3]);
} else {
  throw new Error("invalid storage runtime operation");
}
`,
    );

    async function run(cwd: string, args: string[]): Promise<string> {
      const child = Bun.spawn([process.execPath, runner, ...args], {
        cwd,
        stdout: "pipe",
        stderr: "pipe",
        windowsHide: true,
      });
      const [exitCode, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);
      expect(exitCode, stderr).toBe(0);
      return stdout;
    }

    const storageKey = await run(webRoot, ["put"]);
    const rootObject = join(root, "data", "uploads", storageKey);
    expect(await readFile(rootObject, "utf8")).toBe("shared-root");
    await expect(readFile(join(webRoot, "data", "uploads", storageKey))).rejects.toMatchObject({
      code: "ENOENT",
    });

    await run(root, ["delete", storageKey]);
    await expect(readFile(rootObject)).rejects.toMatchObject({ code: "ENOENT" });
  });

  test("scopes local uploads beneath the stable project root without resolving configured input", async () => {
    const implementation = storagePackage("single").find(
      (file) => file.path === "src/server/storage/index.ts",
    )?.content;
    if (!implementation) throw new Error("single storage implementation missing");

    expect(implementation).toContain("const LOCAL_DATA_ROOT =");
    expect(implementation).toContain("Relative UPLOADS_DIR must be a descendant of ./data");
    expect(implementation).toContain("function hasUnsupportedPathControl(value: string): boolean");
    expect(implementation).not.toContain("/[\\u0000-\\u001f\\u007f]/u");
    expect(implementation).not.toContain("resolve(configured)");
    expect(implementation).not.toMatch(/\bresolve\s*\(/);

    const settingName = `__ghostinitUploadsRoot_${crypto.randomUUID().replaceAll("-", "")}`;
    const source = implementation
      .replace(
        'import { env } from "@/lib/env/server";',
        `const env = {
  STORAGE_DRIVER: "local",
  STORAGE_BUCKET: "REPLACE_WITH_STORAGE_BUCKET",
  S3_REGION: "us-east-1",
  S3_ACCESS_KEY_ID: undefined,
  S3_SECRET_ACCESS_KEY: undefined,
  S3_ENDPOINT: "",
  get UPLOADS_DIR(): string {
    return String((globalThis as Record<string, unknown>)[${JSON.stringify(settingName)}]);
  },
};`,
      )
      .replace(
        "function configuredUploadsRoot(): ConfiguredUploadsRoot {",
        "export function configuredUploadsRoot(): ConfiguredUploadsRoot {",
      );
    const module = await temporaryModule(source, "storage-root-policy");
    const configuredUploadsRoot = module.configuredUploadsRoot as () => {
      path: string;
      scopedToData: boolean;
    };
    const setRoot = (value: string): { path: string; scopedToData: boolean } => {
      (globalThis as Record<string, unknown>)[settingName] = value;
      return configuredUploadsRoot();
    };

    try {
      expect(setRoot("./data/uploads")).toEqual({
        path: join(process.cwd(), "data", "uploads"),
        scopedToData: true,
      });
      expect(setRoot("data\\nested/uploads")).toEqual({
        path: join(process.cwd(), "data", "nested", "uploads"),
        scopedToData: true,
      });

      const nativeAbsolute = await mkdtemp(join(tmpdir(), "ghostinit-absolute-uploads-"));
      temporaryRoots.push(nativeAbsolute);
      expect(setRoot(nativeAbsolute)).toEqual({ path: nativeAbsolute, scopedToData: false });
      expect(setRoot(join(process.cwd(), "data", "absolute-uploads"))).toEqual({
        path: join(process.cwd(), "data", "absolute-uploads"),
        scopedToData: false,
      });

      for (const unsafe of [
        ".",
        "./data",
        "../data/uploads",
        "data/../../public",
        "data\\..\\public",
        "src/uploads",
        "public/uploads",
        "C:uploads",
        "C:..\\uploads",
        "\\uploads",
        "\\\\server\\share\\uploads",
        "//server/share/uploads",
        "\\\\?\\C:\\uploads",
        "file:///tmp/uploads",
        "data/uploads\u0000outside",
        "data/uploads\noutside",
        `data/uploads${String.fromCharCode(0x7f)}outside`,
        process.cwd(),
        join(process.cwd(), "src", "uploads"),
        join(process.cwd(), "public", "uploads"),
      ]) {
        expect(() => setRoot(unsafe), unsafe).toThrow();
      }

      if (process.platform === "win32") {
        expect(() => setRoot("/var/lib/ghostinit/uploads")).toThrow(/drive-less/);
      } else {
        expect(() => setRoot("C:\\ghostinit\\uploads")).toThrow(/foreign/);
      }
    } finally {
      delete (globalThis as Record<string, unknown>)[settingName];
    }
  });

  test("binds local reads to an opened file and never follows a raced symlink", async () => {
    const root = await mkdtemp(join(tmpdir(), "ghostinit-storage-race-"));
    temporaryRoots.push(root);
    const uploads = join(root, "uploads");
    const implementation = storagePackage("single").find(
      (file) => file.path === "src/server/storage/index.ts",
    )?.content;
    if (!implementation) throw new Error("single storage implementation missing");
    const hookName = `__ghostinitStorageRace_${crypto.randomUUID().replaceAll("-", "")}`;
    const source = implementation
      .replace(
        'import { env } from "@/lib/env/server";',
        `const env = ${JSON.stringify({
          STORAGE_DRIVER: "local",
          STORAGE_BUCKET: "REPLACE_WITH_STORAGE_BUCKET",
          S3_REGION: "us-east-1",
          S3_ACCESS_KEY_ID: undefined,
          S3_SECRET_ACCESS_KEY: undefined,
          S3_ENDPOINT: "",
          UPLOADS_DIR: uploads,
        }).replace('"uploads"', JSON.stringify(uploads))};`,
      )
      .replace(
        "    handle = await open(candidate, READ_NO_FOLLOW_FLAGS);",
        `    handle = await open(candidate, READ_NO_FOLLOW_FLAGS);
    const raceHook = (globalThis as Record<string, unknown>)[${JSON.stringify(hookName)}];
    if (typeof raceHook === "function") await raceHook(candidate);`,
      );
    const module = await temporaryModule(source, "storage-race");
    const putFile = module.putFile as (
      data: Uint8Array,
      name: string,
      mime: string,
    ) => Promise<{ storageKey: string }>;
    const getFile = module.getFile as (key: string) => Promise<Uint8Array | null>;
    const stored = await putFile(new TextEncoder().encode("inside"), "inside.txt", "text/plain");
    const candidate = join(uploads, stored.storageKey);
    const moved = `${candidate}.moved`;
    const outside = join(root, "outside.txt");
    await writeFile(outside, "outside-secret");

    const probe = join(root, "symlink-probe");
    try {
      await symlink(outside, probe, "file");
      await unlink(probe);
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "EPERM") return;
      throw error;
    }

    (globalThis as Record<string, unknown>)[hookName] = async (openedPath: string) => {
      delete (globalThis as Record<string, unknown>)[hookName];
      await rename(openedPath, moved);
      await symlink(outside, openedPath, "file");
    };
    try {
      await expect(getFile(stored.storageKey)).rejects.toThrow(/changed|regular contained/);
      expect(await readFile(outside, "utf8")).toBe("outside-secret");
    } finally {
      delete (globalThis as Record<string, unknown>)[hookName];
      await unlink(candidate).catch(() => undefined);
      await unlink(moved).catch(() => undefined);
    }
  });

  test("retries a local deletion left in private trash after an interrupted unlink", async () => {
    const root = await mkdtemp(join(tmpdir(), "ghostinit-storage-delete-"));
    temporaryRoots.push(root);
    const uploads = join(root, "uploads");
    const implementation = storagePackage("single").find(
      (file) => file.path === "src/server/storage/index.ts",
    )?.content;
    if (!implementation) throw new Error("single storage implementation missing");
    const crashName = `__ghostinitStorageDeleteCrash_${crypto.randomUUID().replaceAll("-", "")}`;
    const source = implementation
      .replace(
        'import { env } from "@/lib/env/server";',
        `const env = ${JSON.stringify({
          STORAGE_DRIVER: "local",
          STORAGE_BUCKET: "REPLACE_WITH_STORAGE_BUCKET",
          S3_REGION: "us-east-1",
          S3_ACCESS_KEY_ID: undefined,
          S3_SECRET_ACCESS_KEY: undefined,
          S3_ENDPOINT: "",
          UPLOADS_DIR: uploads,
        }).replace('"uploads"', JSON.stringify(uploads))};`,
      )
      .replace(
        "      opened.candidate = trashPath;",
        `      opened.candidate = trashPath;
      if ((globalThis as Record<string, unknown>)[${JSON.stringify(crashName)}] === true) {
        delete (globalThis as Record<string, unknown>)[${JSON.stringify(crashName)}];
        throw new Error("simulated interrupted unlink");
      }`,
      );
    const module = await temporaryModule(source, "storage-delete");
    const putFile = module.putFile as (
      data: Uint8Array,
      name: string,
      mime: string,
    ) => Promise<{ storageKey: string }>;
    const deleteFile = module.deleteFile as (key: string) => Promise<void>;
    const getFile = module.getFile as (key: string) => Promise<Uint8Array | null>;
    const stored = await putFile(new TextEncoder().encode("delete-me"), "delete.txt", "text/plain");
    const trashPath = join(uploads, `.ghostinit-delete-${stored.storageKey}`);

    (globalThis as Record<string, unknown>)[crashName] = true;
    try {
      await expect(deleteFile(stored.storageKey)).rejects.toThrow(/simulated interrupted unlink/);
      expect(await readFile(trashPath, "utf8")).toBe("delete-me");
      expect(await getFile(stored.storageKey)).toBeNull();

      await deleteFile(stored.storageKey);
      await expect(readFile(trashPath)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      delete (globalThis as Record<string, unknown>)[crashName];
    }
  });

  test("fails closed and wipes handle-bound bytes when the uploads root changes during a write", async () => {
    const root = await mkdtemp(join(tmpdir(), "ghostinit-storage-write-race-"));
    temporaryRoots.push(root);
    const uploads = join(root, "uploads");
    const movedUploads = join(root, "uploads-before-race");
    const outside = join(root, "outside");
    await mkdir(outside);

    const probe = join(root, "directory-symlink-probe");
    try {
      await symlink(outside, probe, process.platform === "win32" ? "junction" : "dir");
      await unlink(probe);
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "EPERM") return;
      throw error;
    }

    const implementation = storagePackage("single").find(
      (file) => file.path === "src/server/storage/index.ts",
    )?.content;
    if (!implementation) throw new Error("single storage implementation missing");
    const hookName = `__ghostinitStorageWriteRace_${crypto.randomUUID().replaceAll("-", "")}`;
    const source = implementation
      .replace(
        'import { env } from "@/lib/env/server";',
        `const env = ${JSON.stringify({
          STORAGE_DRIVER: "local",
          STORAGE_BUCKET: "REPLACE_WITH_STORAGE_BUCKET",
          S3_REGION: "us-east-1",
          S3_ACCESS_KEY_ID: undefined,
          S3_SECRET_ACCESS_KEY: undefined,
          S3_ENDPOINT: "",
          UPLOADS_DIR: uploads,
        }).replace('"uploads"', JSON.stringify(uploads))};`,
      )
      .replace(
        "    await handle.writeFile(data);",
        `    await handle.writeFile(data);
    const writeRaceHook = (globalThis as Record<string, unknown>)[${JSON.stringify(hookName)}];
    if (typeof writeRaceHook === "function") await writeRaceHook(candidate);`,
      );
    const module = await temporaryModule(source, "storage-write-race");
    const putFile = module.putFile as (
      data: Uint8Array,
      name: string,
      mime: string,
    ) => Promise<{ storageKey: string }>;

    let openedPath = "";
    (globalThis as Record<string, unknown>)[hookName] = async (candidate: string) => {
      delete (globalThis as Record<string, unknown>)[hookName];
      openedPath = candidate;
      await rename(uploads, movedUploads);
      await symlink(outside, uploads, process.platform === "win32" ? "junction" : "dir");
    };
    try {
      await expect(
        putFile(new TextEncoder().encode("must-not-escape"), "race.txt", "text/plain"),
      ).rejects.toThrow();
      const key = basename(openedPath);
      expect(key).not.toBe("");
      const residual = await readFile(join(movedUploads, key)).catch((error: unknown) => {
        if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
        throw error;
      });
      expect(residual === null || residual.byteLength === 0).toBe(true);
      await expect(readFile(join(outside, key))).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      delete (globalThis as Record<string, unknown>)[hookName];
    }
  });

  test("normalizes S3 not-found responses, rejects oversized downloads and conditionally creates reserved keys", async () => {
    const implementation = storagePackage("single").find(
      (file) => file.path === "src/server/storage/index.ts",
    )?.content;
    if (!implementation) throw new Error("single storage implementation missing");
    const stateName = `__ghostinitS3_${crypto.randomUUID().replaceAll("-", "")}`;
    const source = implementation
      .replace(
        'import { env } from "@/lib/env/server";',
        `const env = {
          STORAGE_DRIVER: "s3",
          STORAGE_BUCKET: "test-bucket",
          S3_REGION: "us-east-1",
          S3_ACCESS_KEY_ID: undefined,
          S3_SECRET_ACCESS_KEY: undefined,
          S3_ENDPOINT: "",
          UPLOADS_DIR: "./unused",
        };`,
      )
      .replaceAll('import("@aws-sdk/client-s3")', 'import("./fake-s3.ts")');
    const fakeS3 = `class Command { constructor(readonly input: unknown) {} }
export class PutObjectCommand extends Command {}
export class GetObjectCommand extends Command {}
export class DeleteObjectCommand extends Command {}
export class HeadObjectCommand extends Command {}
export class S3Client {
  constructor(readonly config: unknown) {}
  async send(command: { input: unknown }, options?: unknown): Promise<unknown> {
    const state = (globalThis as Record<string, unknown>)[${JSON.stringify(stateName)}] as {
      error?: unknown;
      output?: unknown;
      input?: unknown;
      options?: unknown;
    };
    state.input = command.input;
    state.options = options;
    if (state.error !== undefined) throw state.error;
    return state.output ?? {};
  }
}
`;
    const module = await temporaryModule(source, "storage-s3", { "fake-s3.ts": fakeS3 });
    const getFile = module.getFile as (
      key: string,
      signal?: AbortSignal,
    ) => Promise<Uint8Array | null>;
    const key = "00000000-0000-4000-8000-000000000000";
    const state: { error?: unknown; output?: unknown; input?: unknown; options?: unknown } = {};
    (globalThis as Record<string, unknown>)[stateName] = state;
    try {
      state.error = Object.assign(new Error("missing"), { name: "NoSuchKey" });
      expect(await getFile(key)).toBeNull();

      state.error = Object.assign(new Error("missing"), { $metadata: { httpStatusCode: 404 } });
      expect(await getFile(key)).toBeNull();

      let transformed = false;
      state.error = undefined;
      state.output = {
        ContentLength: 10 * 1024 * 1024 + 1,
        Body: {
          transformToByteArray: async () => {
            transformed = true;
            return new Uint8Array(0);
          },
        },
      };
      await expect(getFile(key)).rejects.toThrow(/10MB limit/);
      const putFile = module.putFile as (
        data: Uint8Array,
        name: string,
        mimeType: string,
        key?: string,
        signal?: AbortSignal,
      ) => Promise<unknown>;
      state.output = {};
      const controller = new AbortController();
      await putFile(
        new TextEncoder().encode("receipt"),
        "receipt.pdf",
        "application/pdf",
        key,
        controller.signal,
      );
      expect(state.options).toEqual({ abortSignal: controller.signal });
      expect(state.input).toMatchObject({
        Key: key,
        IfNoneMatch: "*",
        ServerSideEncryption: "AES256",
      });
      state.error = Object.assign(new Error("already exists"), {
        $metadata: { httpStatusCode: 412 },
      });
      await expect(
        putFile(new TextEncoder().encode("changed"), "receipt.pdf", "application/pdf", key),
      ).rejects.toThrow("already exists");
      expect(transformed).toBe(false);

      state.error = undefined;
      state.output = {
        Body: { transformToByteArray: async () => new Uint8Array(10 * 1024 * 1024 + 1) },
      };
      await expect(getFile(key)).rejects.toThrow(/10MB limit/);
      state.output = { Body: { transformToByteArray: async () => new Uint8Array([1]) } };
      expect(await getFile(key, controller.signal)).toEqual(new Uint8Array([1]));
      expect(state.options).toEqual({ abortSignal: controller.signal });
      const deleteFile = module.deleteFile as (key: string, signal?: AbortSignal) => Promise<void>;
      await deleteFile(key, controller.signal);
      expect(state.options).toEqual({ abortSignal: controller.signal });
      controller.abort(new Error("fixture deadline exceeded"));
      await expect(
        putFile(new Uint8Array([1]), "receipt.pdf", "application/pdf", key, controller.signal),
      ).rejects.toThrow("fixture deadline exceeded");
      await expect(getFile(key, controller.signal)).rejects.toThrow("fixture deadline exceeded");
      await expect(deleteFile(key, controller.signal)).rejects.toThrow("fixture deadline exceeded");
    } finally {
      delete (globalThis as Record<string, unknown>)[stateName];
    }
  });

  test("rejects credentialed and cleartext non-loopback S3 endpoints before constructing a client", async () => {
    const implementation = storagePackage("single").find(
      (file) => file.path === "src/server/storage/index.ts",
    )?.content;
    if (!implementation) throw new Error("single storage implementation missing");
    const key = "00000000-0000-4000-8000-000000000000";

    async function probe(endpoint: string): Promise<unknown> {
      const stateName = `__ghostinitS3Endpoint_${crypto.randomUUID().replaceAll("-", "")}`;
      const source = implementation
        .replace(
          'import { env } from "@/lib/env/server";',
          `const env = ${JSON.stringify({
            STORAGE_DRIVER: "s3",
            STORAGE_BUCKET: "test-bucket",
            S3_REGION: "us-east-1",
            S3_ACCESS_KEY_ID: "test-access-key",
            S3_SECRET_ACCESS_KEY: "test-secret-key",
            S3_ENDPOINT: endpoint,
            UPLOADS_DIR: "./unused",
          })};`,
        )
        .replaceAll('import("@aws-sdk/client-s3")', 'import("./fake-s3.ts")');
      const fakeS3 = `class Command { constructor(readonly input: unknown) {} }
export class PutObjectCommand extends Command {}
export class GetObjectCommand extends Command {}
export class DeleteObjectCommand extends Command {}
export class HeadObjectCommand extends Command {}
export class S3Client {
  constructor(readonly config: unknown) {
    (globalThis as Record<string, unknown>)[${JSON.stringify(stateName)}] = config;
  }
  async send(): Promise<unknown> { return {}; }
}
`;
      const module = await temporaryModule(source, "storage-s3-endpoint", { "fake-s3.ts": fakeS3 });
      const getFile = module.getFile as (storageKey: string) => Promise<Uint8Array | null>;
      try {
        await getFile(key);
        return (globalThis as Record<string, unknown>)[stateName];
      } finally {
        delete (globalThis as Record<string, unknown>)[stateName];
      }
    }

    for (const endpoint of [
      "http://storage.example.test",
      "ftp://storage.example.test",
      "https://user:password@storage.example.test",
      "https://storage.example.test?token=secret",
      " https://storage.example.test",
    ]) {
      await expect(probe(endpoint), endpoint).rejects.toThrow(/S3_ENDPOINT/);
    }

    for (const endpoint of [
      "https://storage.example.test",
      "http://localhost:9000",
      "http://127.0.0.1:9000",
      "http://[::1]:9000",
    ]) {
      const config = (await probe(endpoint)) as {
        endpoint?: string;
        credentials?: { accessKeyId?: string; secretAccessKey?: string };
      };
      expect(new URL(config.endpoint ?? "").origin, endpoint).toBe(new URL(endpoint).origin);
      expect(config.credentials, endpoint).toEqual({
        accessKeyId: "test-access-key",
        secretAccessKey: "test-secret-key",
      });
    }
  });

  test("enforces process-wide and per-user websocket admission caps", async () => {
    const websocketAuth = messagingFilesFor("nextjs", "postgres", ["web"], "single").find(
      (entry) => entry.path === "src/server/transport/websocket-auth.ts",
    )?.content;
    if (!websocketAuth) throw new Error("single Next websocket auth module missing");
    const start = websocketAuth.indexOf("export const MAX_WEBSOCKET_CONNECTIONS");
    const end = websocketAuth.indexOf("export function trustedWebSocketOrigin");
    if (start < 0 || end < 0) throw new Error("websocket admission markers missing");
    const module = await temporaryModule(websocketAuth.slice(start, end), "websocket-admission");
    const acquireWebSocketSlot = module.acquireWebSocketSlot as (userId: string) => number | null;
    const releaseWebSocketSlot = module.releaseWebSocketSlot as (slot: number) => void;

    const userSlots = Array.from({ length: 8 }, () => acquireWebSocketSlot("same-user"));
    expect(userSlots.every((slot) => typeof slot === "number")).toBe(true);
    expect(acquireWebSocketSlot("same-user")).toBeNull();
    releaseWebSocketSlot(userSlots[0] as number);
    expect(typeof acquireWebSocketSlot("same-user")).toBe("number");

    for (const slot of userSlots.slice(1)) releaseWebSocketSlot(slot as number);
    const globalSlots = Array.from({ length: 511 }, (_, index) =>
      acquireWebSocketSlot(`global-user-${index}`),
    );
    expect(globalSlots.every((slot) => typeof slot === "number")).toBe(true);
    expect(acquireWebSocketSlot("over-global-limit")).toBeNull();
  });

  test("streams only currently authorized events and bounds subscriptions per session", async () => {
    const implementation = realtimePackage("single").find(
      (file) => file.path === "src/server/realtime/index.ts",
    )?.content;
    if (!implementation) throw new Error("single realtime implementation missing");
    const source = implementation.replace(
      'import { env } from "@/lib/env/server";',
      `const env = {
        UPSTASH_REDIS_REST_URL: "REPLACE_WITH_UPSTASH_REDIS_REST_URL",
        UPSTASH_REDIS_REST_TOKEN: "REPLACE_WITH_UPSTASH_REDIS_REST_TOKEN",
        BETTER_AUTH_URL: "http://localhost:3000",
      };`,
    );
    const module = await temporaryModule(source, "realtime");
    type RealtimeEvent =
      | {
          type: "message";
          conversationId: string;
          messageId: string;
          userId: string;
          timestamp: number;
        }
      | {
          type: "typing";
          conversationId: string;
          userId: string;
          isTyping: boolean;
          timestamp: number;
        };
    const subscribeAuthorized = module.subscribeAuthorized as (
      userId: string,
      conversationId: string,
      authorize: (conversationId: string, userId: string) => Promise<boolean>,
      handler: (event: RealtimeEvent) => void,
      type?: "message" | "typing" | "presence" | "read",
      subscriptionOwnerId?: string,
      onRevoked?: () => void,
    ) => Promise<() => void>;
    const publish = module.publish as (
      conversationId: string,
      event: RealtimeEvent,
    ) => Promise<void>;
    const authorizeRealtimeConversation = module.authorizeRealtimeConversation as (
      userId: string,
      conversationId: string,
    ) => void;
    const sendTyping = module.sendTyping as (
      conversationId: string,
      userId: string,
      isTyping: boolean,
    ) => Promise<void>;

    const first: RealtimeEvent[] = [];
    const second: RealtimeEvent[] = [];
    let firstAllowed = true;
    let firstRevoked = false;
    let firstAuthorizationChecks = 0;
    let secondAuthorizationChecks = 0;
    const unsubscribeFirst = await subscribeAuthorized(
      "first-user",
      "conversation-a",
      async (id) => {
        firstAuthorizationChecks += 1;
        return firstAllowed && id === "conversation-a";
      },
      (event) => first.push(event),
      undefined,
      "session-first",
      () => {
        firstRevoked = true;
      },
    );
    const unsubscribeSecond = await subscribeAuthorized(
      "second-user",
      "conversation-b",
      async (id) => {
        secondAuthorizationChecks += 1;
        return id === "conversation-b";
      },
      (event) => second.push(event),
      undefined,
      "session-second",
    );
    firstAuthorizationChecks = 0;
    secondAuthorizationChecks = 0;

    await publish("conversation-a", {
      type: "message",
      conversationId: "conversation-a",
      messageId: "message-a",
      userId: "first-user",
      timestamp: Date.now(),
    });
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(0);
    expect(firstAuthorizationChecks).toBe(1);
    expect(secondAuthorizationChecks).toBe(0);

    await expect(sendTyping("conversation-a", "first-user", true)).rejects.toThrow(/access denied/);
    authorizeRealtimeConversation("first-user", "conversation-a");
    await sendTyping("conversation-a", "first-user", true);
    expect(first).toHaveLength(2);
    expect(first.at(-1)).toMatchObject({
      type: "typing",
      conversationId: "conversation-a",
      userId: "first-user",
      isTyping: true,
    });

    firstAllowed = false;
    await publish("conversation-a", {
      type: "message",
      conversationId: "conversation-a",
      messageId: "message-after-removal",
      userId: "first-user",
      timestamp: Date.now(),
    });
    expect(first).toHaveLength(2);
    expect(firstRevoked).toBe(true);
    unsubscribeFirst();
    unsubscribeSecond();

    await expect(
      subscribeAuthorized(
        "denied-user",
        "conversation-a",
        async () => false,
        () => undefined,
      ),
    ).rejects.toThrow(/access denied/);

    const bounded: Array<() => void> = [];
    for (let index = 0; index < 32; index += 1) {
      bounded.push(
        await subscribeAuthorized(
          "bounded-user",
          `conversation-${index}`,
          async () => true,
          () => undefined,
          undefined,
          "bounded-session",
        ),
      );
    }
    await expect(
      subscribeAuthorized(
        "bounded-user",
        "conversation-over-limit",
        async () => true,
        () => undefined,
        undefined,
        "bounded-session",
      ),
    ).rejects.toThrow(/subscription limit/);
    bounded.pop()?.();
    const unsubscribeReplacement = await subscribeAuthorized(
      "bounded-user",
      "conversation-replacement",
      async () => true,
      () => undefined,
      undefined,
      "bounded-session",
    );
    unsubscribeReplacement();
    for (const unsubscribe of bounded) unsubscribe();
  });
});
