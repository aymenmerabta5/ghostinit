import type { ProjectMode } from "../../lib/addons.js";

/** Workers own I/O for one invocation; provider queues never cross requests. */
export function workerPosthogServerContent(mode: ProjectMode): string {
  const config = mode === "monorepo" ? "../config.js" : "./config.js";
  return `import "server-only";
import { PostHog } from "posthog-node/edge";
import { getAnalyticsConfig, isAnalyticsEnabled } from "${config}";

const REQUEST_TIMEOUT_MS = 5_000;
const CLEANUP_TIMEOUT_MS = 1_000;

// This facade exposes only awaited operations. A raw capture() queue, a shared
// client, and a timer-driven flush cannot survive a Worker invocation safely.
export type PostHogServerClient = Pick<PostHog,
  "captureImmediate" | "identifyImmediate" | "aliasImmediate" |
  "groupIdentifyImmediate" | "getFeatureFlag" | "getFeatureFlagPayload"
> & {
  getAllFlags(distinctId: string, options?: Parameters<PostHog["getAllFlags"]>[1]): ReturnType<PostHog["getAllFlags"]>;
};

async function withRequestClient<T>(operation: (client: PostHog) => Promise<T>): Promise<T> {
  const config = getAnalyticsConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let client: PostHog | undefined;
  let result!: T;
  let operationFailed = false;
  let removeErrorListener: (() => void) | undefined;
  try {
    client = new PostHog(config.key, {
      host: config.host,
      flushAt: 1,
      flushInterval: 0,
      fetchRetryCount: 0,
      requestTimeout: REQUEST_TIMEOUT_MS,
      enableExceptionAutocapture: false,
      disableGeoip: false,
      fetch: async (url, options) => {
        try {
          const response = await fetch(url, {
            ...options,
            signal: options.signal
              ? AbortSignal.any([controller.signal, options.signal])
              : controller.signal,
          });
          if (!response.ok) operationFailed = true;
          return response;
        } catch {
          operationFailed = true;
          throw new Error("Analytics transport failed");
        }
      },
    });
    // The SDK can emit an error while an immediate method resolves. Record
    // only failure state so cancellation can never become successful delivery.
    removeErrorListener = client.on("error", () => { operationFailed = true; });
    result = await operation(client);
  } catch {
    // Provider errors can contain URLs, keys, or event properties. Never attach
    // the raw cause or log it; callers still observe delivery failure.
    operationFailed = true;
  } finally {
    try {
      await client?.shutdown(CLEANUP_TIMEOUT_MS);
    } catch {
      operationFailed = true;
    } finally {
      operationFailed ||= controller.signal.aborted;
      removeErrorListener?.();
      clearTimeout(timeout);
      controller.abort();
    }
  }
  if (operationFailed) throw new Error("Analytics operation failed");
  return result;
}

export function getPostHogServer(): PostHogServerClient | null {
  if (!isAnalyticsEnabled()) return null;
  return {
    captureImmediate: (options) => withRequestClient((client) => client.captureImmediate(options)),
    identifyImmediate: (options) => withRequestClient((client) => client.identifyImmediate(options)),
    aliasImmediate: (options) => withRequestClient((client) => client.aliasImmediate(options)),
    groupIdentifyImmediate: (options) => withRequestClient((client) => client.groupIdentifyImmediate(options)),
    getFeatureFlag: (key, id, options) => withRequestClient((client) => client.getFeatureFlag(key, id, { ...options, sendFeatureFlagEvents: false })),
    getAllFlags: (id, options) => withRequestClient((client) => client.getAllFlags(id, options)),
    getFeatureFlagPayload: (key, id, match, options) => withRequestClient((client) => client.getFeatureFlagPayload(key, id, match, options)),
  };
}

export interface ServerCaptureOptions {
  distinctId: string;
  event: string;
  properties?: Record<string, unknown>;
  groups?: Record<string, string | number>;
  timestamp?: Date;
  disableGeoip?: boolean;
}

export async function captureServerEvent(options: ServerCaptureOptions): Promise<void> {
  await getPostHogServer()?.captureImmediate({ ...options, properties: { $lib: "posthog-node", ...options.properties } });
}

export const capture = captureServerEvent;

export interface ServerIdentifyOptions {
  distinctId: string;
  properties?: Record<string, unknown>;
  anonId?: string;
}

export async function identifyServerUser(options: ServerIdentifyOptions): Promise<void> {
  await getPostHogServer()?.identifyImmediate({ distinctId: options.distinctId, properties: options.properties });
}

export const identify = identifyServerUser;

export async function aliasServerUser(options: { distinctId: string; alias: string }): Promise<void> {
  await getPostHogServer()?.aliasImmediate(options);
}

export const alias = aliasServerUser;

export async function groupIdentifyServer(options: {
  groupType: string;
  groupKey: string;
  properties?: Record<string, unknown>;
  distinctId?: string;
}): Promise<void> {
  await getPostHogServer()?.groupIdentifyImmediate(options);
}

export const groupIdentify = groupIdentifyServer;

export async function getFeatureFlag(
  key: string,
  distinctId: string,
  options?: {
    groups?: Record<string, string>;
    personProperties?: Record<string, string>;
    groupProperties?: Record<string, Record<string, string>>;
    onlyEvaluateLocally?: boolean;
    sendFeatureFlagEvents?: boolean;
  },
): Promise<string | boolean | undefined> {
  try { return await getPostHogServer()?.getFeatureFlag(key, distinctId, options); }
  catch { return undefined; }
}

export async function isFeatureEnabled(key: string, distinctId: string, options?: {
  groups?: Record<string, string>; personProperties?: Record<string, string>;
}): Promise<boolean> {
  const flag = await getFeatureFlag(key, distinctId, options);
  return typeof flag === "boolean" ? flag : flag !== undefined;
}

export async function getAllFlags(distinctId: string, options?: {
  groups?: Record<string, string>; personProperties?: Record<string, string>;
  groupProperties?: Record<string, Record<string, string>>; onlyEvaluateLocally?: boolean;
}): Promise<Record<string, string | boolean>> {
  try { return (await getPostHogServer()?.getAllFlags(distinctId, options)) ?? {}; }
  catch { return {}; }
}

export async function getFeatureFlagPayload(key: string, distinctId: string, options?: {
  groups?: Record<string, string>; personProperties?: Record<string, string>; matchValue?: string | boolean;
}): Promise<unknown> {
  try { return await getPostHogServer()?.getFeatureFlagPayload(key, distinctId, options?.matchValue, options); }
  catch { return undefined; }
}

export const getPayload = getFeatureFlagPayload;

export const analytics = {
  capture, identify, alias, groupIdentify, getFeatureFlag,
  isFeatureEnabled, getAllFlags, getPayload,
};
`;
}

export function workerAnalyticsGuide(mode: ProjectMode): string {
  const path = mode === "monorepo" ? "@repo/analytics/server" : "@/server/analytics";
  return `# Server analytics on Cloudflare Workers

Await every server tracking operation before returning the response:

\`\`\`ts
import { captureServerEvent } from "${path}";

await captureServerEvent({ distinctId: user.id, event: "product_saved" });
\`\`\`

Auth and billing tracking helpers also return promises and must be awaited.
Each operation creates and closes its own edge client, sends immediately, and
aborts network I/O after five seconds without retries. A configured delivery
failure rejects with a secret-safe error; choose explicitly whether product
logic should fail or continue. Missing/disabled analytics performs no I/O.
Feature-flag helpers retain their documented empty/undefined fallback, while
the typed provider facade rejects failures for service adapters that need them.

There is no shared provider queue and no flush/shutdown helper on this target.
Awaiting an operation includes its provider cleanup. The provider facade exposes
only immediate tracking and awaited feature reads; it never exposes queued SDK
capture methods. This preserves request ownership across concurrent invocations.
`;
}
