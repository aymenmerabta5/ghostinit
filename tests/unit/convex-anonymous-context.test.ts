import { describe, expect, test } from "bun:test";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import {
  compileGeneratedRouter,
  generateRouterSources,
} from "../helpers/generated-router-fixture.js";
import { convexRoundtripFixture } from "../helpers/convex-router-runtime.js";

// Only the external hosted gateway is controlled. The emitted auth wrapper,
// request context, application facade, identity composition, and HTTP route run unchanged.
const hostedGateway = `export const attempts = [];
let state = "unavailable";
export function backendState(value) { state = value; attempts.length = 0; }
function attempt(operation, headers) {
  attempts.push({ operation, headers: headers ? Object.fromEntries(headers) : undefined });
  if (state === "unavailable") throw new Error("Hosted Convex is unavailable");
}
const actor = { _id: "app-user", authId: "auth-user", email: "owner@example.test", emailVerified: true, name: "Owner", role: "user", banned: false };
function gateway() {
  const handle = async request => {
    attempt("/api/auth/get-session", request.headers);
    return Response.json(state === "authenticated" ? {
      user: { id: "auth-user", email: actor.email, emailVerified: true },
      session: { id: "auth-session", createdAt: "2026-01-01T00:00:00.000Z" },
    } : null);
  };
  const query = async reference => {
    const name = reference.__path.join(".");
    attempt(name);
    if (name === "api.users.me") return state === "authenticated" ? actor : null;
    if (name === "api.identity.sessions.current") return {
      authSessionId: "auth-session", userId: "app-user",
      session: { id: "identity-session", authenticatedAt: "2026-01-01T00:00:00.000Z", activeOrganizationId: null, activeTeamId: null },
    };
    throw new Error("Unexpected hosted query: " + name);
  };
  return {
    handler: { GET: handle, POST: handle },
    fetchAuthQuery: query,
    fetchAuthMutation: query,
    fetchAuthAction: query,
    preloadAuthQuery: query,
    getToken: async () => { attempt("/api/auth/convex/token"); return undefined; },
    isAuthenticated: async () => { attempt("isAuthenticated"); return false; },
  };
}
export const convexBetterAuthNextJs = gateway;
export const convexBetterAuthReactStart = gateway;
`;

interface Attempt {
  operation: string;
  headers?: Record<string, string>;
}
interface Application {
  principal: { userId: string } | null;
  me(): Promise<{ user: { id: string } | null }>;
  identity: { organizations: { list(): Promise<unknown> } };
}
interface Context {
  application: Application;
  user?: { id: string };
}
interface Fixture {
  attempts: Attempt[];
  backendState(value: "unavailable" | "anonymous" | "authenticated"): void;
  createContext(headers: Headers): Promise<Context>;
  handle(request: Request): Promise<Response>;
}

async function loadFixture(mode: "monorepo" | "single", framework: "nextjs" | "tanstack-start") {
  const variant = { mode, framework, database: "convex" } as const;
  const sources = generateRouterSources(variant);
  const boundary = convexRoundtripFixture(sources, variant);
  const entry = `export { createContext } from "../${sources.apiRoot}/context";
export { ${framework === "nextjs" ? "GET" : "handleRpcRequest"} as handle } from "../${sources.handlerPath}";
export { attempts, backendState } from "./convex-framework";`;
  const bundle = await compileGeneratedRouter(
    sources,
    entry,
    { ...boundary.overrides, "__fixture__/convex-framework.ts": hostedGateway },
    boundary.aliases,
  );
  return (await import(
    `data:text/javascript;base64,${Buffer.from(bundle).toString("base64")}`
  )) as Fixture;
}

describe("generated Convex anonymous request context", () => {
  for (const mode of ["single", "monorepo"] as const) {
    for (const framework of ["nextjs", "tanstack-start"] as const) {
      test(`${mode}/${framework}: anonymous RPC health and private denial need no hosted gateway`, async () => {
        const fixture = await loadFixture(mode, framework);
        fixture.backendState("unavailable");
        let context: Context | undefined;
        let failure: unknown;
        try {
          context = await fixture.createContext(new Headers());
        } catch (error) {
          failure = error;
        }
        expect(fixture.attempts, String(failure)).toEqual([]);
        expect(context?.application.principal).toBeNull();
        expect(context?.user).toBeUndefined();
        await expect(context!.application.identity.organizations.list()).rejects.toMatchObject({
          code: "APPLICATION_UNAUTHENTICATED",
        });
        const response = await fixture.handle(new Request("http://localhost:3000/api/rpc/health"));
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ json: { status: "ok" } });
        const client = createORPCClient<{
          identity: { organizations: { list(input: Record<string, never>): Promise<unknown> } };
        }>(
          new RPCLink({
            url: "http://localhost:3000/api/rpc",
            fetch: async (input, init) =>
              fixture.handle(input instanceof Request ? input : new Request(input, init)),
          }),
        );
        await expect(client.identity.organizations.list({})).rejects.toMatchObject({
          code: "UNAUTHORIZED",
        });
        expect(fixture.attempts).toEqual([]);
      });

      test(`${mode}/${framework}: credential carriers retain hosted verification and fail closed`, async () => {
        const fixture = await loadFixture(mode, framework);
        for (const carrier of ["cookie", "authorization", "better-auth-cookie"] as const) {
          for (const value of ["", "malformed-credential"]) {
            const headers = new Headers({ [carrier]: value });
            fixture.backendState("anonymous");
            const context = await fixture.createContext(headers);
            expect(context.application.principal).toBeNull();
            expect(fixture.attempts.map((attempt) => attempt.operation).sort()).toEqual([
              "/api/auth/get-session",
              "api.users.me",
            ]);
            expect(fixture.attempts.find((attempt) => attempt.headers)?.headers?.[carrier]).toBe(
              value,
            );
            await expect(context.application.identity.organizations.list()).rejects.toMatchObject({
              code: "APPLICATION_UNAUTHENTICATED",
            });

            fixture.backendState("unavailable");
            await expect(fixture.createContext(headers)).rejects.toThrow(
              "Hosted Convex is unavailable",
            );
            expect(fixture.attempts).toHaveLength(2);
          }

          fixture.backendState("authenticated");
          const headers = new Headers({ [carrier]: "fixture-session" });
          const context = await fixture.createContext(headers);
          expect(context.user?.id).toBe("app-user");
          expect((await context.application.me()).user?.id).toBe("app-user");
          expect(fixture.attempts.map((attempt) => attempt.operation)).toContain(
            "api.identity.sessions.current",
          );
        }
      });
    }
  }
});
