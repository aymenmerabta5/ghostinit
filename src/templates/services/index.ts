import {
  codeScripts,
  file,
  packageJson,
  tsconfig,
  normalizeTemplateArgs,
  type TemplateFile,
} from "../shared.js";
import * as v from "../versions.js";
import type { AddonInstallerMap, ProjectMode } from "../../lib/addons.js";
import { hasAddon } from "../../lib/addons.js";
import { billingServiceFiles } from "./billing.js";
import { emailServiceFiles } from "./email.js";
import { invoiceServiceFiles } from "./invoice.js";
import { adminServiceFiles } from "./admin.js";
import { messagingServiceFiles } from "./messaging.js";
import { storageServiceFiles } from "./storage.js";
import { identityServiceFiles } from "./identity/index.js";
import { notificationsServiceFiles } from "./notifications/index.js";
import { featureFlagsServiceFiles } from "./feature-flags/index.js";
import { jobsServiceFiles } from "./jobs/index.js";
import { requestApplicationFiles } from "./application.js";
import { requestApplicationServerContent } from "./application-server.js";
import { hasBillingAddon } from "./shared.js";

export function servicesFiles(a?: unknown, b?: unknown, c?: unknown): TemplateFile[] {
  const { mode, addons } = normalizeTemplateArgs(
    a as ProjectMode | string | Record<string, unknown> | undefined,
    b as string | AddonInstallerMap | Record<string, unknown> | undefined,
    c as AddonInstallerMap | Record<string, unknown> | undefined,
  );
  const isMonorepo = mode === "monorepo";
  const base = isMonorepo ? "packages/services/src" : "src/server/services";
  const files: TemplateFile[] = [];
  const withBilling = hasBillingAddon(addons);
  const withEmail = addons ? hasAddon(addons as AddonInstallerMap, "email") : true;
  const withAuth = addons ? hasAddon(addons as AddonInstallerMap, "auth") : true;
  const withMessaging = addons ? hasAddon(addons as AddonInstallerMap, "messaging") : false;
  const withStorage = addons
    ? hasAddon(addons as AddonInstallerMap, "storage") || withMessaging
    : false;
  const withNotifications = addons ? hasAddon(addons as AddonInstallerMap, "notifications") : false;
  const withFeatureFlags = addons
    ? hasAddon(addons as AddonInstallerMap, "featureFlags") ||
      hasAddon(addons as AddonInstallerMap, "posthog")
    : false;
  const withJobs = addons ? hasAddon(addons as AddonInstallerMap, "jobs") : false;
  const database =
    addons && hasAddon(addons as AddonInstallerMap, "convex")
      ? "convex"
      : addons && hasAddon(addons as AddonInstallerMap, "database:none")
        ? "none"
        : "postgres";
  const withRequestApplication = withAuth && database !== "none";
  const requestApplicationSelection = {
    admin: withRequestApplication,
    billing: withRequestApplication && withBilling,
    featureFlags: withRequestApplication && withFeatureFlags,
    identity: withRequestApplication,
    messaging: withRequestApplication && withMessaging,
    notifications: withRequestApplication && withNotifications,
  } as const;

  if (!isMonorepo) {
    files.push(
      file(
        "src/server/kernel/result.ts",
        `export type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };
export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}
export function err<E = Error>(error: E): Result<never, E> {
  return { ok: false, error };
}
`,
      ),
    );
    files.push(
      file("src/server/kernel/index.ts", `export { ok, err, type Result } from "./result.js";\n`),
    );
  }
  if (isMonorepo) {
    files.push(
      file(
        "packages/services/package.json",
        packageJson({
          name: "@repo/services",
          exports: {
            ".": "./src/index.ts",
            ...(withBilling ? { "./billing": "./src/billing/index.ts" } : {}),
            ...(withBilling ? { "./billing/server": "./src/billing/server.ts" } : {}),
            ...(withEmail ? { "./email": "./src/email/index.ts" } : {}),
            ...(withAuth && database !== "none" ? { "./admin": "./src/admin/index.ts" } : {}),
            ...(withAuth && database !== "none" ? { "./identity": "./src/identity/index.ts" } : {}),
            ...(withMessaging ? { "./messaging": "./src/messaging/index.ts" } : {}),
            ...(withStorage ? { "./storage": "./src/storage/index.ts" } : {}),
            ...(withNotifications ? { "./notifications": "./src/notifications/index.ts" } : {}),
            ...(withFeatureFlags ? { "./feature-flags": "./src/feature-flags/index.ts" } : {}),
            ...(withFeatureFlags
              ? { "./feature-flags/posthog": "./src/feature-flags/posthog.ts" }
              : {}),
            ...(withJobs ? { "./jobs": "./src/jobs/index.ts" } : {}),
            ...(withRequestApplication ? { "./application": "./src/application/index.ts" } : {}),
          },
          scripts: codeScripts(),
          dependencies: {
            "@repo/kernel": "workspace:*",
            "server-only": `^${v.runtime["server-only"]}`,
            zod: `^${v.validation.zod}`,
            ...(withBilling
              ? {
                  "@repo/billing": "workspace:*",
                  "@repo/database": "workspace:*",
                  ...(database === "convex" ? { "@repo/auth": "workspace:*" } : {}),
                  "drizzle-orm": `^${v.database["drizzle-orm"]}`,
                }
              : {}),
            ...(withRequestApplication
              ? {
                  "@repo/auth": "workspace:*",
                  "@repo/database": "workspace:*",
                  "@repo/observability": "workspace:*",
                  "drizzle-orm": `^${v.database["drizzle-orm"]}`,
                  ...(database === "convex" ? { convex: `^${v.convex.convex}` } : {}),
                }
              : {}),
          },
          devDependencies: {
            "@types/node": `^${v.runtime["@types/node"]}`,
            ...(withAuth && withEmail ? { "@types/react": `^${v.nextStack["@types/react"]}` } : {}),
            typescript: `^${v.typescript.typescript}`,
          },
        }),
      ),
      file(
        "packages/services/tsconfig.json",
        tsconfig({
          include: ["src/**/*"],
          compilerOptions: {
            composite: true,
            declaration: true,
            outDir: "./dist",
            rootDir: "./src",
            types: ["node"],
            ...(withAuth && withEmail ? { jsx: "react-jsx" } : {}),
          },
        }),
      ),
    );
  }
  // Stagio pattern: typed ServiceError with code, mirrored in api mapper.
  // Every service file carries `import "server-only"` — enforced by check-server-only lint.
  files.push(
    file(
      `${base}/errors.ts`,
      `import "server-only";\n\n/**\n * Shared typed error for service-layer domain failures.\n * Routes map \`code\` to transport-safe ORPC errors via createServiceORPCError.\n */\nexport class ServiceError<TCode extends string = string> extends Error {\n  readonly code: TCode;\n  constructor(code: TCode, message: string, options?: { cause?: unknown }) {\n    super(message);\n    this.name = "ServiceError";\n    this.code = code;\n    if (options?.cause !== undefined) this.cause = options.cause;\n  }\n}\nexport function isServiceError(error: unknown): error is ServiceError<string> {\n  return error instanceof ServiceError;\n}\n`,
    ),
  );
  // The billing service module is only emitted when a billing provider is
  // selected, so the barrel must not re-export it unconditionally — doing so left
  // no-billing projects with a barrel importing a file that was never generated.
  const barrelLines = [
    ...(withAuth && database !== "none" ? [`export * as admin from "./admin/index.js";`] : []),
    ...(withAuth && database !== "none"
      ? [`export * as identity from "./identity/index.js";`]
      : []),
    ...(withBilling ? [`export * as billing from "./billing/index.js";`] : []),
    ...(withEmail ? [`export * as email from "./email/index.js";`] : []),
    ...(withFeatureFlags ? [`export * as featureFlags from "./feature-flags/index.js";`] : []),
    ...(withFeatureFlags
      ? [`export * as featureFlagPostHog from "./feature-flags/posthog.js";`]
      : []),
    ...(withJobs ? [`export * as jobs from "./jobs/index.js";`] : []),
    ...(withMessaging ? [`export * as messaging from "./messaging/index.js";`] : []),
    ...(withNotifications ? [`export * as notifications from "./notifications/index.js";`] : []),
    `export * as invoice from "./invoice/index.js";`,
    ...(withStorage ? [`export * as storage from "./storage/index.js";`] : []),
  ];
  files.push(file(`${base}/index.ts`, `${barrelLines.join("\n")}\n`));
  if (withAuth && database !== "none") {
    files.push(...adminServiceFiles(mode as ProjectMode, database));
    files.push(...identityServiceFiles(mode as ProjectMode));
  }
  if (withBilling) {
    files.push(
      ...billingServiceFiles(mode as ProjectMode, database === "convex" ? "convex" : "postgres"),
    );
  }
  if (withMessaging) {
    files.push(...messagingServiceFiles(mode as ProjectMode));
  }
  if (withStorage) files.push(...storageServiceFiles(mode as ProjectMode, withMessaging));
  if (withNotifications) files.push(...notificationsServiceFiles(mode as ProjectMode));
  if (withFeatureFlags) files.push(...featureFlagsServiceFiles(mode as ProjectMode));
  if (withJobs) files.push(...jobsServiceFiles(mode as ProjectMode));
  if (withEmail) files.push(...emailServiceFiles(mode as ProjectMode));
  files.push(...invoiceServiceFiles(mode as ProjectMode));
  if (withRequestApplication) {
    files.push(
      ...requestApplicationFiles(
        mode as ProjectMode,
        requestApplicationSelection,
        requestApplicationServerContent(
          mode as ProjectMode,
          database as "postgres" | "convex",
          requestApplicationSelection,
        ),
      ),
    );
  }
  return files;
}
