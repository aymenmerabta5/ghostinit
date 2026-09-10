import { describe, expect, test } from "bun:test";
import { notificationsLibFiles } from "../../src/templates/apps/fragments/lib/notifications.js";
import { notificationClientFiles } from "../../src/templates/apps/capability-clients/notifications.js";
import {
  messagingConvexNextFiles,
  messagingConvexTanstackFiles,
} from "../../src/templates/apps/fragments/messaging/index.js";
import { convexWebModelContent } from "../../src/templates/apps/fragments/messaging/web-convex-data.js";
import { z } from "zod";
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
          const composers = files.filter((file) =>
            file.path.endsWith("/features/notifications/components/notification-composer.tsx"),
          );
          expect(composers).toHaveLength(pages.length);
          for (const composer of composers) {
            expect(
              formattedLineCount(composer.path, composer.content),
              composer.path,
            ).toBeLessThanOrEqual(150);
            expect(composer.content).not.toMatch(
              /useNotificationInbox|publishSelfNotification|useAuthOwnedEffect/,
            );
          }
          for (const page of pages) {
            const featureRoot = page.path.slice(0, -"page.tsx".length);
            const read = (relative: string) => {
              const entry = files.find((file) => file.path === `${featureRoot}${relative}`);
              if (!entry) throw new Error(`Missing notification owner: ${featureRoot}${relative}`);
              return entry;
            };
            const workflow = read("use-notification-workspace.ts");
            const view = read("components/notifications-workspace.tsx");
            const queries = read("queries.ts");
            expect(formattedLineCount(page.path, page.content), page.path).toBeLessThanOrEqual(200);
            expect(formattedLineCount(view.path, view.content), view.path).toBeLessThanOrEqual(200);
            expect(page.content).toContain("<NotificationsWorkspace {...useNotificationWorkspace(");
            expect(page.content).toContain('from "./components/notifications-workspace"');
            expect(workflow.content.match(/\buseNotificationInbox\(/g)).toHaveLength(1);
            expect(workflow.content).toContain("const mutation = useAuthOwnedMutation(");
            expect(workflow.content).toContain("if (isCurrent() && result.destination)");
            expect(queries.content).toContain("authScopedQueryKey(scope,");
            expect(view.content).toContain('from "./notification-composer"');
            expect(view.content).not.toMatch(/\buseNotificationInbox\(|useAuthOwnedMutation/);
            expect(workflow.content).not.toContain("const loading = inbox.isPending;");
            expect(view.content).not.toContain(
              '<CardDescription>{t("description")}</CardDescription>',
            );
          }
          expect(notificationClientFiles({ ...options, notifications: false })).toEqual([]);
        });
      }
    }

    test(`${mode} keeps Next Convex data normalization separate without adding subscriptions`, () => {
      const files = messagingConvexNextFiles(mode);
      const thread = files.find((file) => file.path.endsWith("/components/message-thread.tsx"))!;
      const views = files.find((file) => file.path.endsWith("/model.ts"))!;
      const queries = files.find((file) => file.path.endsWith("/queries.ts"))!;
      const mutations = files.find((file) => file.path.endsWith("/mutations.ts"))!;
      expect(formattedLineCount(thread.path, thread.content)).toBeLessThanOrEqual(150);
      expect(formattedLineCount(views.path, views.content)).toBeLessThanOrEqual(150);
      expect(thread.content).toContain('import type { MessagePage } from "../model";');
      expect(thread.content).not.toMatch(/\buse(?:Query|Mutation|Effect|State)\b/);
      expect(queries.content.match(/\buseConvexQuery\(/g)).toHaveLength(3);
      expect(mutations.content).toContain("useConvexMutation(api.messaging.sendMessage)");
      expect(mutations.content).toContain("useConvexMutation(api.messaging.sendTyping)");
      expect(views.content).not.toMatch(/\buse(?:Query|Mutation|Effect|State)\b/);
      expect(
        messagingConvexTanstackFiles(mode).some((file) => file.path.endsWith("/model.ts")),
      ).toBe(true);
    });
  }

  test("the extracted Convex view boundary rejects malformed records and preserves attachments", () => {
    const { module } = generatedFormHarness(
      convexWebModelContent("generated") +
        "\nfunction messageViews(value: unknown) { return convexMessagePageSchema.parse(value); }",
      ["messageViews"],
      { z },
    );
    const normalize = module.messageViews!;
    expect(() => normalize(undefined)).toThrow();
    expect(() => normalize({ messages: "invalid" })).toThrow();
    expect(() =>
      normalize({ messages: [{ body: "missing identity" }], nextCursor: null }),
    ).toThrow();
    expect(
      normalize({
        messages: [
          {
            _id: "message-a",
            body: "Retained live message",
            attachments: [
              {
                id: "attachment-a",
                url: "https://fixture.example/attachment-a",
                originalName: "notes.txt",
              },
            ],
          },
        ],
        nextCursor: null,
      }),
    ).toEqual({
      messages: [
        {
          _id: "message-a",
          body: "Retained live message",
          attachments: [
            {
              id: "attachment-a",
              url: "https://fixture.example/attachment-a",
              originalName: "notes.txt",
            },
          ],
        },
      ],
      nextCursor: null,
    });
  });
});
