import { ExitCode } from "../lib/errors.js";
import {
  JSON_ENVELOPE_SCHEMA_URI,
  JSON_ENVELOPE_SCHEMA_VERSION,
  envelope,
  printJson,
} from "../lib/json.js";
import { SUPPORT_CATALOG, SUPPORT_CATALOG_SCHEMA_URI } from "../domain/capabilities/index.js";
import {
  PROJECT_CONFIG_SCHEMA_URI,
  RESOLVED_PROJECT_CONFIG_SCHEMA_URI,
} from "../domain/project/index.js";
import type { GlobalOptions } from "./types.js";
import { COMMAND_NAMES, COMMAND_SPECS } from "../cli/spec.js";
import { STATE_SCHEMA_URI } from "../lib/config.js";

const CLI_DEFAULTS = Object.freeze({
  mode: "monorepo",
  framework: "nextjs",
  apps: ["web"],
  database: "postgres",
  preset: "saas",
  cache: "none",
  deploy: "none",
  executionRuntime: "bun",
  storage: false,
  notifications: false,
  featureFlags: "none",
  jobs: false,
} as const);

const DEPRECATIONS = Object.freeze([
  {
    option: "features",
    replacements: ["with-eve", "with-i18n"],
    removalVersion: "3.0.0",
  },
  {
    option: "stack",
    replacements: ["framework", "apps"],
    removalVersion: "3.0.0",
  },
] as const);

export const CLI_CAPABILITIES = Object.freeze({
  catalog: SUPPORT_CATALOG,
  commands: Object.freeze(
    Object.fromEntries(
      COMMAND_NAMES.map((name) => [
        name,
        {
          usage: COMMAND_SPECS[name].usage,
          description: COMMAND_SPECS[name].description,
          options: [...COMMAND_SPECS[name].options],
          positionals: {
            min: COMMAND_SPECS[name].minPositionals,
            max: COMMAND_SPECS[name].maxPositionals,
          },
        },
      ]),
    ),
  ),
  defaults: CLI_DEFAULTS,
  deprecations: DEPRECATIONS,
  schemas: {
    jsonEnvelope: {
      uri: JSON_ENVELOPE_SCHEMA_URI,
      schemaVersion: JSON_ENVELOPE_SCHEMA_VERSION,
    },
    supportCatalog: {
      uri: SUPPORT_CATALOG_SCHEMA_URI,
      schemaVersion: SUPPORT_CATALOG.schemaVersion,
      catalogVersion: SUPPORT_CATALOG.catalogVersion,
    },
    projectConfig: { uri: PROJECT_CONFIG_SCHEMA_URI, schemaVersion: 2 },
    resolvedProjectConfig: { uri: RESOLVED_PROJECT_CONFIG_SCHEMA_URI, schemaVersion: 2 },
    state: { uri: STATE_SCHEMA_URI, schemaVersion: 2 },
  },
} as const);

export async function capabilitiesCommand(
  _args: string[],
  options: GlobalOptions,
): Promise<number> {
  const start = Date.now();
  if (options.json) {
    printJson(
      envelope({
        success: true,
        exitCode: ExitCode.OK,
        data: CLI_CAPABILITIES,
        command: "capabilities",
        durationMs: Date.now() - start,
      }),
    );
    return ExitCode.OK;
  }

  options.logger.info(
    `GhostInit support catalog v${SUPPORT_CATALOG.catalogVersion} ` +
      `(schema v${SUPPORT_CATALOG.schemaVersion})`,
  );
  options.logger.info(`Modes: ${SUPPORT_CATALOG.axes.modes.join(", ")}`);
  options.logger.info(`App targets: ${SUPPORT_CATALOG.axes.appTargets.join(", ")}`);
  options.logger.info(`Databases: ${SUPPORT_CATALOG.axes.databases.join(", ")}`);
  for (const capability of SUPPORT_CATALOG.capabilities) {
    options.logger.info(`- ${capability.id}: ${capability.description}`);
  }
  options.logger.info("Use `ghostinit capabilities --json` for the complete typed catalog.");
  return ExitCode.OK;
}
