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
} from "./core.js";

type EnvMode = "monorepo" | "single";

export function envExampleContent(
  projectName: string,
  billingProviders: BillingProviderName[] = [],
  includeResend = true,
  runtime = "bun",
  mode: EnvMode = "monorepo",
): string {
  const lines: string[] = [];
  lines.push(...coreEnvExampleLines(projectName));
  lines.push("");
  if (includeResend) lines.push(...resendExampleLines(projectName));
  lines.push(...billingEnvLines(billingProviders));
  if (lines.length > 0 && lines[lines.length - 1] !== "") lines.push("");
  lines.push(...analyticsEnvLines());
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
  lines.push(...coreEnvLocalLines(projectName, secrets));
  lines.push("");
  lines.push(...resendLocalLines(projectName, secrets));
  if (billingProviders.length === 0) lines.push(...billingEnvLocalLines(secrets, []));
  else lines.push(...billingEnvLocalLinesFiltered(secrets, billingProviders));
  lines.push("# Analytics — PostHog");
  lines.push(`NEXT_PUBLIC_POSTHOG_KEY=${ENV_PLACEHOLDERS.POSTHOG_KEY}`);
  lines.push("NEXT_PUBLIC_POSTHOG_HOST=/ingest");
  lines.push(`VITE_POSTHOG_KEY=${ENV_PLACEHOLDERS.POSTHOG_KEY}`);
  lines.push("VITE_POSTHOG_HOST=/ingest");
  lines.push(`EXPO_PUBLIC_POSTHOG_KEY=${ENV_PLACEHOLDERS.POSTHOG_KEY}`);
  lines.push("EXPO_PUBLIC_POSTHOG_HOST=/ingest");
  lines.push("POSTHOG_HOST=https://us.i.posthog.com");
  lines.push(`POSTHOG_API_KEY=${ENV_PLACEHOLDERS.POSTHOG_KEY}`);
  lines.push("NEXT_PUBLIC_POSTHOG_SESSION_RECORDING=false");
  lines.push("NEXT_PUBLIC_POSTHOG_AUTOCAPTURE=true");
  lines.push("VITE_POSTHOG_SESSION_RECORDING=false");
  lines.push("VITE_POSTHOG_AUTOCAPTURE=true");
  lines.push("EXPO_PUBLIC_POSTHOG_SESSION_RECORDING=false");
  lines.push("EXPO_PUBLIC_POSTHOG_AUTOCAPTURE=true");
  lines.push("NEXT_PUBLIC_ANALYTICS_DISABLED=false");
  lines.push("VITE_ANALYTICS_DISABLED=false");
  lines.push("EXPO_PUBLIC_ANALYTICS_DISABLED=false");
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
): TemplateFile {
  const content = envExampleContent(projectName, selectedBilling, includeResend, runtime, mode);
  return file(".env.example", content);
}

export function filteredEnvLocal(
  projectName: string,
  secrets: RootSecrets,
  selectedBilling: BillingProviderName[],
  runtime = "bun",
  mode: EnvMode = "monorepo",
): TemplateFile {
  const lines: string[] = [];
  lines.push(...coreEnvLocalLines(projectName, secrets));
  lines.push("");
  lines.push(...resendLocalLines(projectName, secrets));
  lines.push(...billingEnvLocalLinesFiltered(secrets, selectedBilling));
  lines.push("# Analytics — PostHog");
  lines.push(`NEXT_PUBLIC_POSTHOG_KEY=${ENV_PLACEHOLDERS.POSTHOG_KEY}`);
  lines.push("NEXT_PUBLIC_POSTHOG_HOST=/ingest");
  lines.push(`VITE_POSTHOG_KEY=${ENV_PLACEHOLDERS.POSTHOG_KEY}`);
  lines.push("VITE_POSTHOG_HOST=/ingest");
  lines.push(`EXPO_PUBLIC_POSTHOG_KEY=${ENV_PLACEHOLDERS.POSTHOG_KEY}`);
  lines.push("EXPO_PUBLIC_POSTHOG_HOST=/ingest");
  lines.push("POSTHOG_HOST=https://us.i.posthog.com");
  lines.push(`POSTHOG_API_KEY=${ENV_PLACEHOLDERS.POSTHOG_KEY}`);
  lines.push("NEXT_PUBLIC_POSTHOG_SESSION_RECORDING=false");
  lines.push("NEXT_PUBLIC_POSTHOG_AUTOCAPTURE=true");
  lines.push("VITE_POSTHOG_SESSION_RECORDING=false");
  lines.push("VITE_POSTHOG_AUTOCAPTURE=true");
  lines.push("EXPO_PUBLIC_POSTHOG_SESSION_RECORDING=false");
  lines.push("EXPO_PUBLIC_POSTHOG_AUTOCAPTURE=true");
  lines.push("NEXT_PUBLIC_ANALYTICS_DISABLED=false");
  lines.push("VITE_ANALYTICS_DISABLED=false");
  lines.push("EXPO_PUBLIC_ANALYTICS_DISABLED=false");
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
