import { getCapabilityDefinition } from "../capabilities/support-catalog.js";
import {
  CAPABILITY_IDS,
  type CapabilityId,
  type CapabilityRequirement,
  type DesiredCapabilities,
  type ResolvedCapabilities,
} from "../capabilities/types.js";
import type { AppTarget, BillingProvider } from "./choices.js";
import type { DesiredProjectConfig, ResolvedProjectApp } from "./config.js";
import { addResolutionIssue, type ResolutionIssueMap } from "./resolution-issues.js";

export interface MutableCapabilityState {
  transport: boolean;
  auth: boolean;
  billing: boolean;
  messaging: boolean;
  email: boolean;
  storage: boolean;
  cache: boolean;
  analytics: boolean;
  i18n: boolean;
  pdf: boolean;
  eve: boolean;
  notifications: boolean;
  featureFlags: boolean;
  jobs: boolean;
}

function capabilityPath(id: CapabilityId): string {
  return `/capabilities/${id}`;
}

export function createCapabilityState(capabilities: DesiredCapabilities): {
  readonly state: MutableCapabilityState;
  readonly explicitlyDisabled: ReadonlySet<CapabilityId>;
} {
  const explicitlyDisabled = new Set<CapabilityId>();
  const setBoolean = (id: CapabilityId, value: boolean | undefined): boolean => {
    if (value === false) explicitlyDisabled.add(id);
    return value === true;
  };

  const billingEnabled = capabilities.billing !== undefined && capabilities.billing !== false;
  if (capabilities.billing === false) explicitlyDisabled.add("billing");
  const cacheEnabled = capabilities.cache !== undefined && capabilities.cache !== "none";
  if (capabilities.cache === "none") explicitlyDisabled.add("cache");
  const featureFlagsEnabled =
    capabilities.featureFlags !== undefined && capabilities.featureFlags !== false;
  if (capabilities.featureFlags === false) explicitlyDisabled.add("featureFlags");
  const jobsEnabled = capabilities.jobs !== undefined && capabilities.jobs !== false;
  if (capabilities.jobs === false) explicitlyDisabled.add("jobs");

  return {
    state: {
      transport: setBoolean("transport", capabilities.transport),
      auth: setBoolean("auth", capabilities.auth),
      billing: billingEnabled,
      messaging: setBoolean("messaging", capabilities.messaging),
      email: setBoolean("email", capabilities.email),
      storage: setBoolean("storage", capabilities.storage),
      cache: cacheEnabled,
      analytics: setBoolean("analytics", capabilities.analytics),
      i18n: setBoolean("i18n", capabilities.i18n),
      pdf: setBoolean("pdf", capabilities.pdf),
      eve: setBoolean("eve", capabilities.eve),
      notifications: setBoolean("notifications", capabilities.notifications),
      featureFlags: featureFlagsEnabled,
      jobs: jobsEnabled,
    },
    explicitlyDisabled,
  };
}

export function applyCapabilityClosure(args: {
  readonly state: MutableCapabilityState;
  readonly explicitlyDisabled: ReadonlySet<CapabilityId>;
  readonly desired: DesiredCapabilities;
  readonly issues: ResolutionIssueMap;
}): void {
  let changed = true;
  while (changed) {
    changed = false;
    for (const capability of CAPABILITY_IDS) {
      if (!args.state[capability]) continue;
      for (const requirement of getCapabilityDefinition(capability).requirements) {
        if (!isRequirementActive(requirement, args.desired)) continue;
        if (requirement.kind !== "capability" || args.state[requirement.capability]) continue;

        if (args.explicitlyDisabled.has(requirement.capability)) {
          addResolutionIssue(args.issues, {
            severity: "error",
            code: "capability-explicitly-disabled",
            path: capabilityPath(requirement.capability),
            capability,
            message: `${capability} requires ${requirement.capability}, but it was explicitly disabled.`,
            suggestion: `Enable capabilities.${requirement.capability} or disable ${capability}.`,
          });
          continue;
        }

        args.state[requirement.capability] = true;
        changed = true;
        addResolutionIssue(args.issues, {
          severity: "warning",
          code: "capability-implied",
          path: capabilityPath(requirement.capability),
          capability,
          message: `${requirement.capability} was enabled because ${capability} requires it.`,
          suggestion: `Declare capabilities.${requirement.capability} explicitly to document the dependency.`,
        });
      }
    }
  }
}

function isRequirementActive(
  requirement: CapabilityRequirement,
  desired: DesiredCapabilities,
): boolean {
  if (requirement.kind !== "capability" || requirement.when === undefined) return true;
  if (requirement.when === "jobs-user-facing-api") {
    return desired.jobs !== undefined && desired.jobs !== false && desired.jobs.userFacingApi;
  }
  return false;
}

function requiresClientSurface(capability: CapabilityId, desired: DesiredCapabilities): boolean {
  const definition = getCapabilityDefinition(capability);
  if (!definition.clientSurfaceRequired) return false;
  if (capability !== "jobs") return true;
  return desired.jobs !== undefined && desired.jobs !== false && desired.jobs.userFacingApi;
}

function enabledTargetExists(
  apps: readonly ResolvedProjectApp[],
  targets: readonly AppTarget[],
): boolean {
  return apps.some((app) => targets.includes(app.target));
}

export function validateCapabilityRequirements(args: {
  readonly state: MutableCapabilityState;
  readonly explicitlyDisabled: ReadonlySet<CapabilityId>;
  readonly config: DesiredProjectConfig;
  readonly apps: readonly ResolvedProjectApp[];
  readonly issues: ResolutionIssueMap;
}): void {
  const backend = args.config.backend;
  const hostApp =
    backend === false ? undefined : args.apps.find((app) => app.id === backend.hostApp.trim());

  for (const capability of CAPABILITY_IDS) {
    if (!args.state[capability]) continue;
    const definition = getCapabilityDefinition(capability);
    for (const requirement of definition.requirements) {
      if (!isRequirementActive(requirement, args.config.capabilities)) continue;
      if (requirement.kind === "capability") {
        if (
          !args.state[requirement.capability] &&
          !args.explicitlyDisabled.has(requirement.capability)
        ) {
          addResolutionIssue(args.issues, {
            severity: "error",
            code: "capability-explicitly-disabled",
            path: capabilityPath(requirement.capability),
            capability,
            message: `${capability} requires the ${requirement.capability} capability.`,
            suggestion: `Enable capabilities.${requirement.capability} or disable ${capability}.`,
          });
        }
        continue;
      }

      if (requirement.kind === "backend") {
        if (backend === false) {
          addResolutionIssue(args.issues, {
            severity: "error",
            code: "capability-requires-backend",
            path: "/backend",
            capability,
            message: `${capability} requires a backend, but backend is false.`,
            suggestion: "Configure a backend host application or disable the capability.",
          });
        }
        continue;
      }

      if (requirement.kind === "persistence") {
        if (backend === false || backend.database === "none") {
          addResolutionIssue(args.issues, {
            severity: "error",
            code: "capability-requires-persistence",
            path: "/backend/database",
            capability,
            message: `${capability} requires persistent storage, but no database is selected.`,
            suggestion: "Select postgres or convex, or disable the capability.",
          });
        }
        continue;
      }

      const bound =
        requirement.subject === "any-app"
          ? enabledTargetExists(args.apps, requirement.targets)
          : hostApp !== undefined && requirement.targets.includes(hostApp.target);
      if (!bound) {
        addResolutionIssue(args.issues, {
          severity: "error",
          code: "capability-target-binding-missing",
          path: requirement.subject === "backend-host" ? "/backend/hostApp" : "/apps",
          capability,
          message: `${capability} has no compatible ${requirement.subject} target binding.`,
          suggestion: `Select one of: ${requirement.targets.join(", ")}.`,
        });
      }
    }

    if (!requiresClientSurface(capability, args.config.capabilities)) continue;
    for (const app of args.apps) {
      const binding = definition.clientBindings[app.target];
      if (binding.status === "supported") continue;
      const reason = binding.reason?.trim() || `${app.target} has no verified client binding.`;
      addResolutionIssue(args.issues, {
        severity: "error",
        code: "capability-client-target-unsupported",
        path: `/apps/${app.id}/target`,
        capability,
        message: `${capability} requires a verified client surface for every selected app, but ${app.id} (${app.target}) is unsupported: ${reason}`,
        suggestion: `Remove ${app.id}, disable ${capability}, or implement and verify the ${app.target} client binding.`,
      });
    }
  }
}

export function resolveCapabilities(
  desired: DesiredCapabilities,
  state: MutableCapabilityState,
  billingProviders: readonly BillingProvider[],
): ResolvedCapabilities {
  const cacheProvider = desired.cache ?? "none";
  return {
    transport: state.transport,
    auth: state.auth,
    billing: {
      enabled: state.billing,
      providers: state.billing ? billingProviders : [],
    },
    messaging: state.messaging,
    email: state.email,
    storage: state.storage,
    cache: {
      enabled: state.cache,
      provider: cacheProvider,
    },
    analytics: state.analytics,
    i18n: state.i18n,
    pdf: state.pdf,
    eve: state.eve,
    notifications: state.notifications,
    featureFlags: {
      enabled: state.featureFlags,
      provider:
        desired.featureFlags === undefined || desired.featureFlags === false
          ? null
          : desired.featureFlags.provider,
    },
    jobs: {
      enabled: state.jobs,
      userFacingApi:
        desired.jobs === undefined || desired.jobs === false ? false : desired.jobs.userFacingApi,
    },
  };
}
