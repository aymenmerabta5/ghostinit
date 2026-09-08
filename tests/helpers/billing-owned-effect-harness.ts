import { resolveCreateConfig } from "../../src/commands/create/resolution.js";
import { buildProjectGenerationPlan } from "../../src/templates/default.js";

export type Target = "next" | "tanstack" | "expo" | "desktop";
export type Operation = "checkout" | "portal" | "paymentLink";
export type Element = { type: unknown; props: Record<string, unknown>; children: unknown[] };
export function nodes(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== "object" || !("type" in value)) return [];
  const node = value as Element;
  return [node, ...node.children.flatMap(nodes)];
}
export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}
export async function flush(): Promise<void> {
  for (let index = 0; index < 12; index += 1) await Promise.resolve();
}

const plans = new Map<string, Map<string, string>>();
function output(target: Target, mode: "single" | "monorepo") {
  const framework = target === "tanstack" ? "tanstack-start" : "nextjs";
  const key = `${mode}/${framework}`;
  let files = plans.get(key);
  if (!files) {
    const result = resolveCreateConfig({
      name: "billing-owner",
      runtime: "bun",
      mode,
      framework,
      database: "postgres",
      databaseWasExplicit: true,
      preset: "saas",
      billing: ["stripe", "chargily"],
      features: [],
      apps: mode === "monorepo" ? ["web", "mobile", "desktop"] : ["web"],
      cache: "none",
      deploy: "none",
    });
    if (!result.ok) throw new Error(result.message);
    const plan = buildProjectGenerationPlan(result.resolvedConfig, {
      desiredConfig: result.desiredConfig,
    });
    files = new Map(plan.files.map((file) => [file.physicalPath, file.content]));
    plans.set(key, files);
  }
  const root =
    target === "expo"
      ? "apps/mobile/src"
      : target === "desktop"
        ? "apps/desktop/src/renderer"
        : mode === "single"
          ? "src"
          : "apps/web/src";
  const read = (path: string): string => {
    const source = files.get(path);
    if (!source) throw new Error(`Missing generated ${path}`);
    return source;
  };
  return { root, read };
}

function load<T>(source: string, names: string, bindings: Record<string, unknown>): T {
  const executable = new Bun.Transpiler({
    loader: "tsx",
    tsconfig: { compilerOptions: { jsx: "react" } },
  }).transformSync(
    source
      .replace(/^import[^;]+;\s*/gm, "")
      .replace(/^export type \{[^}]+\} from [^;]+;\s*/gm, "")
      .replace(/^export default /gm, "")
      .replace(/^export /gm, ""),
  );
  return new Function(...Object.keys(bindings), `${executable}\nreturn { ${names} };`)(
    ...Object.values(bindings),
  ) as T;
}

class QueryClient {
  data = new Map<string, unknown>();
  clearCount = 0;
  clear() {
    this.clearCount += 1;
    this.data.clear();
  }
  getQueryData(key: unknown[]) {
    return this.data.get(JSON.stringify(key));
  }
  setQueryData(key: unknown[], value: unknown) {
    this.data.set(JSON.stringify(key), value);
  }
}

export function billingHarness(target: Target, mode: "single" | "monorepo" = "monorepo") {
  const { root, read } = output(target, mode);
  const ownership = load<{
    currentQueryAuthGeneration(client: QueryClient): number;
    transitionQueryAuthScope(client: QueryClient, scope: unknown): void;
    invalidateQueryAuthScope(client: QueryClient): void;
  }>(
    read(`${root}/lib/query-client.ts`),
    "currentQueryAuthGeneration, transitionQueryAuthScope, invalidateQueryAuthScope",
    { QueryClient },
  );
  let client = new QueryClient();
  const scope = (id: string) => ({ userId: id, sessionId: id, tenantId: null, teamId: null });
  ownership.transitionQueryAuthScope(client, scope("owner-a"));
  const slots: unknown[] = [];
  const effects = new Map<number, { deps: unknown[]; cleanup: () => void }>();
  let cursor = 0;
  const opened: string[] = [];
  const copied: string[] = [];
  const notices: string[] = [];
  const calls: Operation[] = [];
  const request = deferred<{ url: string }>();
  let canOpen = Promise.resolve(true);
  const react = {
    createElement(
      type: unknown,
      props: Record<string, unknown> | null,
      ...children: unknown[]
    ): unknown {
      return typeof type === "function"
        ? type({ ...props, children })
        : { type, props: props ?? {}, children };
    },
    createContext: (value: unknown) => ({ value }),
    useContext: () => ({
      subscriptions: [],
      invoices: [],
      usageEvents: [],
      licenseKeys: [],
      canCreatePaymentLinks: true,
    }),
    useRef(initial: unknown) {
      const index = cursor++;
      return (slots[index] ??= { current: initial });
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
    useCallback: (callback: unknown) => callback,
    useMemo: (factory: () => unknown) => factory(),
    useEffect() {},
    useLayoutEffect(effect: () => () => void, deps: unknown[]) {
      const index = cursor++;
      const previous = effects.get(index);
      if (!previous || deps.some((value, i) => value !== previous.deps[i])) {
        previous?.cleanup();
        effects.set(index, { deps, cleanup: effect() });
      }
    },
  };
  const guard = load<{ useAuthOwnedEffect(): () => () => boolean }>(
    read(`${root}/hooks/use-auth-owned-effect.ts`),
    "useAuthOwnedEffect",
    {
      React: react,
      useQueryClient: () => client,
      currentQueryAuthGeneration: ownership.currentQueryAuthGeneration,
    },
  );
  const invoke = (operation: Operation) => {
    calls.push(operation);
    return request.promise;
  };
  const mutation = (operation: Operation) => ({ mutationOptions: () => ({ operation }) });
  const snapshot = { data: { subscriptions: [], invoices: [] }, refetch: async () => {} };
  const location = {
    origin: "https://app.example.test",
    set href(value: string) {
      opened.push(value);
    },
  };
  const bindings: Record<string, unknown> = {
    React: react,
    useAuthOwnedEffect: guard.useAuthOwnedEffect,
    useAuth: () => ({ isAuthenticated: true }),
    useQuery: () => ({ ...snapshot, data: { ...snapshot.data, user: { role: "admin" } } }),
    useMutation: ({ operation }: { operation: Operation }) => ({
      isPending: false,
      mutateAsync: () => invoke(operation),
    }),
    useBillingSnapshot: () => snapshot,
    useBillingIdentity: () => ({ data: { user: { role: "admin" } } }),
    createBillingCheckoutAction: () => invoke("checkout"),
    createBillingPortalAction: () => invoke("portal"),
    createBillingPaymentLinkAction: () => invoke("paymentLink"),
    createBillingCheckout: () => invoke("checkout"),
    createBillingPortalSession: () => invoke("portal"),
    createBillingPaymentLink: () => invoke("paymentLink"),
    supportsBillingPortal: () => true,
    safeBillingProviderUrl: (value: string) => new URL(value).toString(),
    toast: {
      success: (value: string) => notices.push(value),
      error: (value: string) => notices.push(value),
    },
    window: {
      location,
      desktopBridge: {
        async shellOpenExternal(value: string) {
          opened.push(value);
        },
      },
    },
    navigator: {
      clipboard: {
        async writeText(value: string) {
          copied.push(value);
        },
      },
    },
    env: { EXPO_PUBLIC_APP_URL: "ghostinit://billing" },
    Linking: {
      canOpenURL: () => canOpen,
      async openURL(value: string) {
        opened.push(value);
      },
    },
    WebBrowser: {
      maybeCompleteAuthSession() {},
      async openAuthSessionAsync(value: string) {
        opened.push(value);
      },
    },
    desktopBillingReturnUrl: () => "https://app.example.test/billing",
    desktopQueryOptions: { me: () => ({}) },
    orpc: {
      me: { queryOptions: () => ({}) },
      billing: {
        subscriptions: { queryOptions: () => ({}) },
        createCheckout: mutation("checkout"),
        createPortalSession: mutation("portal"),
        createPaymentLink: mutation("paymentLink"),
      },
    },
    createFileRoute: () => (options: unknown) => options,
    useSurfaceTranslations: () => (key: string) => key,
  };
  for (const component of [
    "ScrollView",
    "View",
    "Text",
    "Link",
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
    "Input",
    "Field",
    "FieldGroup",
    "FieldLabel",
    "Empty",
    "EmptyHeader",
    "EmptyTitle",
    "EmptyDescription",
  ])
    bindings[component] = component;
  const sourcePath =
    target === "next"
      ? `${root}/app/billing/hooks/use-billing-page.ts`
      : target === "tanstack"
        ? `${root}/features/billing/use-billing.ts`
        : target === "expo"
          ? "apps/mobile/app/billing.tsx"
          : `${root}/routes/billing.tsx`;
  const name =
    target === "next" || target === "tanstack"
      ? "useBillingPage"
      : target === "expo"
        ? "BillingScreen"
        : "BillingPage";
  const loaded = load<Record<string, () => unknown>>(read(sourcePath), name, bindings);
  const render = () => {
    cursor = 0;
    return loaded[name]!();
  };
  const form =
    target === "next" || target === "tanstack"
      ? load<{ BillingPaymentLinkForm(props: unknown): unknown }>(
          read(
            target === "next"
              ? `${root}/app/billing/components/payment-link-form.tsx`
              : `${root}/features/billing/payment-link-form.tsx`,
          ),
          "BillingPaymentLinkForm",
          { ...bindings, useBillingPage: loaded[name] },
        )
      : null;
  return {
    request,
    calls,
    opened,
    copied,
    notices,
    render,
    renderForm() {
      if (!form) throw new Error("No web form");
      cursor = 0;
      return form.BillingPaymentLinkForm({ provider: "chargily" });
    },
    changeOwner(id = "owner-b") {
      ownership.transitionQueryAuthScope(client, scope(id));
    },
    invalidate() {
      ownership.invalidateQueryAuthScope(client);
    },
    replaceClient() {
      client = new QueryClient();
      ownership.transitionQueryAuthScope(client, scope("owner-a"));
    },
    unmount() {
      for (const effect of effects.values()) effect.cleanup();
      effects.clear();
    },
    waitForBrowser(promise: Promise<boolean>) {
      canOpen = promise;
    },
    capture() {
      cursor = 0;
      return guard.useAuthOwnedEffect()();
    },
  };
}
