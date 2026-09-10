import { describe, expect, test } from "bun:test";
import { generatedUiOutput } from "../helpers/generated-ui-output.js";
import { authOwnedMutationContent } from "../../src/templates/apps/fragments/auth-owned-mutation.js";
import { queryMutationHarness } from "../helpers/query-mutation-harness.js";
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
  let generation = 0;
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
  let marks = 0;
  const markQueue: Array<ReturnType<typeof deferred<void>>> = [];
  const navigations: string[] = [];
  const navigation = generatedFormHarness(output.read(`${output.root}/lib/notifications.ts`), [
    "resolveNotificationDestination",
    "getNotificationHref",
    "formatNotification",
  ]).module;
  const publish = async (input: { title: string; body: string }) => {
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
      title: input.title,
      body: input.body,
    };
    records.push(item);
    return item;
  };
  const mark = async ({ notificationId: id }: { notificationId: string }) => {
    marks += 1;
    const gate = markQueue.shift();
    if (gate) await gate.promise;
    const index = records.findIndex((item) => item.id === id);
    if (index >= 0) records[index] = { ...records[index]!, readAt: new Date().toISOString() };
  };
  const bindings = {
    useAuthOwnedEffect: () => () => {
      const captured = generation;
      return () => captured === generation && scope !== null;
    },
    useQueryClient: () => client,
    currentQueryAuthGeneration: () => generation,
    subscribeQueryAuthGeneration: () => () => {},
    useNotificationInbox: (items?: unknown[], initialScope?: unknown) =>
      (
        queries.module.useNotificationInbox as (
          items?: unknown[],
          initialScope?: unknown,
        ) => unknown
      )(items, initialScope),
    useInvalidateNotificationInbox: () => invalidator,
    useRouter: () => ({
      push: (href: string) => {
        navigations.push(href);
      },
    }),
    useNavigate:
      () =>
      async ({ to }: { to: string }) => {
        navigations.push(to);
      },
    ...navigation,
    createSelfNotificationAction: publish,
    markNotificationReadAction: mark,
    orpcClient: { notifications: { createSelf: publish, markRead: mark } },
    Input: "Input",
    Textarea: "Textarea",
    Field: "Field",
    FieldLabel: "FieldLabel",
    Empty: "Empty",
    EmptyHeader: "EmptyHeader",
    EmptyTitle: "EmptyTitle",
    EmptyDescription: "EmptyDescription",
    ...Object.fromEntries(
      [
        "Bell",
        "Badge",
        "Popover",
        "PopoverTrigger",
        "PopoverContent",
        "PopoverTitle",
        "PopoverDescription",
      ].map((name) => [name, name]),
    ),
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
    marks: () => marks,
    markQueue,
    navigations,
    currentQueryOptions: () => queryOptions,
    setHydrating: (value: boolean) => {
      hydrating = value;
    },
    clearOwner: () => {
      scope = null;
      generation += 1;
    },
    switchOwner: () => {
      scope = scopeB;
      generation += 1;
    },
  };
}

function pageHarness(testCase: ReturnType<typeof setup>) {
  const base = `${testCase.output.root}/features/notifications`;
  const mutation = queryMutationHarness();
  const ui = generatedFormHarness(
    [
      authOwnedMutationContent(),
      ...[
        "mutations.ts",
        "use-notification-workspace.ts",
        "components/notifications-workspace.tsx",
        "components/notification-composer.tsx",
        "page.tsx",
      ].map((path) => testCase.output.read(`${base}/${path}`)),
    ].join("\n"),
    ["NotificationsPage", "NotificationsWorkspace", "NotificationComposer"],
    { ...testCase.bindings, useMutation: mutation.useMutation },
  );
  return () => {
    const page = ui.render("NotificationsPage", { initialItems: [], initialScope: scopeA });
    const workspace = elements(page).find((node) => node.type === ui.module.NotificationsWorkspace);
    if (!workspace) throw new Error("Missing emitted notification workspace composition");
    const tree = ui.render("NotificationsWorkspace", workspace.props);
    const composer = elements(tree).find((node) => node.type === ui.module.NotificationComposer);
    if (!composer) throw new Error("Missing emitted controlled notification composer");
    return [tree, ui.render("NotificationComposer", composer.props)];
  };
}

function bellHarness(testCase: ReturnType<typeof setup>) {
  const base = `${testCase.output.root}/features/notifications`;
  const mutation = queryMutationHarness();
  const ui = generatedFormHarness(
    [
      authOwnedMutationContent(),
      ...["mutations.ts", "use-notification-bell.ts", "bell.tsx"].map((path) =>
        testCase.output.read(`${base}/${path}`),
      ),
      testCase.output.read(`${testCase.output.root}/components/NotificationBell.tsx`),
    ].join("\n"),
    ["NotificationInboxBell", "NotificationBell"],
    { ...testCase.bindings, useMutation: mutation.useMutation },
  );
  return () => {
    const screen = ui.render("NotificationInboxBell");
    const view = elements(screen).find((node) => node.type === ui.module.NotificationBell);
    if (!view) throw new Error("Missing emitted controlled notification bell");
    return { props: view.props, tree: ui.render("NotificationBell", view.props) };
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
        const render = pageHarness(testCase);
        const renderBell = bellHarness(testCase);
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
        const bellView = renderBell();
        expect(
          (bellView.props.notifications as Item[]).filter((item) => item.readAt === null),
        ).toHaveLength(1);
        const bellAction = elements(bellView.tree).find(
          (node) => node.type === "Button" && typeof node.props.onClick === "function",
        );
        if (!bellAction) throw new Error("Missing controlled bell activation");
        (bellAction.props.onClick as () => void)();
        await flush();
        expect(
          elements(render()).some(
            (node) =>
              node.type === "Button" &&
              node.props.disabled === true &&
              textContent(node) === "read",
          ),
        ).toBe(true);
        const refreshedBell = renderBell();
        expect(
          (refreshedBell.props.notifications as Item[]).filter((item) => item.readAt === null),
        ).toHaveLength(0);
        expect(testCase.invalidations).toEqual([
          { queryKey: [scopeA.userId, "notifications", "inbox"] },
          { queryKey: [scopeA.userId, "notifications", "inbox"] },
        ]);
        expect(testCase.navigations).toEqual(["/notifications"]);
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
    const testCase = setup("nextjs", "monorepo");
    const first = deferred<void>();
    const second = deferred<void>();
    testCase.markQueue.push(first, second);
    testCase.records.push({
      id: "note",
      kind: "user.note",
      title: "Owned note",
      body: "Owned content",
      href: "/notifications",
      readAt: null,
      createdAt: new Date().toISOString(),
    });
    await testCase.cache.refetch();
    const renderBell = bellHarness(testCase);
    const render = () => renderBell().tree;
    const button = elements(render()).find(
      (node) => node.type === "Button" && typeof node.props.onClick === "function",
    )!;
    expect((button.props.onClick as () => void)()).toBeUndefined();
    (button.props.onClick as () => void)();
    expect(testCase.marks()).toBe(1);
    expect(
      elements(render()).find(
        (node) => node.type === "Button" && typeof node.props.onClick === "function",
      )?.props.disabled,
    ).toBe(true);
    first.reject(new Error("Mark read failed"));
    await flush();
    expect(testCase.navigations).toEqual([]);
    expect(testCase.invalidations).toHaveLength(0);
    expect(textContent(render())).toContain("unavailable");
    const retry = elements(render()).find(
      (node) => node.type === "Button" && typeof node.props.onClick === "function",
    )!;
    (retry.props.onClick as () => void)();
    second.resolve();
    await flush();
    expect(testCase.marks()).toBe(2);
    expect(testCase.navigations).toEqual(["/notifications"]);
    expect(testCase.invalidations).toEqual([
      { queryKey: [scopeA.userId, "notifications", "inbox"] },
    ]);
    expect(textContent(render())).not.toContain("unavailable");
  });
});
