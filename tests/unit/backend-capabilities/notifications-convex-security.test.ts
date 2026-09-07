import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseSync } from "oxc-parser";
import { notificationAdapterFiles } from "../../../src/templates/adapters/notifications/index.js";

const roots: string[] = [];

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function rendered(path: string): string {
  const entry = notificationAdapterFiles({ mode: "single", database: "convex" }).find(
    (candidate) => candidate.path === path,
  );
  if (!entry) throw new Error(`Missing rendered notification adapter file: ${path}`);
  return entry.content;
}

async function importProtection(content: string, name: string) {
  const root = mkdtempSync(join(tmpdir(), `ghostinit-${name}-`));
  roots.push(root);
  const path = join(root, `${name}.ts`);
  writeFileSync(path, content.replace('import "server-only";\n', ""));
  return await import(`${path}?nonce=${crypto.randomUUID()}`);
}

describe("Convex notification security boundary", () => {
  test("accepts only raw device input and owns derived values and clocks", () => {
    const functions = rendered("convex/notifications.ts");
    const protection = rendered("convex/lib/notification-token-protection.ts");
    const adapter = rendered(
      "src/server/services/application/composition/adapters/notifications/convex.ts",
    );

    for (const [path, content] of [
      ["convex/notifications.ts", functions],
      ["convex/lib/notification-token-protection.ts", protection],
      ["src/server/services/application/composition/adapters/notifications/convex.ts", adapter],
    ] as const) {
      expect(parseSync(path, content).errors, path).toEqual([]);
    }

    expect(functions).toContain('args: { notificationId: v.id("notifications") }');
    expect(functions).toContain("const readAt = notification.readAt ?? Date.now()");
    expect(functions).toContain("args: { platform, pushToken: v.string() }");
    expect(functions).toContain("pushToken = requireNotificationDeviceToken(args.pushToken)");
    expect(functions).toContain("const registeredAt = Date.now()");
    expect(functions).toContain("protectNotificationDeviceToken(pushToken)");
    expect(functions).toContain("fingerprintNotificationDeviceToken(pushToken)");
    expect(functions).not.toContain("readAt: v.number()");
    expect(functions).not.toContain("registeredAt: v.number()");
    expect(functions).not.toContain("encryptedToken: v.string()");
    expect(functions).not.toContain("tokenFingerprint: v.string()");

    expect(adapter).toContain("markRead(input: { notificationId: string })");
    expect(adapter).toContain("pushToken: string;");
    expect(adapter).not.toContain("encryptedToken: string;");
    expect(adapter).not.toContain("registeredAt: number;");
  });

  test("uses a Convex-runtime implementation compatible with host fingerprints", async () => {
    const previous = process.env.NOTIFICATION_TOKEN_ENCRYPTION_KEY;
    process.env.NOTIFICATION_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 11).toString("base64url");
    try {
      const convex = await importProtection(
        rendered("convex/lib/notification-token-protection.ts"),
        "convex-token-protection",
      );
      const host = await importProtection(
        rendered(
          "src/server/services/application/composition/adapters/notifications/token-protection.ts",
        ),
        "host-token-protection",
      );
      const token = "push-token-with-enough-entropy-123456789";

      expect(convex.requireNotificationDeviceToken(`  ${token}  `)).toBe(token);
      expect(await convex.fingerprintNotificationDeviceToken(token)).toBe(
        host.fingerprintNotificationDeviceToken(token),
      );
      const first = (await convex.protectNotificationDeviceToken(token)) as string;
      const second = (await convex.protectNotificationDeviceToken(token)) as string;
      expect(first.split(".")).toHaveLength(4);
      expect(first).not.toContain(token);
      expect(first).not.toBe(second);
      expect(() => convex.requireNotificationDeviceToken("too-short")).toThrow();
    } finally {
      if (previous === undefined) delete process.env.NOTIFICATION_TOKEN_ENCRYPTION_KEY;
      else process.env.NOTIFICATION_TOKEN_ENCRYPTION_KEY = previous;
    }
  });

  test("fails closed when the Convex deployment key is absent or invalid", async () => {
    const previous = process.env.NOTIFICATION_TOKEN_ENCRYPTION_KEY;
    try {
      const convex = await importProtection(
        rendered("convex/lib/notification-token-protection.ts"),
        "convex-token-fail-closed",
      );
      delete process.env.NOTIFICATION_TOKEN_ENCRYPTION_KEY;
      await expect(convex.fingerprintNotificationDeviceToken("x".repeat(32))).rejects.toThrow(
        "Notification token protection is unavailable",
      );
      process.env.NOTIFICATION_TOKEN_ENCRYPTION_KEY = "not-a-valid-key";
      await expect(convex.protectNotificationDeviceToken("x".repeat(32))).rejects.toThrow(
        "Notification token protection is unavailable",
      );
    } finally {
      if (previous === undefined) delete process.env.NOTIFICATION_TOKEN_ENCRYPTION_KEY;
      else process.env.NOTIFICATION_TOKEN_ENCRYPTION_KEY = previous;
    }
  });
});
