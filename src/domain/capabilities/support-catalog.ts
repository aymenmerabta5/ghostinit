import { deepFreeze } from "../project/canonical.js";
import { IDENTITY_PASSKEY_ACCEPTANCE_OPERATION_IDS } from "../data-model/capabilities.js";
import {
  APP_TARGETS,
  BILLING_PROVIDERS,
  CACHE_PROVIDERS,
  DATABASE_PROVIDERS,
  DEPLOY_TARGETS,
  EXECUTION_RUNTIMES,
  FEATURE_FLAG_PROVIDERS,
  PACKAGE_MANAGERS,
  PROJECT_MODES,
  SERVER_APP_TARGETS,
  type AppTarget,
  type BillingProvider,
  type DatabaseProvider,
  type DeployTarget,
  type ExecutionRuntime,
  type ProjectMode,
} from "../project/choices.js";
import {
  CAPABILITY_IDS,
  CLIENT_SURFACE_ARTIFACT_KINDS,
  type CapabilityClientBinding,
  type CapabilityDefinition,
  type CapabilityId,
  type CapabilityOperationEvidence,
} from "./types.js";
import { CAPABILITY_OPERATION_EVIDENCE } from "./operation-evidence.js";
import {
  BILLING_PROVIDER_CLIENT_BINDINGS,
  billingProviderSupportsClientOperation,
  type BillingProviderClientBinding,
} from "./billing-provider-operations.js";

export const SUPPORT_CATALOG_SCHEMA_URI =
  "https://ghostinit.dev/schemas/support-catalog.schema.json";

export interface DeployBinding {
  readonly target: AppTarget;
  readonly modes: readonly ProjectMode[];
  readonly executionRuntimes: readonly ExecutionRuntime[];
  readonly deployTargets: readonly DeployTarget[];
}

export interface CapabilityDeployBinding {
  readonly capability: CapabilityId;
  readonly database: DatabaseProvider;
  readonly deployTargets: readonly DeployTarget[];
}

/** Closed database/runtime-adapter support by deployment target. */
export interface DatabaseDeployBinding {
  readonly database: DatabaseProvider;
  readonly deployTargets: readonly DeployTarget[];
}

export interface SupportCatalogEvidenceNote {
  readonly id: string;
  readonly subject: `execution-runtime:${ExecutionRuntime}`;
  readonly status: "retained-compatibility";
  readonly note: string;
  readonly requiredEvidence: readonly string[];
}

export interface SupportCatalogManifest {
  readonly $schema: typeof SUPPORT_CATALOG_SCHEMA_URI;
  readonly schemaVersion: 2;
  readonly catalogVersion: 2;
  readonly axes: {
    readonly modes: typeof PROJECT_MODES;
    readonly appTargets: typeof APP_TARGETS;
    readonly databases: typeof DATABASE_PROVIDERS;
    readonly cacheProviders: typeof CACHE_PROVIDERS;
    readonly deployTargets: typeof DEPLOY_TARGETS;
    readonly executionRuntimes: typeof EXECUTION_RUNTIMES;
    readonly billingProviders: typeof BILLING_PROVIDERS;
    readonly featureFlagProviders: typeof FEATURE_FLAG_PROVIDERS;
    readonly packageManagers: typeof PACKAGE_MANAGERS;
  };
  readonly deployBindings: readonly DeployBinding[];
  readonly databaseDeployBindings: readonly DatabaseDeployBinding[];
  /** Unlisted capability/database tuples fail closed on these targets. */
  readonly defaultDenyCapabilityDeployTargets: readonly DeployTarget[];
  readonly capabilityDeployBindings: readonly CapabilityDeployBinding[];
  readonly billingProviderClientBindings: readonly BillingProviderClientBinding[];
  readonly capabilities: readonly CapabilityDefinition[];
  /** Closed mapping from every advertised operation to executable behavioral proof. */
  readonly operationEvidence: readonly CapabilityOperationEvidence[];
  readonly compatibilityEvidence: readonly SupportCatalogEvidenceNote[];
}

const ALL_WEB_DEPLOY_TARGETS = ["none", "vercel", "fly", "docker", "cloudflare"] as const;
const LOCAL_ONLY_DEPLOY_TARGETS = ["none"] as const;

const deployBindings = [
  {
    target: "nextjs",
    modes: PROJECT_MODES,
    executionRuntimes: EXECUTION_RUNTIMES,
    deployTargets: ALL_WEB_DEPLOY_TARGETS,
  },
  {
    target: "tanstack-start",
    modes: PROJECT_MODES,
    executionRuntimes: EXECUTION_RUNTIMES,
    deployTargets: ALL_WEB_DEPLOY_TARGETS,
  },
  {
    target: "expo",
    modes: PROJECT_MODES,
    executionRuntimes: EXECUTION_RUNTIMES,
    deployTargets: LOCAL_ONLY_DEPLOY_TARGETS,
  },
  {
    target: "electron",
    modes: PROJECT_MODES,
    executionRuntimes: EXECUTION_RUNTIMES,
    deployTargets: LOCAL_ONLY_DEPLOY_TARGETS,
  },
] as const satisfies readonly DeployBinding[];

const databaseDeployBindings = [
  {
    database: "postgres",
    deployTargets: ["none", "vercel", "fly", "docker"],
  },
  {
    database: "convex",
    deployTargets: ALL_WEB_DEPLOY_TARGETS,
  },
  {
    database: "none",
    deployTargets: ALL_WEB_DEPLOY_TARGETS,
  },
] as const satisfies readonly DatabaseDeployBinding[];

const capabilityDeployBindings = [
  {
    capability: "messaging",
    database: "postgres",
    deployTargets: ["none", "fly", "docker"],
  },
  {
    capability: "jobs",
    database: "postgres",
    deployTargets: ["none", "fly", "docker"],
  },
  {
    capability: "storage",
    database: "postgres",
    deployTargets: ["none", "fly", "docker"],
  },
  {
    capability: "pdf",
    database: "postgres",
    deployTargets: ["none", "fly", "docker"],
  },
  {
    capability: "pdf",
    database: "convex",
    deployTargets: ["none", "fly", "docker"],
  },
  {
    capability: "eve",
    database: "postgres",
    deployTargets: ["none", "vercel", "fly", "docker"],
  },
  {
    capability: "eve",
    database: "convex",
    deployTargets: ["none", "vercel", "fly", "docker"],
  },
  ...(
    [
      ["transport", "convex"],
      ["transport", "none"],
      ["auth", "convex"],
      ["billing", "convex"],
      ["messaging", "convex"],
      ["email", "convex"],
      ["email", "none"],
      ["storage", "convex"],
      ["cache", "convex"],
      ["cache", "none"],
      ["analytics", "convex"],
      ["analytics", "none"],
      ["i18n", "convex"],
      ["i18n", "none"],
      ["notifications", "convex"],
      ["featureFlags", "convex"],
      ["featureFlags", "none"],
      ["jobs", "convex"],
    ] as const
  ).map(([capability, database]) => ({
    capability,
    database,
    deployTargets: ALL_WEB_DEPLOY_TARGETS,
  })),
] as const satisfies readonly CapabilityDeployBinding[];

const compatibilityEvidence = [
  {
    id: "runtime.node-retained.v1",
    subject: "execution-runtime:node",
    status: "retained-compatibility",
    note: "Node runtime is retained from V1 and remains gated by the generated release matrix.",
    requiredEvidence: ["runtime.node.generated-matrix.v1", "runtime.node.packed-cli.v1"],
  },
] as const satisfies readonly SupportCatalogEvidenceNote[];

const noClientSurface = (): CapabilityClientBinding => ({
  status: "not-required",
  requiredOperationIds: [],
  requiredArtifacts: [],
});

const supportedClientSurface = (
  requiredOperationIds: readonly string[],
): CapabilityClientBinding => ({
  status: "supported",
  requiredOperationIds,
  requiredArtifacts: CLIENT_SURFACE_ARTIFACT_KINDS,
});

function clientBindings(
  nextjs: CapabilityClientBinding,
  tanstackStart: CapabilityClientBinding,
  expo: CapabilityClientBinding,
  electron: CapabilityClientBinding,
): Readonly<Record<AppTarget, CapabilityClientBinding>> {
  return { nextjs, "tanstack-start": tanstackStart, expo, electron };
}

function noClientBindings(): Readonly<Record<AppTarget, CapabilityClientBinding>> {
  return clientBindings(noClientSurface(), noClientSurface(), noClientSurface(), noClientSurface());
}

const capabilities = [
  {
    id: "transport",
    description: "Typed public transport hosted by a server-capable application.",
    requirements: [
      { kind: "backend" },
      { kind: "target-binding", subject: "backend-host", targets: SERVER_APP_TARGETS },
    ],
    acceptanceOperationIds: ["transport.health.v1", "transport.roundtrip.v1"],
    clientSurfaceRequired: false,
    clientBindings: noClientBindings(),
  },
  {
    id: "auth",
    description: "Authentication backed by persistent application identity state.",
    requirements: [
      { kind: "backend" },
      { kind: "persistence" },
      { kind: "target-binding", subject: "backend-host", targets: SERVER_APP_TARGETS },
    ],
    acceptanceOperationIds: [
      "auth.session.v1",
      "auth.sign-in.v1",
      ...IDENTITY_PASSKEY_ACCEPTANCE_OPERATION_IDS,
    ],
    clientSurfaceRequired: true,
    clientBindings: clientBindings(
      supportedClientSurface([
        "auth.session.v1",
        "auth.sign-in.v1",
        ...IDENTITY_PASSKEY_ACCEPTANCE_OPERATION_IDS,
      ]),
      supportedClientSurface([
        "auth.session.v1",
        "auth.sign-in.v1",
        ...IDENTITY_PASSKEY_ACCEPTANCE_OPERATION_IDS,
      ]),
      supportedClientSurface(["auth.session.v1", "auth.sign-in.v1"]),
      supportedClientSurface(["auth.session.v1", "auth.sign-in.v1"]),
    ),
  },
  {
    id: "billing",
    description: "Provider-neutral billing with authenticated ownership and persistence.",
    requirements: [
      { kind: "capability", capability: "auth" },
      { kind: "capability", capability: "transport" },
      { kind: "backend" },
      { kind: "persistence" },
      { kind: "target-binding", subject: "backend-host", targets: SERVER_APP_TARGETS },
    ],
    acceptanceOperationIds: [
      "billing.checkout.v1",
      "billing.invoices.v1",
      "billing.payment-link.v1",
      "billing.portal.v1",
      "billing.subscriptions.v1",
      "billing.webhook.v1",
    ],
    clientSurfaceRequired: true,
    clientBindings: clientBindings(
      supportedClientSurface([
        "billing.checkout.v1",
        "billing.invoices.v1",
        "billing.payment-link.v1",
        "billing.portal.v1",
        "billing.subscriptions.v1",
      ]),
      supportedClientSurface([
        "billing.checkout.v1",
        "billing.invoices.v1",
        "billing.payment-link.v1",
        "billing.portal.v1",
        "billing.subscriptions.v1",
      ]),
      supportedClientSurface([
        "billing.checkout.v1",
        "billing.invoices.v1",
        "billing.payment-link.v1",
        "billing.portal.v1",
        "billing.subscriptions.v1",
      ]),
      supportedClientSurface([
        "billing.checkout.v1",
        "billing.invoices.v1",
        "billing.payment-link.v1",
        "billing.portal.v1",
        "billing.subscriptions.v1",
      ]),
    ),
  },
  {
    id: "messaging",
    description: "Authenticated persistent messaging through typed transport.",
    requirements: [
      { kind: "capability", capability: "auth" },
      { kind: "capability", capability: "transport" },
      { kind: "capability", capability: "storage" },
      { kind: "backend" },
      { kind: "persistence" },
      { kind: "target-binding", subject: "backend-host", targets: SERVER_APP_TARGETS },
    ],
    acceptanceOperationIds: [
      "messaging.attachment.download.v1",
      "messaging.attachment.upload.v1",
      "messaging.conversation.create.v1",
      "messaging.list.v1",
      "messaging.polling-fallback.v1",
      "messaging.send.v1",
      "messaging.transport-status.v1",
      "messaging.typing.v1",
    ],
    clientSurfaceRequired: true,
    clientBindings: clientBindings(
      supportedClientSurface([
        "messaging.attachment.download.v1",
        "messaging.attachment.upload.v1",
        "messaging.conversation.create.v1",
        "messaging.list.v1",
        "messaging.send.v1",
        "messaging.transport-status.v1",
        "messaging.typing.v1",
      ]),
      supportedClientSurface([
        "messaging.attachment.download.v1",
        "messaging.attachment.upload.v1",
        "messaging.conversation.create.v1",
        "messaging.list.v1",
        "messaging.send.v1",
        "messaging.transport-status.v1",
        "messaging.typing.v1",
      ]),
      supportedClientSurface([
        "messaging.attachment.download.v1",
        "messaging.attachment.upload.v1",
        "messaging.conversation.create.v1",
        "messaging.list.v1",
        "messaging.polling-fallback.v1",
        "messaging.send.v1",
        "messaging.transport-status.v1",
      ]),
      supportedClientSurface([
        "messaging.attachment.download.v1",
        "messaging.attachment.upload.v1",
        "messaging.conversation.create.v1",
        "messaging.list.v1",
        "messaging.polling-fallback.v1",
        "messaging.send.v1",
        "messaging.transport-status.v1",
      ]),
    ),
  },
  {
    id: "email",
    description: "Server-owned transactional email delivery.",
    requirements: [
      { kind: "backend" },
      { kind: "target-binding", subject: "backend-host", targets: SERVER_APP_TARGETS },
    ],
    acceptanceOperationIds: ["email.send.v1"],
    clientSurfaceRequired: false,
    clientBindings: noClientBindings(),
  },
  {
    id: "storage",
    description: "Server-authorized object storage.",
    requirements: [
      { kind: "capability", capability: "auth" },
      { kind: "capability", capability: "transport" },
      { kind: "backend" },
      { kind: "persistence" },
      { kind: "target-binding", subject: "backend-host", targets: SERVER_APP_TARGETS },
    ],
    acceptanceOperationIds: ["storage.authorized-read.v1", "storage.authorized-write.v1"],
    clientSurfaceRequired: true,
    clientBindings: clientBindings(
      supportedClientSurface(["storage.authorized-read.v1", "storage.authorized-write.v1"]),
      supportedClientSurface(["storage.authorized-read.v1", "storage.authorized-write.v1"]),
      supportedClientSurface(["storage.authorized-read.v1", "storage.authorized-write.v1"]),
      supportedClientSurface(["storage.authorized-read.v1", "storage.authorized-write.v1"]),
    ),
  },
  {
    id: "cache",
    description: "A selected server cache adapter.",
    requirements: [
      { kind: "backend" },
      { kind: "target-binding", subject: "backend-host", targets: SERVER_APP_TARGETS },
    ],
    acceptanceOperationIds: ["cache.get-set.v1"],
    clientSurfaceRequired: false,
    clientBindings: noClientBindings(),
  },
  {
    id: "analytics",
    description: "Consent-aware analytics for a selected application target.",
    requirements: [],
    acceptanceOperationIds: ["analytics.capture.v1"],
    clientSurfaceRequired: true,
    clientBindings: clientBindings(
      supportedClientSurface(["analytics.capture.v1"]),
      supportedClientSurface(["analytics.capture.v1"]),
      supportedClientSurface(["analytics.capture.v1"]),
      supportedClientSurface(["analytics.capture.v1"]),
    ),
  },
  {
    id: "i18n",
    description: "Localized routing and translated surfaces for a selected target.",
    requirements: [],
    acceptanceOperationIds: ["i18n.locale-routing.v1"],
    clientSurfaceRequired: true,
    clientBindings: clientBindings(
      supportedClientSurface(["i18n.locale-routing.v1"]),
      supportedClientSurface(["i18n.locale-routing.v1"]),
      supportedClientSurface(["i18n.locale-routing.v1"]),
      supportedClientSurface(["i18n.locale-routing.v1"]),
    ),
  },
  {
    id: "pdf",
    description: "Server-side document rendering.",
    requirements: [
      { kind: "capability", capability: "auth" },
      { kind: "capability", capability: "transport" },
      { kind: "backend" },
      { kind: "target-binding", subject: "backend-host", targets: SERVER_APP_TARGETS },
    ],
    acceptanceOperationIds: ["pdf.render.v1"],
    clientSurfaceRequired: true,
    clientBindings: clientBindings(
      supportedClientSurface(["pdf.render.v1"]),
      supportedClientSurface(["pdf.render.v1"]),
      supportedClientSurface(["pdf.render.v1"]),
      supportedClientSurface(["pdf.render.v1"]),
    ),
  },
  {
    id: "eve",
    description: "Server-hosted Eve agents exposed through typed transport.",
    requirements: [
      { kind: "capability", capability: "auth" },
      { kind: "capability", capability: "transport" },
      { kind: "backend" },
      { kind: "persistence" },
      { kind: "target-binding", subject: "backend-host", targets: SERVER_APP_TARGETS },
    ],
    acceptanceOperationIds: ["eve.invoke.v1"],
    clientSurfaceRequired: true,
    clientBindings: clientBindings(
      supportedClientSurface(["eve.invoke.v1"]),
      supportedClientSurface(["eve.invoke.v1"]),
      supportedClientSurface(["eve.invoke.v1"]),
      supportedClientSurface(["eve.invoke.v1"]),
    ),
  },
  {
    id: "notifications",
    description: "Authenticated persistent notification inbox and device registrations.",
    requirements: [
      { kind: "capability", capability: "auth" },
      { kind: "capability", capability: "transport" },
      { kind: "backend" },
      { kind: "persistence" },
      { kind: "target-binding", subject: "backend-host", targets: SERVER_APP_TARGETS },
    ],
    acceptanceOperationIds: [
      "notifications.create.v1",
      "notifications.list.v1",
      "notifications.mark-read.v1",
      "notifications.register-device.v1",
    ],
    clientSurfaceRequired: true,
    clientBindings: clientBindings(
      supportedClientSurface([
        "notifications.create.v1",
        "notifications.list.v1",
        "notifications.mark-read.v1",
      ]),
      supportedClientSurface([
        "notifications.create.v1",
        "notifications.list.v1",
        "notifications.mark-read.v1",
      ]),
      supportedClientSurface([
        "notifications.create.v1",
        "notifications.list.v1",
        "notifications.mark-read.v1",
        "notifications.register-device.v1",
      ]),
      supportedClientSurface([
        "notifications.create.v1",
        "notifications.list.v1",
        "notifications.mark-read.v1",
      ]),
    ),
  },
  {
    id: "featureFlags",
    description: "Remote feature-flag resolution through a selected provider.",
    requirements: [
      { kind: "capability", capability: "transport" },
      { kind: "backend" },
      { kind: "target-binding", subject: "backend-host", targets: SERVER_APP_TARGETS },
    ],
    acceptanceOperationIds: ["feature-flags.resolve.v1"],
    clientSurfaceRequired: true,
    clientBindings: clientBindings(
      supportedClientSurface(["feature-flags.resolve.v1"]),
      supportedClientSurface(["feature-flags.resolve.v1"]),
      supportedClientSurface(["feature-flags.resolve.v1"]),
      supportedClientSurface(["feature-flags.resolve.v1"]),
    ),
  },
  {
    id: "jobs",
    description: "Persistent background jobs hosted by a runnable server target.",
    requirements: [
      { kind: "capability", capability: "auth", when: "jobs-user-facing-api" },
      { kind: "capability", capability: "transport", when: "jobs-user-facing-api" },
      { kind: "backend" },
      { kind: "persistence" },
      { kind: "target-binding", subject: "backend-host", targets: SERVER_APP_TARGETS },
    ],
    acceptanceOperationIds: ["jobs.execute.v1", "jobs.schedule.v1"],
    clientSurfaceRequired: true,
    clientBindings: clientBindings(
      supportedClientSurface(["jobs.execute.v1"]),
      supportedClientSurface(["jobs.execute.v1"]),
      supportedClientSurface(["jobs.execute.v1"]),
      supportedClientSurface(["jobs.execute.v1"]),
    ),
  },
] as const satisfies readonly CapabilityDefinition[];

export const SUPPORT_CATALOG = deepFreeze({
  $schema: SUPPORT_CATALOG_SCHEMA_URI,
  schemaVersion: 2,
  catalogVersion: 2,
  axes: {
    modes: PROJECT_MODES,
    appTargets: APP_TARGETS,
    databases: DATABASE_PROVIDERS,
    cacheProviders: CACHE_PROVIDERS,
    deployTargets: DEPLOY_TARGETS,
    executionRuntimes: EXECUTION_RUNTIMES,
    billingProviders: BILLING_PROVIDERS,
    featureFlagProviders: FEATURE_FLAG_PROVIDERS,
    packageManagers: PACKAGE_MANAGERS,
  },
  deployBindings,
  databaseDeployBindings,
  defaultDenyCapabilityDeployTargets: ["cloudflare"],
  capabilityDeployBindings,
  billingProviderClientBindings: BILLING_PROVIDER_CLIENT_BINDINGS,
  capabilities,
  operationEvidence: CAPABILITY_OPERATION_EVIDENCE,
  compatibilityEvidence,
} satisfies SupportCatalogManifest);

const definitionById = new Map<CapabilityId, CapabilityDefinition>(
  SUPPORT_CATALOG.capabilities.map((definition) => [definition.id, definition]),
);

const operationEvidenceById = new Map<string, CapabilityOperationEvidence>(
  SUPPORT_CATALOG.operationEvidence.map((evidence) => [evidence.operationId, evidence]),
);

export function getCapabilityDefinition(id: CapabilityId): CapabilityDefinition {
  const definition = definitionById.get(id);
  if (!definition) throw new Error(`Support catalog is missing capability ${id}`);
  return definition;
}

export function getCapabilityOperationEvidence(
  operationId: string,
): CapabilityOperationEvidence | undefined {
  return operationEvidenceById.get(operationId);
}

/**
 * Resolve conditional operation promises from the selected persistence/provider
 * bindings. The catalog's base capability remains the union of supported cases.
 */
export function getEffectiveCapabilityClientBinding(args: {
  capability: CapabilityId;
  target: AppTarget;
  database: DatabaseProvider;
  billingProviders?: readonly BillingProvider[];
}): CapabilityClientBinding {
  const binding = getCapabilityDefinition(args.capability).clientBindings[args.target];
  if (args.capability === "billing" && args.billingProviders !== undefined) {
    return deepFreeze({
      ...binding,
      requiredOperationIds: binding.requiredOperationIds.filter((operation) =>
        args.billingProviders?.some((provider) =>
          billingProviderSupportsClientOperation(provider, operation),
        ),
      ),
    });
  }
  if (args.capability !== "auth" || args.database === "postgres") return binding;
  const requiredOperationIds = binding.requiredOperationIds.filter(
    (operation) =>
      !(IDENTITY_PASSKEY_ACCEPTANCE_OPERATION_IDS as readonly string[]).includes(operation),
  );
  return deepFreeze({ ...binding, requiredOperationIds });
}

export function isDeployBindingSupported(args: {
  readonly target: AppTarget;
  readonly mode: ProjectMode;
  readonly executionRuntime: ExecutionRuntime;
  readonly deployTarget: DeployTarget;
}): boolean {
  return SUPPORT_CATALOG.deployBindings.some(
    (binding) =>
      binding.target === args.target &&
      binding.modes.includes(args.mode) &&
      binding.executionRuntimes.includes(args.executionRuntime) &&
      binding.deployTargets.some((deployTarget) => deployTarget === args.deployTarget),
  );
}

export function isDatabaseDeployBindingSupported(args: {
  readonly database: DatabaseProvider;
  readonly deployTarget: DeployTarget;
}): boolean {
  const binding = SUPPORT_CATALOG.databaseDeployBindings.find(
    (candidate) => candidate.database === args.database,
  );
  return Boolean(binding?.deployTargets.some((deployTarget) => deployTarget === args.deployTarget));
}

export function isCapabilityDeployBindingSupported(args: {
  readonly capability: CapabilityId;
  readonly database: DatabaseProvider;
  readonly deployTarget: DeployTarget;
}): boolean {
  const binding = SUPPORT_CATALOG.capabilityDeployBindings.find(
    (candidate) => candidate.capability === args.capability && candidate.database === args.database,
  );
  if (
    binding === undefined &&
    (SUPPORT_CATALOG.defaultDenyCapabilityDeployTargets as readonly DeployTarget[]).includes(
      args.deployTarget,
    )
  ) {
    return false;
  }
  return (
    binding === undefined || binding.deployTargets.some((target) => target === args.deployTarget)
  );
}

export function hasCompleteCapabilityCatalog(): boolean {
  const advertisedOperations = SUPPORT_CATALOG.capabilities.flatMap((definition) =>
    definition.acceptanceOperationIds.map((operationId) => ({
      capability: definition.id,
      operationId,
    })),
  );
  const hasCompleteOperationEvidence =
    operationEvidenceById.size === SUPPORT_CATALOG.operationEvidence.length &&
    SUPPORT_CATALOG.operationEvidence.length === advertisedOperations.length &&
    advertisedOperations.every(({ capability, operationId }) => {
      const evidence = operationEvidenceById.get(operationId);
      return (
        evidence?.capability === capability &&
        evidence.artifacts.length > 0 &&
        evidence.artifacts.every(
          (artifact) =>
            artifact.kind === "bun-test" &&
            /^tests\/(?:unit|integration)\/.+\.test\.[cm]?[jt]sx?$/.test(artifact.path) &&
            artifact.testName.trim().length > 0,
        )
      );
    });
  const capabilityDeployKeys = SUPPORT_CATALOG.capabilityDeployBindings.map(
    ({ capability, database }) => `${capability}:${database}`,
  );
  const hasClosedDeployPolicy =
    new Set(capabilityDeployKeys).size === capabilityDeployKeys.length &&
    SUPPORT_CATALOG.defaultDenyCapabilityDeployTargets.every((target) =>
      (DEPLOY_TARGETS as readonly DeployTarget[]).includes(target),
    );
  const billingBindings = SUPPORT_CATALOG.billingProviderClientBindings;
  const billingOperations = getCapabilityDefinition("billing").acceptanceOperationIds;
  const hasClosedBillingPolicy =
    billingBindings.length === BILLING_PROVIDERS.length &&
    new Set(billingBindings.map(({ provider }) => provider)).size === BILLING_PROVIDERS.length &&
    BILLING_PROVIDERS.every((provider) =>
      billingBindings.some((entry) => entry.provider === provider),
    ) &&
    billingBindings.every(
      ({ operationIds }) =>
        operationIds.length > 0 &&
        operationIds.every((operation) => billingOperations.includes(operation)),
    );
  return (
    hasCompleteOperationEvidence &&
    hasClosedDeployPolicy &&
    hasClosedBillingPolicy &&
    SUPPORT_CATALOG.capabilities.length === CAPABILITY_IDS.length &&
    CAPABILITY_IDS.every((id) => definitionById.has(id)) &&
    SUPPORT_CATALOG.capabilities.every((definition) =>
      APP_TARGETS.every((target) => {
        const binding = definition.clientBindings[target];
        if (!binding) return false;
        if (definition.clientSurfaceRequired) {
          return (
            binding.status !== "not-required" &&
            binding.requiredOperationIds.length > 0 &&
            binding.requiredArtifacts.length > 0 &&
            binding.requiredOperationIds.every((operation) =>
              (definition.acceptanceOperationIds as readonly string[]).includes(operation),
            ) &&
            (binding.status !== "unsupported" || Boolean(binding.reason?.trim()))
          );
        }
        return (
          binding.status === "not-required" &&
          binding.requiredOperationIds.length === 0 &&
          binding.requiredArtifacts.length === 0
        );
      }),
    )
  );
}
