import type { ProjectMode } from "../../../lib/addons.js";

export function convexNotificationAdapterContent(mode: ProjectMode): string {
  const serviceImport =
    mode === "monorepo" ? "../../../../notifications/index.js" : "@/server/services/notifications";
  return `import "server-only";
import { defineConvexNotificationAdapter } from "${serviceImport}";
import { assertNotificationTokenFingerprint } from "./token-protection";

interface ConvexNotificationExecutor {
  createSelf(input: {
    kind: string; title: string; body: string; href?: string;
    data: Readonly<Record<string, string | number | boolean | null>>;
  }): Promise<{
    id: string; userId: string; kind: string; title: string; body: string; href: string | null;
    data: Readonly<Record<string, string | number | boolean | null>>;
    createdAt: number; readAt: number | null;
  }>;
  listInbox(input: { limit: number; cursor?: string; unreadOnly: boolean }): Promise<{
    items: Array<{
      id: string; userId: string; kind: string; title: string; body: string; href: string | null;
      data: Readonly<Record<string, string | number | boolean | null>>;
      createdAt: number; readAt: number | null;
    }>;
    nextCursor: string | null;
  }>;
  markRead(input: { notificationId: string }): Promise<{
    value: {
      id: string; userId: string; kind: string; title: string; body: string; href: string | null;
      data: Readonly<Record<string, string | number | boolean | null>>;
      createdAt: number; readAt: number | null;
    };
    changed: boolean;
  } | null>;
  registerDevice(input: {
    platform: "web" | "ios" | "android";
    pushToken: string;
  }): Promise<{
    kind: "registered" | "refreshed";
    changed: boolean;
    value: {
      id: string; userId: string; platform: "web" | "ios" | "android";
      tokenFingerprint: string; createdAt: number; lastSeenAt: number; disabledAt: number | null;
    };
  }>;
}

function date(value: number | null): Date | null {
  return value === null ? null : new Date(value);
}

export function createConvexNotificationAdapter(executor: ConvexNotificationExecutor) {
  return defineConvexNotificationAdapter({
    kind: "convex" as const,
    async createOwned(input) {
      const value = await executor.createSelf({
        kind: input.kind,
        title: input.title,
        body: input.body,
        ...(input.href ? { href: input.href } : {}),
        data: input.data,
      });
      if (value.userId !== input.userId) throw new Error("Convex notification actor boundary mismatch");
      return { ...value, createdAt: new Date(value.createdAt), readAt: date(value.readAt) };
    },
    async listInbox(input) {
      const page = await executor.listInbox({
        limit: input.limit,
        ...(input.cursor ? { cursor: input.cursor } : {}),
        unreadOnly: input.unreadOnly,
      });
      if (page.items.some((item) => item.userId !== input.userId)) {
        throw new Error("Convex notification actor boundary mismatch");
      }
      return {
        items: page.items.map((item) => ({ ...item, createdAt: new Date(item.createdAt), readAt: date(item.readAt) })),
        nextCursor: page.nextCursor,
      };
    },
    async markReadOwned(input) {
      const result = await executor.markRead({ notificationId: input.notificationId });
      if (!result) return null;
      if (result.value.userId !== input.userId) throw new Error("Convex notification actor boundary mismatch");
      return {
        changed: result.changed,
        value: { ...result.value, createdAt: new Date(result.value.createdAt), readAt: date(result.value.readAt) },
      };
    },
    async registerDeviceOwned(input) {
      assertNotificationTokenFingerprint(input.pushToken, input.tokenFingerprint);
      let result: Awaited<ReturnType<ConvexNotificationExecutor["registerDevice"]>>;
      try {
        result = await executor.registerDevice({
          platform: input.platform,
          pushToken: input.pushToken,
        });
      } catch (error) {
        const data = error && typeof error === "object" ? Reflect.get(error, "data") : null;
        if (data && typeof data === "object" && Reflect.get(data, "code") === "DEVICE_OWNED_BY_OTHER_ACTOR") {
          return { kind: "owned-by-other-actor" as const };
        }
        throw error;
      }
      if (result.value.userId !== input.userId) return { kind: "owned-by-other-actor" as const };
      if (result.value.tokenFingerprint !== input.tokenFingerprint) {
        throw new Error("Convex notification token boundary mismatch");
      }
      return {
        kind: result.kind,
        result: {
          changed: result.changed,
          value: {
            ...result.value,
            createdAt: new Date(result.value.createdAt),
            lastSeenAt: new Date(result.value.lastSeenAt),
            disabledAt: date(result.value.disabledAt),
          },
        },
      };
    },
  });
}
`;
}
