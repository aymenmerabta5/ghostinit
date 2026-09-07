import { describe, expect, test } from "bun:test";
import type { ProjectConfig } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";

type ApiContext = {
  headers: Headers;
  sessionId?: string;
  user?: { banned?: boolean | null; id: string };
};

type SubscriptionAuthorization = (
  initialContext: ApiContext,
  userId: string,
  conversationId: string,
) => Promise<boolean>;

function config(
  mode: "monorepo" | "single",
  framework: "nextjs" | "tanstack-start",
  database: "convex" | "postgres" = "postgres",
): ProjectConfig {
  return {
    name: "realtime-session-security",
    runtime: "bun",
    version: "0.1.0",
    mode,
    framework,
    database,
    apps: ["web"],
    billing: [],
    features: [],
    messaging: true,
  } as ProjectConfig;
}

function content(files: ReadonlyArray<{ content: string; path: string }>, path: string): string {
  const value = files.find((entry) => entry.path === path)?.content;
  if (value === undefined) throw new Error(`Missing generated file: ${path}`);
  return value;
}

function loadAuthorization(
  source: string,
  createContext: (headers: Headers) => Promise<ApiContext>,
  canUserAccessConversation: (userId: string, conversationId: string) => Promise<boolean>,
): SubscriptionAuthorization {
  const start = source.indexOf(
    "export async function hasCurrentMessagingSubscriptionAuthorization",
  );
  const end = source.indexOf("\nfunction toMessageRecord", start);
  if (start < 0 || end <= start) throw new Error("Missing subscription authorization helper");
  const executable = source.slice(start, end).replace(/^export /m, "");
  const javascript = new Bun.Transpiler({ loader: "ts" }).transformSync(executable);
  return new Function(
    "createContext",
    "canUserAccessConversation",
    `${javascript}; return hasCurrentMessagingSubscriptionAuthorization;`,
  )(createContext, canUserAccessConversation) as SubscriptionAuthorization;
}

describe("authoritative realtime session delivery", () => {
  for (const mode of ["monorepo", "single"] as const) {
    for (const framework of ["nextjs", "tanstack-start"] as const) {
      test(`${mode}/${framework} binds every delivery check to the original live session`, async () => {
        const files = generateProjectFiles(config(mode, framework));
        const apiRoot = mode === "monorepo" ? "packages/api/src" : "src/server/api";
        const composition = content(files, `${apiRoot}/composition/messaging.ts`);
        const procedure = content(files, `${apiRoot}/procedures/messaging/subscribe.ts`);
        expect(composition).toContain('import { createContext, type ApiContext } from "../context');
        expect(composition).toContain("currentContext.sessionId !== initialSessionId");
        expect(composition).toContain("currentContext.user.banned === true");
        expect(procedure).toContain("subscribeToMessagingEvents(\n        context,");

        let current: ApiContext = {
          headers: new Headers(),
          sessionId: "session-1",
          user: { id: "user-1", banned: false },
        };
        let membershipChecks = 0;
        const authorize = loadAuthorization(
          composition,
          async () => current,
          async (userId, conversationId) => {
            membershipChecks += 1;
            return userId === "user-1" && conversationId === "conversation-1";
          },
        );
        const initial: ApiContext = {
          headers: new Headers({ cookie: "session=opaque" }),
          sessionId: "session-1",
          user: { id: "user-1", banned: false },
        };

        await expect(authorize(initial, "user-1", "conversation-1")).resolves.toBe(true);
        expect(membershipChecks).toBe(1);

        current = { ...current, sessionId: "replacement-session" };
        await expect(authorize(initial, "user-1", "conversation-1")).resolves.toBe(false);
        current = { ...current, sessionId: "session-1", user: { id: "user-1", banned: true } };
        await expect(authorize(initial, "user-1", "conversation-1")).resolves.toBe(false);
        current = { headers: new Headers() };
        await expect(authorize(initial, "user-1", "conversation-1")).resolves.toBe(false);
        expect(membershipChecks).toBe(1);
      });
    }
  }

  test("Convex reactive queries authorize the current actor and participant on reevaluation", () => {
    for (const mode of ["monorepo", "single"] as const) {
      const files = generateProjectFiles(config(mode, "nextjs", "convex"));
      const messaging = content(files, "convex/messaging.ts");
      const actorGuard = content(files, "convex/lib/auth.ts");
      expect(actorGuard).toContain("tokenIdentity?.sessionId");
      expect(actorGuard).toContain('.query("identitySessions")');
      expect(actorGuard).toContain("appSession.revokedAt !== undefined");
      expect(actorGuard).toContain("appSession.expiresAt <= now");
      for (const operation of ["listMessages", "listTyping", "getAttachmentUrl"] as const) {
        const start = messaging.indexOf(`export const ${operation} = query(`);
        const end = messaging.indexOf("\n});", start);
        const handler = messaging.slice(start, end);
        expect(start, `${mode}/${operation}`).toBeGreaterThan(-1);
        expect(handler, `${mode}/${operation}`).toContain("await requireActor(ctx)");
        expect(handler, `${mode}/${operation}`).toContain("await requireParticipant(");
      }
    }
  });
});
