import { parseArgs } from "node:util";
import { parseCreateArgs } from "../lib/interactive.js";
import type { GlobalOptions } from "../commands/types.js";
import type { Logger } from "../lib/logger.js";
import { getString, getStringArray, getBoolean } from "./validation.js";

export const CLI_OPTIONS = {
  cwd: { type: "string" as const },
  json: { type: "boolean" as const, default: false },
  yes: { type: "boolean" as const, default: false },
  ci: { type: "boolean" as const, default: false },
  "dry-run": { type: "boolean" as const, default: false },
  force: { type: "boolean" as const, default: false },
  "no-install": { type: "boolean" as const, default: false },
  runtime: { type: "string" as const },
  quiet: { type: "boolean" as const, default: false },
  debug: { type: "boolean" as const, default: false },
  version: { type: "boolean" as const, default: false },
  help: { type: "boolean" as const, default: false },
  h: { type: "boolean" as const, default: false },
  kind: { type: "string" as const },
  check: { type: "boolean" as const, default: false },
  mode: { type: "string" as const, multiple: true as const },
  framework: { type: "string" as const, multiple: true as const },
  billing: { type: "string" as const, multiple: true as const },
  features: { type: "string" as const, multiple: true as const },
  database: { type: "string" as const, multiple: true as const },
  apps: { type: "string" as const, multiple: true as const },
  preset: { type: "string" as const, multiple: true as const },
  cache: { type: "string" as const, multiple: true as const },
  stack: { type: "string" as const, multiple: true as const },
  "with-auth": { type: "boolean" as const, default: false },
  "with-api": { type: "boolean" as const, default: false },
  "with-email": { type: "boolean" as const, default: false },
  "with-analytics": { type: "boolean" as const, default: false },
  "with-cache": { type: "boolean" as const, default: false },
  "with-eve": { type: "boolean" as const, default: false },
  "with-i18n": { type: "boolean" as const, default: false },
  "with-pdf": { type: "boolean" as const, default: false },
  "with-messaging": { type: "boolean" as const, default: false },
};

export interface ParsedCli {
  values: Record<string, unknown>;
  positionals: string[];
  rawCommand: string | undefined;
  command: string;
}

export function parseRawArgs(argv: string[]): ParsedCli {
  const parsed = parseArgs({
    args: argv.slice(2),
    options: CLI_OPTIONS,
    allowPositionals: true,
  });

  const values = parsed.values as Record<string, unknown>;
  const positionals = parsed.positionals as string[];
  const rawCommand = positionals[0];
  const command: string = typeof rawCommand === "string" ? rawCommand : "help";

  return { values, positionals, rawCommand, command };
}

export interface CreateParsed {
  mode: "monorepo" | "single";
  framework: import("../lib/addons.js").FrameworkName;
  billing: import("../lib/addons.js").BillingProviderName[];
  features: import("../lib/addons.js").FeatureName[];
  database: "postgres" | "convex" | "none";
  apps: import("../lib/addons.js").AppName[];
  preset: import("../lib/addons.js").PresetName | undefined;
  cache: import("../lib/addons.js").CacheProvider;
  stack: string | undefined;
  withAuth?: boolean;
  withApi?: boolean;
  withEmail?: boolean;
  withAnalytics?: boolean;
  withCache?: boolean;
  withEve?: boolean;
  withI18n?: boolean;
  withPdf?: boolean;
  withMessaging?: boolean;
}

export function parseCreateSpecific(
  values: Record<string, unknown>,
  command: string,
): CreateParsed {
  if (command === "create") {
    const raw = {
      mode: getStringArray(values.mode),
      framework: getStringArray(values.framework),
      billing: getStringArray(values.billing),
      features: getStringArray(values.features),
      database: getStringArray(values.database),
      apps: getStringArray(values.apps),
      preset: getStringArray(values.preset),
      cache: getStringArray(values.cache),
      stack: getStringArray(values.stack),
      "with-auth": getBoolean(values["with-auth"]),
      "with-api": getBoolean(values["with-api"]),
      "with-email": getBoolean(values["with-email"]),
      "with-analytics": getBoolean(values["with-analytics"]),
      "with-cache": getBoolean(values["with-cache"]),
      "with-eve": getBoolean(values["with-eve"]),
      "with-i18n": getBoolean(values["with-i18n"]),
      "with-pdf": getBoolean(values["with-pdf"]),
      "with-messaging": getBoolean(values["with-messaging"]),
    } as Record<string, unknown>;
    return parseCreateArgs(raw as never) as CreateParsed;
  }
  return {
    mode: "monorepo" as const,
    framework: "nextjs" as const,
    billing: [] as never[],
    features: [] as never[],
    database: "postgres" as const,
    apps: ["web"] as import("../lib/addons.js").AppName[],
    preset: undefined,
    cache: "none" as const,
    stack: undefined,
  };
}

export function buildGlobalOptions(
  values: Record<string, unknown>,
  createParsed: CreateParsed,
  logger: Logger,
  runtime: "node" | "bun",
  kind: "command" | "query" | undefined,
  hasCheck: boolean,
): GlobalOptions {
  const cwdValue = getString(values.cwd);
  return {
    cwd: cwdValue ? cwdValue : process.cwd(),
    json: getBoolean(values.json),
    yes: getBoolean(values.yes),
    ci: getBoolean(values.ci),
    dryRun: getBoolean(values["dry-run"]),
    force: getBoolean(values.force),
    noInstall: getBoolean(values["no-install"]),
    runtime,
    kind,
    check: hasCheck,
    mode: createParsed.mode,
    framework: createParsed.framework,
    billing: createParsed.billing,
    features: createParsed.features,
    database: createParsed.database,
    apps: createParsed.apps,
    preset: createParsed.preset,
    cache: createParsed.cache,
    stack: createParsed.stack,
    withAuth: createParsed.withAuth,
    withApi: createParsed.withApi,
    withEmail: createParsed.withEmail,
    withAnalytics: createParsed.withAnalytics,
    withCache: createParsed.withCache,
    withEve: createParsed.withEve,
    withI18n: createParsed.withI18n,
    withPdf: createParsed.withPdf,
    withMessaging: createParsed.withMessaging,
    rawMode: getStringArray(values.mode),
    rawFramework: getStringArray(values.framework),
    rawBilling: getStringArray(values.billing),
    rawFeatures: getStringArray(values.features),
    rawDatabase: getStringArray(values.database),
    rawApps: getStringArray(values.apps),
    rawPreset: getStringArray(values.preset),
    rawCache: getStringArray(values.cache),
    logger,
  };
}
