import type { ProjectMode } from "../../lib/addons.js";

export function testingMocksContent(_mode: ProjectMode): string {
  return `import type { FeatureFlagKey } from "../types.js";

export interface MockPostHogClient {
  capture: (event: string, properties?: Record<string, unknown>) => void;
  identify: (distinctId: string, properties?: Record<string, unknown>) => void;
  alias: (alias: string) => void;
  reset: (resetDeviceId?: boolean) => void;
  isFeatureEnabled: (key: string) => boolean | undefined;
  getFeatureFlag: (key: string) => string | boolean | undefined;
  getFeatureFlagPayload: (key: string) => unknown;
  getFeatureFlags: () => Record<string, string | boolean>;
  reloadFeatureFlags: () => void;
  group: (type: string, key: string, props?: Record<string, unknown>) => void;
  opt_in_capturing: () => void;
  opt_out_capturing: () => void;
  has_opted_in_capturing: () => boolean;
  has_opted_out_capturing: () => boolean;
  _events: Array<{ event: string; properties?: Record<string, unknown> }>;
  _identifies: Array<{ distinctId: string; properties?: Record<string, unknown> }>;
  _flags: Record<string, string | boolean>;
  _payloads: Record<string, unknown>;
}

export function createMockPostHogClient(overrides?: {
  flags?: Record<string, string | boolean>;
  payloads?: Record<string, unknown>;
  optedIn?: boolean;
}): MockPostHogClient {
  const events: Array<{ event: string; properties?: Record<string, unknown> }> = [];
  const identifies: Array<{ distinctId: string; properties?: Record<string, unknown> }> = [];
  let optedIn = overrides?.optedIn ?? true;

  const client: MockPostHogClient = {
    _events: events,
    _identifies: identifies,
    _flags: overrides?.flags ?? {},
    _payloads: overrides?.payloads ?? {},
    capture: (event, properties) => {
      events.push({ event, properties });
    },
    identify: (distinctId, properties) => {
      identifies.push({ distinctId, properties });
    },
    alias: () => {},
    reset: () => {
      events.length = 0;
      identifies.length = 0;
    },
    isFeatureEnabled: (key) => {
      const v = (overrides?.flags ?? client._flags)[key];
      if (typeof v === "boolean") return v;
      return v !== undefined;
    },
    getFeatureFlag: (key) => (overrides?.flags ?? client._flags)[key],
    getFeatureFlagPayload: (key) => (overrides?.payloads ?? client._payloads)[key],
    getFeatureFlags: () => overrides?.flags ?? client._flags,
    reloadFeatureFlags: () => {},
    group: () => {},
    opt_in_capturing: () => {
      optedIn = true;
    },
    opt_out_capturing: () => {
      optedIn = false;
    },
    has_opted_in_capturing: () => optedIn,
    has_opted_out_capturing: () => !optedIn,
  };

  return client;
}

export function createMockServerClient() {
  const events: Array<{ distinctId: string; event: string; properties?: Record<string, unknown> }> = [];
  const identifies: Array<{ distinctId: string; properties?: Record<string, unknown> }> = [];
  const groups: Array<{ type: string; key: string; properties?: Record<string, unknown> }> = [];

  return {
    _events: events,
    _identifies: identifies,
    _groups: groups,
    capture: (payload: { distinctId: string; event: string; properties?: Record<string, unknown> }) => {
      events.push(payload);
    },
    identify: (payload: { distinctId: string; properties?: Record<string, unknown> }) => {
      identifies.push(payload);
    },
    alias: (_payload: { distinctId: string; alias: string }) => {},
    groupIdentify: (payload: { groupType: string; groupKey: string; properties?: Record<string, unknown> }) => {
      groups.push({ type: payload.groupType, key: payload.groupKey, properties: payload.properties });
    },
    getFeatureFlag: async (_key: string, _distinctId: string) => undefined as string | boolean | undefined,
    isFeatureEnabled: async (_key: string, _distinctId: string) => false,
    getAllFlags: async (_distinctId: string) => ({} as Record<string, string | boolean>),
    flush: async () => {},
    shutdown: async () => {},
  };
}

export function mockFeatureFlags(flags: Record<FeatureFlagKey, string | boolean>) {
  return flags;
}
`;
}
