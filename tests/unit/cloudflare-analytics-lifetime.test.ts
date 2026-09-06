// @allow-long 420: generated-code execution covers provider ownership, deadlines, cleanup, and every exported integration
import { describe, expect, test } from "bun:test";
import { resolveCreateConfig } from "../../src/commands/create/resolution.js";
import { buildProjectGenerationPlan } from "../../src/templates/default.js";
import { serverPosthogServerContent } from "../../src/templates/analytics/server.js";

type Mode = "monorepo" | "single";
type Framework = "nextjs" | "tanstack-start";
type Options = { fetch: (url: string, options: RequestInit) => Promise<Response> };
type TrackingInput = { distinctId: string; event?: string };
type Tracking = (input: TrackingInput) => Promise<void>;
type Provider = {
  captureImmediate: Tracking;
  getFeatureFlag: (...args: unknown[]) => Promise<unknown>;
};
type Server = {
  captureServerEvent: Tracking;
  capture: Tracking;
  identify: Tracking;
  alias: Tracking;
  groupIdentify: Tracking;
  getPostHogServer: () => Provider | null;
  getFeatureFlag: (...args: unknown[]) => Promise<unknown>;
  getAllFlags: (...args: unknown[]) => Promise<unknown>;
  getFeatureFlagPayload: (...args: unknown[]) => Promise<unknown>;
  analytics: Record<string, unknown>;
};

function generated(
  mode: Mode,
  framework: Framework,
  deploy: "cloudflare" | "none" = "cloudflare",
  integrations = false,
) {
  const resolution = resolveCreateConfig({
    name: "worker-analytics",
    runtime: "bun",
    mode,
    framework,
    billing: integrations ? ["stripe"] : [],
    features: [],
    database: integrations ? "convex" : "none",
    databaseWasExplicit: true,
    apps: ["web"],
    preset: "custom",
    cache: "none",
    deploy,
    withAuth: integrations,
    withApi: true,
    withEmail: false,
    withAnalytics: true,
    withEve: false,
    withI18n: false,
    withPdf: false,
    withMessaging: false,
    withStorage: false,
    withNotifications: false,
    featureFlags: "none",
    withJobs: false,
  });
  if (!resolution.ok) throw new Error(resolution.message);
  const plan = buildProjectGenerationPlan(resolution.resolvedConfig, {
    desiredConfig: resolution.desiredConfig,
  });
  const root = mode === "monorepo" ? "packages/analytics/src" : "src/server/analytics";
  const read = (path: string) => {
    const file = plan.files.find((entry) => entry.physicalPath === path);
    if (!file) throw new Error(`Missing ${path}`);
    return file.content;
  };
  return {
    read,
    root,
    source: read(`${root}/${mode === "monorepo" ? "server/" : ""}posthog-server.ts`),
  };
}

const transpiler = new Bun.Transpiler({ loader: "ts", target: "bun" });
function executable(source: string, returned: string): string {
  return (
    transpiler.transformSync(source.replace(/^import[^;]+;\s*/gm, "").replace(/^export /gm, "")) +
    `\nreturn { ${returned} };`
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function harness(source: string, enabled = true) {
  const requests: Array<{ signal: AbortSignal; response: ReturnType<typeof deferred<Response>> }> =
    [];
  const instances: Array<{ options: Options; cleanup: number[]; events: string[] }> = [];
  const timers = new Map<number, { callback: () => void; delay: number }>();
  let timerId = 0;
  let cleanupGate: Promise<void> | undefined;
  let swallowTransportErrors = false;
  let emitSdkErrorOnSuccess = false;
  class PostHog {
    readonly record: (typeof instances)[number];
    private errorListener?: () => void;
    constructor(_key: string, options: Options) {
      this.record = { options, cleanup: [], events: [] };
      instances.push(this.record);
    }
    async call(name: string): Promise<void> {
      this.record.events.push(name);
      try {
        await this.record.options.fetch("https://posthog.invalid/batch/", { method: "POST" });
        if (emitSdkErrorOnSuccess) this.errorListener?.();
      } catch (error) {
        if (!swallowTransportErrors) throw error;
      }
    }
    captureImmediate() {
      return this.call("capture");
    }
    identifyImmediate() {
      return this.call("identify");
    }
    aliasImmediate() {
      return this.call("alias");
    }
    groupIdentifyImmediate() {
      return this.call("groupIdentify");
    }
    async getFeatureFlag() {
      await this.call("flag");
      return false;
    }
    async getAllFlags() {
      await this.call("flags");
      return { feature: false };
    }
    async getFeatureFlagPayload() {
      await this.call("payload");
      return { label: "payload" };
    }
    async shutdown(timeout: number) {
      this.record.cleanup.push(timeout);
      await cleanupGate;
    }
    on(_event: string, listener: () => void) {
      this.errorListener = listener;
      return () => {
        this.errorListener = undefined;
      };
    }
  }
  const fakeFetch = (_url: string, options: RequestInit) => {
    const signal = options.signal;
    if (!signal) throw new Error("Missing request deadline");
    const response = deferred<Response>();
    const abort = () => response.reject(new Error("provider-secret-key=must-not-escape"));
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    requests.push({ signal, response });
    return response.promise.finally(() => signal.removeEventListener("abort", abort));
  };
  const server = new Function(
    "PostHog",
    "getAnalyticsConfig",
    "isAnalyticsEnabled",
    "setTimeout",
    "clearTimeout",
    "fetch",
    executable(
      source,
      "captureServerEvent, capture, identify, alias, groupIdentify, getPostHogServer, getFeatureFlag, getAllFlags, getFeatureFlagPayload, analytics",
    ),
  )(
    PostHog,
    () => ({ key: "test-only-provider-key", host: "https://posthog.invalid" }),
    () => enabled,
    (callback: () => void, delay: number) => {
      const id = ++timerId;
      timers.set(id, { callback, delay });
      return id;
    },
    (id: number) => timers.delete(id),
    fakeFetch,
  ) as Server;
  return {
    server,
    instances,
    requests,
    timers,
    setCleanupGate: (gate: Promise<void>) => {
      cleanupGate = gate;
    },
    swallowTransportErrors: () => {
      swallowTransportErrors = true;
    },
    emitSdkErrorOnSuccess: () => {
      emitSdkErrorOnSuccess = true;
    },
  };
}

async function microtasks() {
  for (let index = 0; index < 12; index += 1) await Promise.resolve();
}

describe("Cloudflare server analytics request lifetime", () => {
  for (const mode of ["monorepo", "single"] as const) {
    for (const framework of ["nextjs", "tanstack-start"] as const) {
      test(`${mode}/${framework} delivers one event before resolving and waits for cleanup`, async () => {
        const output = generated(mode, framework);
        const { server, instances, requests, timers, setCleanupGate } = harness(output.source);
        const cleanup = deferred<void>();
        setCleanupGate(cleanup.promise);
        let settled = false;
        const pending = server
          .captureServerEvent({ distinctId: "user", event: "one-event" })
          .then(() => {
            settled = true;
          });
        await microtasks();
        expect(requests).toHaveLength(1);
        expect(settled).toBe(false);
        expect(instances[0]?.events).toEqual(["capture"]);
        requests[0]?.response.resolve(new Response("{}"));
        await microtasks();
        expect(instances[0]?.cleanup).toEqual([1000]);
        expect(settled).toBe(false);
        cleanup.resolve();
        await pending;
        expect(settled).toBe(true);
        expect(requests[0]?.signal.aborted).toBe(true);
        expect(timers.size).toBe(0);
        expect(server.analytics).not.toHaveProperty("flush");
        expect(server.analytics).not.toHaveProperty("shutdown");
        expect(server.getPostHogServer()).not.toHaveProperty("capture");
        expect(output.read("docs/CLOUDFLARE_ANALYTICS.md")).toContain(
          "Await every server tracking operation",
        );
        const manifest = JSON.parse(
          output.read(mode === "monorepo" ? "packages/analytics/package.json" : "package.json"),
        ) as { dependencies: Record<string, string> };
        expect(manifest.dependencies["posthog-node"]).toBeDefined();
        expect(output.source).toContain('from "posthog-node/edge"');
      });
    }
  }

  test("concurrent requests never share provider clients, abort signals, or queues", async () => {
    const { server, instances, requests, timers } = harness(
      generated("single", "tanstack-start").source,
    );
    const first = server.capture({ distinctId: "first", event: "capture" });
    const second = server.identify({ distinctId: "second" });
    expect(instances).toHaveLength(2);
    expect(requests[0]?.signal).not.toBe(requests[1]?.signal);
    requests[1]?.response.resolve(new Response("{}"));
    await second;
    expect(instances[1]?.cleanup).toEqual([1000]);
    expect(instances[0]?.cleanup).toEqual([]);
    requests[0]?.response.resolve(new Response("{}"));
    await first;
    expect(timers.size).toBe(0);
  });

  test("a stalled request aborts at the fixed deadline and rejects without provider secrets", async () => {
    const { server, instances, requests, timers } = harness(generated("single", "nextjs").source);
    const pending = server.capture({ distinctId: "user", event: "never-finishes" });
    const failure = pending.catch((error: unknown) => error);
    expect([...timers.values()].map(({ delay }) => delay)).toEqual([5000]);
    for (const timer of timers.values()) timer.callback();
    expect(await failure).toEqual(new Error("Analytics operation failed"));
    expect(requests[0]?.signal.aborted).toBe(true);
    expect(instances[0]?.cleanup).toEqual([1000]);
    expect(timers.size).toBe(0);
  });

  test("disabled analytics creates no provider or deadline", async () => {
    const { server, instances, timers } = harness(generated("monorepo", "nextjs").source, false);
    await server.capture({ distinctId: "user", event: "disabled" });
    expect(server.getPostHogServer()).toBeNull();
    expect(instances).toHaveLength(0);
    expect(timers.size).toBe(0);
  });

  test("SDK resolution cannot conceal transport, HTTP, or emitted provider failure", async () => {
    for (const failureKind of ["network", "http", "event"]) {
      const { server, requests, timers, swallowTransportErrors, emitSdkErrorOnSuccess } = harness(
        generated("single", "nextjs").source,
      );
      swallowTransportErrors();
      if (failureKind === "event") emitSdkErrorOnSuccess();
      const failure = server
        .capture({ distinctId: "user", event: "failure" })
        .catch((error: unknown) => error);
      if (failureKind === "http")
        requests[0]?.response.resolve(new Response("upstream failure", { status: 503 }));
      else if (failureKind === "event") requests[0]?.response.resolve(new Response("{}"));
      else requests[0]?.response.reject(new Error("provider-secret-key=must-not-escape"));
      expect(await failure).toEqual(new Error("Analytics operation failed"));
      expect(timers.size).toBe(0);
    }
  });

  test("provider failures stay observable while feature helpers retain safe fallbacks", async () => {
    const { server, requests, timers } = harness(generated("single", "nextjs").source);
    const provider = server.getPostHogServer();
    const direct = provider!.getFeatureFlag("feature", "user");
    const failure = direct.catch((error: unknown) => error);
    requests[0]?.response.reject(new Error("provider-secret-key=must-not-escape"));
    expect(await failure).toEqual(new Error("Analytics operation failed"));
    const fallback = server.getAllFlags("user");
    requests[1]?.response.reject(new Error("provider-secret-key=must-not-escape"));
    expect(await fallback).toEqual({});
    expect(timers.size).toBe(0);
  });

  for (const mode of ["monorepo", "single"] as const) {
    test(`${mode} propagates every auth/billing helper until its final operation settles`, async () => {
      const output = generated(mode, "tanstack-start", "cloudflare", true);
      const expected: Record<string, number> = {
        trackSignedUp: 2,
        trackSignedIn: 2,
        trackSignedOut: 1,
        trackOnboardingStarted: 1,
        trackOnboardingCompleted: 1,
        linkAnonymousToUser: 1,
        trackCheckoutStarted: 1,
        trackCheckoutCompleted: 2,
        trackCheckoutFailed: 1,
        trackSubscriptionCreated: 1,
        trackSubscriptionUpdated: 1,
        trackSubscriptionCanceled: 1,
        trackPaymentSucceeded: 1,
        trackPaymentFailed: 1,
      };
      for (const family of ["auth", "billing"]) {
        const source = output.read(`${output.root}/integrations/${family}.ts`);
        const names = [...source.matchAll(/export async function (\w+)\(/g)].map(
          (match) => match[1]!,
        );
        expect(names.length).toBe(family === "auth" ? 6 : 8);
        for (const name of names) {
          const steps: Array<ReturnType<typeof deferred<void>>> = [];
          const operation = () => {
            const gate = deferred<void>();
            steps.push(gate);
            return gate.promise;
          };
          const helpers = new Function(
            "capture",
            "identify",
            "alias",
            "groupIdentify",
            executable(source, names.join(",")),
          )(operation, operation, operation, operation) as Record<
            string,
            (input: Record<string, string>) => Promise<void>
          >;
          let settled = false;
          const pending = helpers[name]!({
            userId: "user",
            email: "user@example.test",
            organizationId: "org",
            provider: "stripe",
            subscriptionId: "sub",
            anonymousId: "anon",
          }).then(() => {
            settled = true;
          });
          for (let step = 0; step < expected[name]!; step += 1) {
            await microtasks();
            expect(settled, name).toBe(false);
            expect(steps.length, name).toBe(step + 1);
            steps[step]!.resolve();
          }
          await pending;
          expect(settled, name).toBe(true);
        }
      }
    });
  }

  test("non-Worker generation retains the existing provider queue and synchronous contract", () => {
    const output = generated("single", "nextjs", "none");
    expect(output.source).not.toContain("withRequestClient");
    expect(output.source).toContain("let serverInstance: PostHog | null = null;");
    expect(output.source).toContain(
      "export function captureServerEvent(opts: ServerCaptureOptions): void",
    );
    expect(serverPosthogServerContent("single")).toContain("flushInterval: cfg.flushIntervalMs");
  });
});
