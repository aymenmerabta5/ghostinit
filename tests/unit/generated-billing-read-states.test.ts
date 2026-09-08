import { describe, expect, test } from "bun:test";
import { resolveCreateConfig } from "../../src/commands/create/resolution.js";
import { buildProjectGenerationPlan } from "../../src/templates/default.js";

type Element = { type: unknown; props: Record<string, unknown>; children: unknown[] };
type Snapshot = {
  data?: { subscriptions: unknown[]; invoices: unknown[] };
  error: Error | null;
  isPending: boolean;
  isFetching: boolean;
  refetch(): Promise<void>;
};

function element(
  type: unknown,
  props: Record<string, unknown> | null,
  ...children: unknown[]
): unknown {
  if (typeof type === "function") return type({ ...props, children });
  return { type, props: props ?? {}, children } satisfies Element;
}

function nodes(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== "object" || !("type" in value)) return [];
  const node = value as Element;
  return [node, ...node.children.flatMap(nodes)];
}

function generate(
  mode: "single" | "monorepo",
  database: "postgres" | "convex",
  native: boolean,
  i18n = false,
) {
  const result = resolveCreateConfig({
    name: "billing-read-states",
    runtime: "bun",
    mode,
    framework: native ? "nextjs" : "tanstack-start",
    database,
    databaseWasExplicit: true,
    preset: "saas",
    billing: ["stripe", "chargily"],
    features: i18n ? ["i18n"] : [],
    apps: native ? ["web", "mobile", "desktop"] : ["web"],
    cache: "none",
    deploy: "none",
  });
  if (!result.ok) throw new Error(result.message);
  const plan = buildProjectGenerationPlan(result.resolvedConfig, {
    desiredConfig: result.desiredConfig,
  });
  return (path: string): string => {
    const file = plan.files.find((entry) => entry.physicalPath === path);
    if (!file) throw new Error(`Missing ${path}`);
    return file.content;
  };
}

function renderer(source: string, name: string) {
  let refreshes = 0;
  const snapshot: Snapshot = {
    error: null,
    isPending: false,
    isFetching: false,
    async refetch() {
      refreshes += 1;
    },
  };
  const mutation = { mutationOptions: () => ({}) };
  const bindings: Record<string, unknown> = {
    React: {
      createElement: element,
      useMemo: (factory: () => unknown) => factory(),
      useState: (value: unknown) => [value, () => {}],
      useEffect: () => {},
      useTransition: () => [false, (operation: () => unknown) => operation()],
    },
    createFileRoute: () => (options: unknown) => ({ options }),
    WebBrowser: { maybeCompleteAuthSession() {} },
    useAuth: () => ({ isAuthenticated: true }),
    useAuthOwnedEffect: () => () => () => true,
    usePlatformI18n: () => ({ locale: "en" }),
    useTranslations: () => (key: string) => key,
    useSurfaceTranslations: () => (key: string) => key,
    useQuery: ({ identity }: { identity?: boolean }) =>
      identity ? { data: { user: { role: "admin" } } } : snapshot,
    useMutation: () => ({ isPending: false }),
    desktopQueryOptions: { me: () => ({ identity: true }) },
    orpc: {
      me: { queryOptions: () => ({ identity: true }) },
      billing: {
        subscriptions: { queryOptions: () => ({}) },
        createCheckout: mutation,
        createPortalSession: mutation,
        createPaymentLink: mutation,
      },
    },
    useBillingPage: () => ({
      subscriptions: snapshot.data?.subscriptions ?? [],
      invoices: snapshot.data?.invoices ?? [],
      subsLoading: snapshot.isPending,
      snapshotError: snapshot.error,
      refresh: snapshot.refetch,
      isCheckoutLoading: false,
      pastDue: false,
      handleCheckout() {},
      handlePortal() {},
    }),
    supportsBillingPortal: () => true,
    formatBillingInvoiceAmount: () => "EUR 12.00",
  };
  for (const component of [
    "ActivityIndicator",
    "Alert",
    "AlertDescription",
    "AlertTitle",
    "Badge",
    "BillingEmptyState",
    "BillingInvoices",
    "BillingPaymentLinkForm",
    "Button",
    "Card",
    "CardContent",
    "CardDescription",
    "CardHeader",
    "CardTitle",
    "Empty",
    "EmptyDescription",
    "EmptyHeader",
    "EmptyTitle",
    "Field",
    "FieldGroup",
    "FieldLabel",
    "Input",
    "Link",
    "ScrollView",
    "Separator",
    "Skeleton",
    "Text",
    "View",
  ])
    bindings[component] = component;
  const executable = new Bun.Transpiler({
    loader: "tsx",
    tsconfig: { compilerOptions: { jsx: "react" } },
  }).transformSync(
    source
      .replace(/^import[^;]+;\s*/gm, "")
      .replace(/^export default /gm, "")
      .replace(/^export /gm, ""),
  );
  const render = new Function(...Object.keys(bindings), `${executable}\nreturn ${name};`)(
    ...Object.values(bindings),
  ) as () => unknown;
  return { snapshot, render, refreshes: () => refreshes };
}

function expectNoEmptyClaims(tree: unknown): void {
  const rendered = JSON.stringify(tree);
  expect(rendered).not.toMatch(
    /noSubscriptionsTitle|noSubscriptionsBadge|noInvoices|No subscriptions yet|No invoices yet/,
  );
}

describe("generated billing read states", () => {
  for (const mode of ["single", "monorepo"] as const) {
    for (const database of ["postgres", "convex"] as const) {
      test(`${mode}/${database} TanStack separates initial loading, read failures and successful empty data`, async () => {
        const read = generate(mode, database, false);
        const root = mode === "single" ? "src" : "apps/web/src";
        const view = renderer(read(`${root}/features/billing/billing-page.tsx`), "BillingPage");
        view.snapshot.isPending = true;
        expectNoEmptyClaims(view.render());
        view.snapshot.isPending = false;
        view.snapshot.error = new Error("Read failed");
        const failed = view.render();
        expectNoEmptyClaims(failed);
        expect(
          nodes(failed).some((node) => node.type === "Alert" && node.props.role === "alert"),
        ).toBe(true);
        const retry = nodes(failed).find(
          (node) => node.type === "Button" && node.children.includes("refresh"),
        );
        expect(retry).toBeDefined();
        if (!retry) throw new Error("Missing billing retry action");
        await (retry.props.onClick as () => Promise<void>)();
        expect(view.refreshes()).toBe(1);
        view.snapshot.error = null;
        view.snapshot.data = { subscriptions: [], invoices: [] };
        expect(JSON.stringify(view.render())).toContain("noSubscriptionsTitle");
        expect(nodes(view.render()).some((node) => node.type === "BillingInvoices")).toBe(true);
        view.snapshot.error = new Error("Refresh failed");
        view.snapshot.data.subscriptions.push({
          id: "sub-1",
          provider: "stripe",
          status: "active",
        });
        expect(JSON.stringify(view.render())).toContain("active");
        expectNoEmptyClaims(view.render());
      });
    }
  }

  for (const database of ["postgres", "convex"] as const) {
    for (const i18n of [false, true]) {
      test(`${database}/i18n=${i18n} native billing never presents unknown invoices as empty`, () => {
        const read = generate("monorepo", database, true, i18n);
        for (const [path, name, indicator] of [
          ["apps/mobile/app/billing.tsx", "BillingScreen", "ActivityIndicator"],
          ["apps/desktop/src/renderer/routes/billing.tsx", "BillingPage", "Skeleton"],
        ] as const) {
          const view = renderer(read(path), name);
          view.snapshot.isPending = true;
          expectNoEmptyClaims(view.render());
          expect(
            nodes(view.render()).filter((node) => node.type === indicator).length,
          ).toBeGreaterThanOrEqual(2);
          view.snapshot.isPending = false;
          view.snapshot.error = new Error("Read failed");
          expectNoEmptyClaims(view.render());
          expect(nodes(view.render()).some((node) => node.type === "Alert")).toBe(true);
          view.snapshot.error = null;
          view.snapshot.data = { subscriptions: [], invoices: [] };
          expect(JSON.stringify(view.render())).toMatch(
            /noSubscriptionsTitle|No subscriptions yet/,
          );
          expect(JSON.stringify(view.render())).toMatch(/noInvoices|No invoices yet/);
          view.snapshot.error = new Error("Refresh failed");
          view.snapshot.data = {
            subscriptions: [{ id: "sub-1", provider: "stripe", status: "active" }],
            invoices: [
              { id: "inv-1", provider: "stripe", amount: 1200, status: "paid", paid: true },
            ],
          };
          expect(JSON.stringify(view.render())).toContain("active");
          expect(JSON.stringify(view.render())).toContain("EUR 12.00");
          expectNoEmptyClaims(view.render());
          if (name === "BillingScreen") {
            const fields = nodes(view.render()).filter((node) => node.type === "Input");
            expect(fields).toHaveLength(2);
            expect(fields.every((node) => typeof node.props.accessibilityLabel === "string")).toBe(
              true,
            );
          }
        }
      });
    }
  }
});
