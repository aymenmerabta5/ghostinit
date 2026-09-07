import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { notificationsServiceFiles } from "../../../src/templates/services/notifications/index.js";
import { expectErrorCode, importRenderedService } from "./runtime.js";

interface Actor {
  userId: string;
}

interface NotificationRecord {
  id: string;
  userId: string;
  kind: string;
  title: string;
  body: string;
  href: string | null;
  data: Readonly<Record<string, string | number | boolean | null>>;
  createdAt: Date;
  readAt: Date | null;
}

interface DeviceRegistration {
  id: string;
  userId: string;
  platform: "web" | "ios" | "android";
  tokenFingerprint: string;
  createdAt: Date;
  lastSeenAt: Date;
  disabledAt: Date | null;
}

interface NotificationServiceModule {
  createNotificationService(dependencies: {
    repository: ReturnType<typeof createHarness>["repository"];
    deviceTokens: { fingerprint(token: string): string };
    now: () => Date;
  }): {
    publish(
      actor: Actor,
      input: { kind: string; title: string; body: string; href?: string },
    ): Promise<NotificationRecord>;
    listInbox(
      actor: Actor,
      input?: { unreadOnly?: boolean },
    ): Promise<{ items: NotificationRecord[] }>;
    markRead(
      actor: Actor,
      notificationId: string,
    ): Promise<{ value: NotificationRecord; changed: boolean }>;
    registerDevice(
      actor: Actor,
      input: { platform: "web" | "ios" | "android"; pushToken: string },
    ): Promise<{ value: DeviceRegistration; changed: boolean }>;
  };
}

const now = new Date("2026-01-02T03:04:05.000Z");
let generated: NotificationServiceModule;
let runtimeRoot = "";

beforeAll(async () => {
  const loaded = await importRenderedService<NotificationServiceModule>(
    "notifications",
    "src/server/services/notifications/",
    notificationsServiceFiles("single"),
  );
  generated = loaded.module;
  runtimeRoot = loaded.root;
});

afterAll(() => {
  if (runtimeRoot) rmSync(runtimeRoot, { recursive: true, force: true });
});

function createHarness() {
  const notifications: NotificationRecord[] = [
    {
      id: "notification-a",
      userId: "user-a",
      kind: "billing.updated",
      title: "Updated",
      body: "Your subscription changed",
      href: "/billing",
      data: {},
      createdAt: now,
      readAt: null,
    },
    {
      id: "notification-b",
      userId: "user-b",
      kind: "security.alert",
      title: "Security alert",
      body: "A new session was created",
      href: null,
      data: {},
      createdAt: now,
      readAt: null,
    },
  ];
  const devices: DeviceRegistration[] = [];

  const repository = {
    async createOwned(input: Omit<NotificationRecord, "id" | "readAt">) {
      const value: NotificationRecord = {
        ...input,
        id: `notification-${notifications.length + 1}`,
        readAt: null,
      };
      notifications.push(value);
      return value;
    },
    async listInbox(input: {
      userId: string;
      limit: number;
      unreadOnly: boolean;
      cursor?: string;
    }) {
      const items = notifications
        .filter(
          (entry) => entry.userId === input.userId && (!input.unreadOnly || entry.readAt === null),
        )
        .slice(0, input.limit);
      return { items, nextCursor: null };
    },
    async markReadOwned(input: { notificationId: string; userId: string; readAt: Date }) {
      const record = notifications.find(
        (entry) => entry.id === input.notificationId && entry.userId === input.userId,
      );
      if (!record) return null;
      if (record.readAt) return { value: record, changed: false };
      record.readAt = input.readAt;
      return { value: record, changed: true };
    },
    async registerDeviceOwned(input: {
      userId: string;
      platform: "web" | "ios" | "android";
      tokenFingerprint: string;
      registeredAt: Date;
    }) {
      const existing = devices.find((entry) => entry.tokenFingerprint === input.tokenFingerprint);
      if (existing && existing.userId !== input.userId) {
        return { kind: "owned-by-other-actor" as const };
      }
      if (existing) {
        const changed = existing.platform !== input.platform || existing.disabledAt !== null;
        existing.platform = input.platform;
        existing.disabledAt = null;
        existing.lastSeenAt = input.registeredAt;
        return { kind: "refreshed" as const, result: { value: existing, changed } };
      }
      const registration: DeviceRegistration = {
        id: `device-${devices.length + 1}`,
        userId: input.userId,
        platform: input.platform,
        tokenFingerprint: input.tokenFingerprint,
        createdAt: input.registeredAt,
        lastSeenAt: input.registeredAt,
        disabledAt: null,
      };
      devices.push(registration);
      return { kind: "registered" as const, result: { value: registration, changed: true } };
    },
  };

  return { repository, notifications, devices };
}

function setup() {
  const harness = createHarness();
  const service = generated.createNotificationService({
    repository: harness.repository,
    deviceTokens: { fingerprint: (token) => `fingerprint:${token}` },
    now: () => now,
  });
  return { harness, service };
}

describe("generated notification service behavior", () => {
  test("publishes a bounded notification only to the actor inbox", async () => {
    const { service } = setup();
    const created = await service.publish(
      { userId: "user-a" },
      { kind: "user.note", title: "Note", body: "Created from the client", href: "/notifications" },
    );
    expect(created.userId).toBe("user-a");
    expect((await service.listInbox({ userId: "user-a" })).items.map(({ id }) => id)).toContain(
      created.id,
    );
    await expectErrorCode(
      service.publish({ userId: "user-a" }, { kind: "INVALID KIND", title: "Note", body: "No" }),
      "NOTIFICATION_INVALID_CONTENT",
    );
  });

  test("lists only the actor inbox and rejects cross-user mark-read", async () => {
    const { harness, service } = setup();
    const page = await service.listInbox({ userId: "user-a" });
    expect(page.items.map(({ id }) => id)).toEqual(["notification-a"]);

    await expectErrorCode(
      service.markRead({ userId: "user-a" }, "notification-b"),
      "NOTIFICATION_NOT_FOUND",
    );
    expect(harness.notifications.find(({ id }) => id === "notification-b")?.readAt).toBeNull();
  });

  test("marks owned notifications idempotently", async () => {
    const { service } = setup();
    const first = await service.markRead({ userId: "user-a" }, "notification-a");
    const replay = await service.markRead({ userId: "user-a" }, "notification-a");
    expect(first.changed).toBe(true);
    expect(first.value.readAt).toEqual(now);
    expect(replay.changed).toBe(false);
  });

  test("registers a device idempotently and never transfers it across actors", async () => {
    const { harness, service } = setup();
    const input = { platform: "web" as const, pushToken: "push-token-with-enough-entropy" };
    const first = await service.registerDevice({ userId: "user-a" }, input);
    const replay = await service.registerDevice({ userId: "user-a" }, input);
    expect(first.changed).toBe(true);
    expect(replay.changed).toBe(false);
    expect(harness.devices).toHaveLength(1);

    await expectErrorCode(
      service.registerDevice({ userId: "user-b" }, input),
      "NOTIFICATION_DEVICE_OWNED_BY_OTHER_ACTOR",
    );
    expect(harness.devices[0]?.userId).toBe("user-a");
  });
});
