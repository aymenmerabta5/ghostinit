import { describe, expect, it } from "bun:test";
import { parseSync } from "oxc-parser";
import { resolveCreateConfig } from "../../src/commands/create/resolution.js";
import { generateProjectFiles } from "../../src/templates/default.js";
import type { TemplateFile } from "../../src/templates/shared.js";

type Database = "postgres" | "convex";
type App = "mobile" | "desktop";
type Provider = "stripe" | "chargily" | "paddle" | "polar";
type ClientOption = {
  id: Provider;
  checkout: boolean;
  portal: boolean;
  paymentLink: boolean;
};

function resolveBillingProject(
  mode: "monorepo" | "single",
  database: Database | "none",
  app: App,
  billing: Provider[],
) {
  return resolveCreateConfig({
    name: "selected-app-billing",
    runtime: "bun",
    mode,
    framework: "nextjs",
    database,
    databaseWasExplicit: database !== "none",
    preset: billing.length > 0 ? "saas" : "frontend",
    billing,
    apps: mode === "monorepo" ? ["web", app] : [app],
    features: [],
    cache: "none",
    deploy: "none",
    withAnalytics: billing.length === 0,
    withI18n: billing.length === 0,
  });
}

function generate(database: Database, app: App, billing: Provider[]): TemplateFile[] {
  const result = resolveBillingProject("monorepo", database, app, billing);
  if (!result.ok) throw new Error(result.message);
  return generateProjectFiles(result.config, { dryRun: true });
}

function contentAt(files: TemplateFile[], path: string): string {
  const file = files.find((candidate) => candidate.path === path);
  expect(file, `missing ${path}`).toBeDefined();
  return file?.content ?? "";
}

function expectOrdered(source: string, label: string, ...tokens: string[]): void {
  let cursor = -1;
  for (const token of tokens) {
    const next = source.indexOf(token, cursor + 1);
    expect(next, `${label}: ${token}`).toBeGreaterThan(cursor);
    cursor = next;
  }
}

function expectSecureBillingApplication(
  files: TemplateFile[],
  selected: readonly Provider[],
): void {
  const procedureRoot = "packages/api/src/procedures/billing";
  const portal = contentAt(files, `${procedureRoot}/create-portal-session.ts`);
  const paymentLink = contentAt(files, `${procedureRoot}/create-payment-link.ts`);
  expect(portal).toContain("context.application.billing.createPortalSession(input)");
  expect(portal).not.toMatch(
    /actorId: context\.user\.id|customerId: z\.|getBillingProvider|\brateLimit\(/,
  );
  expect(paymentLink).toContain("context.application.billing.createPaymentLink(input)");
  expect(paymentLink).toContain("z.string().min(1).max(120)");
  expect(paymentLink).toContain(".min(1).max(20)");
  expect(paymentLink).not.toMatch(/provider\.createPaymentLink|getBillingProvider|\brateLimit\(/);

  const facade = contentAt(files, "packages/services/src/application/facade.ts");
  expect(facade).toContain('"APPLICATION_UNAUTHENTICATED"');
  expect(facade).toContain('"APPLICATION_ACCOUNT_SUSPENDED"');
  expect(facade).toContain('"APPLICATION_EMAIL_NOT_VERIFIED"');
  expect(facade).toContain('"APPLICATION_ADMIN_REQUIRED"');
  expectOrdered(
    facade,
    "billing subscriptions",
    "subscriptions: async () =>",
    "requireVerifiedPrincipal(dependencies.principal)",
    'dependencies.rateLimit("billing:subscriptions:" + principal.userId, 60, 60_000)',
    "dependencies.billing.subscriptions(principal.userId)",
  );
  expectOrdered(
    facade,
    "billing checkout",
    "createCheckout: async (input: BillingCheckoutInput)",
    "requireVerifiedPrincipal(dependencies.principal)",
    'dependencies.rateLimit("billing:checkout:" + principal.userId, 10, 60_000)',
    "dependencies.billing.createCheckout(principal, input)",
  );
  expectOrdered(
    facade,
    "billing portal",
    "createPortalSession: async (input: BillingPortalInput)",
    "requireVerifiedPrincipal(dependencies.principal)",
    'dependencies.rateLimit("billing:portal:" + principal.userId, 20, 60_000)',
    "dependencies.billing.createPortalSession(principal, input)",
  );
  expectOrdered(
    facade,
    "billing payment link",
    "createPaymentLink: async (input: BillingPaymentLinkInput)",
    "requireAdminPrincipal(requireVerifiedPrincipal(dependencies.principal))",
    'dependencies.rateLimit("billing:payment-link:" + principal.userId, 10, 60_000)',
    "dependencies.billing.createPaymentLink(principal, input)",
  );

  const server = contentAt(files, "packages/services/src/application/server.ts");
  expectOrdered(
    server,
    "portal provider composition",
    "async createPortalSession(principal, input: BillingPortalInput)",
    "validateBillingRedirectUrl(input.returnUrl",
    "getBillingProvider(input.provider)",
    "createPortalSessionService({ actorId: principal.userId, provider: input.provider",
  );
  expectOrdered(
    server,
    "payment-link provider composition",
    "async createPaymentLink(_principal, input: BillingPaymentLinkInput)",
    "getBillingProvider(input.provider)",
    "if (!provider.createPaymentLink)",
    "return await provider.createPaymentLink",
  );

  const registry = contentAt(files, "packages/billing/src/index.ts");
  const paths = new Set(files.map(({ path }) => path));
  for (const provider of ["stripe", "chargily", "paddle", "polar"] as const) {
    const selectedProvider = selected.includes(provider);
    expect(
      registry.includes(`import("./providers/${provider}")`),
      `${provider} registry leakage`,
    ).toBe(selectedProvider);
    expect(
      paths.has(`packages/billing/src/providers/${provider}.ts`),
      `${provider} file leakage`,
    ).toBe(selectedProvider);
  }
}

function isProvider(value: unknown): value is Provider {
  return value === "stripe" || value === "chargily" || value === "paddle" || value === "polar";
}

function clientOptions(source: string): ClientOption[] {
  const program = parseSync("billing-model.ts", source);
  expect(program.errors).toEqual([]);
  const declarations = program.program.body.flatMap((statement) =>
    statement.type === "ExportNamedDeclaration" &&
    statement.declaration?.type === "VariableDeclaration"
      ? statement.declaration.declarations
      : [],
  );
  const selected = declarations.filter(
    ({ id }) => id.type === "Identifier" && id.name === "selectedProviders",
  );
  expect(selected).toHaveLength(1);
  const initializer = selected[0]?.init;
  if (initializer?.type !== "ArrayExpression")
    throw new Error("Selected provider options were not an exported array");
  const parsed: unknown = JSON.parse(source.slice(initializer.start, initializer.end));
  if (!Array.isArray(parsed)) throw new Error("Selected provider options were not an array");
  return parsed.map((value) => {
    const id = typeof value === "object" && value !== null ? Reflect.get(value, "id") : undefined;
    const checkout =
      typeof value === "object" && value !== null ? Reflect.get(value, "checkout") : undefined;
    const portal =
      typeof value === "object" && value !== null ? Reflect.get(value, "portal") : undefined;
    const paymentLink =
      typeof value === "object" && value !== null ? Reflect.get(value, "paymentLink") : undefined;
    if (
      !isProvider(id) ||
      typeof checkout !== "boolean" ||
      typeof portal !== "boolean" ||
      typeof paymentLink !== "boolean"
    ) {
      throw new Error("Invalid selected provider option");
    }
    return { id, checkout, portal, paymentLink };
  });
}

function loadReturnUrl(
  source: string,
  functionName: "billingReturnUrl" | "desktopBillingReturnUrl",
  env: Record<string, string>,
): (status: "success" | "cancel" | "return") => string {
  const body = source.match(new RegExp(`function ${functionName}\\([\\s\\S]*?\\n\\}`))?.[0];
  if (!body) throw new Error(`Missing ${functionName}`);
  const javascript = new Bun.Transpiler({ loader: "ts" }).transformSync(body);
  const loaded: unknown = new Function("env", `${javascript}; return ${functionName};`)(env);
  if (typeof loaded !== "function") throw new Error(`${functionName} did not compile`);
  return (status) => {
    const result: unknown = Reflect.apply(loaded, undefined, [status]);
    if (typeof result !== "string") throw new Error(`${functionName} returned a non-string`);
    return result;
  };
}

describe("selected Expo and Electron billing parity", () => {
  it("builds only configured same-origin or application deep-link returns", () => {
    const mobile = generate("postgres", "mobile", ["stripe"]);
    const mobileSource = contentAt(mobile, "apps/mobile/src/features/billing/mutations.ts");
    expect(
      loadReturnUrl(mobileSource, "billingReturnUrl", {
        EXPO_PUBLIC_APP_URL: "https://app.example.test/base",
      })("success"),
    ).toBe("https://app.example.test/billing?checkout=success");
    expect(
      loadReturnUrl(mobileSource, "billingReturnUrl", {
        EXPO_PUBLIC_APP_URL: "myapp://billing",
      })("cancel"),
    ).toBe("myapp://billing?checkout=cancel");
    expect(() =>
      loadReturnUrl(mobileSource, "billingReturnUrl", {
        EXPO_PUBLIC_APP_URL: "javascript:alert(1)",
      })("success"),
    ).toThrow("application URL or deep link");

    const desktop = generate("postgres", "desktop", ["stripe"]);
    const desktopOrpc = contentAt(desktop, "apps/desktop/src/renderer/lib/orpc.ts");
    expect(
      loadReturnUrl(desktopOrpc, "desktopBillingReturnUrl", {
        VITE_APP_URL: "https://app.example.test/base",
      })("return"),
    ).toBe("https://app.example.test/billing?checkout=return");
    expect(() =>
      loadReturnUrl(desktopOrpc, "desktopBillingReturnUrl", {
        VITE_APP_URL: "file:///desktop/index.html",
      })("success"),
    ).toThrow("trusted HTTP(S)");
  });

  for (const database of ["postgres", "convex"] as const) {
    for (const app of ["mobile", "desktop"] as const) {
      for (const selected of [
        ["stripe", "chargily"],
        ["chargily", "paddle"],
        ["chargily", "polar"],
      ] as const) {
        it(`monorepo/${database}/web+${app}/${selected.join("+")} exposes only selected secure capabilities`, () => {
          const files = generate(database, app, [...selected]);
          const prefix = `apps/${app}/`;
          const billingPath =
            app === "mobile"
              ? `${prefix}app/billing.tsx`
              : `${prefix}src/renderer/routes/billing.tsx`;
          const billing = contentAt(files, billingPath);
          const featureRoot =
            app === "mobile"
              ? `${prefix}src/features/billing`
              : `${prefix}src/renderer/features/billing`;
          const model = contentAt(files, `${featureRoot}/model.ts`);
          const queries = contentAt(files, `${featureRoot}/queries.ts`);
          const mutations = contentAt(files, `${featureRoot}/mutations.ts`);
          const snapshot = contentAt(files, `${featureRoot}/use-billing-snapshot.ts`);
          const actions = contentAt(files, `${featureRoot}/use-billing-actions.ts`);
          const screen = contentAt(files, `${featureRoot}/screen.tsx`);
          const providerCard = contentAt(files, `${featureRoot}/components/provider-card.tsx`);
          const options = clientOptions(model);

          expect(options.map(({ id }) => id)).toEqual([...selected]);
          expect(options.every(({ checkout }) => checkout)).toBe(true);
          expect(options.find(({ id }) => id === "chargily")?.paymentLink ?? false).toBe(
            selected.some((provider) => provider === "chargily"),
          );
          expect(
            options.filter(({ id }) => id !== "chargily").every(({ paymentLink }) => !paymentLink),
          ).toBe(true);
          expect(options.find(({ id }) => id === "chargily")?.portal ?? false).toBe(false);
          expect(options.filter(({ id }) => id !== "chargily").every(({ portal }) => portal)).toBe(
            true,
          );

          expect(billing).toContain('import { BillingScreen } from "@/features/billing/screen"');
          expect(billing).not.toMatch(/useQuery|useMutation|orpc|useBilling/);
          expect(screen).toContain('import { selectedProviders } from "./model"');
          expect(screen).toContain("selectedProviders.map");
          expect(screen).toContain("disabled={!snapshot.isAuthenticated || actions.isPending}");
          expect(screen).toContain("paymentLink={provider.paymentLink ? snapshot.isAdmin");
          expect(providerCard).toContain("{provider.portal ?");
          expect(queries).toContain("orpc.billing.subscriptions.queryOptions");
          expect(mutations).toContain("orpcClient.billing.createCheckout(");
          expect(mutations).toContain("orpcClient.billing.createPortalSession(");
          expect(mutations).toContain("orpcClient.billing.createPaymentLink(");
          expect(actions).toContain("useAuthOwnedMutation(performBillingAction");
          expect(actions).toContain("if (isCurrent()) refresh()");
          expect(snapshot).toContain("snapshot.data?.invoices");
          expect(snapshot).toContain("useBillingSnapshotQuery(isAuthenticated)");
          expect(model).toContain('typeof value._id === "string"');
          expect(screen).toContain("Start checkout");
          expect(screen).toContain("Open portal");
          for (const file of files.filter(
            ({ path }) => path === billingPath || path.startsWith(`${featureRoot}/`),
          )) {
            expect(file.content, file.path).not.toContain("customerId");
            expect(file.content, file.path).not.toMatch(/fetch\(["']\/api\/billing/);
            expect(file.content, file.path).not.toContain(
              "Start checkout from the web application",
            );
            expect(file.content, file.path).not.toContain("Math.random");
            expect(file.content, file.path).not.toContain('useAuth } from "../hooks/useAuth"');
            expect(file.content, file.path).not.toContain("isRecord(user)");
          }

          if (app === "mobile") {
            expect(mutations).toContain("env.EXPO_PUBLIC_APP_URL");
            expect(mutations).toContain("configured billing deep link must target /billing");
            expect(mutations).toContain("Linking.canOpenURL");
            expect(mutations).toContain("WebBrowser.openAuthSessionAsync");
            expect(mutations).toContain('Reflect.get(cryptoValue, "getRandomValues")');
          } else {
            expect(mutations).toContain("desktopBillingReturnUrl");
            expect(mutations).toContain("window.desktopBridge.shellOpenExternal");
            expect(queries).toContain("orpc.me.queryOptions({ enabled })");
            expect(snapshot).toContain("const identity = useBillingIdentityQuery(true)");
            expect(snapshot).toContain(
              "Boolean(identity.data?.user && !identity.data.user.banned)",
            );
            expect(snapshot).toContain(
              "const role = identity.data?.user?.banned ? null : identity.data?.user?.role",
            );
            const orpc = contentAt(files, `${prefix}src/renderer/lib/orpc.ts`);
            expect(orpc).toContain("export function desktopBillingReturnUrl");
            expect(orpc).toContain("env.VITE_APP_URL");
            const main = contentAt(files, `${prefix}src/main.ts`);
            expect(main).toContain("parsed.username || parsed.password");
          }

          expectSecureBillingApplication(files, selected);
          const redirectRoot = "packages/services/src";
          const redirect = contentAt(files, `${redirectRoot}/billing/redirect-url-policy.ts`);
          expect(redirect).toContain("trustedBillingDeepLink");
          expect(redirect).toContain('billingDeepLinkRoute(parsed) !== "/billing"');
        });
      }
    }
  }

  for (const database of ["postgres", "convex"] as const) {
    for (const app of ["mobile", "desktop"] as const) {
      for (const selected of [
        ["stripe", "chargily"],
        ["chargily", "paddle"],
        ["chargily", "polar"],
      ] as const) {
        it(`rejects single/${database}/${app}/${selected.join("+")} without a backend host`, () => {
          const result = resolveBillingProject("single", database, app, [...selected]);
          expect(result.ok).toBe(false);
          if (result.ok) throw new Error(`single ${app} billing must remain unreachable`);
          expect(result.reason).toBe("single-native-server-capabilities-unsupported");
          expect(result.unsupportedSelections).toEqual(
            expect.arrayContaining([
              `database:${database}`,
              "auth",
              "api",
              "email",
              `billing:${[...selected].sort().join(",")}`,
            ]),
          );
        });
      }
    }
  }

  it("keeps single native frontend-only projects reachable without dormant billing clients", () => {
    for (const app of ["mobile", "desktop"] as const) {
      const result = resolveBillingProject("single", "none", app, []);
      expect(result.ok, app).toBe(true);
      if (!result.ok) throw new Error(result.message);
      expect(result.config.analytics).toBe(true);
      expect(result.config.i18n).toBe(true);
      expect(result.config.billing).toEqual([]);

      const files = generateProjectFiles(result.config, { dryRun: true });
      const paths = new Set(files.map(({ path }) => path));
      expect(paths.has(app === "mobile" ? "app/index.tsx" : "src/renderer/routes/index.tsx")).toBe(
        true,
      );
      expect([...paths].some((path) => /(?:^|\/)billing(?:\/|\.tsx?$)/i.test(path))).toBe(false);
      expect(files.map(({ content }) => content).join("\n")).not.toMatch(
        /(?:href|to)=["']\/billing["']/,
      );
    }
  });
});
