// @allow-long 884: executable generated-code fixture keeps its isolated in-memory Convex adapter inline
import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { projectConfigSchema } from "../../src/lib/config.js";
import { FsTransaction } from "../../src/lib/fs.js";
import { generateProjectFiles } from "../../src/templates/default.js";
import { convexMemoryClassesSource } from "../helpers/convex-memory-runtime.js";

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

// Contract stub for Convex codegen surfaces; registration tags below verify the generated definition.
const generatedApiRuntime = `export const components = { betterAuth: {} };
export const internal = { auth: {}, users: { seedFirstAdmin: {} } };
export const api = {
  users: {
    me: {},
    getCurrentUser: {},
    list: {},
    setRoleByAuthId: {},
    setBannedByAuthId: {},
    getById: {},
  },
  posts: { list: {}, get: {}, create: {}, update: {}, remove: {} },
};
`;

const generatedServerRuntime = `function register(definition, kind, visibility) {
  return Object.freeze({ ...definition, __kind: kind, __visibility: visibility });
}
export function query(definition) { return register(definition, "query", "public"); }
export function mutation(definition) { return register(definition, "mutation", "public"); }
export function internalMutation(definition) {
  return register(definition, "mutation", "internal");
}
`;

const generatedDataModelRuntime = `export const DataModel = {};
export const Doc = {};
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
  role?: string;
  banned?: boolean;
}

interface MappingContext {
  db: MemoryDb;
  auth: { getUserIdentity: () => Promise<TokenIdentity | null> };
}

interface UserTriggers {
  onCreate: (ctx: MappingContext, doc: AuthUser) => Promise<void>;
  onUpdate: (ctx: MappingContext, doc: AuthUser) => Promise<void>;
  onDelete: (ctx: MappingContext, doc: AuthUser) => Promise<void>;
}

interface ClientConfig {
  triggers?: { user?: UserTriggers };
}

interface IndexBuilder {
  eq: (field: string, value: unknown) => IndexBuilder;
}

interface IndexFilter {
  field: string;
  value: unknown;
}

interface TokenIdentity {
  subject: string;
  tokenIdentifier: string;
  sessionId: string;
}

const indexFields = new Map<string, readonly string[]>([
  ["users:by_authId", ["authId"]],
  ["users:by_role", ["role"]],
  ["posts:by_userId", ["userId"]],
  ["posts:by_userId_createdAt", ["userId", "createdAt"]],
  ["admin_audit_events:by_targetUserId", ["targetUserId"]],
  ["admin_audit_events:by_targetAuthId", ["targetAuthId"]],
  ["identitySessions:by_auth_session", ["authSessionId"]],
]);

${convexMemoryClassesSource(["users", "posts", "admin_audit_events", "identitySessions"])}

let currentAuthUser: AuthUser | null = null;
let currentTokenIdentity: TokenIdentity | null = null;
let capturedTriggers: UserTriggers | undefined;

function validator(kind: string, args: unknown[]) {
  return { kind, args };
}

const validators = new Proxy(
  {},
  {
    get: (_target, property) => (...args: unknown[]) => validator(String(property), args),
  },
);

function defineTable(fields: Record<string, unknown>) {
  const indexes: Array<{ name: string; fields: string[] }> = [];
  const table = {
    fields,
    indexes,
    index: (name: string, indexedFields: string[]) => {
      indexes.push({ name, fields: indexedFields });
      return table;
    },
  };
  return table;
}

mock.module("@convex-dev/better-auth", () => ({
  createClient: (_component: unknown, config?: ClientConfig) => {
    capturedTriggers = config?.triggers?.user;
    return {
      adapter: () => ({}),
      triggersApi: () => ({ onCreate: {}, onUpdate: {}, onDelete: {} }),
      safeGetAuthUser: async () => {
        if (!currentTokenIdentity || currentAuthUser?._id !== currentTokenIdentity.subject) {
          return null;
        }
        return currentAuthUser;
      },
      getAuthUser: async () => {
        if (!currentTokenIdentity || currentAuthUser?._id !== currentTokenIdentity.subject) {
          throw new Error("Unauthenticated");
        }
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
mock.module("better-auth/plugins/two-factor", () => ({ twoFactor: () => ({}) }));
mock.module("convex/server", () => ({
  defineSchema: (tables: Record<string, unknown>) => tables,
  defineTable,
  paginationOptsValidator: validator("pagination", []),
}));
mock.module("convex/values", () => ({
  ConvexError: class ConvexError extends Error {
    readonly data: { code: string; message: string };

    constructor(data: { code: string; message: string }) {
      super(data.message);
      this.data = data;
    }
  },
  v: validators,
}));

function requireTriggers(): UserTriggers {
  if (!capturedTriggers) throw new Error("Generated auth did not register user triggers");
  return capturedTriggers;
}

function findMappedUser(db: MemoryDb, authId: string): Record<string, unknown> | undefined {
  return db.rows("users").find((candidate) => candidate.authId === authId);
}

function requireMappedUser(db: MemoryDb, authId: string): Record<string, unknown> {
  const row = findMappedUser(db, authId);
  if (!row) throw new Error("Expected mapped local user " + authId);
  return row;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error("Expected string " + label);
  return value;
}

function readProperty(value: unknown, key: string): unknown {
  if ((typeof value !== "object" && typeof value !== "function") || value === null) {
    throw new Error("Expected object while reading " + key);
  }
  return Reflect.get(value, key);
}

async function callFunctionHandler(
  registeredFunction: unknown,
  ctx: MappingContext,
  args: Record<string, unknown> = {},
): Promise<unknown> {
  const handler = readProperty(registeredFunction, "handler");
  if (typeof handler !== "function") throw new Error("Registered function has no handler");
  return await handler(ctx, args);
}

async function expectConvexError(promise: Promise<unknown>, code: string): Promise<void> {
  let caught: unknown;
  try {
    await promise;
  } catch (error) {
    caught = error;
  }
  expect(readProperty(readProperty(caught, "data"), "code")).toBe(code);
}

function makeAuthUser(
  id: string,
  email: string,
  overrides: Partial<AuthUser> = {},
): AuthUser {
  return {
    _id: id,
    _creationTime: 1,
    name: id,
    email,
    emailVerified: true,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

async function authenticate(user: AuthUser | null, db: MemoryDb): Promise<void> {
  currentAuthUser = user;
  currentTokenIdentity = user
    ? {
        subject: user._id,
        tokenIdentifier: "https://issuer.example|" + user._id,
        sessionId: "session:" + user._id,
      }
    : null;
  if (!user) return;
  const mapped = findMappedUser(db, user._id);
  if (!mapped) return;
  const existing = await db
    .query("identitySessions")
    .withIndex("by_auth_session", (query) => query.eq("authSessionId", currentTokenIdentity!.sessionId))
    .unique();
  if (existing) return;
  await db.insert("identitySessions", {
    authSessionId: currentTokenIdentity.sessionId,
    userId: mapped._id,
    authenticatedAt: Date.now(),
    expiresAt: Date.now() + 60_000,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
}

function mappingContext(db: MemoryDb): MappingContext {
  return { db, auth: { getUserIdentity: async () => currentTokenIdentity } };
}

process.env.SITE_URL = "http://localhost:3000";
process.env.CONVEX_SITE_URL = "https://example.convex.site";
process.env.BETTER_AUTH_SECRET = "0123456789abcdef0123456789abcdef";

const schemaModule = await import("./convex/schema.ts");
await import("./convex/auth.ts");
const users = await import("./convex/users.ts");
const posts = await import("./convex/posts.ts");
const generatedApi = await import("./convex/_generated/api.ts");

test("app-owned Convex users enforce authorization, auditing, and local IDs", async () => {
  const triggers = requireTriggers();

  expect(readProperty(users.seedFirstAdmin, "__visibility")).toBe("internal");
  expect(readProperty(users.seedFirstAdmin, "__kind")).toBe("mutation");
  expect(readProperty(users.setRoleByAuthId, "__visibility")).toBe("public");
  const publicUsers = readProperty(generatedApi.api, "users");
  expect(readProperty(publicUsers, "seedFirstAdmin")).toBeUndefined();
  const internalUsers = readProperty(generatedApi.internal, "users");
  expect(readProperty(internalUsers, "seedFirstAdmin")).toBeDefined();

  const schema = schemaModule.default;
  const usersTable = readProperty(schema, "users");
  const userFields = readProperty(usersTable, "fields");
  expect(readProperty(userFields, "authId")).toEqual({ kind: "string", args: [] });
  expect(readProperty(userFields, "role")).toMatchObject({ kind: "union" });
  expect(readProperty(userFields, "banned")).toEqual({ kind: "boolean", args: [] });
  expect(readProperty(usersTable, "indexes")).toEqual([
    { name: "by_authId", fields: ["authId"] },
    { name: "by_email", fields: ["email"] },
    { name: "by_role", fields: ["role"] },
  ]);
  const auditTable = readProperty(schema, "admin_audit_events");
  const auditFields = readProperty(auditTable, "fields");
  expect(readProperty(auditFields, "actor")).toMatchObject({
    kind: "union",
    args: [
      {
        kind: "object",
        args: [
          {
            kind: { kind: "literal", args: ["user"] },
            userId: { kind: "id", args: ["users"] },
            authId: { kind: "string", args: [] },
          },
        ],
      },
      { kind: "object", args: [{ kind: { kind: "literal", args: ["bootstrap"] } }] },
    ],
  });
  expect(readProperty(auditFields, "targetAuthId")).toEqual({ kind: "string", args: [] });
  expect(readProperty(auditFields, "event")).toMatchObject({
    kind: "union",
    args: [
      {
        kind: "object",
        args: [{ type: { kind: "literal", args: ["user.role.changed"] } }],
      },
      {
        kind: "object",
        args: [{ type: { kind: "literal", args: ["user.ban.changed"] } }],
      },
    ],
  });
  expect(readProperty(auditTable, "indexes")).toEqual([
    { name: "by_targetUserId", fields: ["targetUserId"] },
    { name: "by_targetAuthId", fields: ["targetAuthId"] },
    { name: "by_createdAt", fields: ["createdAt"] },
  ]);
  const postsTable = readProperty(schema, "posts");
  expect(readProperty(postsTable, "indexes")).toContainEqual({
    name: "by_userId",
    fields: ["userId"],
  });

  const db = new MemoryDb();
  const ctx = mappingContext(db);
  const adminIdentity = makeAuthUser("auth-admin-1", "admin@example.com", {
    name: "Bootstrap Admin",
    role: "user",
  });
  await triggers.onCreate(ctx, adminIdentity);
  const initialAdminMapping = requireMappedUser(db, adminIdentity._id);
  const adminId = requireString(initialAdminMapping._id, "admin local ID");
  expect(adminId).toBe("users:1");
  expect(adminId).not.toBe(adminIdentity._id);

  await triggers.onCreate(ctx, { ...adminIdentity, name: "Updated before bootstrap", updatedAt: 2 });
  const idempotentAdminMapping = requireMappedUser(db, adminIdentity._id);
  expect(idempotentAdminMapping._id).toBe(adminId);
  expect(idempotentAdminMapping.name).toBe("Updated before bootstrap");
  expect(db.rows("users")).toHaveLength(1);

  await callFunctionHandler(users.seedFirstAdmin, ctx, { authId: adminIdentity._id });
  expect(requireMappedUser(db, adminIdentity._id).role).toBe("admin");
  expect(db.rows("admin_audit_events")).toEqual([
    expect.objectContaining({
      actor: { kind: "bootstrap" },
      targetUserId: adminId,
      targetAuthId: adminIdentity._id,
      event: { type: "user.role.changed", previousRole: "user", nextRole: "admin" },
    }),
  ]);

  const memberIdentity = makeAuthUser("auth-user-1", "member@example.com", {
    name: "Member",
  });
  const targetIdentity = makeAuthUser("auth-user-2", "target@example.com", {
    name: "Target",
  });
  await triggers.onCreate(ctx, memberIdentity);
  await triggers.onCreate(ctx, targetIdentity);
  const memberId = requireString(
    requireMappedUser(db, memberIdentity._id)._id,
    "member local ID",
  );
  const targetId = requireString(
    requireMappedUser(db, targetIdentity._id)._id,
    "target local ID",
  );
  expect([memberId, targetId]).toEqual(["users:2", "users:3"]);
  await expectConvexError(
    callFunctionHandler(users.seedFirstAdmin, ctx, { authId: memberIdentity._id }),
    "BOOTSTRAP_CLOSED",
  );

  const bannedBootstrapDb = new MemoryDb();
  const bannedBootstrapCtx = mappingContext(bannedBootstrapDb);
  const bannedCandidate = makeAuthUser("auth-banned-bootstrap", "blocked@example.com");
  await triggers.onCreate(bannedBootstrapCtx, bannedCandidate);
  const bannedCandidateId = requireString(
    requireMappedUser(bannedBootstrapDb, bannedCandidate._id)._id,
    "banned candidate local ID",
  );
  await bannedBootstrapDb.patch(bannedCandidateId, { banned: true });
  await expectConvexError(
    callFunctionHandler(users.seedFirstAdmin, bannedBootstrapCtx, {
      authId: bannedCandidate._id,
    }),
    "USER_BANNED",
  );
  expect(bannedBootstrapDb.rows("admin_audit_events")).toHaveLength(0);

  await authenticate(null, db);
  expect(await callFunctionHandler(users.me, ctx)).toBeNull();
  await expectConvexError(callFunctionHandler(users.getCurrentUser, ctx), "UNAUTHENTICATED");
  await expectConvexError(
    callFunctionHandler(users.list, ctx, {
      paginationOpts: { numItems: 20, cursor: null },
    }),
    "UNAUTHENTICATED",
  );
  await expectConvexError(
    callFunctionHandler(posts.create, ctx, { title: "Blocked", content: "No identity" }),
    "UNAUTHENTICATED",
  );

  await authenticate(makeAuthUser("auth-missing", "missing@example.com"), db);
  await expectConvexError(callFunctionHandler(users.me, ctx), "AUTH_MAPPING_MISSING");

  await authenticate({ ...memberIdentity, role: "admin", banned: false }, db);
  expect(currentTokenIdentity).toEqual({
    subject: memberIdentity._id,
    tokenIdentifier: "https://issuer.example|" + memberIdentity._id,
    sessionId: "session:" + memberIdentity._id,
  });
  expect(readProperty(currentTokenIdentity, "tokenIdentifier")).not.toBe(memberIdentity._id);
  await expectConvexError(
    callFunctionHandler(users.list, ctx, {
      paginationOpts: { numItems: 20, cursor: null },
    }),
    "FORBIDDEN",
  );
  await expectConvexError(
    callFunctionHandler(users.setRoleByAuthId, ctx, {
      authId: targetIdentity._id,
      role: "admin",
    }),
    "FORBIDDEN",
  );
  const postId = requireString(
    await callFunctionHandler(posts.create, ctx, {
      title: "  Local ownership  ",
      content: "Stored under the application user ID",
    }),
    "post ID",
  );
  const storedPost = await db.get(postId);
  expect(storedPost).toMatchObject({
    _id: "posts:1",
    userId: memberId,
    title: "Local ownership",
  });
  expect(readProperty(storedPost, "userId")).not.toBe(memberIdentity._id);

  await authenticate(targetIdentity, db);
  await expectConvexError(callFunctionHandler(posts.get, ctx, { id: postId }), "FORBIDDEN");
  await expectConvexError(
    callFunctionHandler(posts.list, ctx, {
      userId: memberId,
      paginationOpts: { numItems: 20, cursor: null },
    }),
    "FORBIDDEN",
  );

  await authenticate({ ...adminIdentity, role: "user", banned: true }, db);
  const listedUsers = await callFunctionHandler(users.list, ctx, {
    paginationOpts: { numItems: 20, cursor: null },
  });
  expect(readProperty(listedUsers, "page")).toHaveLength(3);
  expect(await callFunctionHandler(posts.get, ctx, { id: postId })).toEqual(storedPost);
  const memberPosts = await callFunctionHandler(posts.list, ctx, {
    userId: memberId,
    paginationOpts: { numItems: 20, cursor: null },
  });
  expect(readProperty(memberPosts, "page")).toHaveLength(1);

  const auditCountBeforeNoOps = db.rows("admin_audit_events").length;
  expect(
    readProperty(
      await callFunctionHandler(users.setRoleByAuthId, ctx, {
        authId: adminIdentity._id,
        role: "admin",
      }),
      "_id",
    ),
  ).toBe(adminId);
  expect(
    readProperty(
      await callFunctionHandler(users.setBannedByAuthId, ctx, {
        authId: memberIdentity._id,
        banned: false,
      }),
      "_id",
    ),
  ).toBe(memberId);
  expect(db.rows("admin_audit_events")).toHaveLength(auditCountBeforeNoOps);

  await callFunctionHandler(users.setBannedByAuthId, ctx, {
    authId: memberIdentity._id,
    banned: true,
    reason: "manual review",
  });
  await authenticate({ ...memberIdentity, banned: false }, db);
  await expectConvexError(callFunctionHandler(users.me, ctx), "USER_BANNED");
  await expectConvexError(
    callFunctionHandler(posts.create, ctx, { title: "Blocked", content: "Banned locally" }),
    "USER_BANNED",
  );
  await authenticate(adminIdentity, db);
  await callFunctionHandler(users.setBannedByAuthId, ctx, {
    authId: memberIdentity._id,
    banned: false,
  });

  await callFunctionHandler(users.setRoleByAuthId, ctx, {
    authId: targetIdentity._id,
    role: "admin",
  });
  await callFunctionHandler(users.setBannedByAuthId, ctx, {
    authId: targetIdentity._id,
    banned: true,
    reason: "security hold",
  });
  const updatedTargetIdentity: AuthUser = {
    ...targetIdentity,
    name: "Renamed identity",
    email: "renamed@example.com",
    emailVerified: false,
    role: "user",
    banned: false,
    updatedAt: 50,
  };
  await triggers.onUpdate(ctx, updatedTargetIdentity);
  const synchronizedTarget = requireMappedUser(db, targetIdentity._id);
  expect(synchronizedTarget).toMatchObject({
    _id: targetId,
    authId: targetIdentity._id,
    name: "Renamed identity",
    email: "renamed@example.com",
    emailVerified: false,
    role: "admin",
    banned: true,
    banReason: "security hold",
  });

  await authenticate(updatedTargetIdentity, db);
  await expectConvexError(callFunctionHandler(users.me, ctx), "USER_BANNED");
  await expectConvexError(
    callFunctionHandler(users.setRoleByAuthId, ctx, {
      authId: memberIdentity._id,
      role: "admin",
    }),
    "USER_BANNED",
  );
  await authenticate(adminIdentity, db);
  await callFunctionHandler(users.setBannedByAuthId, ctx, {
    authId: targetIdentity._id,
    banned: false,
  });

  await authenticate(updatedTargetIdentity, db);
  const auditCountBeforeRejectedSelfChanges = db.rows("admin_audit_events").length;
  await expectConvexError(
    callFunctionHandler(users.setRoleByAuthId, ctx, {
      authId: targetIdentity._id,
      role: "user",
    }),
    "SELF_DEMOTION",
  );
  await expectConvexError(
    callFunctionHandler(users.setBannedByAuthId, ctx, {
      authId: targetIdentity._id,
      banned: true,
    }),
    "SELF_BAN",
  );
  expect(db.rows("admin_audit_events")).toHaveLength(auditCountBeforeRejectedSelfChanges);

  await authenticate(adminIdentity, db);
  await callFunctionHandler(users.setRoleByAuthId, ctx, {
    authId: targetIdentity._id,
    role: "user",
  });
  await expectConvexError(
    callFunctionHandler(users.setRoleByAuthId, ctx, {
      authId: adminIdentity._id,
      role: "user",
    }),
    "LAST_ADMIN",
  );
  await expectConvexError(
    callFunctionHandler(users.setBannedByAuthId, ctx, {
      authId: adminIdentity._id,
      banned: true,
    }),
    "LAST_ADMIN",
  );

  expect(db.rows("admin_audit_events")).toEqual([
    expect.objectContaining({
      actor: { kind: "bootstrap" },
      targetUserId: adminId,
      targetAuthId: adminIdentity._id,
      event: { type: "user.role.changed", previousRole: "user", nextRole: "admin" },
    }),
    expect.objectContaining({
      actor: { kind: "user", userId: adminId, authId: adminIdentity._id },
      targetUserId: memberId,
      targetAuthId: memberIdentity._id,
      event: {
        type: "user.ban.changed",
        previousBanned: false,
        nextBanned: true,
        reason: "manual review",
      },
    }),
    expect.objectContaining({
      actor: { kind: "user", userId: adminId, authId: adminIdentity._id },
      targetUserId: memberId,
      targetAuthId: memberIdentity._id,
      event: {
        type: "user.ban.changed",
        previousBanned: true,
        nextBanned: false,
        reason: undefined,
      },
    }),
    expect.objectContaining({
      actor: { kind: "user", userId: adminId, authId: adminIdentity._id },
      targetUserId: targetId,
      targetAuthId: targetIdentity._id,
      event: { type: "user.role.changed", previousRole: "user", nextRole: "admin" },
    }),
    expect.objectContaining({
      actor: { kind: "user", userId: adminId, authId: adminIdentity._id },
      targetUserId: targetId,
      targetAuthId: targetIdentity._id,
      event: {
        type: "user.ban.changed",
        previousBanned: false,
        nextBanned: true,
        reason: "security hold",
      },
    }),
    expect.objectContaining({
      actor: { kind: "user", userId: adminId, authId: adminIdentity._id },
      targetUserId: targetId,
      targetAuthId: targetIdentity._id,
      event: {
        type: "user.ban.changed",
        previousBanned: true,
        nextBanned: false,
        reason: undefined,
      },
    }),
    expect.objectContaining({
      actor: { kind: "user", userId: adminId, authId: adminIdentity._id },
      targetUserId: targetId,
      targetAuthId: targetIdentity._id,
      event: { type: "user.role.changed", previousRole: "admin", nextRole: "user" },
    }),
  ]);

  await triggers.onDelete(ctx, updatedTargetIdentity);
  expect(findMappedUser(db, targetIdentity._id)).toBeUndefined();
  expect(db.rows("users")).toHaveLength(2);
  await authenticate(updatedTargetIdentity, db);
  await expectConvexError(callFunctionHandler(users.me, ctx), "AUTH_MAPPING_MISSING");
  const retainedTargetAudits = await db
    .query("admin_audit_events")
    .withIndex("by_targetAuthId", (query) => query.eq("targetAuthId", targetIdentity._id))
    .collect();
  expect(retainedTargetAudits).toHaveLength(4);
  for (const audit of retainedTargetAudits) {
    expect(audit.targetUserId).toBe(targetId);
    expect(audit.targetAuthId).toBe(targetIdentity._id);
    expect(audit.actor).toMatchObject({ authId: adminIdentity._id });
  }
  expect(await db.get(postId)).toMatchObject({ userId: memberId });
});
`;

describe("generated Convex app-owned user mapping", () => {
  test("runtime behavior preserves local authorization and immutable audit identity", async () => {
    const root = mkdtempSync(join(tmpdir(), "ghostinit-convex-user-mapping-"));
    try {
      const files = generateProjectFiles(
        projectConfigSchema.parse({
          name: "convex-user-mapping",
          runtime: "bun",
          version: "0.1.0",
          mode: "single",
          preset: "custom",
          auth: true,
          api: true,
          email: false,
          billing: [],
          features: [],
          database: "convex",
          framework: "tanstack-start",
          apps: ["web"],
        }),
      );
      const transaction = new FsTransaction(root);
      for (const path of [
        "convex/auth.ts",
        "convex/users.ts",
        "convex/posts.ts",
        "convex/schema.ts",
        "convex/lib/auth.ts",
        "convex/auth.config.ts",
        "convex/schema/identity.ts",
        "convex/identity/sessions.ts",
        "convex/identity/shared.ts",
      ]) {
        const content = files.find((file) => file.path === path)?.content ?? "";
        expect(content, path).not.toBe("");
        await transaction.write(path, content);
      }
      await transaction.write("convex/_generated/api.ts", generatedApiRuntime);
      await transaction.write("convex/_generated/server.ts", generatedServerRuntime);
      await transaction.write("convex/_generated/dataModel.ts", generatedDataModelRuntime);
      await transaction.write("mapping.test.ts", mappingBehaviorTest);
      expect(transaction.getStagedFiles().map(({ path }) => path)).toEqual(
        expect.arrayContaining([
          "convex/auth.ts",
          "convex/users.ts",
          "convex/posts.ts",
          "convex/schema.ts",
          "convex/lib/auth.ts",
          "mapping.test.ts",
        ]),
      );
      await transaction.commit();
      await runMappingTest(root);
    } finally {
      verifyTempRoot(root);
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);
});
