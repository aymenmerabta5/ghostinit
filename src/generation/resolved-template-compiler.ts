import type {
  ProjectRendererPort,
  RenderedProjectContribution,
} from "../application/ports/project-renderer.js";
import { isCapabilityDeployBindingSupported } from "../domain/capabilities/support-catalog.js";
import type { CapabilityId } from "../domain/capabilities/types.js";
import type {
  FileLifecycle,
  FileOwner,
  PlannedFileInput,
  PlannedSecretOperation,
  SecretDestination,
} from "../domain/generation/types.js";
import type { ResolvedProjectConfig } from "../domain/project/config.js";
import { deepFreeze } from "../domain/project/canonical.js";
import { projectConfigSchema, type ProjectConfig } from "../lib/config.js";
import { buildAddonInstallerMap } from "../lib/addons.js";
import type { RootSecrets } from "../templates/root.js";
import type { TemplateFile } from "../templates/shared.js";
import { sanitizeLegacyCapabilityOutput } from "./capability-output-sanitizer.js";
import { clientFileAttribution } from "./client-surface-attribution.js";
import { emitLegacyTemplateTarget, type LegacyTemplateTarget } from "./legacy-template-adapter.js";

export const RESOLVED_TEMPLATE_RENDERER_ID = "resolved-template-compiler.v2" as const;
export const CORE_RENDER_ACCEPTANCE_ID = "project.render.v2" as const;

/**
 * The remaining bridge is mechanical and byte-compatible: legacy templates
 * still return path/content pairs, while this compiler owns all resolved policy,
 * attribution, lifecycle, and secret declarations before the domain plan is
 * accepted. The legacy emitter itself is intentionally policy-free.
 */
export const RESOLVED_TEMPLATE_COMPILER_BRIDGE = Object.freeze({
  emitter: "legacy-string-template-target",
  policySource: "immutable-resolved-project-config",
  byteCompatibilityProjection: true,
} as const);

export class LegacyRendererCompatibilityError extends Error {
  readonly code = "legacy-renderer-unrepresentable" as const;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(message: string, details: Readonly<Record<string, unknown>>) {
    super(message);
    this.name = "LegacyRendererCompatibilityError";
    this.details = details;
  }
}

const PLACEHOLDER_SECRETS: RootSecrets = Object.freeze({
  authSecret: "REPLACE_WITH_A_STRONG_SECRET_AT_LEAST_32_CHARS",
  postgresPassword: "REPLACE_WITH_A_STRONG_POSTGRES_PASSWORD",
  notificationTokenEncryptionKey: "REPLACE_WITH_32_BYTE_BASE64URL_KEY",
  eveInternalAuthSecret: "REPLACE_WITH_A_STRONG_RANDOM_SECRET_AT_LEAST_32_CHARS",
});

const TANSTACK_SERVER_FUNCTIONS_PATH = /^(?:apps\/web\/)?src\/lib\/server-functions\.ts$/;

const CAPABILITY_PATH_RULES: readonly {
  readonly capability: CapabilityId;
  readonly pattern: RegExp;
}[] = [
  { capability: "featureFlags", pattern: /(?:^|\/)(?:feature-flags?|flags?)(?:\/|[.-])/i },
  { capability: "notifications", pattern: /(?:^|\/)notifications?(?:\/|[.-])/i },
  {
    capability: "messaging",
    pattern: /(?:^|\/)(?:messaging|messages?|conversations?|attachments?)(?:\/|[.-])/i,
  },
  {
    capability: "billing",
    pattern: /(?:^|\/)(?:billing|subscriptions?|invoices?|webhooks?)(?:\/|[.-])/i,
  },
  {
    capability: "auth",
    pattern:
      /(?:^|\/)(?:auth|identity|sessions?|organizations?|invitations?|passkeys?|two-factor)(?:\/|[.-])/i,
  },
  { capability: "email", pattern: /(?:^|\/)(?:email|resend)(?:\/|[.-])/i },
  { capability: "storage", pattern: /(?:^|\/)(?:storage|uploads?|objects?|s3)(?:\/|[.-])/i },
  { capability: "cache", pattern: /(?:^|\/)(?:cache|redis)(?:\/|[.-])/i },
  { capability: "analytics", pattern: /(?:^|\/)(?:analytics|posthog|ingest)(?:\/|[.-])/i },
  { capability: "i18n", pattern: /(?:^|\/)(?:i18n|locales?|messages)(?:\/|[.-])/i },
  { capability: "pdf", pattern: /(?:^|\/)(?:pdf|documents?)(?:\/|[.-])/i },
  { capability: "eve", pattern: /(?:^|\/)(?:eve|agent)(?:\/|[.-])/i },
  { capability: "jobs", pattern: /(?:^|\/)(?:jobs?|workers?|schedules?)(?:\/|[.-])/i },
  {
    capability: "transport",
    pattern: /^(?:packages\/(?:api|contracts)\/|.*\/(?:api|transport|orpc)(?:\/|[.-]))/i,
  },
] as const;

function capabilityForPath(path: string): CapabilityId | null {
  // Locale catalogs share a `messages/` segment with the messaging feature.
  // Resolve the typed JSON catalog shape before the broader messaging rule so
  // provenance never depends on which of the two capabilities is enabled.
  if (/(?:^|\/)(?:i18n\/)?messages\/[^/]+\.json$/i.test(path)) return "i18n";
  if (TANSTACK_SERVER_FUNCTIONS_PATH.test(path)) return "transport";
  return CAPABILITY_PATH_RULES.find(({ pattern }) => pattern.test(path))?.capability ?? null;
}

function ownerForPath(path: string): FileOwner {
  if (path === "ghostinit.config.json" || path.startsWith(".ghostinit/")) return "ghostinit";
  if (/\.(?:md|mdc)$/.test(path)) return "documentation";
  if (path.startsWith("tooling/") || path.startsWith(".github/")) return "tooling";
  if (path.startsWith("packages/ui/") || path.startsWith("src/platform/ui/")) return "ui";
  if (
    path.startsWith("packages/api/") ||
    path.startsWith("packages/contracts/") ||
    path.includes("/api/") ||
    path.startsWith("src/server/transport/") ||
    path.includes("/transport/") ||
    TANSTACK_SERVER_FUNCTIONS_PATH.test(path)
  ) {
    return "transport";
  }
  if (
    /^apps\/desktop\/src\/(?:main|preload)(?:\/|\.)/.test(path) ||
    /^src\/(?:main|preload)(?:\/|\.)/.test(path)
  ) {
    return "platform";
  }
  if (/^(?:apps\/[^/]+\/)?(?:src\/)?(?:app|routes|components|hooks|lib)\//.test(path)) {
    return "ui";
  }
  if (path.startsWith("apps/")) return "platform";
  if (
    path.includes("/application/") ||
    path.includes("/services/") ||
    path.startsWith("packages/services/")
  ) {
    return "application";
  }
  if (path.includes("/domain/") || path.startsWith("packages/modules/")) return "domain";
  if (
    path.includes("/providers/") ||
    path.includes("/adapters/") ||
    path.includes("database") ||
    path.includes("/db/") ||
    path.startsWith("convex/")
  ) {
    return "adapter";
  }
  if (
    path === "package.json" ||
    path.endsWith("/package.json") ||
    path.endsWith(".json") ||
    path.endsWith(".toml") ||
    path.endsWith(".yml") ||
    path.endsWith(".yaml")
  ) {
    return "tooling";
  }
  return "root";
}

function lifecycleForPath(path: string, capability: CapabilityId | null): FileLifecycle {
  if (path === "ghostinit.config.json" || path.startsWith(".ghostinit/")) {
    return "generator-owned";
  }
  // Convex codegen replaces these bootstrap files after a deployment is linked.
  // They must remain user/tool-owned on later syncs rather than conflicting with
  // or overwriting the authoritative deployment-generated output.
  if (path.startsWith("convex/_generated/")) return "seed-once";
  if (
    path === "package.json" ||
    path.endsWith("/package.json") ||
    path === "turbo.json" ||
    path.endsWith("tsconfig.json") ||
    path === "components.json"
  ) {
    return "structured-merge";
  }
  if (
    path === ".env.local" ||
    path.endsWith("/.env.local") ||
    path.endsWith("README.md") ||
    path.endsWith("AGENTS.md") ||
    path.endsWith("CLAUDE.md") ||
    // Application pages are seeded for product teams to customize, but
    // transport entrypoints are executable generator wiring.  Treating Next
    // `app/api/**/route.ts` as seed-once left stale handlers behind whenever a
    // capability changed and also prevented security fixes from reaching an
    // otherwise untouched generated route.
    /^(?:apps\/[^/]+\/)?src\/app\/(?!api\/).*(?:page|layout|route)\.tsx?$/.test(path)
  ) {
    return "seed-once";
  }
  // Capability slices must be removable after an explicit disable. This hint
  // controls lifecycle only; it is deliberately not recorded as provenance.
  if (capability !== null) return "generator-owned";
  return "generator-owned";
}

function legacyApps(config: ResolvedProjectConfig): ProjectConfig["apps"] {
  return [
    ...new Set(
      config.apps.map((app) =>
        app.target === "expo" ? "mobile" : app.target === "electron" ? "desktop" : "web",
      ),
    ),
  ];
}

function assertLegacyAppProjectionIsLossless(config: ResolvedProjectConfig): void {
  const expectedId = {
    nextjs: "web",
    "tanstack-start": "web",
    expo: "mobile",
    electron: "desktop",
  } as const;
  const serverApps = config.apps.filter(
    ({ target }) => target === "nextjs" || target === "tanstack-start",
  );
  const duplicateTargets = config.apps
    .map(({ target }) => target)
    .filter((target, index, targets) => targets.indexOf(target) !== index);
  const customIds = config.apps.filter(({ id, target }) => id !== expectedId[target]);
  const invalidBackendHost =
    config.backend !== false &&
    (serverApps.length !== 1 || serverApps[0]?.id !== config.backend.hostApp);
  const messagingDeployMismatch =
    config.capabilities.messaging &&
    config.backend !== false &&
    config.backend.database === "postgres" &&
    serverApps.some(
      ({ deploy }) =>
        !isCapabilityDeployBindingSupported({
          capability: "messaging",
          database: "postgres",
          deployTarget: deploy,
        }),
    );
  if (
    serverApps.length > 1 ||
    duplicateTargets.length > 0 ||
    customIds.length > 0 ||
    invalidBackendHost ||
    messagingDeployMismatch
  ) {
    throw new LegacyRendererCompatibilityError(
      "The compatibility renderer cannot losslessly project this resolved application layout",
      {
        apps: config.apps.map(({ id, target, deploy }) => ({ id, target, deploy })),
        backendHost: config.backend === false ? null : config.backend.hostApp,
        reason:
          "custom app ids, repeated targets, multiple web frameworks, and noncanonical backend hosts require native V2 renderers",
      },
    );
  }
}

/**
 * Temporary compatibility projection for the existing string-template tree.
 * Every value is derived from the immutable resolved graph; desired/legacy
 * booleans never participate in rendering after resolution.
 */
export function resolvedToLegacyRenderConfig(config: ResolvedProjectConfig): ProjectConfig {
  assertLegacyAppProjectionIsLossless(config);
  const web = config.apps.find((app) => app.target === "nextjs" || app.target === "tanstack-start");
  const caps = config.capabilities;
  const fullSaas = caps.auth && caps.transport && caps.email && caps.analytics;
  const frontendOnly = !caps.auth && !caps.transport && !caps.email && !caps.analytics;

  return projectConfigSchema.parse({
    name: config.name,
    runtime: config.runtime,
    version: "0.1.0",
    mode: config.mode,
    preset: fullSaas ? "saas" : frontendOnly ? "frontend" : "custom",
    cache: caps.cache.enabled ? caps.cache.provider : "none",
    deploy: web?.deploy ?? "none",
    auth: caps.auth,
    api: caps.transport,
    email: caps.email,
    analytics: caps.analytics,
    eve: caps.eve,
    i18n: caps.i18n,
    pdf: caps.pdf,
    messaging: caps.messaging,
    storage: caps.storage,
    notifications: caps.notifications,
    featureFlags: caps.featureFlags.enabled ? caps.featureFlags.provider : "none",
    jobs: caps.jobs.enabled,
    jobsUserFacingApi: caps.jobs.userFacingApi,
    billing: caps.billing.enabled ? caps.billing.providers : [],
    features: [],
    database: config.backend === false ? "none" : config.backend.database,
    framework: web?.target ?? "nextjs",
    apps: legacyApps(config),
  });
}

/** Compile every legacy bridge input before the target emitter is invoked. */
export function compileLegacyTemplateTarget(config: ResolvedProjectConfig): LegacyTemplateTarget {
  const legacy = deepFreeze(resolvedToLegacyRenderConfig(config));
  const addons = deepFreeze(
    buildAddonInstallerMap({
      billing: legacy.billing,
      features: legacy.features,
      database: legacy.database,
      mode: legacy.mode,
      framework: legacy.framework,
      apps: legacy.apps,
      preset: legacy.preset,
      cache: legacy.cache,
      deploy: legacy.deploy,
      auth: legacy.auth,
      api: legacy.api,
      email: legacy.email,
      analytics: legacy.analytics,
      eve: legacy.eve,
      i18n: legacy.i18n,
      pdf: legacy.pdf,
      messaging: legacy.messaging,
      storage: legacy.storage,
      notifications: legacy.notifications,
      featureFlags: legacy.featureFlags,
      jobs: legacy.jobs,
    }),
  );

  return deepFreeze({
    config: legacy,
    addons,
    secrets: PLACEHOLDER_SECRETS,
    context: { dryRun: false },
  });
}

interface ResolvedTemplateFiles {
  readonly files: readonly TemplateFile[];
  readonly normalizedPaths: ReadonlySet<string>;
}

function renderResolvedTemplateFiles(config: ResolvedProjectConfig): ResolvedTemplateFiles {
  const target = compileLegacyTemplateTarget(config);
  // Passing explicit placeholders prevents the legacy composer's default
  // entropy source from running. `dryRun: false` keeps its normal capability-
  // aware env filtering instead of the old preview-only all-secret prelude.
  const emitted = emitLegacyTemplateTarget(target);
  const files = sanitizeLegacyCapabilityOutput(emitted, config);
  const emittedContent = new Map(emitted.map((file) => [file.path, file.content]));
  const normalizedPaths = new Set(
    files.filter((file) => emittedContent.get(file.path) !== file.content).map((file) => file.path),
  );
  return { files, normalizedPaths };
}

function toPlannedFile(
  file: TemplateFile,
  config: ResolvedProjectConfig,
  normalized: boolean,
): PlannedFileInput {
  const lifecycleCapabilityHint = capabilityForPath(file.path);
  if (
    lifecycleCapabilityHint === "storage" &&
    !config.enabledCapabilities.includes(lifecycleCapabilityHint)
  ) {
    throw new LegacyRendererCompatibilityError(
      `The compatibility renderer emitted disabled storage output at ${file.path}`,
      {
        physicalPath: file.path,
        capability: lifecycleCapabilityHint,
        enabledCapabilities: config.enabledCapabilities,
        reason: "disabled-capability-output",
      },
    );
  }
  const client = clientFileAttribution(config, file.path);
  const capability =
    client.capability ??
    (lifecycleCapabilityHint !== null &&
    config.enabledCapabilities.includes(lifecycleCapabilityHint)
      ? lifecycleCapabilityHint
      : null);
  return {
    logicalPath: file.path,
    physicalPath: file.path,
    content: file.content,
    owner: ownerForPath(file.path),
    lifecycle: lifecycleForPath(file.path, lifecycleCapabilityHint),
    provenance: {
      renderer: RESOLVED_TEMPLATE_RENDERER_ID,
      source: "src/templates",
      capability,
      appId: client.appId,
      target: client.target,
      artifacts: client.artifacts,
      acceptance: [CORE_RENDER_ACCEPTANCE_ID, ...client.acceptance],
      contribution: [
        "legacy.core.v2",
        ...(normalized ? ["resolved-output-normalization.v2"] : []),
        ...client.contribution,
      ],
    },
  };
}

function isDotenvPath(path: string): boolean {
  const name = path.slice(path.lastIndexOf("/") + 1);
  return name === ".env" || name.startsWith(".env.");
}

interface SelfIssuedSecretPolicy {
  readonly reference: string;
  readonly bytes: number;
  readonly encoding: "base64url" | "hex";
}

interface ExternalSecretPolicy {
  readonly reference: string;
  readonly provider: string;
}

const SELF_ISSUED_SECRET_POLICIES = Object.freeze({
  BETTER_AUTH_SECRET: {
    reference: "auth.session-secret",
    bytes: 48,
    encoding: "base64url",
  },
  POSTGRES_PASSWORD: {
    reference: "database.postgres-password",
    bytes: 48,
    encoding: "base64url",
  },
  EVE_INTERNAL_AUTH_SECRET: {
    reference: "eve.internal-auth-secret",
    bytes: 32,
    encoding: "base64url",
  },
  NOTIFICATION_TOKEN_ENCRYPTION_KEY: {
    reference: "notifications.token-encryption-key",
    bytes: 32,
    encoding: "base64url",
  },
} satisfies Readonly<Record<string, SelfIssuedSecretPolicy>>);

const EXTERNAL_SECRET_POLICIES = Object.freeze({
  AI_GATEWAY_API_KEY: { reference: "ai-gateway.api-key", provider: "ai-gateway" },
  BILLING_CHARGILY_PRO_PRICE_ID: { reference: "chargily.pro-price-id", provider: "chargily" },
  BILLING_PADDLE_PRO_PRICE_ID: { reference: "paddle.pro-price-id", provider: "paddle" },
  BILLING_POLAR_PRO_PRODUCT_ID: { reference: "polar.pro-product-id", provider: "polar" },
  BILLING_STRIPE_PRO_PRICE_ID: { reference: "stripe.pro-price-id", provider: "stripe" },
  CHARGILY_API_KEY: { reference: "chargily.api-key", provider: "chargily" },
  CHARGILY_SECRET_KEY: { reference: "chargily.secret-key", provider: "chargily" },
  GITHUB_CLIENT_ID: { reference: "github.client-id", provider: "github" },
  GITHUB_CLIENT_SECRET: { reference: "github.client-secret", provider: "github" },
  GOOGLE_CLIENT_ID: { reference: "google.client-id", provider: "google" },
  GOOGLE_CLIENT_SECRET: { reference: "google.client-secret", provider: "google" },
  PADDLE_API_KEY: { reference: "paddle.api-key", provider: "paddle" },
  PADDLE_WEBHOOK_SECRET: { reference: "paddle.webhook-secret", provider: "paddle" },
  POLAR_ACCESS_TOKEN: { reference: "polar.access-token", provider: "polar" },
  POLAR_ORG_ID: { reference: "polar.organization-id", provider: "polar" },
  POLAR_WEBHOOK_SECRET: { reference: "polar.webhook-secret", provider: "polar" },
  RESEND_API_KEY: { reference: "resend.api-key", provider: "resend" },
  S3_ACCESS_KEY_ID: { reference: "s3.access-key-id", provider: "s3" },
  S3_SECRET_ACCESS_KEY: { reference: "s3.secret-access-key", provider: "s3" },
  STORAGE_BUCKET: { reference: "storage.bucket", provider: "storage" },
  STRIPE_SECRET_KEY: { reference: "stripe.secret-key", provider: "stripe" },
  STRIPE_WEBHOOK_SECRET: { reference: "stripe.webhook-secret", provider: "stripe" },
  UPSTASH_REDIS_REST_TOKEN: { reference: "upstash.redis-rest-token", provider: "upstash" },
  UPSTASH_REDIS_REST_URL: { reference: "upstash.redis-rest-url", provider: "upstash" },
} satisfies Readonly<Record<string, ExternalSecretPolicy>>);

function collectPlaceholderDestinations(
  files: readonly TemplateFile[],
): Map<string, { placeholder: string; destinations: SecretDestination[] }> {
  const groups = new Map<string, { placeholder: string; destinations: SecretDestination[] }>();
  for (const file of files) {
    if (!isDotenvPath(file.path)) continue;
    const pattern = /^([A-Z][A-Z0-9_]*)=(REPLACE_WITH_[A-Z0-9_]+)\s*$/gm;
    for (const match of file.content.matchAll(pattern)) {
      const environmentKey = match[1];
      const placeholder = match[2];
      if (!environmentKey || !placeholder) continue;
      const group = groups.get(environmentKey) ?? { placeholder, destinations: [] };
      if (group.placeholder !== placeholder) {
        throw new Error(
          `Environment key ${environmentKey} has conflicting placeholders in rendered output`,
        );
      }
      group.destinations.push({
        physicalPath: file.path,
        format: "dotenv",
        field: environmentKey,
      });
      groups.set(environmentKey, group);
    }
  }
  return groups;
}

function plannedSecrets(files: readonly TemplateFile[]): PlannedSecretOperation[] {
  const groups = collectPlaceholderDestinations(files);
  const operations: PlannedSecretOperation[] = [];
  for (const [environmentKey, group] of groups) {
    const localDestinations = group.destinations.filter(
      ({ physicalPath }) => physicalPath === ".env.local" || physicalPath.endsWith("/.env.local"),
    );
    const selfIssued = SELF_ISSUED_SECRET_POLICIES[
      environmentKey as keyof typeof SELF_ISSUED_SECRET_POLICIES
    ] as SelfIssuedSecretPolicy | undefined;
    if (selfIssued) {
      if (localDestinations.length === 0) continue;
      operations.push({
        kind: "generate-self-issued",
        reference: selfIssued.reference,
        environmentKey,
        bytes: selfIssued.bytes,
        encoding: selfIssued.encoding,
        destinations: localDestinations,
      });
      continue;
    }

    const external = EXTERNAL_SECRET_POLICIES[
      environmentKey as keyof typeof EXTERNAL_SECRET_POLICIES
    ] as ExternalSecretPolicy | undefined;
    if (!external) {
      throw new LegacyRendererCompatibilityError(
        `Rendered placeholder ${environmentKey} has no typed secret ownership policy`,
        { environmentKey, placeholder: group.placeholder, reason: "unknown-secret-policy" },
      );
    }
    operations.push({
      kind: "require-external",
      reference: external.reference,
      environmentKey,
      provider: external.provider,
      placeholder: group.placeholder,
      destinations: group.destinations,
    });
  }
  return operations;
}

export const resolvedTemplateRenderer: ProjectRendererPort = Object.freeze({
  id: RESOLVED_TEMPLATE_RENDERER_ID,
  render(config: ResolvedProjectConfig): RenderedProjectContribution {
    const rendered = renderResolvedTemplateFiles(config);
    return {
      files: rendered.files.map((file) =>
        toPlannedFile(file, config, rendered.normalizedPaths.has(file.path)),
      ),
      secrets: plannedSecrets(rendered.files),
    };
  },
});
