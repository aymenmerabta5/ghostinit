import { describe, expect, test } from "bun:test";
import { notificationsLibFiles } from "../../src/templates/apps/fragments/lib/notifications.js";
import { notificationClientFiles } from "../../src/templates/apps/capability-clients/notifications.js";
import {
  messagingConvexNextFiles,
  messagingConvexTanstackFiles,
} from "../../src/templates/apps/fragments/messaging/index.js";
import { convexNextMessageViewsContent } from "../../src/templates/apps/fragments/messaging/convex-next-data.js";
import { generatedFormHarness } from "../helpers/generated-form-harness.js";

const formattedCounts = new Map<string, number>();

function formattedLineCount(filename: string, source: string): number {
  const existing = formattedCounts.get(source);
  if (existing !== undefined) return existing;
  const result = Bun.spawnSync(
    [process.execPath, "x", "--no-install", "oxfmt", "--stdin-filepath", filename],
    { stdin: new TextEncoder().encode(source), stdout: "pipe", stderr: "pipe" },
  );
  expect(result.exitCode, new TextDecoder().decode(result.stderr)).toBe(0);
  const count = new TextDecoder().decode(result.stdout).split(/\r?\n/).length;
  formattedCounts.set(source, count);
  return count;
}

describe("formatted notification and Convex messaging boundaries", () => {
  for (const mode of ["single", "monorepo"] as const) {
    test(`${mode} keeps the bell item contract outside the bounded presenter`, () => {
      const root = mode === "single" ? "src" : "apps/web/src";
      const files = notificationsLibFiles(root);
      const bell = files.find((file) => file.path.endsWith("/NotificationBell.tsx"))!;
      const library = files.find((file) => file.path.endsWith("/lib/notifications.ts"))!;
      expect(formattedLineCount(bell.path, bell.content)).toBeLessThanOrEqual(150);
      expect(library.content).toContain("export interface NotificationItem");
      expect(bell.content).toContain("export type NotificationItem = BellNotificationItem;");
      expect(bell.content).not.toContain("export interface NotificationItem");
    });

    for (const framework of ["nextjs", "tanstack-start"] as const) {
      for (const i18n of [false, true]) {
        test(`${mode}/${framework}/i18n=${i18n} formats every selected DOM notification page within its limit`, () => {
          const options = {
            mode,
            framework,
            apps: ["web", "mobile", "desktop"],
            notifications: true,
            storage: false,
            featureFlags: false,
            jobs: false,
            i18n,
            requestApplication: true,
          } as const;
          const files = notificationClientFiles(options);
          const pages = files.filter(
            (file) =>
              file.path.endsWith("/features/notifications/page.tsx") &&
              !file.path.startsWith("apps/mobile/"),
          );
          expect(pages).toHaveLength(mode === "single" ? 1 : 2);
          for (const page of pages) {
            expect(formattedLineCount(page.path, page.content), page.path).toBeLessThanOrEqual(200);
            expect(page.content.match(/\buseNotificationInbox\(/g)).toHaveLength(1);
            expect(page.content).toContain("const isCurrent = captureEffect();");
            expect(page.content).not.toContain("const loading = inbox.isPending;");
            expect(page.content).not.toContain(
              '<CardDescription>{t("description")}</CardDescription>',
            );
          }
          expect(notificationClientFiles({ ...options, notifications: false })).toEqual([]);
        });
      }
    }

    test(`${mode} keeps Next Convex data normalization separate without adding subscriptions`, () => {
      const files = messagingConvexNextFiles(mode);
      const thread = files.find((file) => file.path.endsWith("/convex-message-thread.tsx"))!;
      const views = files.find((file) => file.path.endsWith("/convex-message-views.ts"))!;
      expect(formattedLineCount(thread.path, thread.content)).toBeLessThanOrEqual(150);
      expect(formattedLineCount(views.path, views.content)).toBeLessThanOrEqual(150);
      expect(thread.content).toContain('import { messageViews } from "./convex-message-views";');
      expect(thread.content.match(/\buseQuery\(/g)).toHaveLength(2);
      expect(thread.content).toContain("useMutation(api.messaging.sendMessage)");
      expect(thread.content).toContain("useMutation(api.messaging.sendTyping)");
      expect(views.content).not.toMatch(/\buse(?:Query|Mutation|Effect|State)\b/);
      expect(
        messagingConvexTanstackFiles(mode).some((file) =>
          file.path.endsWith("/convex-message-views.ts"),
        ),
      ).toBe(false);
    });
  }

  test("the extracted Convex view boundary rejects malformed records and preserves attachments", () => {
    const { module } = generatedFormHarness(convexNextMessageViewsContent(), ["messageViews"]);
    const normalize = module.messageViews!;
    expect(normalize(undefined)).toEqual([]);
    expect(normalize({ messages: "invalid" })).toEqual([]);
    expect(
      normalize({
        messages: [
          null,
          { body: "missing identity" },
          {
            _id: "message-a",
            body: "Retained live message",
            attachments: [
              { id: "attachment-a", url: "/attachment-a", originalName: "notes.txt" },
              { id: "attachment-b", url: false, originalName: "invalid.txt" },
            ],
          },
        ],
      }),
    ).toEqual([
      {
        id: "message-a",
        body: "Retained live message",
        attachments: [{ id: "attachment-a", url: "/attachment-a", originalName: "notes.txt" }],
      },
    ]);
  });
});
