// @allow-long 340: external Convex boundaries and the actual generated function registry form one hermetic fixture
import type { RouterSources, RouterVariant } from "./generated-router-fixture.js";
import { fixtureEnvironmentSource, fixtureImports } from "./generated-router-fixture.js";
import { convexMemoryClassesSource } from "./convex-memory-runtime.js";

const runtimeState = `import { AsyncLocalStorage } from "node:async_hooks";
import { Database } from "bun:sqlite";
import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { env } from "./environment";

// This is the hosted auth-component boundary, not an application-service stub.
// Canonical identities are seeded through Better Auth's internal adapter; signup/email policy
// and hosted Convex JWT issuance are outside this composition test's claim.
process.env.SITE_URL = env.SITE_URL;
process.env.CONVEX_SITE_URL = env.CONVEX_SITE_URL;
process.env.BETTER_AUTH_SECRET = env.BETTER_AUTH_SECRET;
process.env.BETTER_AUTH_URL = env.BETTER_AUTH_URL;
process.env.TRUSTED_PROXY = "false";
process.env.NOTIFICATION_TOKEN_ENCRYPTION_KEY = env.NOTIFICATION_TOKEN_ENCRYPTION_KEY;
export const sqlite = new Database(":memory:");
export const canonicalAuth = betterAuth({
  database: sqlite,
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: [env.BETTER_AUTH_URL],
  emailAndPassword: { enabled: false },
  session: { cookieCache: { enabled: false } },
});
const requests = new AsyncLocalStorage();
let dispatcher;
export let authTriggers;
export function registerAuthTriggers(triggers) { authTriggers = triggers; }
export function installDispatcher(value) { dispatcher = value; }
export function withRequest(headers, operation) { return requests.run(new Headers(headers), operation); }
export function requestHeaders() { return requests.getStore() ?? new Headers(); }
export async function authSession() {
  return await canonicalAuth.api.getSession({ headers: requestHeaders(), query: { disableCookieCache: true, disableRefresh: true } });
}
export function millis(value) {
  const result = value instanceof Date ? value.getTime() : typeof value === "number" ? value : Date.parse(value);
  if (!Number.isFinite(result)) throw new Error("Hosted auth supplied an invalid timestamp");
  return result;
}
export function componentUser(user) {
  return user ? { ...user, _id: user.id, _creationTime: millis(user.createdAt), createdAt: millis(user.createdAt), updatedAt: millis(user.updatedAt) } : null;
}
export async function safeAuthUser() { return componentUser((await authSession())?.user ?? null); }
export async function invokeExternal(reference, args = {}) {
  if (reference?.__path?.[0] !== "api") throw new Error("External Convex gateway requires a public api reference");
  if (!dispatcher) throw new Error("Convex fixture was not initialized");
  return await dispatcher(reference, args, false);
}
export async function initializeAuth() { await (await getMigrations(canonicalAuth.options)).runMigrations(); }
`;

const componentBoundary = `import { sqlite, registerAuthTriggers, safeAuthUser } from "./convex-state";
export function createClient(_component, config) {
  registerAuthTriggers(config?.triggers);
  return {
    adapter: () => sqlite,
    triggersApi: () => ({ onCreate: {}, onUpdate: {}, onDelete: {} }),
    safeGetAuthUser: async () => await safeAuthUser(),
    getAuthUser: async () => {
      const user = await safeAuthUser();
      if (!user) throw new Error("Unauthenticated hosted auth component request");
      return user;
    },
  };
}
`;

const frameworkGateway = `import { canonicalAuth, authSession, invokeExternal } from "./convex-state";
function gateway() {
  const handle = request => canonicalAuth.handler(request);
  return {
    handler: { GET: handle, POST: handle },
    getToken: async () => (await authSession())?.session.id,
    isAuthenticated: async () => Boolean(await authSession()),
    fetchAuthQuery: invokeExternal,
    fetchAuthMutation: invokeExternal,
    fetchAuthAction: invokeExternal,
    preloadAuthQuery: async () => { throw new Error("Convex preloading is outside this fixture"); },
  };
}
export const convexBetterAuthNextJs = gateway;
export const convexBetterAuthReactStart = gateway;
`;

const convexServerBoundary = `function register(definition, kind, visibility) {
  return Object.freeze({ ...definition, __kind: kind, __visibility: visibility });
}
export const query = definition => register(definition, "query", "public");
export const mutation = definition => register(definition, "mutation", "public");
export const action = definition => register(definition, "action", "public");
export const internalQuery = definition => register(definition, "query", "internal");
export const internalMutation = definition => register(definition, "mutation", "internal");
export const internalAction = definition => register(definition, "action", "internal");
export const paginationOptsValidator = { kind: "pagination" };
export function defineTable(fields) {
  const table = { fields, indexes: [], index(name, indexedFields) {
    table.indexes.push({ name, fields: indexedFields }); return table;
  } };
  return table;
}
export const defineSchema = tables => tables;
`;

const convexValuesBoundary = `export class ConvexError extends Error {
  constructor(data) { super(typeof data === "string" ? data : data.message); this.data = data; }
}
export const v = new Proxy({}, { get: (_target, property) => (...args) => ({ kind: String(property), args }) });
`;

const generatedReferences = `function reference(path) {
  return new Proxy({}, { get: (_target, property) => {
    if (property === "then") return undefined;
    if (property === "__path") return path;
    if (typeof property !== "string") return undefined;
    return reference([...path, property]);
  } });
}
export const api = reference(["api"]);
export const internal = reference(["internal"]);
export const components = reference(["components"]);
`;

/**
 * Real generated HTTP/auth/application graph and Convex handlers, with modeled
 * external hosting, function dispatch, validators, and indexed data access.
 * This does not claim hosted JWT, transactions/concurrency, or pagination proof.
 */
export function convexRoundtripFixture(
  sources: RouterSources,
  variant: RouterVariant,
): { entry: string; overrides: Record<string, string>; aliases: Record<string, string> } {
  if (variant.database !== "convex") throw new Error("Convex fixture requires a Convex variant");
  const modules = [
    "auth",
    "users",
    "notifications",
    "identity/sessions",
    "identity/organizations",
    "identity/teams",
    "identity/invitations",
    "identity/audit",
  ];
  for (const name of modules) {
    if (!sources.files.has(`convex/${name}.ts`))
      throw new Error("Missing generated Convex function module: " + name);
  }
  const overrides = {
    "__fixture__/environment.ts": fixtureEnvironmentSource(),
    "__fixture__/convex-state.ts": runtimeState,
    "__fixture__/convex-component.ts": componentBoundary,
    "__fixture__/convex-framework.ts": frameworkGateway,
    "__fixture__/convex-server.ts": convexServerBoundary,
    "__fixture__/convex-values.ts": convexValuesBoundary,
    "__fixture__/convex-plugins.ts":
      'export const convex = () => ({ id: "hermetic-convex" }); export const crossDomain = () => ({ id: "hermetic-cross-domain" });',
    "__fixture__/convex-auth-config.ts":
      'export const getAuthConfigProvider = () => ({ domain: "https://hermetic.convex.site", applicationID: "convex" });',
    "convex/_generated/api.ts": generatedReferences,
    "convex/_generated/server.ts":
      'export { query, mutation, action, internalQuery, internalMutation, internalAction } from "../../__fixture__/convex-server";',
    "convex/_generated/dataModel.ts": "export {};",
  };
  const aliases = {
    "@repo/config/server": "__fixture__/environment.ts",
    "@/lib/env/server": "__fixture__/environment.ts",
    "@convex-dev/better-auth": "__fixture__/convex-component.ts",
    "@convex-dev/better-auth/nextjs": "__fixture__/convex-framework.ts",
    "@convex-dev/better-auth/react-start": "__fixture__/convex-framework.ts",
    "@convex-dev/better-auth/plugins": "__fixture__/convex-plugins.ts",
    "@convex-dev/better-auth/auth-config": "__fixture__/convex-auth-config.ts",
    "convex/server": "__fixture__/convex-server.ts",
    "convex/values": "__fixture__/convex-values.ts",
  };
  const entry = `${fixtureImports(sources, variant)}
import schema from "../convex/schema";
import { serializeSignedCookie } from "better-call";
${modules.map((name, index) => `import * as functions${index} from "../convex/${name}";`).join("\n")}
import { canonicalAuth, sqlite, authSession, authTriggers, componentUser, initializeAuth, installDispatcher, millis, withRequest } from "./convex-state";
export { withRequest };

interface IndexBuilder { eq(field: string, value: unknown): IndexBuilder; }
interface IndexFilter { field: string; value: unknown; }
const indexFields = new Map<string, readonly string[]>();
for (const [name, table] of Object.entries(schema)) {
  for (const index of table.indexes) indexFields.set(name + ":" + index.name, index.fields);
}
${convexMemoryClassesSource([])}
const db = new MemoryDb(Object.keys(schema));
const modules = { ${modules.map((name, index) => `${JSON.stringify(name)}: functions${index}`).join(", ")} };

async function context() {
  const current = await authSession();
  return {
    db,
    auth: { getUserIdentity: async () => current ? {
      subject: current.user.id,
      tokenIdentifier: "https://hermetic.convex.site|" + current.user.id,
      sessionId: current.session.id,
    } : null },
    runQuery: (reference, args) => dispatch(reference, args, true),
    runMutation: (reference, args) => dispatch(reference, args, true),
    runAction: (reference, args) => dispatch(reference, args, true),
  };
}

async function dispatch(reference, args, internal) {
  const path = reference?.__path;
  if (!Array.isArray(path)) throw new Error("Invalid Convex function reference");
  if (path.join("/") === "components/betterAuth/adapter/deleteOne") {
    if (!internal || args?.input?.model !== "session" || args.input.where?.length !== 1) throw new Error("Unexpected component deletion");
    const selector = args.input.where[0];
    if (selector.field !== "_id" || selector.operator !== "eq" || typeof selector.value !== "string") throw new Error("Unexpected canonical session selector");
    // Real generated revocation reaches this external component adapter call.
    // Delete its authoritative SQLite row, not merely the app-owned tombstone.
    sqlite.query('DELETE FROM "session" WHERE id = ?').run(selector.value);
    return null;
  }
  const module = modules[path.slice(1, -1).join("/")];
  const registered = module?.[path.at(-1)];
  if (!registered || typeof registered.handler !== "function") throw new Error("Unknown generated Convex function: " + path.join("/"));
  if (!internal && registered.__visibility !== "public") throw new Error("Internal Convex function crossed the public gateway");
  return await registered.handler(await context(), args);
}

export async function setup() {
  await initializeAuth();
  installDispatcher(dispatch);
}
export async function close() { sqlite.close(); }

export async function seedUser(email, _password) {
  const authContext = await canonicalAuth.$context;
  const user = await authContext.internalAdapter.createUser({ email, emailVerified: true, name: email.split("@")[0] });
  const session = await authContext.internalAdapter.createSession(user.id);
  const signed = await serializeSignedCookie(authContext.authCookies.sessionToken.name, session.token, authContext.secret, authContext.authCookies.sessionToken.attributes);
  const cookie = signed.split(";", 1)[0];
  await withRequest(new Headers({ cookie }), async () => {
    const current = await authSession();
    if (!current || !authTriggers?.user?.onCreate) throw new Error("Canonical auth session or generated mapping trigger is missing");
    await authTriggers.user.onCreate(await context(), componentUser(current.user));
    await functions3.syncIdentitySessionCreated(await context(), {
      ...current.session, _id: current.session.id,
      createdAt: millis(current.session.createdAt), updatedAt: millis(current.session.updatedAt),
      expiresAt: millis(current.session.expiresAt),
    });
  });
  return cookie;
}
`;
  return { entry, overrides, aliases };
}
