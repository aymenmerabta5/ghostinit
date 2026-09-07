import type { RouterSources, RouterVariant } from "./generated-router-fixture.js";
import { fixtureImports } from "./generated-router-fixture.js";

export function postgresRoundtripEntry(sources: RouterSources, variant: RouterVariant): string {
  const schemaPaths = [...sources.files.keys()].filter(
    (path) => path.startsWith(`${sources.databaseRoot}/schema/`) && path.endsWith(".ts"),
  );
  return `${fixtureImports(sources, variant)}
import { db } from "../${sources.databaseRoot}/index";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import { serializeSignedCookie } from "better-call";
${schemaPaths.map((path, index) => `import * as schema${index} from "../${path}";`).join("\n")}
const schema = { ${schemaPaths.map((_path, index) => `...schema${index}`).join(", ")} };
const pool = db.$client;
export async function setup() {
  const statements = await generateMigration(generateDrizzleJson({}), generateDrizzleJson(schema));
  for (const statement of statements) await pool.query(statement);
}
export async function close() { await pool.end(); }
export async function seedUser(email, _password) {
  const context = await auth.$context;
  const user = await context.internalAdapter.createUser({ email, emailVerified: true, name: email.split("@")[0] });
  const session = await context.internalAdapter.createSession(user.id);
  const cookie = await serializeSignedCookie(context.authCookies.sessionToken.name, session.token, context.secret, context.authCookies.sessionToken.attributes);
  return cookie.split(";", 1)[0];
}
export function withRequest(_headers, operation) { return operation(); }
`;
}

/** The driver uses a real oRPC fetch client; every request reaches the emitted handler. */
export const authenticatedRoundtripDriver = `
import { expect, mock, test } from "bun:test";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import * as generated from "./fixture.mjs";

// Framework lifecycle stores are supplied by Next/Start in a deployed host.
// This Request-level fixture has no UI response cookie store; authentication
// still consumes the explicit signed Cookie header against the real provider.
mock.module("next/headers.js", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ set() {} }),
}));
mock.module("@tanstack/react-start/server", () => ({ setCookie() {} }));

const origin = "http://localhost:3000";
let requests = 0;
function headers(cookie, native = false) {
  const result = new Headers({ "Content-Type": "application/json" });
  if (cookie) result.set("Cookie", cookie);
  if (native) result.set("X-Ghostinit-Native-Client", "expo");
  else result.set("Origin", origin);
  return result;
}
function client(cookie, native = false) {
  return createORPCClient(new RPCLink({
    url: origin + "/api/rpc",
    headers: () => headers(cookie, native),
    fetch: async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init);
      requests += 1;
      return generated.withRequest(request.headers, () => generated.handle(request));
    },
  }));
}
function direct(cookie, operation) {
  const requestHeaders = headers(cookie);
  return generated.withRequest(requestHeaders, async () => operation(await generated.createRequestApplicationForRequest(requestHeaders)));
}

test("actual generated authenticated router composition", async () => {
  await generated.setup();
  try {
    const password = "Fixture-password-only-123!";
    const ownerCookie = await generated.seedUser("owner@example.test", password);
    const otherCookie = await generated.seedUser("other@example.test", password);
    expect(ownerCookie.length).toBeGreaterThan(0);
    expect(otherCookie.length).toBeGreaterThan(0);
    const owner = client(ownerCookie);
    const other = client(otherCookie);
    const anonymous = client("");
    const native = client(ownerCookie, true);
    const me = await owner.me({});
    expect(me.user.email).toBe("owner@example.test");
    expect(me).toEqual(await direct(ownerCookie, application => application.me()));
    expect((await native.me({})).user.id).toBe(me.user.id);

    const notification = await owner.notifications.createSelf({ kind: "user.note", title: "Owned note", body: "Composition proof", data: {} });
    expect(notification.title).toBe("Owned note");
    expect(typeof notification.createdAt).toBe("string");
    expect(notification).not.toHaveProperty("userId");
    const inboxInput = { limit: 50, unreadOnly: false };
    const inbox = await owner.notifications.listInbox(inboxInput);
    expect(inbox.items.map(item => item.id)).toEqual([notification.id]);
    expect(inbox).toEqual(await direct(ownerCookie, application => application.notifications.listInbox(inboxInput)));
    expect((await other.notifications.listInbox(inboxInput)).items).toEqual([]);
    await expect(other.notifications.markRead({ notificationId: notification.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(anonymous.notifications.createSelf({ kind: "user.note", title: "Denied", body: "", data: {} })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(owner.notifications.createSelf({ kind: "user.note", title: "", body: "", data: {} })).rejects.toMatchObject({ code: "BAD_REQUEST" });

    const marked = await native.notifications.markRead({ notificationId: notification.id });
    const replayed = await owner.notifications.markRead({ notificationId: notification.id });
    expect(marked.changed).toBe(true);
    expect(replayed.changed).toBe(false);
    expect(replayed.value).toEqual(marked.value);
    expect((await owner.notifications.listInbox({ limit: 50, unreadOnly: true })).items).toEqual([]);

    const deviceInput = { platform: "web", pushToken: "fixture-device-token-123456789" };
    const device = await owner.notifications.registerDevice(deviceInput);
    expect(device.changed).toBe(true);
    expect(device.value).not.toHaveProperty("pushToken");
    expect(device.value).not.toHaveProperty("tokenFingerprint");
    expect((await owner.notifications.registerDevice(deviceInput)).changed).toBe(false);
    await expect(other.notifications.registerDevice(deviceInput)).rejects.toMatchObject({ code: "CONFLICT" });

    const created = await owner.identity.organizations.create({ name: "Roundtrip tenant", slug: "roundtrip-tenant" });
    const organizationId = created.organization.id;
    expect((await owner.identity.organizations.list({})).map(value => value.id)).toContain(organizationId);
    expect(await owner.identity.organizations.list({})).toEqual(await direct(ownerCookie, application => application.identity.organizations.list()));
    expect(await other.identity.organizations.list({})).toEqual([]);
    const members = await owner.identity.organizations.listMembers({ organizationId });
    expect(members).toHaveLength(1);
    expect(members[0].userId).toBe(me.user.id);
    await expect(other.identity.organizations.listMembers({ organizationId })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(other.identity.organizations.setActive({ organizationId })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await owner.identity.organizations.setActive({ organizationId });
    expect((await owner.me({})).activeOrganizationId).toBe(organizationId);

    const sessions = await owner.identity.sessions.list({});
    expect(sessions).toHaveLength(1);
    await expect(other.identity.sessions.revoke({ sessionId: sessions[0].id })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await owner.identity.sessions.revoke({ sessionId: sessions[0].id });
    await expect(owner.notifications.listInbox(inboxInput)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect((await other.me({})).user.email).toBe("other@example.test");
    expect(requests).toBeGreaterThanOrEqual(20);
    console.log("AUTHENTICATED_COMPOSITION_PASS " + requests + " generated HTTP requests");
  } finally {
    await generated.close();
  }
}, 60_000);
`;
