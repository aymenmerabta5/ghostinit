import { generatedFormHarness } from "../helpers/generated-form-harness.js";
import { resolveCreateConfig } from "../../src/commands/create/resolution.js";
import { buildProjectGenerationPlan } from "../../src/templates/default.js";

export type Element = { type: unknown; props: Record<string, unknown>; children: unknown[] };
export function nodes(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== "object" || !("type" in value)) return [];
  const node = value as Element;
  return [node, ...node.children.flatMap(nodes)];
}

export function generatedMessaging(
  mode: "single" | "monorepo",
  framework: "nextjs" | "tanstack-start",
  database: "postgres" | "convex",
  i18n = false,
) {
  const result = resolveCreateConfig({
    name: "messaging-read-states",
    runtime: "bun",
    mode,
    framework,
    database,
    databaseWasExplicit: true,
    preset: "saas",
    billing: [],
    features: i18n ? ["i18n"] : [],
    apps: mode === "monorepo" ? ["web", "mobile", "desktop"] : ["web"],
    cache: "none",
    deploy: "none",
    withMessaging: true,
  });
  if (!result.ok) throw new Error(result.message);
  const plan = buildProjectGenerationPlan(result.resolvedConfig, {
    desiredConfig: result.desiredConfig,
  });
  return (suffix: string): string => {
    const expected = suffix.startsWith("/")
      ? `${mode === "monorepo" ? "apps/web/src" : "src"}${suffix}`
      : suffix;
    const files = plan.files.filter((file) => file.physicalPath === expected);
    if (files.length !== 1)
      throw new Error(`Expected one generated ${suffix}, found ${files.length}`);
    return files[0]!.content;
  };
}

export function renderer(source: string, name: string, overrides: Record<string, unknown> = {}) {
  const slots: unknown[] = [];
  let cursor = 0;
  const bindings: Record<string, unknown> = {
    React: {
      createElement(
        type: unknown,
        props: Record<string, unknown> | null,
        ...children: unknown[]
      ): unknown {
        return typeof type === "function"
          ? type({ ...props, children })
          : { type, props: props ?? {}, children };
      },
      useState(initial: unknown) {
        const index = cursor++;
        if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
        return [
          slots[index],
          (value: unknown) => {
            slots[index] = value;
          },
        ];
      },
      useRef(initial: unknown) {
        const index = cursor++;
        return (slots[index] ??= { current: initial });
      },
      useEffect() {},
      useCallback: (callback: unknown) => callback,
    },
    createFileRoute: () => (options: unknown) => ({ options }),
    useSurfaceTranslations: () => (key: string) => key,
    useTranslations: () => (key: string) => key,
    useSurfaceLocale: () => "en",
    useTyping: () => new Set(),
    useConvexTyping: () => [],
    useMutation: () => ({ isPending: false }),
    useQueryClient: () => ({}),
    api: {
      messaging: {
        listMessages: "messages",
        listTyping: "typing",
        sendMessage: "send",
        sendTyping: "sendTyping",
      },
    },
  };
  for (const component of [
    "Alert",
    "AlertTitle",
    "AlertDescription",
    "Badge",
    "Button",
    "Card",
    "CardHeader",
    "CardContent",
    "CardTitle",
    "CardDescription",
    "Empty",
    "EmptyDescription",
    "EmptyHeader",
    "EmptyTitle",
    "Skeleton",
    "Input",
    "Text",
    "View",
    "ScrollView",
    "Image",
    "MessageComposer",
    "ConvexMessageComposer",
    "Attachment",
    "AttachmentActions",
    "AttachmentContent",
    "AttachmentGroup",
    "AttachmentTitle",
    "AttachmentMedia",
    "Bubble",
    "BubbleContent",
    "Marker",
    "MarkerContent",
    "Message",
    "MessageContent",
    "MessageHeader",
    "MessageScroller",
    "MessageScrollerButton",
    "MessageScrollerContent",
    "MessageScrollerItem",
    "MessageScrollerProvider",
    "MessageScrollerViewport",
  ])
    bindings[component] = component;
  Object.assign(bindings, overrides);
  const executable = new Bun.Transpiler({
    loader: "tsx",
    tsconfig: { compilerOptions: { jsx: "react" } },
  }).transformSync(
    source
      .replace(/^import[^;]+;\s*/gm, "")
      .replace(/^export default /gm, "")
      .replace(/^export /gm, ""),
  );
  const component = new Function(...Object.keys(bindings), `${executable}\nreturn ${name};`)(
    ...Object.values(bindings),
  ) as (props?: unknown) => unknown;
  return {
    render(props?: unknown) {
      cursor = 0;
      return component(props);
    },
    setState(index: number, value: unknown) {
      slots[index] = value;
    },
  };
}

export function readState() {
  let retries = 0;
  return {
    data: undefined as unknown,
    error: null as Error | null,
    isLoading: false,
    isPending: false,
    isFetching: false,
    async refetch() {
      retries += 1;
    },
    retries: () => retries,
  };
}

export function retryButton(tree: unknown): Element {
  const button = nodes(tree).find(
    (node) => node.type === "Button" && JSON.stringify(node.children).includes("refresh"),
  );
  if (!button) throw new Error("Missing retry button");
  return button;
}

/** Execute the emitted query adapters and workflows instead of copying their state mapping. */
export function postgresReadWorkflows(
  read: (path: string) => string,
  query: ReturnType<typeof readState>,
) {
  let enabled: boolean | undefined;
  const harness = generatedFormHarness(
    [
      "/features/messaging/queries.ts",
      "/features/messaging/use-messaging-workspace.ts",
      "/features/messaging/use-message-thread.ts",
    ]
      .map(read)
      .join("\n"),
    ["useMessagingWorkspace", "useMessageThread", "useMessageQuery"],
    {
      useQuery: (options: { enabled?: boolean }) => {
        enabled = options.enabled;
        return query;
      },
      useQueryClient: () => ({}),
      window: {},
      useCallback: (callback: unknown) => callback,
      currentQueryAuthScope: () => ({
        userId: "member",
        sessionId: "session",
        tenantId: null,
        teamId: null,
      }),
      authScopedQueryKey: (_scope: unknown, key: unknown) => key,
      messagingConversationsQueryKey: () => ["messaging", "conversations"],
      orpc: {
        messaging: {
          listConversations: { queryOptions: () => ({ queryKey: ["messaging", "conversations"] }) },
          listMessages: { queryOptions: () => ({ queryKey: ["messaging", "messages"] }) },
        },
      },
      useAuthOwnedEffect: () => () => () => true,
      useStartConversation: () => ({ isPending: false, error: null }),
      useMessageTyping: () => new Set(),
    },
  );
  return {
    workspace: () => harness.render("useMessagingWorkspace") as Record<string, unknown>,
    thread: (id: string) => harness.render("useMessageThread", id) as Record<string, unknown>,
    queryEnabledFor(id: string): boolean | undefined {
      harness.render("useMessageQuery", id);
      return enabled;
    },
  };
}
