import { describe, expect, test } from "bun:test";
import { notificationClientFiles } from "../../src/templates/apps/capability-clients/notifications.js";
import { desktopRouteRootContent } from "../../src/templates/apps/desktop/shell/root.js";
import { fullDesktopCapabilities } from "../../src/templates/apps/desktop/model.js";

async function checkUpdate(result: { isUpdateAvailable: boolean } | Error): Promise<unknown[]> {
  const source = desktopRouteRootContent({ ...fullDesktopCapabilities, hasI18n: false });
  const start = source.indexOf("  const check = React.useCallback");
  const fragment = source.slice(start, source.indexOf("\n  return <Button", start));
  const executable = new Bun.Transpiler({ loader: "tsx" }).transformSync(fragment);
  const states: unknown[] = [];
  const check = new Function(
    "React",
    "window",
    "setStatus",
    "timeoutRef",
    "setTimeout",
    "clearTimeout",
    executable + ";return check;",
  )(
    { useCallback: (callback: () => Promise<void>) => callback },
    {
      desktopBridge: {
        updatesCheck: async () => {
          if (result instanceof Error) throw result;
          return result;
        },
      },
    },
    (value: unknown) => states.push(value),
    { current: null },
    () => 0,
    () => {},
  ) as () => Promise<void>;
  await check();
  return states;
}

describe("native feature action outcomes", () => {
  test("desktop distinguishes available updates from current versions and check failures", async () => {
    expect(await checkUpdate({ isUpdateAvailable: true })).toEqual([
      "Checking…",
      "Update available",
    ]);
    expect(await checkUpdate({ isUpdateAvailable: false })).toEqual(["Checking…", "Up to date"]);
    expect(await checkUpdate(new Error("Update server unavailable"))).toEqual([
      "Checking…",
      "Update server unavailable",
    ]);
    const localized = desktopRouteRootContent({ ...fullDesktopCapabilities, hasI18n: true });
    expect(localized).toContain('t("updatesAvailable")');
  });

  for (const framework of ["nextjs", "tanstack-start"] as const) {
    for (const target of ["mobile", "desktop"] as const) {
      test(`${framework}/${target} presents rejected notification actions without an unhandled rejection`, async () => {
        const files = notificationClientFiles({
          mode: "monorepo",
          framework,
          apps: [target],
          notifications: true,
          storage: false,
          featureFlags: false,
          jobs: false,
          i18n: false,
          requestApplication: true,
        });
        const source = files.find((file) =>
          file.path.endsWith("/features/notifications/page.tsx"),
        )!.content;
        const start = source.indexOf("  async function runAction");
        const fragment = source.slice(
          start,
          source.indexOf("  async function openNotification", start),
        );
        const executable = new Bun.Transpiler({ loader: "ts" }).transformSync(fragment);
        const errors: unknown[] = [];
        const runAction = new Function("setError", executable + ";return runAction;")(
          (value: unknown) => errors.push(value),
        ) as (action: () => Promise<void>) => Promise<void>;
        for (const message of [
          "Notification access denied",
          "Expo push notifications require an EAS project ID",
        ]) {
          await expect(
            runAction(async () => {
              throw new Error(message);
            }),
          ).resolves.toBeUndefined();
          expect(errors.at(-1)).toBe(message);
        }
        await runAction(async () => {});
        expect(errors.at(-1)).toBeNull();
        expect(source).toContain("void runAction(() => openNotification(item))");
        expect(source).toContain(
          "void runAction(async () => { await markNotificationRead(item.id); await refresh(); })",
        );
        if (target === "mobile") {
          expect(source).toContain("void runAction(async () => { const platform = Platform.OS;");
          expect(source).toContain("if (token) await registerNotificationDevice(platform, token)");
        }
      });
    }
  }
});
