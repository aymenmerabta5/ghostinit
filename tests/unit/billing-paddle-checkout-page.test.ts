// @allow-long 430: executed Paddle transaction, server validation, client lifecycle, and deployment CSP contracts
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseSync } from "oxc-parser";
import { resolveCreateConfig } from "../../src/commands/create/resolution.js";
import { buildProjectGenerationPlan } from "../../src/templates/default.js";
import { paddleCheckoutControllerContent } from "../../src/templates/billing/ui/paddle-checkout-client.js";
import { paddleCheckoutContentSecurityPolicy } from "../../src/templates/billing/ui/paddle-csp.js";

const TRANSACTION = "txn_01h0123456789abcdefghjkmnp";
const TOKEN = "test_0123456789abcdefghijklmnop";
const transpiler = new Bun.Transpiler({ loader: "ts" });
type Mode = "single" | "monorepo";
type Framework = "nextjs" | "tanstack-start";
type Options = {
  transactionId: string;
  successUrl: string;
  cancelUrl: string;
  environment: "sandbox" | "production";
};
const options: Options = {
  transactionId: TRANSACTION,
  successUrl: "myapp://billing?checkout=success",
  cancelUrl: "myapp://billing?checkout=cancel",
  environment: "sandbox",
};

function generate(
  mode: Mode,
  framework: Framework,
  database: "postgres" | "convex",
  deploy: "none" | "cloudflare" = "none",
) {
  const resolution = resolveCreateConfig({
    name: "paddle-page",
    runtime: "bun",
    mode,
    framework,
    database,
    databaseWasExplicit: true,
    preset: "saas",
    billing: ["paddle"],
    features: [],
    apps: ["web"],
    cache: "none",
    deploy,
  });
  if (!resolution.ok) throw new Error(resolution.message);
  const plan = buildProjectGenerationPlan(resolution.resolvedConfig, {
    desiredConfig: resolution.desiredConfig,
  });
  const read = (path: string) => {
    const file = plan.files.find((entry) => entry.physicalPath === path);
    if (!file) throw new Error(`Missing ${path}`);
    return file.content;
  };
  return { read, root: mode === "monorepo" ? "apps/web/" : "" };
}

function executable(source: string): string {
  let withoutImports = source;
  const imports = parseSync("paddle-probe.ts", source).program.body.filter(
    (entry) => entry.type === "ImportDeclaration",
  );
  for (const entry of imports.reverse())
    withoutImports = withoutImports.slice(0, entry.start) + withoutImports.slice(entry.end);
  return transpiler.transformSync(withoutImports.replace(/^export /gm, ""));
}
function load<T>(source: string, exports: string, bindings: Record<string, unknown>): T {
  return new Function(...Object.keys(bindings), executable(source) + `\nreturn { ${exports} };`)(
    ...Object.values(bindings),
  ) as T;
}
async function microtasks() {
  for (let n = 0; n < 12; n += 1) await Promise.resolve();
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}

function controller() {
  const opened: unknown[] = [];
  const navigation: string[] = [];
  const statuses: string[] = [];
  const timers = new Map<number, () => void>();
  let timerId = 0;
  let initialized = 0;
  let closed = 0;
  let eventCallback!: (event: { name: string; data?: { transaction_id: string } }) => void;
  const ready = deferred<{ Checkout: { open: (input: unknown) => void; close: () => void } }>();
  let currentUrl = `https://app.example.test/billing/paddle-checkout?_ptxn=${TRANSACTION}`;
  const loaded = load<{
    startPaddleCheckout: (
      options: Options,
      token: string,
      status: (status: string) => void,
      navigate: (url: string) => void,
    ) => () => void;
    validPaddleClientToken: (token: string, environment: string) => boolean;
  }>(paddleCheckoutControllerContent, "startPaddleCheckout, validPaddleClientToken", {
    initializePaddle: (input: { eventCallback: typeof eventCallback }) => {
      initialized++;
      eventCallback = input.eventCallback;
      return ready.promise;
    },
    window: {
      location: {
        get href() {
          return currentUrl;
        },
      },
      history: {
        state: null,
        replaceState: (_state: unknown, _title: string, url: string) => {
          currentUrl = url;
        },
      },
    },
    setTimeout: (callback: () => void) => {
      const id = ++timerId;
      timers.set(id, callback);
      return id;
    },
    clearTimeout: (id: number) => timers.delete(id),
  });
  return {
    ...loaded,
    opened,
    navigation,
    statuses,
    timers,
    get initialized() {
      return initialized;
    },
    get closed() {
      return closed;
    },
    get currentUrl() {
      return currentUrl;
    },
    start: () =>
      loaded.startPaddleCheckout(
        options,
        TOKEN,
        (status) => statuses.push(status),
        (url) => navigation.push(url),
      ),
    resolve: () =>
      ready.resolve({
        Checkout: {
          open: (input) => opened.push(input),
          close: () => {
            closed++;
            eventCallback({ name: "checkout.closed", data: { transaction_id: TRANSACTION } });
          },
        },
      }),
    event: (name: string, transactionId = TRANSACTION) =>
      eventCallback({ name, data: { transaction_id: transactionId } }),
  };
}

describe("Paddle transaction payment page", () => {
  test("creates the transaction with the generated approved page and preserves native return targets", async () => {
    const source = readFileSync(
      resolve(import.meta.dir, "../../src/templates/billing/providers/paddle/checkout.ts"),
      "utf8",
    );
    const payloads: unknown[] = [];
    const client = {
      transactions: {
        list: () => ({ async *[Symbol.asyncIterator]() {} }),
        create: async (input: unknown) => {
          payloads.push(input);
          return {
            id: TRANSACTION,
            checkout: {
              url: `https://app.example.test/billing/paddle-checkout?_ptxn=${TRANSACTION}`,
            },
          };
        },
      },
    };
    const { createPaddleCheckout } = load<{
      createPaddleCheckout: (config: unknown, input: unknown) => Promise<{ url: string }>;
    }>(source, "createPaddleCheckout", {
      getPaddleClient: async () => client,
      requirePaddleResponseString: (value: unknown) => {
        if (typeof value !== "string" || !value) throw new Error("Invalid Paddle response");
        return value;
      },
    });
    const result = await createPaddleCheckout(
      { appUrl: "https://app.example.test" },
      {
        userId: "actor",
        customerId: "customer",
        priceId: "price",
        requestKey: "request",
        successUrl: options.successUrl,
        failureUrl: options.cancelUrl,
      },
    );
    expect(payloads).toHaveLength(1);
    expect(payloads[0]).toMatchObject({
      checkout: { url: "https://app.example.test/billing/paddle-checkout" },
      collectionMode: "automatic",
      customData: { userId: "actor", requestKey: "request" },
    });
    const checkout = new URL(result.url);
    expect(checkout.pathname).toBe("/billing/paddle-checkout");
    expect(checkout.searchParams.get("_ptxn")).toBe(TRANSACTION);
    expect(checkout.searchParams.get("successUrl")).toBe(options.successUrl);
    expect(checkout.searchParams.get("cancelUrl")).toBe(options.cancelUrl);
  });

  test("resolves only configured return destinations without a second browser session", () => {
    for (const mode of ["single", "monorepo"] as const) {
      const output = generate(mode, "nextjs", "postgres");
      const services = mode === "single" ? "src/server/services" : "packages/services/src";
      const policy = output.read(`${services}/billing/redirect-url-policy.ts`);
      const setup = output.read(`${output.root}src/server/billing/paddle-checkout.ts`);
      class ServiceError extends Error {
        constructor(_code: string, message: string) {
          super(message);
        }
      }
      const { resolvePaddleCheckoutPage } = load<{
        resolvePaddleCheckoutPage: (input: unknown) => { state: string; options?: Options };
      }>(policy + "\n" + setup, "resolvePaddleCheckoutPage", {
        ServiceError,
        process: {
          env: {
            BETTER_AUTH_URL: "https://app.example.test",
            EXPO_PUBLIC_APP_URL: "myapp://billing",
            PADDLE_ENVIRONMENT: "sandbox",
          },
        },
      });
      expect(resolvePaddleCheckoutPage(options)).toEqual({ state: "ready", options });
      for (const successUrl of [
        "https://evil.example/",
        "javascript:alert(1)",
        "myapp://settings",
        "https://user:secret@app.example.test/billing",
      ]) {
        expect(resolvePaddleCheckoutPage({ ...options, successUrl }).state).toBe("invalid");
      }
      expect(
        resolvePaddleCheckoutPage({ ...options, transactionId: TRANSACTION + "\n" }).state,
      ).toBe("invalid");
      expect(resolvePaddleCheckoutPage({ transactionId: TRANSACTION })).toMatchObject({
        state: "ready",
        options: {
          successUrl: "https://app.example.test/billing/success",
          cancelUrl: "https://app.example.test/billing/cancel",
        },
      });
      expect(setup).not.toMatch(/getSession|application\.me|fetch\(|\.billing\.subscriptions/);
    }
  });

  test("initializes and opens once across effect cleanup/remount, then navigates at most once", async () => {
    const fixture = controller();
    const cancelFirst = fixture.start();
    cancelFirst();
    const cleanup = fixture.start();
    fixture.resolve();
    await microtasks();
    expect(fixture.initialized).toBe(1);
    expect(fixture.opened).toEqual([
      { transactionId: TRANSACTION, settings: { displayMode: "overlay" } },
    ]);
    const location = new URL(fixture.currentUrl);
    expect(location.searchParams.has("_ptxn")).toBe(false);
    expect(location.searchParams.get("transactionId")).toBe(TRANSACTION);
    fixture.event("checkout.completed", "txn_different");
    expect(fixture.navigation).toEqual([]);
    fixture.event("checkout.loaded");
    expect(fixture.statuses.at(-1)).toBe("ready");
    fixture.event("checkout.completed");
    fixture.event("checkout.closed");
    fixture.event("checkout.completed");
    expect(fixture.navigation).toEqual([options.successUrl]);
    expect(fixture.timers.size).toBe(0);
    cleanup();
  });

  test("cancellation returns to the validated cancel target and late loading cannot open a timed-out page", async () => {
    const fixture = controller();
    const cleanup = fixture.start();
    fixture.resolve();
    await microtasks();
    fixture.event("checkout.closed");
    expect(fixture.navigation).toEqual([options.cancelUrl]);
    cleanup();
    const delayed = controller();
    const stop = delayed.start();
    for (const timer of delayed.timers.values()) timer();
    delayed.resolve();
    await microtasks();
    expect(delayed.statuses.at(-1)).toBe("error");
    expect(delayed.opened).toEqual([]);
    stop();
  });

  test("does not let cleanup close a new owner or accept a server key as a browser token", async () => {
    const fixture = controller();
    const first = fixture.start();
    fixture.resolve();
    await microtasks();
    fixture.event("checkout.loaded");
    first();
    const second = fixture.start();
    await microtasks();
    expect(fixture.initialized).toBe(1);
    expect(fixture.opened).toHaveLength(1);
    expect(fixture.closed).toBe(0);
    expect(fixture.navigation).toEqual([]);
    for (const token of [
      "pdl_sdbx_apikey_secret",
      "pdl_live_apikey_secret",
      "pdl_ntf_REPLACE",
      TOKEN + "\n",
    ])
      expect(fixture.validPaddleClientToken(token, "sandbox")).toBe(false);
    expect(fixture.validPaddleClientToken(TOKEN, "sandbox")).toBe(true);
    expect(fixture.validPaddleClientToken(TOKEN, "production")).toBe(false);
    second();
    await microtasks();
    expect(fixture.closed).toBe(1);
    expect(fixture.navigation).toEqual([]);
  });

  for (const mode of ["single", "monorepo"] as const)
    for (const framework of ["nextjs", "tanstack-start"] as const)
      for (const profile of [
        { database: "postgres", deploy: "none" },
        { database: "convex", deploy: "none" },
        { database: "convex", deploy: "cloudflare" },
      ] as const) {
        test(`${mode}/${framework}/${profile.database}/${profile.deploy} emits the page, direct SDK dependency, and scoped CSP`, async () => {
          const output = generate(mode, framework, profile.database, profile.deploy);
          const path =
            framework === "nextjs"
              ? `${output.root}src/app/billing/paddle-checkout/page.tsx`
              : `${output.root}src/routes/billing_.paddle-checkout.tsx`;
          expect(output.read(path)).toContain("PaddleCheckoutPage");
          expect(output.read("docs/PADDLE_CHECKOUT.md")).toContain("default payment link");
          const manifest = JSON.parse(output.read(`${output.root}package.json`)) as {
            dependencies: Record<string, string>;
          };
          expect(manifest.dependencies["@paddle/paddle-js"]).toBe("1.6.5");
          const process = {
            env: {
              NODE_ENV: "production",
              NEXT_PUBLIC_CONVEX_URL: "https://fixture.convex.cloud",
              CONVEX_SITE_URL: "https://fixture.convex.site",
              VITE_CONVEX_URL: "https://fixture.convex.cloud",
            },
          };
          let base: string;
          let checkout: string;
          if (framework === "nextjs") {
            const source = output
              .read(`${output.root}next.config.ts`)
              .replace(/^export default config;?$/gm, "");
            const { config } = load<{
              config: {
                headers: () => Promise<
                  Array<{ source: string; headers: Array<{ key: string; value: string }> }>
                >;
              };
            }>(source, "config", { process });
            const headers = await config.headers();
            base = headers
              .find((entry) => entry.source === "/:path*")!
              .headers.find((entry) => entry.key === "Content-Security-Policy")!.value;
            checkout = headers.find((entry) => entry.source === "/billing/paddle-checkout")!
              .headers[0]!.value;
            const handler = profile.deploy === "cloudflare" ? "middleware" : "proxy";
            const boundarySource = output.read(`${output.root}src/${handler}.ts`);
            const boundary = load<
              Record<string, (request: unknown) => Promise<Response>> & {
                isProtectedPath: (path: string) => boolean;
              }
            >(boundarySource, `${handler}, isProtectedPath`, {
              process,
              getSessionCookie: () => undefined,
              NextResponse: {
                next: () => new Response(null, { status: 200 }),
                redirect: (url: URL) =>
                  new Response(null, { status: 302, headers: { location: url.toString() } }),
              },
            });
            const paymentUrl = new URL("https://app.example.test/billing/paddle-checkout");
            expect(
              (await boundary[handler]!({ nextUrl: paymentUrl, url: paymentUrl.toString() }))
                .status,
            ).toBe(200);
            const privateUrl = new URL("https://app.example.test/billing");
            expect(
              (await boundary[handler]!({ nextUrl: privateUrl, url: privateUrl.toString() }))
                .status,
            ).toBe(302);
            expect(boundary.isProtectedPath("/billing/paddle-checkout/other")).toBe(true);
            expect(boundary.isProtectedPath("/billing/success")).toBe(false);
          } else if (profile.deploy === "none") {
            const source = output
              .read(`${output.root}nitro.config.ts`)
              .replace("export default ", "const config = ");
            const { config } = load<{
              config: { routeRules: Record<string, { headers: Record<string, string> }> };
            }>(source, "config", { process, defineNitroConfig: (value: unknown) => value });
            base = config.routeRules["/**"]!.headers["Content-Security-Policy"]!;
            checkout =
              config.routeRules["/billing/paddle-checkout"]!.headers["Content-Security-Policy"]!;
          } else {
            const source = output
              .read(`${output.root}src/cloudflare-worker.ts`)
              .replace("export default ", "const worker = ")
              .replaceAll("import.meta.env.DEV", "false")
              .replaceAll("import.meta.env.VITE_CONVEX_URL", '"https://fixture.convex.cloud"');
            const { worker } = load<{ worker: { fetch: (request: Request) => Promise<Response> } }>(
              source,
              "worker",
              { handler: { fetch: async () => new Response("ok") } },
            );
            base = (await worker.fetch(new Request("https://app.example.test/"))).headers.get(
              "content-security-policy",
            )!;
            checkout = (
              await worker.fetch(new Request("https://app.example.test/billing/paddle-checkout"))
            ).headers.get("content-security-policy")!;
          }
          expect(base).not.toContain("paddle.com");
          expect(checkout).toBe(paddleCheckoutContentSecurityPolicy(base));
          expect(checkout).toContain(
            "frame-src https://buy.paddle.com https://sandbox-buy.paddle.com",
          );
          expect(checkout).toContain("frame-ancestors 'none'");
          expect(checkout).not.toContain("https://*.paddle.com");
        });
      }
});
