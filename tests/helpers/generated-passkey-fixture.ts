import {
  compileGeneratedRouter,
  fixtureEnvironmentSource,
  type RouterSources,
  type RouterVariant,
} from "./generated-router-fixture.js";
import { postgresRoundtripEntry } from "./authenticated-roundtrip-runner.js";
import { compileGeneratedBrowser } from "./generated-browser-compiler.js";

export async function compilePasskeyFixture(sources: RouterSources, variant: RouterVariant) {
  const route =
    variant.framework === "nextjs"
      ? `${sources.webRoot}/app/api/auth/[...all]/route.ts`
      : `${sources.webRoot}/server/http/auth.server.ts`;
  const handler = variant.framework === "nextjs" ? "POST" : "handleAuthRequest";
  const environment = fixtureEnvironmentSource().replaceAll(
    '"http://localhost:3000"',
    "process.env.PASSKEY_TEST_ORIGIN",
  );
  const server = await compileGeneratedRouter(
    sources,
    `${postgresRoundtripEntry(sources, variant)}
export { ${handler} as handleAuth } from "../${route}";
export async function limiterState() {
  const rows = await db.select().from(schema.rateLimits);
  let uniqueKeyEnforced = false;
  if (rows[0]) {
    try {
      await db.insert(schema.rateLimits).values({ id: crypto.randomUUID(), key: rows[0].key, count: 0, lastRequest: Date.now() });
    } catch (error) {
      uniqueKeyEnforced = error?.cause?.code === "23505" || error?.code === "23505";
    }
  }
  return { rows, uniqueKeyEnforced };
}`,
    { "__fixture__/environment.ts": environment },
    {
      "@repo/config/server": "__fixture__/environment.ts",
      "@/lib/env/server": "__fixture__/environment.ts",
    },
  );
  const browser = await compileGeneratedBrowser(
    sources,
    `import { identityPasskeyClient, authClient } from "../${sources.webRoot}/lib/auth-client.ts";
window.passkeyFixture = {
  register: input => identityPasskeyClient.register(input),
  authenticate: () => identityPasskeyClient.authenticate(),
  list: () => identityPasskeyClient.list(),
  rename: input => identityPasskeyClient.rename(input),
  remove: input => identityPasskeyClient.delete(input),
  signOut: () => authClient.signOut(),
  session: () => authClient.getSession(),
};`,
  );
  return { server, browser };
}

/** Loopback-only host for the real emitted auth Request handler and browser client. */
export const passkeyServerSource = `
import { mock } from "bun:test";
mock.module("next/headers.js", () => ({ headers: async () => new Headers(), cookies: async () => ({ set() {} }) }));
mock.module("@tanstack/react-start/server", () => ({ setCookie() {} }));
let generated;
let initialized = false;
const cookies = new Map();
const server = Bun.serve({
  hostname: "127.0.0.1", port: 0,
  async fetch(request) {
    const url = new URL(request.url);
    if (!initialized) return new Response("Initializing", { status: 503 });
    if (url.pathname.startsWith("/api/auth/")) return generated.handleAuth(request);
    if (url.pathname === "/__fixture__/seed" && request.method === "POST") {
      const body = await request.json();
      if (body.user !== "owner" && body.user !== "other") return new Response("Unknown fixture actor", { status: 400 });
      return Response.json({ ok: true }, { headers: { "Set-Cookie": cookies.get(body.user) + "; Path=/; HttpOnly; SameSite=Lax" } });
    }
    if (url.pathname === "/__fixture__/limiter") return Response.json(await generated.limiterState());
    if (url.pathname === "/__fixture__/close" && request.method === "POST") {
      setTimeout(async () => { server.stop(true); await generated.close(); process.exit(0); }, 50);
      return new Response("Closing");
    }
    if (url.pathname === "/client.js") return new Response(Bun.file(new URL("./client.js", import.meta.url)), { headers: { "Content-Type": "text/javascript" } });
    return new Response('<!doctype html><html><body><h1>Generated passkey fixture</h1><script type="module" src="/client.js"></script></body></html>', { headers: { "Content-Type": "text/html" } });
  },
});
process.env.PASSKEY_TEST_ORIGIN = "http://localhost:" + server.port;
process.env.BETTER_AUTH_URL = process.env.PASSKEY_TEST_ORIGIN;
generated = await import("./fixture.mjs");
await generated.setup();
for (const actor of ["owner", "other"]) cookies.set(actor, await generated.seedUser(actor + "@example.test", "unused"));
initialized = true;
console.log("PASSKEY_FIXTURE_READY " + process.env.PASSKEY_TEST_ORIGIN);
`;
