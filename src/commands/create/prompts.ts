// @allow-long 450: preset-first wizard with branching saas/frontend/custom reads best as one sequence
import { billingSelectionError } from "../../domain/project/billing-selection.js";
import { ExitCode } from "../../lib/errors.js";
import {
  electron as electronVersions,
  expo as expoVersions,
  nextStack,
  postgresDocker,
} from "../../../packages/versions/src/index.js";
import {
  isInteractiveMode,
  normalizeAppsSelection,
  normalizeBillingSelection,
  normalizeFeaturesSelection,
  PROJECT_NAME_RE,
  PROJECT_NAME_MESSAGE,
} from "../../lib/interactive.js";
import type { GlobalOptions } from "../types.js";
import { validateProjectName } from "./validation.js";

const NEXT_LABEL = `Next.js ${nextStack.next}`;
const EXPO_LABEL = `Expo SDK ${expoVersions.expo.split(".")[0]}`;
const ELECTRON_LABEL = `Electron ${electronVersions.electron.split(".")[0]}`;
const POSTGRES_LABEL = postgresDocker.image.replace("postgres:", "PG ");

class CancelledError extends Error {
  constructor() {
    super("Operation cancelled");
    this.name = "CancelledError";
  }
}

export { CancelledError };

export interface PromptResult {
  name: string;
  mode: "monorepo" | "single";
  framework: "nextjs" | "tanstack-start";
  database: "postgres" | "convex" | "none";
  billing: string[];
  features: string[];
  apps: string[];
  preset: "saas" | "frontend" | "custom";
  cache: string;
  deploy: string;
  stack?: string;
  noInstall: boolean;
  cancelled?: boolean;
  exitCode?: number;
}

function deploymentTargetOptions() {
  return [
    { value: "none", label: "None", hint: "No deploy config (default)" },
    {
      value: "cloudflare",
      label: "Cloudflare Workers",
      hint: "Web: TanStack native / Next OpenNext; Convex/none; no PostgreSQL, Eve, or PDF",
    },
    {
      value: "docker",
      label: "Docker",
      hint: "Dockerfile + production Compose (exact Bun image)",
    },
    { value: "fly", label: "Fly.io", hint: "fly.toml + health-checked image" },
    {
      value: "vercel",
      label: "Vercel",
      hint: "exact Bun build; managed function runtime",
    },
  ];
}

export function getIsInteractive(options: GlobalOptions): boolean {
  return isInteractiveMode({
    json: options.json,
    yes: options.yes,
    ci: options.ci,
    isTTY: Boolean(process.stdout.isTTY && process.stdin.isTTY),
  });
}

function presetHint(preset: string): string {
  if (preset === "saas") return "Full stack — Auth + DB + API + Email + Billing optional";
  if (preset === "frontend") return "Minimal — apps/web + UI + config only";
  return "Pick every feature yourself";
}

export async function promptInteractive(
  initialName: string | undefined,
  initial: {
    mode: string;
    framework: string;
    database: string;
    billing: string[];
    features: string[];
    apps: string[];
    preset?: string;
    cache?: string;
    deploy?: string;
    customFeatures?: string[];
    noInstall: boolean;
  },
): Promise<PromptResult> {
  // Clack 1.x is ESM-only. Keep the import lazy so non-interactive commands do
  // not initialize terminal prompt machinery.
  const p = await import("@clack/prompts");
  async function selectBilling(
    options: import("@clack/prompts").MultiSelectOptions<string>,
  ): Promise<string[] | symbol> {
    let selected = options.initialValues;
    while (true) {
      const values = await p.multiselect({ ...options, initialValues: selected });
      if (p.isCancel(values)) return values;
      const message = billingSelectionError(values.filter((value) => value !== "none"));
      if (message === undefined) return values;
      p.log.error(message);
      selected = values;
    }
  }

  p.intro("GhostInit v0.1 — create your project");

  let name = initialName;

  if (!name) {
    const nameResult = await p.text({
      message: "What is your project named?",
      placeholder: "my-app",
      validate(value) {
        if (!value || value.trim().length === 0) return "Project name is required";
        if (!PROJECT_NAME_RE.test(value)) return PROJECT_NAME_MESSAGE;
      },
    });
    if (p.isCancel(nameResult)) {
      p.cancel("Operation cancelled.");
      return {
        name: "",
        mode: initial.mode as PromptResult["mode"],
        framework: initial.framework as PromptResult["framework"],
        database: initial.database as PromptResult["database"],
        billing: initial.billing,
        features: initial.features,
        apps: initial.apps,
        preset: (initial.preset as PromptResult["preset"]) ?? "saas",
        cache: initial.cache ?? "none",
        deploy: initial.deploy ?? "none",
        noInstall: initial.noInstall,
        cancelled: true,
        exitCode: ExitCode.CANCELLED,
      };
    }
    name = nameResult as string;
  }

  let attempts = 0;
  while (attempts < 5) {
    try {
      validateProjectName(name as string);
      break;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      if (attempts >= 4) {
        p.cancel(`Invalid project name after ${attempts + 1} attempts: ${reason}`);
        return {
          name: name as string,
          mode: initial.mode as PromptResult["mode"],
          framework: initial.framework as PromptResult["framework"],
          database: initial.database as PromptResult["database"],
          billing: initial.billing,
          features: initial.features,
          apps: initial.apps,
          preset: (initial.preset as PromptResult["preset"]) ?? "saas",
          cache: initial.cache ?? "none",
          deploy: initial.deploy ?? "none",
          noInstall: initial.noInstall,
          cancelled: true,
          exitCode: ExitCode.CANCELLED,
        };
      }
      const retry = await p.text({
        message: `Project name invalid (${reason}) — please enter a valid name:`,
        placeholder: "my-app",
        initialValue: name,
        validate(value) {
          if (!value || value.trim().length === 0) return "Project name is required";
          try {
            if (value) validateProjectName(value);
          } catch (e) {
            return e instanceof Error ? e.message : PROJECT_NAME_MESSAGE;
          }
          if (!PROJECT_NAME_RE.test(value)) return PROJECT_NAME_MESSAGE;
          return undefined;
        },
      });
      if (p.isCancel(retry)) {
        p.cancel("Operation cancelled.");
        return {
          name: name as string,
          mode: initial.mode as PromptResult["mode"],
          framework: initial.framework as PromptResult["framework"],
          database: initial.database as PromptResult["database"],
          billing: initial.billing,
          features: initial.features,
          apps: initial.apps,
          preset: (initial.preset as PromptResult["preset"]) ?? "saas",
          cache: initial.cache ?? "none",
          deploy: initial.deploy ?? "none",
          noInstall: initial.noInstall,
          cancelled: true,
          exitCode: ExitCode.CANCELLED,
        };
      }
      name = retry as string;
      attempts++;
    }
  }

  // Preset selection — first real choice
  let presetValue: PromptResult["preset"] = (initial.preset as PromptResult["preset"]) ?? "saas";
  try {
    const presetResult = await p.select({
      message: "What are you building?",
      initialValue: presetValue,
      options: [
        { value: "saas", label: "SaaS Starter", hint: presetHint("saas") },
        { value: "frontend", label: "Frontend Only", hint: presetHint("frontend") },
        { value: "custom", label: "Custom", hint: presetHint("custom") },
      ],
    });
    if (p.isCancel(presetResult)) {
      p.cancel("Operation cancelled.");
      throw new CancelledError();
    }
    presetValue = presetResult as PromptResult["preset"];
  } catch (err) {
    if (err instanceof CancelledError) {
      return {
        name: name as string,
        mode: initial.mode as PromptResult["mode"],
        framework: initial.framework as PromptResult["framework"],
        database: initial.database as PromptResult["database"],
        billing: initial.billing,
        features: initial.features,
        apps: initial.apps,
        preset: presetValue,
        cache: initial.cache ?? "none",
        deploy: initial.deploy ?? "none",
        noInstall: initial.noInstall,
        cancelled: true,
        exitCode: ExitCode.CANCELLED,
      };
    }
    throw err;
  }

  // Branch based on preset
  let group: Record<string, unknown>;
  try {
    if (presetValue === "frontend") {
      group = await p.group(
        {
          mode: () =>
            p.select({
              message: "Project structure?",
              initialValue: initial.mode,
              options: [
                { value: "monorepo", label: "Monorepo", hint: "apps/web + packages/* + tooling" },
                { value: "single", label: "Single", hint: "one app, no workspaces" },
              ],
            }),
          stack: () =>
            p.select({
              message: "Stack?",
              initialValue: "nextjs",
              options: [
                { value: "nextjs", label: "Next.js", hint: `${NEXT_LABEL} App Router RSC — Web` },
                {
                  value: "tanstack-start",
                  label: "TanStack Start",
                  hint: "Vite + file-based router — Web",
                },
                { value: "expo", label: "Expo", hint: `${EXPO_LABEL} Router — Mobile` },
                {
                  value: "both",
                  label: "Web + Mobile",
                  hint: "Next.js web + Expo mobile (requires monorepo)",
                },
              ],
            }),
          apps: () =>
            p.multiselect({
              message: "App targets? (space to select, enter to confirm)",
              initialValues: initial.apps && initial.apps.length > 0 ? initial.apps : ["web"],
              required: false,
              options: [
                { value: "web", label: "Web", hint: "Next.js or TanStack Start (default)" },
                { value: "mobile", label: "Mobile", hint: `${EXPO_LABEL} Router + SecureStore` },
                {
                  value: "desktop",
                  label: "Desktop",
                  hint: `${ELECTRON_LABEL} + TanStack Router SPA`,
                },
              ],
            }),
          deploy: () =>
            p.select({
              message: "Deployment target?",
              initialValue: initial.deploy ?? "none",
              options: deploymentTargetOptions(),
            }),
          install: () =>
            p.confirm({
              message: "Install dependencies with Bun?",
              initialValue: !initial.noInstall,
            }),
        },
        {
          onCancel: () => {
            p.cancel("Operation cancelled.");
            throw new CancelledError();
          },
        },
      );
    } else if (presetValue === "saas") {
      group = await p.group(
        {
          mode: () =>
            p.select({
              message: "Project structure?",
              initialValue: initial.mode,
              options: [
                {
                  value: "monorepo",
                  label: "Monorepo",
                  hint: "recommended for AI — apps/web + apps/eve + packages/* + apps/api",
                },
                {
                  value: "single",
                  label: "Single",
                  hint: "one project — Next src/app or TanStack src/routes + src/server",
                },
              ],
            }),
          framework: () =>
            p.select({
              message: "Frontend framework?",
              initialValue: initial.framework,
              options: [
                { value: "nextjs", label: "Next.js", hint: `${NEXT_LABEL} App Router RSC` },
                {
                  value: "tanstack-start",
                  label: "TanStack Start",
                  hint: "Vite + file-based router SSR",
                },
              ],
            }),
          database: () =>
            p.select({
              message: "Database provider?",
              initialValue: initial.database === "none" ? "postgres" : initial.database,
              options: [
                {
                  value: "postgres",
                  label: "PostgreSQL",
                  hint: `Drizzle + ${POSTGRES_LABEL} (default)`,
                },
                { value: "convex", label: "Convex", hint: "Realtime + serverless" },
              ],
            }),
          billing: () =>
            selectBilling({
              message: "Billing: one global provider, optional Chargily and manual payments?",
              initialValues: initial.billing.length > 0 ? initial.billing : [],
              required: false,
              options: [
                { value: "none", label: "None", hint: "No billing" },
                {
                  value: "manual",
                  label: "Manual payment",
                  hint: "Transfer receipt and admin approval",
                },
                { value: "stripe", label: "Stripe", hint: "global cards, subscription-native" },
                {
                  value: "chargily",
                  label: "Chargily",
                  hint: "Algeria EDAHABIA/CIB, checkout-only",
                },
                { value: "paddle", label: "Paddle", hint: "MoR global tax 5% + 50c" },
                { value: "polar", label: "Polar", hint: "MoR open-source 4% + metering + license" },
              ],
            }),
          apps: () =>
            p.multiselect({
              message: "App targets? (space to select, enter to confirm)",
              initialValues: initial.apps && initial.apps.length > 0 ? initial.apps : ["web"],
              required: false,
              options: [
                { value: "web", label: "Web", hint: "Next.js or TanStack Start (default)" },
                { value: "mobile", label: "Mobile", hint: `${EXPO_LABEL} Router + SecureStore` },
                {
                  value: "desktop",
                  label: "Desktop",
                  hint: `${ELECTRON_LABEL} + TanStack Router SPA`,
                },
              ],
            }),
          features: () =>
            p.multiselect({
              message: "Additional features?",
              initialValues: initial.features,
              required: false,
              options: [
                { value: "eve", label: "Eve", hint: "durable AI agent hybrid via withEve()" },
                { value: "i18n", label: "i18n", hint: "next-intl internationalization" },
                {
                  value: "pdf",
                  label: "PDF",
                  hint: "@react-pdf/renderer + invoices & certificates",
                },
                {
                  value: "messaging",
                  label: "Messaging",
                  hint: "DM + files + realtime (WS for postgres, Convex native)",
                },
                {
                  value: "storage",
                  label: "Storage",
                  hint: "actor-owned uploads (local/S3 for postgres, Convex native)",
                },
                {
                  value: "notifications",
                  label: "Notifications",
                  hint: "persistent inbox + Expo push registration",
                },
                {
                  value: "featureFlags",
                  label: "Remote flags",
                  hint: "PostHog evaluation through the typed API",
                },
                {
                  value: "jobs",
                  label: "Background jobs",
                  hint: "actor-owned runs + worker scheduler",
                },
              ],
            }),
          deploy: () =>
            p.select({
              message: "Deployment target?",
              initialValue: initial.deploy ?? "none",
              options: deploymentTargetOptions(),
            }),
          install: () =>
            p.confirm({
              message: "Install dependencies with Bun?",
              initialValue: !initial.noInstall,
            }),
        },
        {
          onCancel: () => {
            p.cancel("Operation cancelled.");
            throw new CancelledError();
          },
        },
      );
    } else {
      // custom
      group = await p.group(
        {
          mode: () =>
            p.select({
              message: "Project structure?",
              initialValue: initial.mode,
              options: [
                { value: "monorepo", label: "Monorepo", hint: "apps/web + packages/* + tooling" },
                {
                  value: "single",
                  label: "Single",
                  hint: "one project — Next src/app or TanStack src/routes + src/server",
                },
              ],
            }),
          framework: () =>
            p.select({
              message: "Frontend framework?",
              initialValue: initial.framework,
              options: [
                { value: "nextjs", label: "Next.js", hint: `${NEXT_LABEL} App Router RSC` },
                {
                  value: "tanstack-start",
                  label: "TanStack Start",
                  hint: "Vite + file-based router",
                },
              ],
            }),
          database: () =>
            p.select({
              message: "Database provider?",
              initialValue: initial.database,
              options: [
                { value: "postgres", label: "PostgreSQL", hint: `Drizzle + ${POSTGRES_LABEL}` },
                { value: "convex", label: "Convex", hint: "Realtime + serverless" },
                { value: "none", label: "None", hint: "No database (blocks Auth/Billing)" },
              ],
            }),
          apps: () =>
            p.multiselect({
              message: "App targets? (space to select, enter to confirm)",
              initialValues: initial.apps && initial.apps.length > 0 ? initial.apps : ["web"],
              required: false,
              options: [
                { value: "web", label: "Web", hint: "Next.js or TanStack Start (default)" },
                { value: "mobile", label: "Mobile", hint: `${EXPO_LABEL} Router + SecureStore` },
                {
                  value: "desktop",
                  label: "Desktop",
                  hint: `${ELECTRON_LABEL} + TanStack Router SPA`,
                },
              ],
            }),
          customFeatures: () =>
            p.multiselect({
              message: "Addons — pick any (space to select)",
              initialValues: initial.customFeatures ?? [],
              required: false,
              options: [
                { value: "auth", label: "Authentication", hint: "Better Auth + 2FA (requires DB)" },
                { value: "api", label: "API (oRPC)", hint: "contract-first transport" },
                { value: "email", label: "Email", hint: "Resend templates" },
                { value: "analytics", label: "Analytics", hint: "PostHog client+server" },
                { value: "cache", label: "Cache (Redis)", hint: "Upstash Redis + memory fallback" },
                { value: "eve", label: "Eve", hint: "durable AI agent hybrid" },
                { value: "i18n", label: "i18n", hint: "next-intl internationalization" },
                {
                  value: "pdf",
                  label: "PDF",
                  hint: "@react-pdf/renderer + invoice/certificate/agreement",
                },
                {
                  value: "messaging",
                  label: "Messaging",
                  hint: "DM + files + realtime (WS for postgres, Convex native)",
                },
                {
                  value: "storage",
                  label: "Storage",
                  hint: "actor-owned uploads (local/S3 for postgres, Convex native)",
                },
                {
                  value: "notifications",
                  label: "Notifications",
                  hint: "persistent inbox + Expo push registration",
                },
                {
                  value: "featureFlags",
                  label: "Remote flags",
                  hint: "PostHog evaluation through the typed API",
                },
                {
                  value: "jobs",
                  label: "Background jobs",
                  hint: "actor-owned runs + worker scheduler",
                },
              ],
            }),
          billing: () =>
            selectBilling({
              message: "Billing: one global provider, optional Chargily and manual payments?",
              initialValues: initial.billing.length > 0 ? initial.billing : [],
              required: false,
              options: [
                { value: "none", label: "None", hint: "No billing" },
                {
                  value: "manual",
                  label: "Manual payment",
                  hint: "Transfer receipt and admin approval",
                },
                { value: "stripe", label: "Stripe", hint: "global cards" },
                { value: "chargily", label: "Chargily", hint: "Algeria EDAHABIA/CIB" },
                { value: "paddle", label: "Paddle", hint: "MoR" },
                { value: "polar", label: "Polar", hint: "MoR + metering" },
              ],
            }),
          deploy: () =>
            p.select({
              message: "Deployment target?",
              initialValue: initial.deploy ?? "none",
              options: deploymentTargetOptions(),
            }),
          install: () =>
            p.confirm({
              message: "Install dependencies with Bun?",
              initialValue: !initial.noInstall,
            }),
        },
        {
          onCancel: () => {
            p.cancel("Operation cancelled.");
            throw new CancelledError();
          },
        },
      );
    }
  } catch (err) {
    if (err instanceof CancelledError) {
      return {
        name: name as string,
        mode: initial.mode as PromptResult["mode"],
        framework: initial.framework as PromptResult["framework"],
        database: initial.database as PromptResult["database"],
        billing: initial.billing,
        features: initial.features,
        apps: initial.apps,
        preset: presetValue,
        cache: initial.cache ?? "none",
        deploy: initial.deploy ?? "none",
        noInstall: initial.noInstall,
        cancelled: true,
        exitCode: ExitCode.CANCELLED,
      };
    }
    throw err;
  }

  if (
    Object.values(group as Record<string, unknown>).some((v) => v === "canceled" || p.isCancel(v))
  ) {
    return {
      name: name as string,
      mode: initial.mode as PromptResult["mode"],
      framework: initial.framework as PromptResult["framework"],
      database: initial.database as PromptResult["database"],
      billing: initial.billing,
      features: initial.features,
      apps: initial.apps,
      preset: presetValue,
      cache: initial.cache ?? "none",
      deploy: initial.deploy ?? "none",
      noInstall: initial.noInstall,
      cancelled: true,
      exitCode: ExitCode.CANCELLED,
    };
  }

  // Parse results branching
  const mode = ((group.mode as string | undefined) ?? initial.mode) as PromptResult["mode"];
  let framework: PromptResult["framework"];
  let database: PromptResult["database"];
  let billing: string[];
  let features: string[];
  let apps: string[];
  let cache: string = "none";
  const deploy = ((group.deploy as string | undefined) ??
    initial.deploy ??
    "none") as PromptResult["deploy"];
  let stack: string | undefined;

  if (presetValue === "frontend") {
    const stackVal = (group.stack as string | undefined) ?? "nextjs";
    stack = stackVal;
    let baseFramework: PromptResult["framework"];
    let baseApps: string[];
    if (stackVal === "expo") {
      baseFramework = "nextjs";
      baseApps = ["mobile"];
    } else if (stackVal === "both") {
      baseFramework = "nextjs";
      baseApps = ["web", "mobile"];
    } else {
      baseFramework = stackVal as PromptResult["framework"];
      baseApps = ["web"];
    }
    // If apps multiselect was answered (new), it overrides stack-derived apps (allows desktop)
    const appsFromPrompt = (group.apps as string[] | undefined) ?? undefined;
    if (appsFromPrompt && appsFromPrompt.length > 0) {
      // Normalize apps selection; if user explicitly selected via multiselect, respect it
      // but keep framework from stack (stack decides framework, apps decides targets)
      try {
        apps = normalizeAppsSelection(appsFromPrompt);
        framework = baseFramework;
        // If apps includes mobile but stack was nextjs, keep nextjs framework (mobile uses nextjs web stack)
        // If apps is desktop-only, keep baseFramework as selected (nextjs or tanstack-start)
        if (apps.length === 0) apps = baseApps;
      } catch {
        apps = baseApps;
        framework = baseFramework;
      }
    } else {
      apps = baseApps;
      framework = baseFramework;
    }
    database = "none";
    billing = [];
    features = [];
    cache = "none";
    // single + web+mobile check — force monorepo if both selected with single
    if (mode === "single" && apps.length > 1) {
      // Keep as is, validation will error; prompt layer could auto-switch but keep explicit error
    }
  } else if (presetValue === "saas") {
    framework = ((group.framework as string | undefined) ??
      initial.framework) as PromptResult["framework"];
    database = ((group.database as string | undefined) ??
      initial.database) as PromptResult["database"];
    billing = normalizeBillingSelection((group.billing as string[]) ?? []);
    const rawSaasFeatures = (group.features as string[]) ?? [];
    const hasPdfSaas = rawSaasFeatures.includes("pdf");
    const hasMessagingSaas = rawSaasFeatures.includes("messaging");
    const hasStorageSaas = rawSaasFeatures.includes("storage");
    const hasNotificationsSaas = rawSaasFeatures.includes("notifications");
    const hasFeatureFlagsSaas = rawSaasFeatures.includes("featureFlags");
    const hasJobsSaas = rawSaasFeatures.includes("jobs");
    const filteredSaasFeatures = rawSaasFeatures.filter(
      (f) =>
        f !== "pdf" &&
        f !== "messaging" &&
        f !== "storage" &&
        f !== "notifications" &&
        f !== "featureFlags" &&
        f !== "jobs",
    );
    features = normalizeFeaturesSelection(filteredSaasFeatures);
    if (hasPdfSaas) features = [...features, "__custom_pdf"];
    if (hasMessagingSaas) features = [...features, "__custom_messaging"];
    if (hasStorageSaas) features = [...features, "__custom_storage"];
    if (hasNotificationsSaas) features = [...features, "__custom_notifications"];
    if (hasFeatureFlagsSaas) features = [...features, "__custom_featureFlags"];
    if (hasJobsSaas) features = [...features, "__custom_jobs"];
    apps = normalizeAppsSelection((group.apps as string[]) ?? initial.apps ?? ["web"]);
    cache = "none";
  } else {
    framework = ((group.framework as string | undefined) ??
      initial.framework) as PromptResult["framework"];
    database = ((group.database as string | undefined) ??
      initial.database) as PromptResult["database"];
    billing = normalizeBillingSelection((group.billing as string[]) ?? []);
    features = normalizeFeaturesSelection((group.features as string[]) ?? []);
    apps = normalizeAppsSelection((group.apps as string[]) ?? initial.apps ?? ["web"]);
    const customFeatures = (group.customFeatures as string[]) ?? [];
    // Map customFeatures to future with-* handling via outer createCommand; for now expose via cache flag
    if (customFeatures.includes("cache")) cache = "redis";
    // Store customFeatures in features temporarily with prefix for outer handler to parse
    // We'll encode as special features entries: __custom_auth etc.
    const customPrefix = customFeatures.filter((f) => f !== "cache").map((f) => `__custom_${f}`);
    features = [...features, ...customPrefix];
  }

  const shouldInstall = group.install as boolean | undefined;
  const noInstall = shouldInstall !== undefined ? !shouldInstall : initial.noInstall;

  const presetLabel = presetValue;
  const billingLabel = billing.length ? ` + billing:${billing.join(",")}` : "";
  const featuresLabel = features.length ? ` + ${features.join(",")}` : "";
  const cacheLabel = cache !== "none" ? ` + cache:${cache}` : "";
  const deployLabel = deploy !== "none" ? ` + deploy:${deploy}` : "";
  const frameworkLabel = framework ? ` + ${framework}` : "";
  const appsLabel = apps.length ? ` + apps:${apps.join(",")}` : "";
  void appsLabel;
  p.outro(
    `Scaffolding ${name} with ${presetLabel} ${mode}${frameworkLabel} + ${apps.join(",")} + ${database}${billingLabel}${featuresLabel}${cacheLabel}${deployLabel}...`,
  );

  return {
    name: name as string,
    mode,
    framework,
    database,
    billing,
    features,
    apps,
    preset: presetValue,
    cache,
    deploy,
    stack,
    noInstall,
  };
}
