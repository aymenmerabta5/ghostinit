import { describe, expect, test } from "bun:test";
import { convexIdentityAdapterFiles } from "../../../src/templates/adapters/identity/convex.js";

interface AppSession {
  _id: string;
  authSessionId: string;
  userId: string;
  expiresAt: number;
  revokedAt?: number;
  updatedAt: number;
}

interface CanonicalSession {
  id: string;
  token: string;
  userId: string;
}

interface GeneratedMutation<TArgs> {
  handler(ctx: unknown, args: TArgs): Promise<unknown>;
}

function generatedSessionSource(): string {
  const source = convexIdentityAdapterFiles("monorepo").find(
    ({ path }) => path === "convex/identity/sessions.ts",
  )?.content;
  if (!source) throw new Error("Convex identity session template was not emitted");
  return source;
}

function loadGeneratedHandlers(actor: { user: { _id: string }; session: AppSession }): {
  revoke: GeneratedMutation<{ sessionId: string }>;
  revokeOthers: GeneratedMutation<Record<string, never>>;
} {
  const source = generatedSessionSource()
    .replace(/import\s+(?:type\s+)?(?:\{[\s\S]*?\}|[^;]+)\s+from\s+["'][^"']+["'];\r?\n/g, "")
    .replace(/^export /gm, "");
  const javascript = new Bun.Transpiler({ loader: "ts" }).transformSync(source);
  class HarnessConvexError extends Error {}
  const register = <T>(definition: T): T => definition;
  return new Function(
    "ConvexError",
    "v",
    "components",
    "internalMutation",
    "mutation",
    "query",
    "findUserByAuthId",
    "identitySessionValue",
    "recordIdentityAudit",
    "requireFreshIdentitySession",
    "requireIdentityActor",
    `${javascript}; return { revoke, revokeOthers };`,
  )(
    HarnessConvexError,
    { id: (name: string) => name },
    { betterAuth: { adapter: { deleteOne: "betterAuth.adapter.deleteOne" } } },
    register,
    register,
    register,
    async () => null,
    (session: AppSession) => ({ ...session, revokedAt: session.revokedAt ?? null }),
    async () => undefined,
    () => undefined,
    async () => actor,
  ) as {
    revoke: GeneratedMutation<{ sessionId: string }>;
    revokeOthers: GeneratedMutation<Record<string, never>>;
  };
}

function harness(input: {
  appSessions: AppSession[];
  canonicalSessions: CanonicalSession[];
  currentAppSessionId: string;
}) {
  const appSessions = new Map(input.appSessions.map((session) => [session._id, { ...session }]));
  const canonicalSessions = new Map(
    input.canonicalSessions.map((session) => [session.id, { ...session }]),
  );
  const events: string[] = [];
  const current = appSessions.get(input.currentAppSessionId);
  if (!current) throw new Error("Current app session is missing");
  const actor = { user: { _id: current.userId }, session: current };
  const handlers = loadGeneratedHandlers(actor);
  const ctx = {
    db: {
      async get(id: string) {
        return appSessions.get(id) ?? null;
      },
      async patch(id: string, values: Partial<AppSession>) {
        const session = appSessions.get(id);
        if (!session) throw new Error("App session disappeared");
        events.push(`app:${id}`);
        Object.assign(session, values);
      },
      query(table: string) {
        if (table !== "identitySessions") throw new Error("Unexpected table");
        return {
          withIndex() {
            return {
              async collect() {
                return [...appSessions.values()];
              },
            };
          },
        };
      },
    },
    async runMutation(reference: string, args: { input: { where: Array<{ value: string }> } }) {
      expect(reference).toBe("betterAuth.adapter.deleteOne");
      const canonicalId = args.input.where[0]?.value;
      if (!canonicalId) throw new Error("Canonical session id is missing");
      events.push(`canonical:${canonicalId}`);
      const existing = canonicalSessions.get(canonicalId) ?? null;
      canonicalSessions.delete(canonicalId);
      return existing;
    },
  };

  function listSessions(token: string): { status: 200; tokens: string[] } | { status: 401 } {
    const caller = [...canonicalSessions.values()].find((session) => session.token === token);
    if (!caller) return { status: 401 };
    return {
      status: 200,
      tokens: [...canonicalSessions.values()]
        .filter((session) => session.userId === caller.userId)
        .map((session) => session.token)
        .sort(),
    };
  }

  return { appSessions, canonicalSessions, ctx, events, handlers, listSessions };
}

describe("generated Convex canonical session revocation", () => {
  test("a stolen token cannot list and exchange itself for another session after typed revoke", async () => {
    const now = Date.now();
    const state = harness({
      currentAppSessionId: "app-current",
      appSessions: [
        {
          _id: "app-current",
          authSessionId: "canonical-current",
          userId: "user-1",
          expiresAt: now + 60_000,
          updatedAt: now,
        },
        {
          _id: "app-stolen",
          authSessionId: "canonical-stolen",
          userId: "user-1",
          expiresAt: now + 60_000,
          updatedAt: now,
        },
      ],
      canonicalSessions: [
        { id: "canonical-current", token: "token-current", userId: "user-1" },
        { id: "canonical-stolen", token: "token-stolen", userId: "user-1" },
      ],
    });

    expect(state.listSessions("token-stolen")).toEqual({
      status: 200,
      tokens: ["token-current", "token-stolen"],
    });
    const result = (await state.handlers.revoke.handler(state.ctx, {
      sessionId: "app-stolen",
    })) as { changed: boolean };

    expect(result.changed).toBe(true);
    expect(state.listSessions("token-stolen")).toEqual({ status: 401 });
    expect(state.listSessions("token-current")).toEqual({
      status: 200,
      tokens: ["token-current"],
    });
    expect(state.events.slice(0, 2)).toEqual(["canonical:canonical-stolen", "app:app-stolen"]);
  });

  test("revoke-others removes every provider session but preserves normal current-session management", async () => {
    const now = Date.now();
    const state = harness({
      currentAppSessionId: "app-current",
      appSessions: [
        {
          _id: "app-current",
          authSessionId: "canonical-current",
          userId: "user-1",
          expiresAt: now + 60_000,
          updatedAt: now,
        },
        {
          _id: "app-active-other",
          authSessionId: "canonical-active-other",
          userId: "user-1",
          expiresAt: now + 60_000,
          updatedAt: now,
        },
        {
          _id: "app-old-tombstone",
          authSessionId: "canonical-old-tombstone",
          userId: "user-1",
          expiresAt: now + 60_000,
          revokedAt: now - 1_000,
          updatedAt: now - 1_000,
        },
      ],
      canonicalSessions: [
        { id: "canonical-current", token: "token-current", userId: "user-1" },
        { id: "canonical-active-other", token: "token-active-other", userId: "user-1" },
        { id: "canonical-old-tombstone", token: "token-old-tombstone", userId: "user-1" },
      ],
    });

    const result = (await state.handlers.revokeOthers.handler(state.ctx, {})) as {
      changed: boolean;
      revokedCount: number;
    };

    expect(result).toEqual({ changed: true, revokedCount: 1 });
    expect([...state.canonicalSessions.keys()]).toEqual(["canonical-current"]);
    expect(state.listSessions("token-active-other")).toEqual({ status: 401 });
    expect(state.listSessions("token-old-tombstone")).toEqual({ status: 401 });
    expect(state.listSessions("token-current")).toEqual({
      status: 200,
      tokens: ["token-current"],
    });
  });
});
