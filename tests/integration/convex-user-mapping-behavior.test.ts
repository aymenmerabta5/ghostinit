// @allow-long 320: executable generated-code fixture keeps its isolated in-memory Convex adapter inline
import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { projectConfigSchema } from "../../src/lib/config.js";
import { FsTransaction } from "../../src/lib/fs.js";
import { generateProjectFiles } from "../../src/templates/default.js";

async function runMappingTest(root: string): Promise<void> {
  const child = Bun.spawn([process.execPath, "test", "mapping.test.ts", "--timeout", "10000"], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
    windowsHide: true,
  });
  const stdoutPromise = new Response(child.stdout).text();
  const stderrPromise = new Response(child.stderr).text();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const result = await Promise.race([
    child.exited,
    new Promise<"timeout">((resolveTimeout) => {
      timer = setTimeout(() => resolveTimeout("timeout"), 15_000);
    }),
  ]);
  if (timer !== undefined) clearTimeout(timer);
  if (result === "timeout") {
    child.kill();
    await child.exited;
    throw new Error("Timed out running generated Convex user mapping behavior test");
  }
  const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise]);
  if (result !== 0) {
    throw new Error(`Generated mapping test failed (${result})\n${stdout}\n${stderr}`);
  }
}

function verifyTempRoot(root: string): void {
  const absoluteRoot = resolve(root);
  const relativeToTemp = relative(resolve(tmpdir()), absoluteRoot);
  if (
    relativeToTemp === "" ||
    relativeToTemp.startsWith("..") ||
    isAbsolute(relativeToTemp) ||
    !basename(absoluteRoot).startsWith("ghostinit-convex-user-mapping-")
  ) {
    throw new Error(`Refusing to remove unverified temp root: ${absoluteRoot}`);
  }
}

const generatedApiRuntime = `export const components = { betterAuth: {} };
export const internal = { auth: {} };
export const api = {};
`;

const generatedServerRuntime = `export function query(definition) { return definition; }
export function internalMutation(definition) { return definition; }
`;

const generatedDataModelRuntime = `export const DataModel = {};
`;

const mappingBehaviorTest = `import { expect, mock, test } from "bun:test";

interface AuthUser {
  _id: string;
  _creationTime: number;
  name: string;
  email: string;
  emailVerified: boolean;
  image?: string | null;
  createdAt: number;
  updatedAt: number;
  twoFactorEnabled?: boolean | null;
}

interface MappingContext {
  db: MemoryDb;
}

interface UserTriggers {
  onCreate: (ctx: MappingContext, doc: AuthUser) => Promise<void>;
  onUpdate: (ctx: MappingContext, newDoc: AuthUser, oldDoc: AuthUser) => Promise<void>;
  onDelete: (ctx: MappingContext, doc: AuthUser) => Promise<void>;
}

interface ClientConfig {
  triggers?: { user?: UserTriggers };
}

interface IndexBuilder {
  eq: (field: string, value: unknown) => IndexBuilder;
}

class MemoryDb {
  readonly rows = new Map<string, Record<string, unknown>>();
  #nextId = 1;

  query(table: string) {
    if (table !== "users") throw new Error("Unexpected table " + table);
    return {
      withIndex: (index: string, configure: (query: IndexBuilder) => IndexBuilder) => {
        if (index !== "by_authId") throw new Error("Unexpected index " + index);
        let authId: unknown;
        const builder: IndexBuilder = {
          eq: (field, value) => {
            if (field !== "authId") throw new Error("Unexpected indexed field " + field);
            authId = value;
            return builder;
          },
        };
        configure(builder);
        return {
          unique: async () =>
            [...this.rows.values()].find((row) => row.authId === authId) ?? null,
        };
      },
      order: () => ({ paginate: async () => ({ page: [], isDone: true, continueCursor: "" }) }),
    };
  }

  async insert(table: string, value: Record<string, unknown>): Promise<string> {
    if (table !== "users") throw new Error("Unexpected table " + table);
    const id = "users:" + this.#nextId++;
    this.rows.set(id, { _id: id, _creationTime: Date.now(), ...value });
    return id;
  }

  async patch(id: string, value: Record<string, unknown>): Promise<void> {
    const row = this.rows.get(id);
    if (!row) throw new Error("Missing row " + id);
    for (const [key, nextValue] of Object.entries(value)) {
      if (nextValue === undefined) delete row[key];
      else row[key] = nextValue;
    }
  }

  async delete(id: string): Promise<void> {
    this.rows.delete(id);
  }

  async get(id: string): Promise<Record<string, unknown> | null> {
    return this.rows.get(id) ?? null;
  }
}

let currentAuthUser: AuthUser | null = null;
let capturedTriggers: UserTriggers | undefined;

mock.module("@convex-dev/better-auth", () => ({
  createClient: (_component: unknown, config?: ClientConfig) => {
    capturedTriggers = config?.triggers?.user;
    return {
      adapter: () => ({}),
      triggersApi: () => ({ onCreate: {}, onUpdate: {}, onDelete: {} }),
      safeGetAuthUser: async () => currentAuthUser,
      getAuthUser: async () => {
        if (!currentAuthUser) throw new Error("Unauthenticated");
        return currentAuthUser;
      },
    };
  },
}));
mock.module("@convex-dev/better-auth/plugins", () => ({
  convex: () => ({}),
  crossDomain: () => ({}),
}));
mock.module("@convex-dev/better-auth/auth-config", () => ({
  getAuthConfigProvider: () => ({}),
}));
mock.module("better-auth/minimal", () => ({ betterAuth: () => ({}) }));
mock.module("better-auth/plugins/admin", () => ({ admin: () => ({}) }));
mock.module("convex/server", () => ({ paginationOptsValidator: {} }));
mock.module("convex/values", () => ({
  ConvexError: class ConvexError extends Error {},
  v: new Proxy({}, { get: () => () => ({}) }),
}));

function requireTriggers(): UserTriggers {
  if (!capturedTriggers) throw new Error("Generated auth did not register user triggers");
  return capturedTriggers;
}

function requireRow(db: MemoryDb): Record<string, unknown> {
  const row = [...db.rows.values()][0];
  if (!row) throw new Error("Expected a mapped local user");
  return row;
}

async function callQueryHandler(
  registeredQuery: unknown,
  ctx: MappingContext,
): Promise<unknown> {
  if (typeof registeredQuery !== "object" || registeredQuery === null) {
    throw new Error("Expected a registered query object");
  }
  const handler = Reflect.get(registeredQuery, "handler");
  if (typeof handler !== "function") throw new Error("Registered query has no handler");
  return await handler(ctx, {});
}

process.env.SITE_URL = "http://localhost:3000";
process.env.CONVEX_SITE_URL = "https://example.convex.site";
process.env.BETTER_AUTH_SECRET = "0123456789abcdef0123456789abcdef";

await import("./convex/auth.ts");
const users = await import("./convex/users.ts");

test("auth triggers map identity fields while local authorization stays app-owned", async () => {
  const db = new MemoryDb();
  const ctx = { db };
  const original: AuthUser = {
    _id: "auth-user-1",
    _creationTime: 10,
    name: "Ada",
    email: "ada@example.com",
    emailVerified: false,
    image: null,
    createdAt: 10,
    updatedAt: 10,
    twoFactorEnabled: null,
  };
  currentAuthUser = original;
  const triggers = requireTriggers();
  await triggers.onCreate(ctx, original);
  const created = requireRow(db);
  expect(created.authId).toBe(original._id);
  expect(created.role).toBe("user");
  expect(created.emailVerified).toBe(false);

  const localId = String(created._id);
  await db.patch(localId, {
    role: "admin",
    banned: true,
    banReason: "manual review",
    banExpires: 123,
  });
  const updated: AuthUser = {
    ...original,
    name: "Ada Lovelace",
    email: "ada.lovelace@example.com",
    emailVerified: true,
    image: "https://example.com/ada.png",
    twoFactorEnabled: true,
    updatedAt: 20,
  };
  currentAuthUser = updated;
  await triggers.onUpdate(ctx, updated, original);
  const synchronized = requireRow(db);
  expect(synchronized.name).toBe(updated.name);
  expect(synchronized.email).toBe(updated.email);
  expect(synchronized.emailVerified).toBe(true);
  expect(synchronized.twoFactorEnabled).toBe(true);
  expect(synchronized.role).toBe("admin");
  expect(synchronized.banned).toBe(true);
  expect(synchronized.banReason).toBe("manual review");
  expect(synchronized.banExpires).toBe(123);

  const me = await callQueryHandler(users.me, ctx);
  expect(me).toEqual(synchronized);

  await triggers.onDelete(ctx, updated);
  expect(db.rows.size).toBe(0);
});
`;

describe("generated Convex app-owned user mapping", () => {
  test("create, update, lookup, and delete preserve local role authority", async () => {
    const root = mkdtempSync(join(tmpdir(), "ghostinit-convex-user-mapping-"));
    try {
      const files = generateProjectFiles(
        projectConfigSchema.parse({
          name: "convex-user-mapping",
          runtime: "bun",
          version: "0.1.0",
          mode: "single",
          preset: "saas",
          billing: [],
          features: [],
          database: "convex",
          framework: "tanstack-start",
          apps: ["web"],
        }),
      );
      const transaction = new FsTransaction(root);
      for (const path of ["convex/auth.ts", "convex/users.ts", "convex/auth.config.ts"]) {
        const content = files.find((file) => file.path === path)?.content ?? "";
        expect(content, path).not.toBe("");
        await transaction.write(path, content);
      }
      await transaction.write("convex/_generated/api.ts", generatedApiRuntime);
      await transaction.write("convex/_generated/server.ts", generatedServerRuntime);
      await transaction.write("convex/_generated/dataModel.ts", generatedDataModelRuntime);
      await transaction.write("mapping.test.ts", mappingBehaviorTest);
      expect(transaction.getStagedFiles().map(({ path }) => path)).toContain("mapping.test.ts");
      await transaction.commit();
      await runMappingTest(root);
    } finally {
      verifyTempRoot(root);
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);
});
