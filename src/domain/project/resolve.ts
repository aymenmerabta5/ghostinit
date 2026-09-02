import {
  isCapabilityDeployBindingSupported,
  isDeployBindingSupported,
} from "../capabilities/support-catalog.js";
import { CAPABILITY_IDS, type DesiredCapabilities } from "../capabilities/types.js";
import {
  applyCapabilityClosure,
  createCapabilityState,
  resolveCapabilities,
  validateCapabilityRequirements,
} from "./capability-resolution.js";
import { canonicalHash, deepFreeze } from "./canonical.js";
import {
  EXECUTION_RUNTIMES,
  isWindowsReservedDeviceName,
  PACKAGE_MANAGERS,
  PORTABLE_NAME_MAX_UTF8_BYTES,
  PROJECT_NAME_PATTERN,
  portableNameUtf8Bytes,
  type BillingProvider,
} from "./choices.js";
import {
  RESOLVED_PROJECT_CONFIG_SCHEMA_URI,
  type DesiredProjectApp,
  type DesiredProjectConfig,
  type ResolvedProjectApp,
  type ResolvedProjectConfig,
} from "./config.js";
import {
  addResolutionIssue,
  sortedResolutionIssues,
  type ResolutionIssueMap,
  type ResolutionResult,
} from "./resolution-issues.js";

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function appSort(left: ResolvedProjectApp, right: ResolvedProjectApp): number {
  return (
    compareText(left.id, right.id) ||
    compareText(left.target, right.target) ||
    compareText(left.deploy, right.deploy)
  );
}

function uniqueSorted<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)].sort(compareText);
}

function normalizeApp(app: DesiredProjectApp): ResolvedProjectApp {
  return { id: app.id.trim(), target: app.target, deploy: app.deploy };
}

function validateProjectIdentity(
  desired: DesiredProjectConfig,
  issues: ResolutionIssueMap,
): string {
  const name = desired.name.trim();
  if (
    !PROJECT_NAME_PATTERN.test(name) ||
    isWindowsReservedDeviceName(name) ||
    portableNameUtf8Bytes(name) > PORTABLE_NAME_MAX_UTF8_BYTES
  ) {
    addResolutionIssue(issues, {
      severity: "error",
      code: "invalid-project-name",
      path: "/name",
      capability: null,
      message: `Project names must begin with a lowercase letter, contain only lowercase letters, digits, or single hyphens, end with a letter or digit, avoid Windows device names, and be at most ${PORTABLE_NAME_MAX_UTF8_BYTES} UTF-8 bytes.`,
      suggestion: "Use the same project-name grammar accepted by create and init.",
    });
  }

  const supportedPackageManager = PACKAGE_MANAGERS.some(
    (entry) =>
      entry.name === desired.packageManager.name &&
      entry.version === desired.packageManager.version,
  );
  if (!supportedPackageManager) {
    addResolutionIssue(issues, {
      severity: "error",
      code: "unsupported-package-manager",
      path: "/packageManager",
      capability: null,
      message: `${desired.packageManager.name}@${desired.packageManager.version} is not in the support catalog.`,
      suggestion: `Use ${PACKAGE_MANAGERS[0].name}@${PACKAGE_MANAGERS[0].version}.`,
    });
  }
  return name;
}

function normalizeAndValidateApps(
  desired: DesiredProjectConfig,
  issues: ResolutionIssueMap,
): ResolvedProjectApp[] {
  const apps = desired.apps.map(normalizeApp).sort(appSort);
  if (apps.length === 0) {
    addResolutionIssue(issues, {
      severity: "error",
      code: "app-required",
      path: "/apps",
      capability: null,
      message: "At least one application target is required.",
      suggestion: "Add a web, mobile, or desktop application.",
    });
  }

  const seenAppIds = new Set<string>();
  for (const app of apps) {
    if (!PROJECT_NAME_PATTERN.test(app.id)) {
      addResolutionIssue(issues, {
        severity: "error",
        code: "invalid-app-id",
        path: "/apps",
        capability: null,
        message: `Application id ${JSON.stringify(app.id)} is invalid.`,
        suggestion: "Use a lowercase identifier beginning with a letter.",
      });
    }
    if (seenAppIds.has(app.id)) {
      addResolutionIssue(issues, {
        severity: "error",
        code: "duplicate-app-id",
        path: "/apps",
        capability: null,
        message: `Application id ${JSON.stringify(app.id)} is declared more than once.`,
        suggestion: "Give every application a unique id.",
      });
    }
    seenAppIds.add(app.id);
  }

  if (desired.mode === "single" && apps.length !== 1) {
    addResolutionIssue(issues, {
      severity: "error",
      code: "single-mode-app-count",
      path: "/apps",
      capability: null,
      message: `Single mode requires exactly one application; received ${apps.length}.`,
      suggestion: "Select monorepo mode or keep one application.",
    });
  }
  return apps;
}

function validateBindings(
  desired: DesiredProjectConfig,
  apps: readonly ResolvedProjectApp[],
  issues: ResolutionIssueMap,
): void {
  const executionRuntime =
    desired.runtime ??
    (desired.backend === false ? EXECUTION_RUNTIMES[0] : desired.backend.executionRuntime);
  if (!EXECUTION_RUNTIMES.includes(executionRuntime)) {
    addResolutionIssue(issues, {
      severity: "error",
      code: "unsupported-execution-runtime",
      path: "/backend/executionRuntime",
      capability: null,
      message: `${executionRuntime} is not a supported execution runtime.`,
      suggestion: `Select one of: ${EXECUTION_RUNTIMES.join(", ")}.`,
    });
  }

  for (const app of apps) {
    if (
      !isDeployBindingSupported({
        target: app.target,
        mode: desired.mode,
        executionRuntime,
        deployTarget: app.deploy,
      })
    ) {
      addResolutionIssue(issues, {
        severity: "error",
        code: "unsupported-deploy-binding",
        path: `/apps/${app.id}/deploy`,
        capability: null,
        message: `${app.deploy} is not supported for ${desired.mode}/${app.target}/${executionRuntime}.`,
        suggestion: "Select a deploy binding listed in the support catalog.",
      });
    }
  }

  if (desired.backend === false) return;
  const hostAppId = desired.backend.hostApp.trim();
  const hostApp = apps.find((app) => app.id === hostAppId);
  if (!hostApp) {
    addResolutionIssue(issues, {
      severity: "error",
      code: "backend-host-app-missing",
      path: "/backend/hostApp",
      capability: null,
      message: `Backend host ${JSON.stringify(hostAppId)} does not name a selected application.`,
      suggestion: "Select an existing server-capable application id.",
    });
  } else if (hostApp.target !== "nextjs" && hostApp.target !== "tanstack-start") {
    addResolutionIssue(issues, {
      severity: "error",
      code: "backend-host-target-unsupported",
      path: "/backend/hostApp",
      capability: null,
      message: `${hostApp.target} cannot host the selected backend.`,
      suggestion: "Use a nextjs or tanstack-start application as the backend host.",
    });
  }
}

function normalizeBilling(
  capabilities: DesiredCapabilities,
  issues: ResolutionIssueMap,
): BillingProvider[] {
  const providers =
    capabilities.billing === false || capabilities.billing === undefined
      ? []
      : capabilities.billing.providers;
  const normalized = uniqueSorted(providers);
  if (
    capabilities.billing !== false &&
    capabilities.billing !== undefined &&
    normalized.length === 0
  ) {
    addResolutionIssue(issues, {
      severity: "error",
      code: "billing-provider-required",
      path: "/capabilities/billing/providers",
      capability: "billing",
      message: "Billing is enabled without a provider.",
      suggestion: "Select at least one supported billing provider or disable billing.",
    });
  }
  if (normalized.length !== providers.length) {
    addResolutionIssue(issues, {
      severity: "warning",
      code: "duplicate-selection",
      path: "/capabilities/billing/providers",
      capability: "billing",
      message: "Duplicate billing providers were removed during normalization.",
      suggestion: "Keep each billing provider only once in desired state.",
    });
  }
  return normalized;
}

export function resolveProjectConfig(desired: DesiredProjectConfig): ResolutionResult {
  const issueMap: ResolutionIssueMap = new Map();
  const name = validateProjectIdentity(desired, issueMap);
  const apps = normalizeAndValidateApps(desired, issueMap);
  validateBindings(desired, apps, issueMap);
  const billingProviders = normalizeBilling(desired.capabilities, issueMap);

  const { state, explicitlyDisabled } = createCapabilityState(desired.capabilities);
  applyCapabilityClosure({
    state,
    explicitlyDisabled,
    desired: desired.capabilities,
    issues: issueMap,
  });
  validateCapabilityRequirements({
    state,
    explicitlyDisabled,
    config: desired,
    apps,
    issues: issueMap,
  });
  const backend = desired.backend;
  if (backend !== false) {
    const host = apps.find(({ id }) => id === backend.hostApp.trim());
    for (const capability of CAPABILITY_IDS) {
      if (
        !state[capability] ||
        !host ||
        isCapabilityDeployBindingSupported({
          capability,
          database: backend.database,
          deployTarget: host.deploy,
        })
      ) {
        continue;
      }
      const isMessaging = capability === "messaging";
      const isJobs = capability === "jobs";
      const isStorage = capability === "storage";
      const isPdf = capability === "pdf";
      addResolutionIssue(issueMap, {
        severity: "error",
        code: "capability-deploy-binding-unsupported",
        path: `/apps/${host.id}/deploy`,
        capability,
        message: isMessaging
          ? `Postgres messaging requires a persistent custom server and cannot run on ${host.deploy}.`
          : isJobs
            ? `Postgres jobs require persistent worker and scheduler processes and cannot run on ${host.deploy}.`
            : isStorage
              ? `Postgres storage requires durable shared object storage and a persistent cleanup worker and cannot use the generated local-disk adapter on ${host.deploy}.`
              : isPdf
                ? `PDF admission is process-local and cannot enforce global concurrency or per-actor limits on ${host.deploy}.`
                : `${capability} is not supported on ${host.deploy} with ${backend.database}.`,
        suggestion: isMessaging
          ? "Use Fly or Docker, select Convex native realtime, or disable messaging."
          : isJobs
            ? "Use Fly or Docker, select Convex scheduled functions, or disable jobs."
            : isStorage
              ? "Use Fly or Docker, select Convex storage, or disable storage until an explicit external object-storage binding is configured."
              : isPdf
                ? "Use the generated single-replica Fly or Docker profile, keep local execution to one web process, or add a shared transactional PDF admission adapter before scaling."
                : "Select a deployment binding listed for this capability in the support catalog.",
      });
    }
  }

  const issues = sortedResolutionIssues(issueMap);
  if (issues.some((issue) => issue.severity === "error")) {
    return deepFreeze({ ok: false, issues });
  }

  const capabilities = resolveCapabilities(desired.capabilities, state, billingProviders);
  const enabledCapabilities = CAPABILITY_IDS.filter((id) => state[id]).sort(compareText);
  const executionRuntime =
    desired.runtime ??
    (desired.backend === false ? EXECUTION_RUNTIMES[0] : desired.backend.executionRuntime);
  const body = {
    $schema: RESOLVED_PROJECT_CONFIG_SCHEMA_URI,
    schemaVersion: 2 as const,
    catalogVersion: 1 as const,
    name,
    mode: desired.mode,
    runtime: executionRuntime,
    packageManager: {
      name: desired.packageManager.name,
      version: desired.packageManager.version,
    },
    apps,
    backend:
      desired.backend === false
        ? false
        : {
            hostApp: desired.backend.hostApp.trim(),
            executionRuntime,
            database: desired.backend.database,
          },
    capabilities,
    enabledCapabilities,
  } as const;
  const config = {
    ...body,
    configHash: canonicalHash(body),
  } satisfies ResolvedProjectConfig;

  return deepFreeze({ ok: true, config, issues });
}
