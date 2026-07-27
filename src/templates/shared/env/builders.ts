import { file, type TemplateFile } from "../../shared.js";
import type { RootSecrets } from "../../root.js";
import type { BillingProviderName } from "../../../lib/addons.js";
import { ENV_PLACEHOLDERS } from "../../../lib/constants.js";
import { analyticsEnvLines } from "../analytics-env.js";
import { billingEnvLines, billingEnvLocalLines, billingEnvLocalLinesFiltered } from "./billing.js";
import {
  coreEnvExampleLines,
  coreEnvLocalLines,
  resendExampleLines,
  resendLocalLines,
  publicVarLines,
  type EnvAudience,
} from "./core.js";

type EnvMode = "monorepo" | "single";

/**
 * PostHog client vars, emitted only for the prefixes this project consumes.
 *
 * This block was previously written out three times over (NEXT_PUBLIC_, VITE_,
 * EXPO_PUBLIC_) regardless of framework or whether a mobile app existed, in two
 * separate copies. @repo/config declares exactly one client family, so the
 * surplus lines described variables nothing would ever read.
 */
function analyticsPublicLines(audience: EnvAudience): string[] {
  return [
    "# Analytics — PostHog",
    ...publicVarLines(audience, "POSTHOG_KEY", ENV_PLACEHOLDERS.POSTHOG_KEY),
    ...publicVarLines(audience, "POSTHOG_HOST", "/ingest"),
    "POSTHOG_HOST=https://us.i.posthog.com",
    `POSTHOG_API_KEY=${ENV_PLACEHOLDERS.POSTHOG_KEY}`,
    ...publicVarLines(audience, "POSTHOG_SESSION_RECORDING", "false"),
    ...publicVarLines(audience, "POSTHOG_AUTOCAPTURE", "true"),
    ...publicVarLines(audience, "ANALYTICS_DISABLED", "false"),
  ];
}

export function envExampleContent(
  projectName: string,
  billingProviders: BillingProviderName[] = [],
  includeResend = true,
  runtime = "bun",
  mode: EnvMode = "monorepo",
  database: "postgres" | "convex" | "none" | string = "postgres",
  audience: EnvAudience = { framework: "nextjs", hasMobile: false },
): string {
  const lines: string[] = [];
  lines.push(...coreEnvExampleLines(projectName, database, audience));
  lines.push("");
  if (includeResend) lines.push(...resendExampleLines(projectName));
  lines.push(...billingEnvLines(billingProviders, audience));
  if (lines.length > 0 && lines[lines.length - 1] !== "") lines.push("");
  lines.push(...analyticsEnvLines(audience));
  lines.push("");
  if (mode === "monorepo") {
    lines.push("# oRPC contract-first, single port 3000");
    lines.push("# No separate API_PORT");
    lines.push("");
    lines.push("# Runtime bun only");
  } else {
    lines.push(`# Runtime ${runtime}`);
  }
  lines.push(`RUNTIME=${runtime}`);
  lines.push("");
  return lines.join("\n") + "\n";
}

export function envPlaceholderContent(projectName: string): string {
  return envExampleContent(
    projectName,
    ["stripe", "chargily", "paddle", "polar"],
    true,
    "bun",
    "monorepo",
  );
}

function parseEnvMode(value: unknown): EnvMode | undefined {
  if (value === "monorepo" || value === "single") return value;
  return undefined;
}

export function envLocalContent(
  projectNameOrSecrets: string | RootSecrets,
  secretsOrBilling: RootSecrets | BillingProviderName[],
  billingProvidersOrMode?: BillingProviderName[] | string,
  mode?: string,
  runtime?: string,
): string {
  let projectName: string;
  let secrets: RootSecrets;
  let billingProviders: BillingProviderName[] = [];
  let _effectiveMode: EnvMode = "monorepo";
  let effectiveRuntime = "bun";
  if (typeof projectNameOrSecrets === "string") {
    projectName = projectNameOrSecrets;
    secrets = secretsOrBilling as RootSecrets;
    if (Array.isArray(billingProvidersOrMode))
      billingProviders = billingProvidersOrMode as BillingProviderName[];
    const parsedMode = parseEnvMode(mode);
    if (parsedMode) _effectiveMode = parsedMode;
    else {
      const parsedAlt = parseEnvMode(billingProvidersOrMode);
      if (parsedAlt) _effectiveMode = parsedAlt;
    }
    if (typeof runtime === "string") effectiveRuntime = runtime;
  } else {
    secrets = projectNameOrSecrets as RootSecrets;
    billingProviders = (secretsOrBilling as BillingProviderName[]) ?? [];
    const rec = secrets as unknown as { appName?: string };
    projectName = rec.appName ?? "ghostinit-app";
    const parsed = parseEnvMode(billingProvidersOrMode);
    if (parsed) _effectiveMode = parsed;
  }
  if (!projectName) projectName = "ghostinit-app";
  const lines: string[] = [];
  // Detect database from overload? For backwards compat, we look at second arg maybe?
  // In this legacy overload we don't have database param, default to postgres.
  // New callers should use filteredEnvLocal with database param via sharedFiltered.
  // Legacy positional overload with no framework information: assume the
  // Next.js default rather than emitting every prefix family.
  const audience: EnvAudience = { framework: "nextjs", hasMobile: false };
  lines.push(...coreEnvLocalLines(projectName, secrets, "postgres", audience));
  lines.push("");
  lines.push(...resendLocalLines(projectName, secrets));
  if (billingProviders.length === 0) lines.push(...billingEnvLocalLines(secrets, [], audience));
  else lines.push(...billingEnvLocalLinesFiltered(secrets, billingProviders, audience));
  lines.push(...analyticsPublicLines(audience));
  lines.push("");
  lines.push(`# Runtime ${effectiveRuntime}`);
  lines.push(`RUNTIME=${effectiveRuntime}`);
  lines.push("");
  return lines.join("\n");
}

export function filteredEnvExample(
  projectName: string,
  _secrets: RootSecrets,
  selectedBilling: BillingProviderName[],
  includeResend: boolean,
  runtime: string,
  mode: EnvMode = "monorepo",
  database: "postgres" | "convex" | "none" | string = "postgres",
  audience: EnvAudience = { framework: "nextjs", hasMobile: false },
): TemplateFile {
  const content = envExampleContent(
    projectName,
    selectedBilling,
    includeResend,
    runtime,
    mode,
    database,
    audience,
  );
  return file(".env.example", content);
}

export function filteredEnvLocal(
  projectName: string,
  secrets: RootSecrets,
  selectedBilling: BillingProviderName[],
  runtime = "bun",
  mode: EnvMode = "monorepo",
  database: "postgres" | "convex" | "none" | string = "postgres",
  audience: EnvAudience = { framework: "nextjs", hasMobile: false },
): TemplateFile {
  const lines: string[] = [];
  lines.push(...coreEnvLocalLines(projectName, secrets, database, audience));
  lines.push("");
  lines.push(...resendLocalLines(projectName, secrets));
  lines.push(...billingEnvLocalLinesFiltered(secrets, selectedBilling, audience));
  lines.push(...analyticsPublicLines(audience));
  lines.push("");
  if (mode === "monorepo") {
    lines.push("# oRPC contract-first, single port 3000");
    lines.push("");
  }
  lines.push(`# Runtime ${runtime} — ${mode} mode`);
  lines.push(`RUNTIME=${runtime}`);
  lines.push("");
  return file(".env.local", lines.join("\n"));
}
