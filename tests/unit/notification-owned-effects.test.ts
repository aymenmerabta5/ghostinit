import { describe, expect, test } from "bun:test";
import { authOwnedEffectContent } from "../../src/templates/apps/fragments/auth-owned-effect.js";
import { generatedUiOutput } from "../helpers/generated-ui-output.js";
import {
  deferred,
  elements,
  flush,
  generatedFormHarness,
  textContent,
} from "../helpers/generated-form-harness.js";

function ownerHarness() {
  let generation = 0;
  let cleanup = () => {};
  let reference: { current: unknown } | undefined;
  const queryClient = {};
  const hook = generatedFormHarness(authOwnedEffectContent(), ["useAuthOwnedEffect"], {
    React: {
      useRef: (initial: unknown) => (reference ??= { current: initial }),
      useLayoutEffect: (effect: () => () => void) => {
        cleanup = effect();
      },
      useCallback: (callback: unknown) => callback,
    },
    useQueryClient: () => queryClient,
    currentQueryAuthGeneration: () => generation,
  });
  const capture = hook.module.useAuthOwnedEffect!() as () => () => boolean;
  return {
    capture,
    changeOwner: () => {
      generation += 1;
    },
    unmount: () => cleanup(),
  };
}

const item = {
  id: "owner-a-notification",
  kind: "user.note",
  title: "Owned notice",
  body: "Owned body",
  href: "/settings",
  readAt: null,
  createdAt: "2026-09-07T00:00:00.000Z",
};

function pageHarness(
  framework: "nextjs" | "tanstack-start",
  target: "web" | "mobile" | "desktop",
  mode: "single" | "monorepo",
) {
  const output = generatedUiOutput(framework, mode);
  const root =
    target === "web"
      ? output.root
      : target === "mobile"
        ? "apps/mobile/src"
        : "apps/desktop/src/renderer";
  const owner = ownerHarness();
  const request = deferred<void>();
  const navigations: string[] = [];
  let marks = 0;
  let invalidations = 0;
  const ui = generatedFormHarness(
    output.read(`${root}/features/notifications/page.tsx`),
    ["NotificationsPage"],
    {
      ...Object.fromEntries(
        [
          "ScrollView",
          "View",
          "Text",
          "Input",
          "Textarea",
          "Field",
          "FieldLabel",
          "Empty",
          "EmptyHeader",
          "EmptyTitle",
          "EmptyDescription",
          "NotificationComposer",
        ].map((name) => [name, name]),
      ),
      Platform: { OS: "ios" },
      usePushNotifications: () => ({}),
      useTranslations: () => (key: string) => key,
      useAuthOwnedEffect: () => owner.capture,
      useRouter: () => ({ push: (destination: string) => navigations.push(destination) }),
      useNavigate:
        () =>
        async ({ to }: { to: string }) => {
          navigations.push(to);
        },
      resolveNotificationDestination: (href: string) => href,
      useNotificationInbox: () => ({
        data: [item],
        isPending: false,
        isFetching: false,
        error: null,
        refetch: async () => {},
      }),
      useInvalidateNotificationInbox: () => async () => {
        invalidations += 1;
      },
      markNotificationRead: () => {
        marks += 1;
        return request.promise;
      },
    },
  );
  const start = () => {
    const tree = ui.render("NotificationsPage", { initialItems: [item] });
    const open = elements(tree).find(
      (node) => node.type === "Button" && textContent(node) === "open",
    );
    if (!open) throw new Error("Missing notification open action");
    (open.props[target === "mobile" ? "onPress" : "onClick"] as () => void)();
  };
  return {
    owner,
    request,
    navigations,
    start,
    marks: () => marks,
    invalidations: () => invalidations,
  };
}

describe("notification follow-up effects remain with their initiating UI owner", () => {
  for (const framework of ["nextjs", "tanstack-start"] as const) {
    for (const [mode, target] of [
      ["single", "web"],
      ["monorepo", "web"],
      ["monorepo", "mobile"],
      ["monorepo", "desktop"],
    ] as const) {
      for (const transition of ["account", "unmount", "none"] as const) {
        test(`${mode}/${framework}/${target} ${transition} during mark-read controls subsequent navigation`, async () => {
          const harness = pageHarness(framework, target, mode);
          harness.start();
          expect(harness.marks()).toBe(1);
          if (transition === "account") harness.owner.changeOwner();
          if (transition === "unmount") harness.owner.unmount();
          harness.request.resolve();
          await flush();
          expect(harness.navigations).toEqual(transition === "none" ? ["/settings"] : []);
          expect(harness.invalidations()).toBe(transition === "none" ? 1 : 0);
        });
      }
    }
    for (const transition of ["account", "unmount", "none"] as const) {
      test(`${framework}/${transition} bell checks its captured owner after mark-read and inbox refresh`, async () => {
        const output = generatedUiOutput(framework);
        const owner = ownerHarness();
        const request = deferred<void>();
        const navigations: string[] = [];
        let marks = 0;
        const adapter = generatedFormHarness(
          output.read(`${output.root}/features/notifications/bell.tsx`),
          ["NotificationInboxBell"],
          {
            NotificationBell: "NotificationBell",
            useAuthOwnedEffect: () => owner.capture,
            useRouter: () => ({ push: (href: string) => navigations.push(href) }),
            useNavigate:
              () =>
              ({ to }: { to: string }) => {
                navigations.push(to);
              },
            useNotificationInbox: () => ({ data: [item] }),
            useInvalidateNotificationInbox: () => async () => {},
            markNotificationRead: () => {
              marks += 1;
              return request.promise;
            },
          },
        );
        const props = elements(adapter.render("NotificationInboxBell"))[0]!.props;
        const ui = generatedFormHarness(
          output.read(`${output.root}/components/NotificationBell.tsx`),
          ["NotificationBell"],
          {
            ...Object.fromEntries(
              [
                "Bell",
                "Badge",
                "Popover",
                "PopoverTrigger",
                "PopoverContent",
                "PopoverTitle",
                "PopoverDescription",
                "Empty",
                "EmptyHeader",
                "EmptyTitle",
                "EmptyDescription",
              ].map((name) => [name, name]),
            ),
            formatNotification: () => ({ title: "Owned notice", message: "Owned body" }),
            getNotificationHref: () => ({ href: "/settings" }),
          },
        );
        const button = elements(ui.render("NotificationBell", props)).find(
          (node) => node.type === "Button" && typeof node.props.onClick === "function",
        )!;
        const completion = (button.props.onClick as () => Promise<void>)();
        expect(marks).toBe(1);
        if (transition === "account") owner.changeOwner();
        if (transition === "unmount") owner.unmount();
        request.resolve();
        await completion;
        expect(navigations).toEqual(transition === "none" ? ["/settings"] : []);
      });
    }
  }
});
