import type { ProjectMode } from "../../lib/addons.js";

export function serverPosthogServerContent(mode: ProjectMode): string {
  const cfgImport = mode === "monorepo" ? "../config.js" : "./config.js";
  return `import { PostHog } from "posthog-node";
import { getAnalyticsConfig, isAnalyticsEnabled } from "${cfgImport}";
import { anonymizeEmail, buildServerContext } from "./utils.js";

export type { PostHog as PostHogServerClient } from "posthog-node";

let serverInstance: PostHog | null = null;
let loggedDisabled = false;

function getConfigSafe() {
  try {
    return getAnalyticsConfig();
  } catch {
    return null;
  }
}

export function getPostHogServer(): PostHog | null {
  if (serverInstance) return serverInstance;
  if (!isAnalyticsEnabled()) {
    if (!loggedDisabled) {
      loggedDisabled = true;
      console.debug("[analytics:server] PostHog disabled");
    }
    return null;
  }
  const cfg = getConfigSafe();
  if (!cfg || !cfg.key) return null;
  try {
    serverInstance = new PostHog(cfg.key, {
      host: cfg.host,
      flushAt: cfg.flushAt,
      flushInterval: cfg.flushIntervalMs,
      enableExceptionAutocapture: false,
      disableGeoip: false,
    });
    return serverInstance;
  } catch (err) {
    console.warn("[analytics:server] Failed to init posthog-node", err);
    return null;
  }
}

export interface ServerCaptureOptions {
  distinctId: string;
  event: string;
  properties?: Record<string, unknown>;
  groups?: Record<string, string | number>;
  timestamp?: Date;
  disableGeoip?: boolean;
}

export function captureServerEvent(opts: ServerCaptureOptions): void {
  const client = getPostHogServer();
  if (!client) return;
  try {
    client.capture({
      distinctId: opts.distinctId,
      event: opts.event,
      properties: { $lib: "posthog-node", ...opts.properties },
      groups: opts.groups,
      timestamp: opts.timestamp,
      disableGeoip: opts.disableGeoip,
    });
  } catch (err) {
    console.warn("[analytics:server] capture failed", err);
  }
}

export function capture(opts: ServerCaptureOptions): void {
  captureServerEvent(opts);
}

export interface ServerIdentifyOptions {
  distinctId: string;
  properties?: Record<string, unknown>;
  anonId?: string;
}

export function identifyServerUser(opts: ServerIdentifyOptions): void {
  const client = getPostHogServer();
  if (!client) return;
  try {
    client.identify({ distinctId: opts.distinctId, properties: opts.properties });
  } catch (err) {
    console.warn("[analytics:server] identify failed", err);
  }
}

export function identify(opts: ServerIdentifyOptions): void {
  identifyServerUser(opts);
}

export function aliasServerUser(opts: { distinctId: string; alias: string }): void {
  const client = getPostHogServer();
  if (!client) return;
  try {
    client.alias({ distinctId: opts.distinctId, alias: opts.alias });
  } catch (err) {
    console.warn("[analytics:server] alias failed", err);
  }
}

export function alias(opts: { distinctId: string; alias: string }): void {
  aliasServerUser(opts);
}

export function groupIdentifyServer(opts: {
  groupType: string;
  groupKey: string;
  properties?: Record<string, unknown>;
  distinctId?: string;
}): void {
  const client = getPostHogServer();
  if (!client) return;
  try {
    client.groupIdentify({
      groupType: opts.groupType,
      groupKey: opts.groupKey,
      properties: opts.properties,
      distinctId: opts.distinctId,
    });
  } catch (err) {
    console.warn("[analytics:server] groupIdentify failed", err);
  }
}

export function groupIdentify(opts: {
  groupType: string;
  groupKey: string;
  properties?: Record<string, unknown>;
  distinctId?: string;
}): void {
  groupIdentifyServer(opts);
}

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
  const client = getPostHogServer();
  if (!client) return undefined;
  try {
    return await client.getFeatureFlag(key, distinctId, {
      groups: options?.groups,
      personProperties: options?.personProperties,
      groupProperties: options?.groupProperties,
      onlyEvaluateLocally: options?.onlyEvaluateLocally,
      sendFeatureFlagEvents: options?.sendFeatureFlagEvents ?? false,
    });
  } catch (err) {
    console.warn("[analytics:server] getFeatureFlag failed", { key, err });
    return undefined;
  }
}

export async function isFeatureEnabled(key: string, distinctId: string, options?: { groups?: Record<string, string>; personProperties?: Record<string, string>; }): Promise<boolean> {
  const flag = await getFeatureFlag(key, distinctId, options);
  if (typeof flag === "boolean") return flag;
  return flag !== undefined;
}

export async function getAllFlags(distinctId: string, options?: { groups?: Record<string, string>; personProperties?: Record<string, string>; groupProperties?: Record<string, Record<string, string>>; onlyEvaluateLocally?: boolean; }): Promise<Record<string, string | boolean>> {
  const client = getPostHogServer();
  if (!client) return {};
  try {
    return await client.getAllFlags(distinctId, {
      groups: options?.groups,
      personProperties: options?.personProperties,
      groupProperties: options?.groupProperties,
      onlyEvaluateLocally: options?.onlyEvaluateLocally,
    });
  } catch (err) {
    console.warn("[analytics:server] getAllFlags failed", err);
    return {};
  }
}

export async function getFeatureFlagPayload(key: string, distinctId: string, options?: { groups?: Record<string, string>; personProperties?: Record<string, string>; matchValue?: string | boolean; }): Promise<unknown> {
  const client = getPostHogServer();
  if (!client) return undefined;
  try {
    return await client.getFeatureFlagPayload(key, distinctId, undefined, {
      groups: options?.groups,
      personProperties: options?.personProperties,
    } as unknown as { groups?: Record<string, string>; personProperties?: Record<string, string> });
  } catch (err) {
    console.warn("[analytics:server] getFeatureFlagPayload failed", { key, err });
    return undefined;
  }
}

export async function getPayload(key: string, distinctId: string, options?: { groups?: Record<string, string> }): Promise<unknown> {
  return getFeatureFlagPayload(key, distinctId, options);
}

export async function flush(): Promise<void> {
  const client = getPostHogServer();
  if (!client) return;
  try {
    await (client as unknown as { flush?: () => Promise<void> }).flush?.();
  } catch {}
}

export async function shutdown(): Promise<void> {
  const client = serverInstance;
  if (!client) return;
  try {
    await client.shutdown();
  } catch {}
  serverInstance = null;
}

export const analytics = {
  capture: captureServerEvent,
  identify: identifyServerUser,
  alias: aliasServerUser,
  groupIdentify: groupIdentifyServer,
  getFeatureFlag,
  isFeatureEnabled,
  getAllFlags,
  getPayload: getFeatureFlagPayload,
  flush,
  shutdown,
};
`;
}
