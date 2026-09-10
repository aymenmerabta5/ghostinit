import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { resolveCreateConfig } from "../../src/commands/create/resolution.js";
import { buildProjectGenerationPlan } from "../../src/templates/default.js";
import { settingsFeatureHarness } from "../helpers/settings-feature-harness.js";

type Mode = "monorepo" | "single";
type Framework = "nextjs" | "tanstack-start";
type Database = "postgres" | "convex";
type Provider = "stripe" | "chargily" | "paddle" | "polar";
const PROVIDERS = ["stripe", "chargily", "paddle", "polar"] as const;
const transpiler = new Bun.Transpiler({
  loader: "tsx",
  tsconfig: { compilerOptions: { jsx: "react" } },
});

function generate(
  mode: Mode,
  framework: Framework,
  database: Database,
  selected: readonly Provider[] = ["stripe", "chargily"],
) {
  const result = resolveCreateConfig({
    name: "billing-features",
    runtime: "bun",
    mode,
    framework,
    database,
    databaseWasExplicit: true,
    preset: "saas",
    billing: [...selected],
    features: [],
    apps: ["web"],
    cache: "none",
    deploy: "none",
  });
  if (!result.ok) throw new Error(result.message);
  const plan = buildProjectGenerationPlan(result.resolvedConfig, {
    desiredConfig: result.desiredConfig,
  });
  const root = mode === "monorepo" ? "apps/web/src" : "src";
  const read = (path: string) => {
    const file = plan.files.find((entry) => entry.physicalPath === path);
    if (!file) throw new Error(`Missing ${path}`);
    return file.content;
  };
  return { root, read, paths: new Set(plan.files.map((entry) => entry.physicalPath)) };
}

function load<T>(source: string, exports: string, bindings: Record<string, unknown>): T {
  const js = transpiler.transformSync(
    source.replace(/^import[^;]+;\s*/gm, "").replace(/^export /gm, ""),
  );
  return new Function(...Object.keys(bindings), `${js}\nreturn { ${exports} };`)(
    ...Object.values(bindings),
  ) as T;
}

type Element = { type: unknown; props: Record<string, unknown>; children: unknown[] };
function h(type: unknown, props: Record<string, unknown> | null, ...children: unknown[]): unknown {
  if (typeof type === "function") return type({ ...props, children });
  return { type, props: props ?? {}, children } satisfies Element;
}
function nodes(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (typeof value !== "object" || value === null || !("type" in value)) return [];
  const element = value as Element;
  return [element, ...element.children.flatMap(nodes)];
}

describe("billing browser feature closure", () => {
  for (const mode of ["monorepo", "single"] as const) {
    for (const framework of ["nextjs", "tanstack-start"] as const) {
      for (const database of ["postgres", "convex"] as const) {
        test(`${mode}/${framework}/${database} completes checkout returns without asserting payment`, () => {
          const output = generate(mode, framework, database);
          const body =
            output.read(`${output.root}/features/billing/components/return-page.tsx`) +
            "\n" +
            output.read(`${output.root}/features/billing/return-page.tsx`);
          const calls: string[] = [];
          const bindings: Record<string, unknown> = {
            React: { createElement: h },
            Link: "Link",
            Button: "Button",
            useSurfaceTranslations: () => (key: string) => {
              calls.push(key);
              return key;
            },
          };
          for (const name of ["Card", "CardContent", "CardDescription", "CardHeader", "CardTitle"])
            bindings[name] = name;
          const { BillingReturnPage } = load<{
            BillingReturnPage: (props: { outcome: string }) => unknown;
          }>(body, "BillingReturnPage", bindings);
          for (const outcome of ["success", "cancel"] as const) {
            const path =
              framework === "nextjs"
                ? `${output.root}/app/billing/${outcome}/page.tsx`
                : `${output.root}/routes/billing_.${outcome}.tsx`;
            expect(output.paths.has(path)).toBe(true);
            const page = output.read(path);
            expect(page).toContain(`outcome="${outcome}"`);
            if (framework === "tanstack-start")
              expect(page).toContain(`createFileRoute("/billing_/${outcome}")`);
            const rendered = nodes(BillingReturnPage({ outcome }));
            const button = rendered.find((node) => node.type === "Button");
            const link = button?.props.render as Element;
            expect(link.props[framework === "nextjs" ? "href" : "to"]).toBe("/billing");
          }
          expect(calls).toContain("checkoutReturnDescription");
          expect(calls).toContain("checkoutCancelledDescription");
          expect(body).not.toMatch(/searchParams|markPaid|grant|createCheckout|fetch\(/);
          expect(
            output.read(
              framework === "nextjs"
                ? `${output.root}/features/billing/screen.tsx`
                : `${output.root}/features/billing/billing-page.tsx`,
            ),
          ).toContain("BillingPaymentLinkForm allowed={");
        });
      }
    }
  }

  for (const mode of ["single", "monorepo"] as const) {
    test(`${mode} Next merchant action validates input and creates a fresh authenticated application`, async () => {
      const output = generate(mode, "nextjs", "postgres");
      const calls: unknown[] = [];
      let contexts = 0;
      const loaded = load<{ createBillingPaymentLinkAction: (input: unknown) => Promise<unknown> }>(
        output.read(`${output.root}/app/billing/actions.ts`),
        "createBillingPaymentLinkAction",
        {
          z,
          headers: async () => new Headers({ cookie: "inert-test-session" }),
          revalidatePath: () => {},
          createRequestApplicationForRequest: async (headers: Headers) => {
            expect(headers.get("cookie")).toBe("inert-test-session");
            contexts++;
            return {
              billing: {
                createPaymentLink: async (input: unknown) => {
                  calls.push(input);
                  return { id: "link", url: "https://pay.example.test/link" };
                },
              },
            };
          },
        },
      );
      expect(
        await loaded.createBillingPaymentLinkAction({
          provider: "chargily",
          name: " Merchant link ",
          price: " price-id ",
        }),
      ).toEqual({ id: "link", url: "https://pay.example.test/link" });
      expect(calls).toEqual([
        {
          provider: "chargily",
          name: "Merchant link",
          items: [{ price: "price-id", quantity: 1 }],
        },
      ]);
      await loaded.createBillingPaymentLinkAction({
        provider: "chargily",
        name: "Another link",
        price: "price-id",
      });
      expect(contexts).toBe(2);
      await expect(
        loaded.createBillingPaymentLinkAction({
          provider: "chargily",
          name: " ",
          price: "price-id",
        }),
      ).rejects.toThrow("Invalid payment-link input");
      expect(contexts).toBe(2);
    });
  }

  test("TanStack renders only selected checkout providers and exposes no Chargily portal", () => {
    for (const selected of [
      ["chargily"],
      ["stripe"],
      ["paddle"],
      ["polar"],
      ["chargily", "paddle"],
      ["chargily", "polar"],
    ] as Provider[][]) {
      const output = generate("single", "tanstack-start", "convex", selected);
      const { BILLING_PROVIDERS, supportsBillingPortal } = load<{
        BILLING_PROVIDERS: { id: Provider }[];
        supportsBillingPortal: (provider: Provider) => boolean;
      }>(
        output.read(`${output.root}/features/billing/provider-options.ts`),
        "BILLING_PROVIDERS, supportsBillingPortal",
        {},
      );
      expect(BILLING_PROVIDERS.map(({ id }) => id)).toEqual(selected);
      expect(supportsBillingPortal("chargily")).toBe(false);
      for (const provider of PROVIDERS)
        expect(supportsBillingPortal(provider)).toBe(
          selected.includes(provider) && provider !== "chargily",
        );
      const checkoutCalls: Provider[] = [];
      const { BillingEmptyState } = load<{ BillingEmptyState: (props: unknown) => unknown }>(
        output.read(`${output.root}/features/billing/components/billing-empty-state.tsx`),
        "BillingEmptyState",
        {
          React: { createElement: h },
          Button: "Button",
          Card: "Card",
          CardHeader: "CardHeader",
          CardTitle: "CardTitle",
          CardDescription: "CardDescription",
          CardContent: "CardContent",
          BILLING_PROVIDERS,
          useSurfaceTranslations: () => (key: string) => key,
        },
      );
      const buttons = nodes(
        BillingEmptyState({
          disabled: false,
          onCheckout: (provider: Provider) => checkoutCalls.push(provider),
        }),
      ).filter(({ type }) => type === "Button");
      for (const button of buttons) (button.props.onClick as () => void)();
      expect(checkoutCalls).toEqual(selected);
    }
  });

  test("TanStack displays invoice records when no subscription exists", () => {
    const output = generate("single", "tanstack-start", "postgres", ["stripe"]);
    const invoice = {
      id: "invoice",
      provider: "stripe",
      amount: 1500,
      currency: "usd",
      status: "paid",
      paid: true,
    };
    const bindings: Record<string, unknown> = {
      React: { createElement: h, useTransition: () => [false, () => {}] },
      useSurfaceTranslations: () => (key: string) => key,
      useBillingPage: () => ({
        subscriptions: [],
        invoices: [invoice],
        subsLoading: false,
        isCheckoutLoading: false,
        pastDue: false,
        handleCheckout() {},
        handlePortal() {},
      }),
      supportsBillingPortal: () => false,
      BillingEmptyState: "ProviderActions",
      BillingInvoices: "InvoiceRecords",
    };
    for (const name of [
      "Separator",
      "Card",
      "CardHeader",
      "CardTitle",
      "CardDescription",
      "CardContent",
      "Badge",
      "Button",
      "Empty",
      "EmptyDescription",
      "EmptyHeader",
      "EmptyTitle",
      "Skeleton",
    ])
      bindings[name] = name;
    const { BillingPage } = load<{ BillingPage: () => unknown }>(
      output.read(`${output.root}/features/billing/billing-page.tsx`),
      "BillingPage",
      bindings,
    );
    expect(
      nodes(BillingPage()).find(({ type }) => type === "InvoiceRecords")?.props.invoices,
    ).toEqual([invoice]);
  });

  test("merchant form hides privileged input and delegates only allowed valid merchant submissions", async () => {
    const output = generate("single", "nextjs", "postgres", ["chargily"]);
    const source = [
      "schema.ts",
      "provider-url.ts",
      "mutations.ts",
      "use-payment-link-form.ts",
      "components/payment-link-form.tsx",
    ]
      .map((path) => output.read(output.root + "/features/billing/" + path))
      .join("\n");
    for (const merchant of [false, true]) {
      const calls: unknown[] = [];
      const ui = settingsFeatureHarness(source, ["usePaymentLinkForm", "BillingPaymentLinkView"], {
        z,
        createBillingPaymentLinkAction: async (input: unknown) => {
          calls.push(input);
          return { url: "https://pay.example.test/link" };
        },
      });
      const model = () => ui.render("usePaymentLinkForm", merchant);
      const render = () => ui.render("BillingPaymentLinkView", { state: model() });
      const formNode = nodes(render()).find(({ type }) => type === "Form");
      expect(Boolean(formNode)).toBe(merchant);
      const form = ui.forms[0]!;
      form.values.name = " Merchant link ";
      form.values.price = " price-id ";
      await form.handleSubmit();
      if (!merchant) {
        expect(calls).toEqual([]);
        expect(nodes(render()).some(({ type }) => type === "a")).toBe(false);
        continue;
      }
      expect(calls).toEqual([{ provider: "chargily", name: "Merchant link", price: "price-id" }]);
      expect(nodes(render()).find(({ type }) => type === "a")?.props.href).toBe(
        "https://pay.example.test/link",
      );
    }
  });
});
