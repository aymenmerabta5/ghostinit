import { describe, expect, test } from "bun:test";
import { generatedUiOutput } from "../helpers/generated-ui-output.js";
import {
  deferred,
  elements,
  flush,
  generatedFormHarness,
  textContent,
} from "../helpers/generated-form-harness.js";

type Item = {
  id: string;
  kind: string;
  title: string;
  body: string;
  href: string;
  createdAt: string;
  readAt: string | null;
};
const scopeA = { userId: "member-a", sessionId: "session-a", tenantId: null, teamId: null };
const scopeB = { userId: "member-b", sessionId: "session-b", tenantId: null, teamId: null };

function setup(framework: "nextjs" | "tanstack-start", mode: "monorepo" | "single") {
  const output = generatedUiOutput(framework, mode);
  const records: Item[] = [];
  const cache = {
    data: [] as Item[],
    isPending: false,
    isFetching: false,
    error: null as Error | null,
    async refetch() {
      cache.error = null;
      cache.data = records.map((item) => ({ ...item }));
    },
  };
  const invalidations: unknown[] = [];
  const client = {
    async invalidateQueries(options: unknown) {
      invalidations.push(options);
      await cache.refetch();
    },
  };
  let scope: typeof scopeA | null = scopeA;
  let hydrating = false;
  let queryOptions: { queryKey: unknown[]; enabled: boolean; initialData?: unknown[] } | null =
    null;
  const queries = generatedFormHarness(
    output.read(`${output.root}/features/notifications/queries.ts`),
    ["useNotificationInbox", "useInvalidateNotificationInbox", "notificationInboxQueryOptions"],
    {
      useCallback: (callback: unknown) => callback,
      useSyncExternalStore: (_subscribe: unknown, client: () => boolean, server: () => boolean) =>
        hydrating ? server() : client(),
      useQueryClient: () => client,
      useQuery: (options: typeof queryOptions) => {
        queryOptions = options;
        return cache;
      },
      currentQueryAuthScope: () => scope,
      queryAuthScopeSignature: (value: unknown) => JSON.stringify(value),
      authScopedQueryKey: (value: { userId: string }, key: unknown[]) => [value.userId, ...key],
      orpcClient: {
        notifications: {
          async listInbox() {
            return { items: records.map((item) => ({ ...item })) };
          },
        },
      },
    },
  );
  const invalidator = queries.render("useInvalidateNotificationInbox") as () => Promise<void>;
  const first = deferred<void>();
  const second = deferred<void>();
  const queue = [first, second];
  let creates = 0;
  const bindings = {
    useAuthOwnedEffect: () => () => () => true,
    useNotificationInbox: () => queries.render("useNotificationInbox"),
    useInvalidateNotificationInbox: () => invalidator,
    useRouter: () => ({ push() {} }),
    useNavigate: () => async () => {},
    resolveNotificationDestination: (href: string) => href,
    async publishSelfNotification(input: { title: string; body: string }) {
      creates += 1;
      const next = queue.shift();
      if (!next) throw new Error("Duplicate notification");
      await next.promise;
      const item = {
        id: "created-notification",
        kind: "user.note",
        href: "/notifications",
        createdAt: new Date().toISOString(),
        readAt: null,
        ...input,
      };
      records.push(item);
      return item;
    },
    async markNotificationRead(id: string) {
      const index = records.findIndex((item) => item.id === id);
      if (index >= 0) records[index] = { ...records[index]!, readAt: new Date().toISOString() };
    },
    Input: "Input",
    Textarea: "Textarea",
    Field: "Field",
    FieldLabel: "FieldLabel",
    Empty: "Empty",
    EmptyHeader: "EmptyHeader",
    EmptyTitle: "EmptyTitle",
    EmptyDescription: "EmptyDescription",
  };
  return {
    output,
    records,
    cache,
    invalidations,
    client,
    queries,
    bindings,
    first,
    second,
    creates: () => creates,
    currentQueryOptions: () => queryOptions,
    setHydrating: (value: boolean) => {
      hydrating = value;
    },
    clearOwner: () => {
      scope = null;
    },
    switchOwner: () => {
      scope = scopeB;
    },
  };
}

describe("notification inbox and bell consistency", () => {
  for (const mode of ["single", "monorepo"] as const) {
    test(`${mode}/nextjs preserves the owned RSC snapshot only during hydration and waits for canonical identity before fetching`, () => {
      const testCase = setup("nextjs", mode);
      const useInbox = testCase.queries.module.useNotificationInbox as (
        items: unknown[],
        scope: unknown,
      ) => unknown;
      const initial = [{ id: "private-owner-a-item" }];
      testCase.clearOwner();
      testCase.setHydrating(true);
      useInbox(initial, scopeA);
      expect(testCase.currentQueryOptions()).toMatchObject({
        queryKey: [scopeA.userId, "notifications", "inbox"],
        enabled: false,
        initialData: initial,
      });
      testCase.setHydrating(false);
      useInbox(initial, scopeA);
      expect(testCase.currentQueryOptions()).toEqual({
        queryKey: ["auth", "anonymous", "notifications"],
        queryFn: expect.any(Function),
        enabled: false,
      });
      testCase.switchOwner();
      testCase.setHydrating(true);
      useInbox(initial, scopeA);
      expect(testCase.currentQueryOptions()).toMatchObject({
        queryKey: [scopeB.userId, "notifications", "inbox"],
        enabled: true,
      });
      expect(testCase.currentQueryOptions()?.initialData).toBeUndefined();
    });
  }

  for (const framework of ["nextjs", "tanstack-start"] as const) {
    for (const mode of ["single", "monorepo"] as const) {
      test(`${mode}/${framework} coalesces create, recovers from failure, and updates both surfaces after bell read`, async () => {
        const testCase = setup(framework, mode);
        const page = generatedFormHarness(
          testCase.output.read(`${testCase.output.root}/features/notifications/page.tsx`),
          ["NotificationsPage"],
          { ...testCase.bindings, NotificationComposer: "NotificationComposer" },
        );
        const composer = generatedFormHarness(
          testCase.output.read(
            `${testCase.output.root}/features/notifications/components/notification-composer.tsx`,
          ),
          ["NotificationComposer"],
          testCase.bindings,
        );
        const bell = generatedFormHarness(
          testCase.output.read(`${testCase.output.root}/features/notifications/bell.tsx`),
          ["NotificationInboxBell"],
          { ...testCase.bindings, NotificationBell: "NotificationBell" },
        );
        const render = () => {
          const tree = page.render("NotificationsPage", { initialItems: [], initialScope: scopeA });
          const controlled = elements(tree).find((node) => node.type === "NotificationComposer");
          if (!controlled) throw new Error("Missing controlled notification composer");
          return [tree, composer.render("NotificationComposer", controlled.props)];
        };
        const titleInput = elements(render()).find(
          (node) => node.props.id === "notification-title",
        )!;
        const bodyInput = elements(render()).find((node) => node.props.id === "notification-body")!;
        expect(titleInput.props).toMatchObject({ required: true, maxLength: 160 });
        expect(bodyInput.props.maxLength).toBe(2000);
        (titleInput.props.onChange as (event: unknown) => void)({
          target: { value: "Reviewed title" },
        });
        (bodyInput.props.onChange as (event: unknown) => void)({
          target: { value: "Reviewed body" },
        });
        const form = elements(render()).find((node) => node.type === "form")!;
        const submit = form.props.onSubmit as (event: unknown) => void;
        submit({ preventDefault() {} });
        submit({ preventDefault() {} });
        expect(testCase.creates()).toBe(1);
        expect(
          elements(render()).find((node) => node.type === "Button" && node.props.type === "submit")
            ?.props.disabled,
        ).toBe(true);
        testCase.first.reject(new Error("Notification endpoint unavailable"));
        await flush();
        expect(textContent(render())).toContain("Notification endpoint unavailable");
        expect(
          elements(render()).find((node) => node.props.id === "notification-title")?.props.value,
        ).toBe("Reviewed title");
        expect(
          elements(render()).find((node) => node.props.id === "notification-body")?.props.value,
        ).toBe("Reviewed body");
        expect(testCase.invalidations).toHaveLength(0);
        const retryForm = elements(render()).find((node) => node.type === "form")!;
        (retryForm.props.onSubmit as (event: unknown) => void)({ preventDefault() {} });
        testCase.second.resolve();
        await flush();
        expect(testCase.creates()).toBe(2);
        expect(testCase.records[0]).toMatchObject({
          title: "Reviewed title",
          body: "Reviewed body",
        });
        expect(testCase.invalidations).toEqual([
          { queryKey: [scopeA.userId, "notifications", "inbox"] },
        ]);
        const bellView = elements(bell.render("NotificationInboxBell")).find(
          (node) => node.type === "NotificationBell",
        )!;
        expect(
          (bellView.props.notifications as Item[]).filter((item) => item.readAt === null),
        ).toHaveLength(1);
        await (bellView.props.onMarkRead as (id: string) => Promise<void>)("created-notification");
        expect(
          elements(render()).some(
            (node) =>
              node.type === "Button" &&
              node.props.disabled === true &&
              textContent(node) === "read",
          ),
        ).toBe(true);
        const refreshedBell = elements(bell.render("NotificationInboxBell")).find(
          (node) => node.type === "NotificationBell",
        )!;
        expect(
          (refreshedBell.props.notifications as Item[]).filter((item) => item.readAt === null),
        ).toHaveLength(0);
      });

      test(`${mode}/${framework} never seeds an earlier owner's RSC inbox into a new owner query`, () => {
        const testCase = setup(framework, mode);
        const options = testCase.queries.module.notificationInboxQueryOptions as (
          client: unknown,
          items: unknown[],
          scope: unknown,
        ) => { queryKey: unknown[]; initialData?: unknown[] };
        const initial = [{ id: "private-owner-a-item" }];
        expect(options(testCase.client, initial, scopeA).initialData).toBe(initial);
        testCase.switchOwner();
        const next = options(testCase.client, initial, scopeA);
        expect(next.initialData).toBeUndefined();
        expect(next.queryKey).toEqual([scopeB.userId, "notifications", "inbox"]);
      });
    }
  }

  test("the bell catches failed read mutations and exposes a safe retry without navigating", async () => {
    const output = generatedUiOutput("nextjs");
    const first = deferred<void>();
    const second = deferred<void>();
    const queue = [first, second];
    let marks = 0;
    let navigations = 0;
    const ui = generatedFormHarness(
      output.read(`${output.root}/components/NotificationBell.tsx`),
      ["NotificationBell"],
      {
        Bell: "Bell",
        Badge: "Badge",
        Popover: "Popover",
        PopoverTrigger: "PopoverTrigger",
        PopoverContent: "PopoverContent",
        PopoverTitle: "PopoverTitle",
        PopoverDescription: "PopoverDescription",
        Empty: "Empty",
        EmptyHeader: "EmptyHeader",
        EmptyTitle: "EmptyTitle",
        EmptyDescription: "EmptyDescription",
        formatNotification: () => ({ title: "Owned note", message: "Owned content" }),
        getNotificationHref: () => ({ href: "/notifications" }),
      },
    );
    const props = {
      notifications: [
        {
          id: "note",
          type: "user.note",
          payload: {},
          readAt: null,
          createdAt: new Date().toISOString(),
        },
      ],
      async onMarkRead() {
        marks += 1;
        const gate = queue.shift();
        if (!gate) throw new Error("Duplicate mark");
        await gate.promise;
      },
      onNavigate() {
        navigations += 1;
      },
    };
    const render = () => ui.render("NotificationBell", props);
    const button = elements(render()).find(
      (node) => node.type === "Button" && typeof node.props.onClick === "function",
    )!;
    const pending = (button.props.onClick as () => Promise<void>)();
    await (button.props.onClick as () => Promise<void>)();
    expect(marks).toBe(1);
    first.reject(new Error("Mark read failed"));
    await expect(pending).resolves.toBeUndefined();
    expect(navigations).toBe(0);
    expect(textContent(render())).toContain("unavailable");
    const retry = elements(render()).find(
      (node) => node.type === "Button" && typeof node.props.onClick === "function",
    )!;
    const completion = (retry.props.onClick as () => Promise<void>)();
    second.resolve();
    await completion;
    expect(navigations).toBe(1);
    expect(textContent(render())).not.toContain("unavailable");
  });
});
