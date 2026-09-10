import { authOwnedMutationContent } from "../../src/templates/apps/fragments/auth-owned-mutation.js";
import { queryMutationHarness } from "../helpers/query-mutation-harness.js";
import { generatedFormHarness, flush } from "../helpers/generated-form-harness.js";
import { describe, expect, test } from "bun:test";
import { notificationClientFiles } from "../../src/templates/apps/capability-clients/notifications.js";
import { desktopShellFeatureFiles } from "../../src/templates/apps/desktop/shell/root.js";
import { fullDesktopCapabilities } from "../../src/templates/apps/desktop/model.js";

async function checkUpdate(result: { isUpdateAvailable: boolean } | Error): Promise<unknown[]> {
  const files = desktopShellFeatureFiles(
    { ...fullDesktopCapabilities, hasI18n: false },
    "monorepo",
  );
  const source = ["mutations.ts", "use-update-check.ts"]
    .map((name) => files.find(({ path }) => path.endsWith("/" + name))!.content)
    .join("\n");
  let operation: () => Promise<{ isUpdateAvailable: boolean }>;
  const mutation = {
    isPending: false,
    data: null as { isUpdateAvailable: boolean } | null,
    error: null as Error | null,
    reset() {
      mutation.data = null;
      mutation.error = null;
    },
    async mutateAsync() {
      mutation.isPending = true;
      try {
        mutation.data = await operation();
      } catch (cause) {
        mutation.error = cause as Error;
        throw cause;
      } finally {
        mutation.isPending = false;
      }
    },
  };
  const harness = generatedFormHarness(source, ["useUpdateCheck"], {
    useMutation: (options: { mutationFn: typeof operation }) => {
      operation = options.mutationFn;
      return mutation;
    },
    window: {
      desktopBridge: {
        updatesCheck: async () => {
          if (result instanceof Error) throw result;
          return result;
        },
      },
    },
    setTimeout: () => 0,
    clearTimeout() {},
  });
  const render = () =>
    harness.render("useUpdateCheck") as { status: unknown; check(): Promise<void> };
  const model = render();
  harness.flushEffects();
  const checked = model.check();
  const states = [render().status];
  await checked;
  states.push(render().status);
  harness.unmount();
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
    const localized = desktopShellFeatureFiles(
      { ...fullDesktopCapabilities, hasI18n: true },
      "monorepo",
    ).find(({ path }) => path.endsWith("/use-update-check.ts"))!.content;
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
          file.path.endsWith("/features/notifications/use-notification-workspace.ts"),
        )!.content;
        let failure: string | null = null;
        let invalidations = 0;
        const marked: string[] = [];
        const navigation: string[] = [];
        const devices: string[] = [];
        const mutations = queryMutationHarness();
        const harness = generatedFormHarness(
          authOwnedMutationContent() + "\n" + source,
          ["useNotificationWorkspace"],
          {
            Platform: { OS: "ios" },
            Notification: undefined,
            useMutation: mutations.useMutation,
            useQueryClient: () => ({}),
            currentQueryAuthGeneration: () => 0,
            subscribeQueryAuthGeneration: () => () => {},
            useAuthOwnedEffect: () => () => () => true,
            useRouter: () => ({ push: (path: string) => navigation.push(path) }),
            useNavigate:
              () =>
              async ({ to }: { to: string }) => {
                navigation.push(to);
              },
            useNotificationInbox: () => ({
              data: [],
              isPending: false,
              isFetching: false,
              error: null,
              refetch() {},
            }),
            useInvalidateNotificationInbox: () => async () => {
              invalidations++;
            },
            publishSelfNotification: async () => {
              if (failure) throw new Error(failure);
              return { title: "notice", body: "body" };
            },
            markNotificationRead: async (id: string) => {
              marked.push(id);
            },
            resolveNotificationDestination: (href: string) => href,
            usePushNotifications: () => ({
              requestPermission: async () => {
                if (failure) throw new Error(failure);
                return "push-token";
              },
            }),
            registerNotificationDevice: async (platform: string, token: string) => {
              devices.push(`${platform}:${token}`);
            },
          },
        );
        const render = () =>
          harness.render("useNotificationWorkspace") as {
            publish(): void;
            markRead(id: string): void;
            open(item: unknown): void;
            enablePush(): void;
            displayedError: string | null;
            pending: boolean;
          };
        for (const message of [
          "Notification access denied",
          "Expo push notifications require an EAS project ID",
        ]) {
          failure = message;
          render().publish();
          await flush();
          expect(render().displayedError).toBe(message);
          expect(render().pending).toBe(false);
        }
        expect(invalidations).toBe(0);
        if (target === "mobile") {
          render().enablePush();
          await flush();
          expect(render().displayedError).toBe(failure);
          expect(devices).toEqual([]);
        }
        failure = null;
        render().publish();
        await flush();
        expect(render().displayedError).toBeNull();
        expect(invalidations).toBe(1);
        render().markRead("notice-1");
        await flush();
        render().open({ id: "notice-2", href: "/settings", readAt: null });
        await flush();
        expect(marked).toEqual(["notice-1", "notice-2"]);
        expect(navigation).toEqual(["/settings"]);
        if (target === "mobile") {
          render().enablePush();
          await flush();
          expect(devices).toEqual(["ios:push-token"]);
        }
        expect(render().pending).toBe(false);
      });
    }
  }
});
