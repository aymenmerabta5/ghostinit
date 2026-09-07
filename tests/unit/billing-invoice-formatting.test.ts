import { describe, expect, test } from "bun:test";
import { parseSync } from "oxc-parser";
import { resolveCreateConfig } from "../../src/commands/create/resolution.js";
import { buildProjectGenerationPlan } from "../../src/templates/default.js";

type Mode = "single" | "monorepo";
type Framework = "nextjs" | "tanstack-start";
type Database = "postgres" | "convex";
type Invoice = {
  id: string;
  provider: string;
  amount: number;
  currency?: string;
  paid: boolean;
  status: string;
};
const records: Invoice[] = [
  {
    id: "paddle-usd",
    provider: "paddle",
    amount: 1500,
    currency: "usd",
    paid: true,
    status: "paid",
  },
  {
    id: "paddle-jpy",
    provider: "paddle",
    amount: 1500,
    currency: "jpy",
    paid: true,
    status: "paid",
  },
  {
    id: "paddle-bhd",
    provider: "paddle",
    amount: 1500,
    currency: "bhd",
    paid: true,
    status: "paid",
  },
  { id: "polar-usd", provider: "polar", amount: 1500, currency: "usd", paid: true, status: "paid" },
  { id: "polar-jpy", provider: "polar", amount: 1500, currency: "jpy", paid: true, status: "paid" },
  { id: "polar-isk", provider: "polar", amount: 1500, currency: "isk", paid: true, status: "paid" },
  {
    id: "stripe-usd",
    provider: "stripe",
    amount: 1500,
    currency: "usd",
    paid: true,
    status: "paid",
  },
  {
    id: "stripe-jpy",
    provider: "stripe",
    amount: 1500,
    currency: "jpy",
    paid: true,
    status: "paid",
  },
  {
    id: "stripe-bhd",
    provider: "stripe",
    amount: 1500,
    currency: "bhd",
    paid: true,
    status: "paid",
  },
  {
    id: "stripe-ugx",
    provider: "stripe",
    amount: 1500,
    currency: "ugx",
    paid: true,
    status: "paid",
  },
];
const expectedMajor: Record<string, number> = {
  "paddle-usd": 15,
  "paddle-jpy": 1500,
  "paddle-bhd": 1.5,
  "polar-usd": 15,
  "polar-jpy": 1500,
  "polar-isk": 15,
  "stripe-usd": 15,
  "stripe-jpy": 1500,
  "stripe-bhd": 1.5,
  "stripe-ugx": 15,
};

function generate(
  mode: Mode,
  framework: Framework,
  database: Database,
  native = false,
  withI18n = false,
) {
  const result = resolveCreateConfig({
    name: "invoice-format",
    runtime: "bun",
    mode,
    framework,
    database,
    databaseWasExplicit: true,
    preset: "saas",
    billing: ["stripe", "chargily", "paddle", "polar"],
    features: [],
    apps: native ? ["web", "mobile", "desktop"] : ["web"],
    cache: "none",
    deploy: "none",
    withI18n,
  });
  if (!result.ok) throw new Error(result.message);
  const plan = buildProjectGenerationPlan(result.resolvedConfig, {
    desiredConfig: result.desiredConfig,
  });
  return {
    root: mode === "single" ? "src" : "apps/web/src",
    read: (path: string) => {
      const file = plan.files.find((entry) => entry.physicalPath === path);
      if (!file) throw new Error(`Missing ${path}`);
      return file.content;
    },
  };
}

type Element = { type: unknown; props: Record<string, unknown>; children: unknown[] };
function createElement(
  type: unknown,
  props: Record<string, unknown> | null,
  ...children: unknown[]
): Element {
  return { type, props: props ?? {}, children };
}
function text(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(text).join(" ");
  if (typeof value !== "object" || value === null || !("children" in value)) return "";
  return text((value as Element).children);
}
const transpiler = new Bun.Transpiler({
  loader: "tsx",
  tsconfig: { compilerOptions: { jsx: "react" } },
});

function functionExports(source: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const node of parseSync("module.tsx", source).program.body) {
    if (
      node.type === "ExportNamedDeclaration" &&
      node.declaration?.type === "FunctionDeclaration" &&
      node.declaration.id
    ) {
      result.set(
        node.declaration.id.name,
        source.slice(node.declaration.start, node.declaration.end),
      );
    }
  }
  return result;
}

function load(
  output: ReturnType<typeof generate>,
  path: string,
  component: string,
  invoices: Invoice[],
  locale = "en-US",
  numberFormatOnly = false,
) {
  const source = output.read(path);
  const sourceRoot = path.startsWith("apps/mobile/")
    ? "apps/mobile/src"
    : path.startsWith("apps/desktop/")
      ? "apps/desktop/src/renderer"
      : output.root;
  const moneySource = output.read(`${sourceRoot}/lib/billing-money.ts`);
  const moneyExports = functionExports(moneySource);
  expect(moneyExports.has("formatBillingInvoiceAmount")).toBe(true);
  expect(source).not.toContain("BILLING_ISO_CURRENCIES");
  const formatBillingInvoiceAmount: (invoice: Invoice, locale?: string) => string = new Function(
    "Intl",
    transpiler.transformSync(moneySource.replace(/^export /gm, "")) +
      "\nreturn formatBillingInvoiceAmount;",
  )(numberFormatOnly ? { NumberFormat: Intl.NumberFormat } : Intl);
  const imports = parseSync("invoice.tsx", source).program.body.filter(
    (entry) => entry.type === "ImportDeclaration",
  );
  let stripped = source;
  for (const entry of [...imports].reverse())
    stripped = stripped.slice(0, entry.start) + stripped.slice(entry.end);
  stripped = stripped.replace(/^export default function /gm, "function ").replace(/^export /gm, "");
  const query = (kind: string) => ({
    queryOptions: () => ({ kind }),
    mutationOptions: () => ({ kind }),
  });
  const bindings: Record<string, unknown> = {
    React: {
      createElement,
      useMemo: (callback: () => unknown) => callback(),
      useEffect() {},
      useState: (value: unknown) => [value, () => {}],
    },
    useSurfaceTranslations: () => (key: string) => key,
    useSurfaceLocale: () => locale,
    useTranslations: () => (key: string) => key,
    formatBillingInvoiceAmount,
    createFileRoute: () => (value: unknown) => value,
    useAuth: () => ({ isAuthenticated: true }),
    useAuthOwnedEffect: () => () => () => true,
    useQuery: ({ kind }: { kind: string }) => ({
      data:
        kind === "me"
          ? { user: { id: "user", role: "user", banned: false } }
          : { invoices, subscriptions: [] },
      isPending: false,
      isFetching: false,
      refetch: async () => {},
    }),
    useMutation: () => ({
      isPending: false,
      mutateAsync: async () => ({ url: "https://pay.example.test" }),
    }),
    orpc: {
      me: query("me"),
      billing: {
        subscriptions: query("billing"),
        createCheckout: query("checkout"),
        createPortalSession: query("portal"),
        createPaymentLink: query("payment-link"),
      },
    },
    desktopQueryOptions: { me: () => ({ kind: "me" }) },
    WebBrowser: { maybeCompleteAuthSession() {} },
  };
  for (const entry of imports) {
    if (entry.source.value === "@/lib/i18n") {
      const exports = functionExports(output.read(`${sourceRoot}/lib/i18n.tsx`));
      for (const specifier of entry.specifiers) {
        if (specifier.type !== "ImportSpecifier") continue;
        const name =
          specifier.imported.type === "Identifier"
            ? specifier.imported.name
            : specifier.imported.value;
        expect(exports.has(name), `${path} imports missing native hook ${name}`).toBe(true);
      }
      const hook = exports.get("usePlatformI18n");
      expect(hook).toBeDefined();
      bindings.usePlatformI18n = new Function(
        "React",
        "I18nContext",
        transpiler.transformSync(hook!) + "\nreturn usePlatformI18n;",
      )({ useContext: () => ({ locale }) }, {});
    }
    if (entry.source.value === "@/lib/translations") {
      const exports = functionExports(output.read(`${sourceRoot}/lib/translations.ts`));
      for (const specifier of entry.specifiers) {
        if (specifier.type !== "ImportSpecifier") continue;
        const name =
          specifier.imported.type === "Identifier"
            ? specifier.imported.name
            : specifier.imported.value;
        expect(exports.has(name), `${path} imports missing surface hook ${name}`).toBe(true);
      }
    }
  }
  for (const name of [
    "ActivityIndicator",
    "ScrollView",
    "View",
    "Text",
    "Link",
    "Badge",
    "Button",
    "Card",
    "CardContent",
    "CardDescription",
    "CardHeader",
    "CardTitle",
    "Input",
    "Empty",
    "EmptyHeader",
    "EmptyTitle",
    "EmptyDescription",
    "Alert",
    "AlertTitle",
    "AlertDescription",
    "Skeleton",
    "Table",
    "TableBody",
    "TableCell",
    "TableHead",
    "TableHeader",
    "TableRow",
  ])
    bindings[name] = name;
  return new Function(
    ...Object.keys(bindings),
    transpiler.transformSync(stripped) +
      `\nreturn { render: ${component}, formatBillingInvoiceAmount };`,
  )(...Object.values(bindings)) as {
    render: (props?: unknown) => unknown;
    formatBillingInvoiceAmount: (invoice: Invoice, locale?: string) => string;
  };
}

function expectAmounts(rendered: unknown, invoices: Invoice[], locale = "en-US") {
  const content = text(rendered);
  for (const invoice of invoices) {
    const expected = new Intl.NumberFormat(locale, {
      style: "currency",
      currency: invoice.currency!.toUpperCase(),
      currencyDisplay: "code",
    }).format(expectedMajor[invoice.id]!);
    expect(content, invoice.id).toContain(expected);
  }
  expect(content).not.toMatch(/1500 usd|1500 USD|USD\s*1,500\.00/);
}

describe("provider invoice monetary presentation", () => {
  for (const mode of ["single", "monorepo"] as const)
    for (const framework of ["nextjs", "tanstack-start"] as const)
      for (const database of ["postgres", "convex"] as const) {
        test(`${mode}/${framework}/${database} renders actual invoice JSX with currency-aware provider units`, () => {
          const output = generate(mode, framework, database);
          const path =
            framework === "nextjs"
              ? `${output.root}/app/billing/components/billing-invoices.tsx`
              : `${output.root}/features/billing/billing-invoices.tsx`;
          const component = load(output, path, "BillingInvoices", records);
          expectAmounts(component.render({ invoices: records }), records);
          const invalid = {
            id: "invalid",
            provider: "paddle",
            amount: 1500,
            paid: true,
            status: "paid",
          };
          for (const invoice of [
            invalid,
            { ...invalid, currency: "ZZZ" },
            { ...invalid, currency: "USD", amount: Number.NaN },
            { ...invalid, currency: "DZD", provider: "chargily" },
          ]) {
            expect(component.formatBillingInvoiceAmount(invoice)).toBe("—");
          }
        });
      }

  for (const mode of ["single", "monorepo"] as const)
    for (const database of ["postgres", "convex"] as const) {
      test(`${mode}/${database} Stripe-specific JSX uses the same zero/two/three-decimal contract`, () => {
        const output = generate(mode, "nextjs", database);
        const selected = records.filter((invoice) => invoice.provider === "stripe");
        const component = load(
          output,
          `${output.root}/app/billing/components/providers/stripe-invoices.tsx`,
          "StripeInvoices",
          selected,
        );
        expectAmounts(component.render({ invoices: selected }), selected);
      });
    }

  for (const database of ["postgres", "convex"] as const)
    for (const framework of ["nextjs", "tanstack-start"] as const)
      for (const withI18n of [false, true]) {
        test(`${framework}/${database}/i18n=${withI18n} Expo and Electron render money through real emitted locale contracts`, () => {
          const output = generate("monorepo", framework, database, true, withI18n);
          const locale = withI18n ? "fr" : "en";
          const mobile = load(
            output,
            "apps/mobile/app/billing.tsx",
            "BillingScreen",
            records,
            locale,
          );
          expectAmounts(mobile.render(), records, locale);
          const desktop = load(
            output,
            "apps/desktop/src/renderer/routes/billing.tsx",
            "BillingPage",
            records,
            locale,
          );
          expectAmounts(desktop.render(), records, locale);
          expect(output.read("apps/mobile/src/lib/billing-money.ts")).toBe(
            output.read("apps/desktop/src/renderer/lib/billing-money.ts"),
          );
        });
      }

  test("formatted JSX follows the selected locale without changing persisted values", () => {
    const output = generate("single", "tanstack-start", "convex");
    const before = JSON.stringify(records);
    for (const locale of ["fr-FR", "ar-DZ"]) {
      const component = load(
        output,
        "src/features/billing/billing-invoices.tsx",
        "BillingInvoices",
        records,
        locale,
      );
      expectAmounts(component.render({ invoices: records }), records, locale);
    }
    expect(JSON.stringify(records)).toBe(before);
  });

  test("renders money with native NumberFormat support and no newer Intl enumeration API", () => {
    const output = generate("single", "tanstack-start", "convex");
    const component = load(
      output,
      "src/features/billing/billing-invoices.tsx",
      "BillingInvoices",
      records,
      "en-US",
      true,
    );
    expectAmounts(component.render({ invoices: records }), records);
  });
});
