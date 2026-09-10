// @allow-long 617: detector, catalog projection, and baseline CLI stay together so the committed gate has one executable definition
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import { parseSync } from "oxc-parser";
import { GLOBAL_BILLING_PROVIDERS } from "../../src/domain/project/choices.js";
import { projectConfigSchema, type ProjectConfig } from "../../src/lib/config.js";
import { FsTransaction, type StagedFile } from "../../src/lib/fs.js";
import { generateProjectFiles } from "../../src/templates/default.js";
import type { TemplateFile } from "../../src/templates/shared.js";

export type UnsafeKind = "explicit-any" | "as-any" | "assertion-chain" | "ts-ignore";

export interface UnsafeOccurrence {
  id: string;
  configKey: string;
  path: string;
  sourceOwner: string;
  kind: UnsafeKind;
  fingerprint: string;
  snippet: string;
}

export interface UnsafeProvenanceRule {
  sourceOwner: string;
  emittedPathPattern: string;
  applicableConfigKeys: string[];
  expectedOccurrences: number;
  disposition: "remove-in-stabilization" | "deferred-v1";
  removalPhase: "Phase 1A" | "V2 Phase 6";
}

export interface UnsafeDispositionPolicy {
  rules: UnsafeProvenanceRule[];
}

interface OxcNode {
  type?: string;
  start?: number;
  end?: number;
  expression?: OxcNode;
  typeAnnotation?: OxcNode;
  [key: string]: unknown;
}

interface PendingOccurrence {
  configKey: string;
  path: string;
  sourceOwner: string;
  kind: UnsafeKind;
  fingerprint: string;
  snippet: string;
  start: number;
}

interface CompiledRule {
  rule: UnsafeProvenanceRule;
  emittedPathRegex: RegExp;
}

export interface CatalogConfiguration {
  configKey: string;
  config: ProjectConfig;
}

export interface UnsafeBaselineEntry {
  id: string;
  path: string;
  kind: UnsafeKind;
  fingerprint: string;
  sourceOwner: string;
  catalogKeys: string[];
  disposition: "remove-in-stabilization" | "deferred-v1";
  removalPhase: "Phase 1A" | "V2 Phase 6";
}

export interface UnsafeBaseline {
  $schema: string;
  schemaVersion: 1;
  detectorVersion: 1;
  zeroGatePhase: "V2 Phase 6";
  catalogKeys: string[];
  entries: UnsafeBaselineEntry[];
}

const compiledPolicies = new WeakMap<object, CompiledRule[]>();
const SOURCE_FILE = /\.[cm]?tsx?$/;
const TS_IGNORE_DIRECTIVE = /^\s*\/?\s*@ts-ignore(?:\s|$)/;

const normalized = (source: string): string => source.replace(/\s+/g, " ").trim();
const fingerprint = (source: string): string =>
  createHash("sha256").update(normalized(source)).digest("hex").slice(0, 16);

const ALL_CAPABILITIES_ENABLED = {
  cache: "redis",
  auth: true,
  api: true,
  email: true,
  analytics: true,
  eve: true,
  i18n: true,
  pdf: true,
  messaging: true,
  storage: true,
  notifications: true,
  featureFlags: "posthog",
  jobs: true,
} as const;

const ALL_CAPABILITIES_DISABLED = {
  cache: "none",
  auth: false,
  api: false,
  email: false,
  analytics: false,
  eve: false,
  i18n: false,
  pdf: false,
  messaging: false,
  storage: false,
  notifications: false,
  featureFlags: "none",
  jobs: false,
} as const;

// Exercise capabilities that are meaningful without a project database while
// retaining the database=none boundary for stateful families.
const STATELESS_CAPABILITIES_ENABLED = {
  ...ALL_CAPABILITIES_DISABLED,
  api: true,
  email: true,
  analytics: true,
  eve: true,
  i18n: true,
  pdf: true,
  featureFlags: "posthog",
} as const;

function unsafeKind(node: OxcNode, parent: OxcNode | undefined): UnsafeKind | undefined {
  if (node.type === "TSAnyKeyword") {
    const ownedByAsAny =
      (parent?.type === "TSAsExpression" || parent?.type === "TSTypeAssertion") &&
      parent.typeAnnotation === node;
    return ownedByAsAny ? undefined : "explicit-any";
  }
  if (
    (node.type === "TSAsExpression" || node.type === "TSTypeAssertion") &&
    node.typeAnnotation?.type === "TSAnyKeyword"
  )
    return parent?.type === "TSAsExpression" || parent?.type === "TSTypeAssertion"
      ? undefined
      : "as-any";
  if (
    (node.type === "TSAsExpression" || node.type === "TSTypeAssertion") &&
    (node.expression?.type === "TSAsExpression" || node.expression?.type === "TSTypeAssertion") &&
    parent?.type !== "TSAsExpression" &&
    parent?.type !== "TSTypeAssertion"
  )
    return "assertion-chain";
  return undefined;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compilePolicy(policy: UnsafeDispositionPolicy): CompiledRule[] {
  const cached = compiledPolicies.get(policy);
  if (cached) return cached;

  const compiled = policy.rules.map((rule) => {
    if (!rule.emittedPathPattern.startsWith("^") || !rule.emittedPathPattern.endsWith("$")) {
      throw new Error(
        `Unsafe provenance regex must be anchored with ^ and $: ${rule.emittedPathPattern}`,
      );
    }
    let emittedPathRegex: RegExp;
    try {
      emittedPathRegex = new RegExp(rule.emittedPathPattern);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`Invalid unsafe provenance regex ${rule.emittedPathPattern}: ${detail}`);
    }
    return { rule, emittedPathRegex };
  });
  compiledPolicies.set(policy, compiled);
  return compiled;
}

export function findProvenanceRule(
  configKey: string,
  emittedPath: string,
  policy: UnsafeDispositionPolicy,
): UnsafeProvenanceRule {
  const matches = compilePolicy(policy).filter(
    ({ rule, emittedPathRegex }) =>
      rule.applicableConfigKeys.includes(configKey) && emittedPathRegex.test(emittedPath),
  );
  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one unsafe provenance rule for ${configKey} :: ${emittedPath}; matched ${matches.length}`,
    );
  }
  return matches[0].rule;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function walkOxc(
  value: unknown,
  parent: OxcNode | undefined,
  visit: (node: OxcNode, parent: OxcNode | undefined) => void,
): void {
  if (Array.isArray(value)) {
    for (const item of value) walkOxc(item, parent, visit);
    return;
  }
  if (!isObject(value)) return;

  const node = value as OxcNode;
  const isNode = typeof node.type === "string";
  const nextParent = isNode ? node : parent;
  if (isNode) visit(node, parent);
  for (const [key, child] of Object.entries(value)) {
    if (key === "type" || key === "start" || key === "end") continue;
    walkOxc(child, nextParent, visit);
  }
}

function syntaxOccurrences(
  path: string,
  source: string,
): Array<{
  kind: UnsafeKind;
  snippet: string;
  start: number;
}> {
  const parsed = parseSync(path, source);
  if (parsed.errors.length > 0) {
    const diagnostics = parsed.errors.map(({ message }) => message).join("; ");
    throw new Error(`OXC parser diagnostics for ${path}: ${diagnostics}`);
  }

  const found: Array<{ kind: UnsafeKind; snippet: string; start: number }> = [];
  walkOxc(parsed.program, undefined, (node, parent) => {
    const kind = unsafeKind(node, parent);
    if (kind === undefined) return;
    if (typeof node.start !== "number" || typeof node.end !== "number") {
      throw new Error(`OXC node lacks a source range in ${path}: ${node.type ?? "unknown"}`);
    }
    found.push({ kind, snippet: source.slice(node.start, node.end), start: node.start });
  });

  for (const comment of parsed.comments) {
    if (!TS_IGNORE_DIRECTIVE.test(comment.value)) continue;
    const marker = source.indexOf("@ts-ignore", comment.start);
    if (marker === -1 || marker >= comment.end) continue;
    const start = source.lastIndexOf("\n", marker - 1) + 1;
    const newline = source.indexOf("\n", marker);
    const end = newline === -1 ? source.length : newline;
    found.push({ kind: "ts-ignore", snippet: source.slice(start, end), start });
  }
  return found;
}

export function collectUnsafeOccurrences(
  configKey: string,
  files: TemplateFile[],
  policy: UnsafeDispositionPolicy,
): UnsafeOccurrence[] {
  // Compiling the complete policy before scanning prevents an unused malformed
  // rule from hiding until a later catalog configuration happens to select it.
  compilePolicy(policy);
  const pending: PendingOccurrence[] = [];

  for (const file of files) {
    const emittedPath = file.path.replace(/\\/g, "/");
    if (!SOURCE_FILE.test(emittedPath)) continue;
    const syntax = syntaxOccurrences(emittedPath, file.content);
    if (syntax.length === 0) continue;
    const rule = findProvenanceRule(configKey, emittedPath, policy);
    for (const occurrence of syntax) {
      pending.push({
        configKey,
        path: emittedPath,
        sourceOwner: rule.sourceOwner,
        kind: occurrence.kind,
        fingerprint: fingerprint(occurrence.snippet),
        snippet: occurrence.snippet,
        start: occurrence.start,
      });
    }
  }

  const byBaseId = new Map<string, PendingOccurrence[]>();
  for (const occurrence of pending) {
    const baseId = [
      occurrence.configKey,
      occurrence.path,
      occurrence.kind,
      occurrence.fingerprint,
    ].join("::");
    const group = byBaseId.get(baseId) ?? [];
    group.push(occurrence);
    byBaseId.set(baseId, group);
  }

  const resolved: UnsafeOccurrence[] = [];
  for (const [baseId, group] of byBaseId) {
    group.sort((left, right) => left.start - right.start);
    group.forEach((occurrence, index) => {
      resolved.push({
        id: `${baseId}::${index + 1}`,
        configKey: occurrence.configKey,
        path: occurrence.path,
        sourceOwner: occurrence.sourceOwner,
        kind: occurrence.kind,
        fingerprint: occurrence.fingerprint,
        snippet: occurrence.snippet,
      });
    });
  }
  return resolved.sort((left, right) => compareText(left.id, right.id));
}

function catalogConfig(
  mode: "monorepo" | "single",
  framework: "nextjs" | "tanstack-start",
  database: "postgres" | "convex",
  capabilities: "off" | "on",
  globalProvider?: (typeof GLOBAL_BILLING_PROVIDERS)[number],
): CatalogConfiguration {
  const enabled = capabilities === "on";
  const allApps = enabled && mode === "monorepo";
  const profile = allApps ? "capabilities-on-all-apps" : `capabilities-${capabilities}`;
  return {
    configKey: `${mode}/${framework}/${database}/${profile}${enabled ? `/billing-${globalProvider}-chargily-manual` : ""}`,
    config: projectConfigSchema.parse({
      name: "unsafe-syntax-catalog",
      runtime: "bun",
      version: "0.1.0",
      mode,
      preset: "custom",
      billing: enabled ? [globalProvider, "chargily", "manual"] : [],
      features: [],
      database,
      framework,
      apps: allApps ? ["web", "mobile", "desktop"] : ["web"],
      ...(enabled ? ALL_CAPABILITIES_ENABLED : ALL_CAPABILITIES_DISABLED),
    }),
  };
}

function singleNonWebCatalogConfig(
  framework: "nextjs" | "tanstack-start",
  database: "postgres" | "convex" | "none",
  app: "mobile" | "desktop",
  globalProvider?: (typeof GLOBAL_BILLING_PROVIDERS)[number],
): CatalogConfiguration {
  const enabled = database !== "none";
  return {
    configKey: `single/${framework}/${database}/capabilities-${enabled ? "on" : "off"}-${app}${enabled ? `/billing-${globalProvider}-chargily-manual` : ""}`,
    config: projectConfigSchema.parse({
      name: "unsafe-syntax-catalog",
      runtime: "bun",
      version: "0.1.0",
      mode: "single",
      preset: "custom",
      billing: enabled ? [globalProvider, "chargily", "manual"] : [],
      features: [],
      database,
      framework,
      apps: [app],
      ...(enabled ? ALL_CAPABILITIES_ENABLED : ALL_CAPABILITIES_DISABLED),
    }),
  };
}

function statelessCatalogConfig(
  mode: "monorepo" | "single",
  framework: "nextjs" | "tanstack-start",
  capabilities: "off" | "stateless",
): CatalogConfiguration {
  const enabled = capabilities === "stateless";
  return {
    configKey: `${mode}/${framework}/none/capabilities-${capabilities}`,
    config: projectConfigSchema.parse({
      name: "unsafe-syntax-catalog",
      runtime: "bun",
      version: "0.1.0",
      mode,
      preset: "custom",
      billing: [],
      features: [],
      database: "none",
      framework,
      apps: ["web"],
      ...(enabled ? STATELESS_CAPABILITIES_ENABLED : ALL_CAPABILITIES_DISABLED),
    }),
  };
}

const modes = ["monorepo", "single"] as const;
const frameworks = ["nextjs", "tanstack-start"] as const;
const databases = ["postgres", "convex"] as const;

export const PROJECTION_CONFIGURATIONS: CatalogConfiguration[] = modes
  .flatMap((mode) =>
    frameworks.flatMap((framework) =>
      databases.flatMap((database) => [
        catalogConfig(mode, framework, database, "off"),
        ...GLOBAL_BILLING_PROVIDERS.map((provider) =>
          catalogConfig(mode, framework, database, "on", provider),
        ),
      ]),
    ),
  )
  .concat(
    modes.flatMap((mode) =>
      frameworks.flatMap((framework) =>
        (["off", "stateless"] as const).map((capabilities) =>
          statelessCatalogConfig(mode, framework, capabilities),
        ),
      ),
    ),
  )
  .concat(
    frameworks.flatMap((framework) =>
      ([...databases, "none"] as const).flatMap((database) =>
        (["mobile", "desktop"] as const).flatMap((app) =>
          database === "none"
            ? [singleNonWebCatalogConfig(framework, database, app)]
            : GLOBAL_BILLING_PROVIDERS.map((provider) =>
                singleNonWebCatalogConfig(framework, database, app, provider),
              ),
        ),
      ),
    ),
  );

export const GATE_CONFIGURATIONS: CatalogConfiguration[] = [
  {
    configKey: "gate/next-monorepo",
    config: projectConfigSchema.parse({
      name: "next-monorepo",
      runtime: "bun",
      version: "0.1.0",
      mode: "monorepo",
      preset: "saas",
      billing: ["stripe", "chargily"],
      features: [],
      database: "postgres",
      framework: "nextjs",
      apps: ["web"],
      ...ALL_CAPABILITIES_ENABLED,
    }),
  },
  {
    configKey: "gate/single-next",
    config: projectConfigSchema.parse({
      name: "single-next",
      runtime: "bun",
      version: "0.1.0",
      mode: "single",
      preset: "saas",
      billing: ["stripe"],
      features: [],
      database: "postgres",
      framework: "nextjs",
      apps: ["web"],
      ...ALL_CAPABILITIES_ENABLED,
    }),
  },
];

export const GENERATED_UNSAFE_SYNTAX_CATALOG: CatalogConfiguration[] = [
  ...GATE_CONFIGURATIONS,
  ...PROJECTION_CONFIGURATIONS,
].sort((left, right) => compareText(left.configKey, right.configKey));

export function generateCatalogOccurrences(
  configurations: CatalogConfiguration[],
  policy: UnsafeDispositionPolicy,
): UnsafeOccurrence[] {
  return configurations
    .flatMap(({ configKey, config }) =>
      collectUnsafeOccurrences(configKey, generateProjectFiles(config, { dryRun: false }), policy),
    )
    .sort((left, right) => compareText(left.id, right.id));
}

function formatAjvErrors(errors: unknown): string {
  return JSON.stringify(errors, null, 2);
}

function validateArtifact(artifact: unknown, schemaPath: string, label: string): void {
  const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
  const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);
  if (!validate(artifact)) {
    throw new Error(`${label} does not satisfy ${schemaPath}: ${formatAjvErrors(validate.errors)}`);
  }
}

function argumentValue(args: string[], name: string): string {
  const index = args.indexOf(name);
  const value = index === -1 ? undefined : args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`Missing required ${name} argument`);
  return value;
}

function assertZeroCatalog(
  projection: UnsafeOccurrence[],
  gates: UnsafeOccurrence[],
  policy: UnsafeDispositionPolicy,
): void {
  if (policy.rules.length !== 0) {
    throw new Error(`Zero-gate policy must not retain provenance rules: ${policy.rules.length}`);
  }
  if (projection.length !== 0 || gates.length !== 0) {
    throw new Error(
      `Unsafe syntax returned after zero gate: projection=${projection.length}, gates=${gates.length}`,
    );
  }
}

function buildBaseline(policy: UnsafeDispositionPolicy): UnsafeBaseline {
  const projection = generateCatalogOccurrences(PROJECTION_CONFIGURATIONS, policy);
  const gates = generateCatalogOccurrences(GATE_CONFIGURATIONS, policy);
  assertZeroCatalog(projection, gates, policy);
  const occurrences = [...gates, ...projection].sort((left, right) =>
    compareText(left.id, right.id),
  );
  return {
    $schema: "../../schemas/v1-generated-unsafe-syntax-baseline.schema.json",
    schemaVersion: 1,
    detectorVersion: 1,
    zeroGatePhase: "V2 Phase 6",
    catalogKeys: GENERATED_UNSAFE_SYNTAX_CATALOG.map(({ configKey }) => configKey),
    entries: occurrences.map((occurrence) => {
      const rule = findProvenanceRule(occurrence.configKey, occurrence.path, policy);
      return {
        id: occurrence.id,
        path: occurrence.path,
        kind: occurrence.kind,
        fingerprint: occurrence.fingerprint,
        sourceOwner: rule.sourceOwner,
        catalogKeys: [occurrence.configKey],
        disposition: rule.disposition,
        removalPhase: rule.removalPhase,
      };
    }),
  };
}

function serializeBaseline(baseline: UnsafeBaseline): string {
  return `${JSON.stringify(baseline, null, 2).replace(
    /"catalogKeys": \[\n        "([^"\n]+)"\n      \]/g,
    '"catalogKeys": ["$1"]',
  )}\n`;
}

export async function writeBaselineWithTransaction(
  root: string,
  outputPath: string,
  content: string,
): Promise<{ staged: StagedFile[]; written: string[] }> {
  const transaction = new FsTransaction(root);
  const relativePath = relative(root, resolve(root, outputPath)).replace(/\\/g, "/");
  const previousContent = await transaction.readText(relativePath);
  await transaction.write(relativePath, content);
  const staged = transaction.getStagedFiles();
  if (previousContent === content) {
    if (staged.length !== 0) {
      throw new Error(`Unchanged baseline unexpectedly staged: ${relativePath}`);
    }
  } else if (
    staged.length !== 1 ||
    staged[0].path !== relativePath ||
    staged[0].content !== content
  ) {
    throw new Error(`Baseline transaction staged unexpected path or content: ${relativePath}`);
  }
  const { written } = await transaction.commit();
  const expectedWritten = previousContent === content ? [] : [relativePath];
  if (
    written.length !== expectedWritten.length ||
    written.some((path, index) => path !== expectedWritten[index])
  ) {
    throw new Error(`Baseline transaction committed unexpected paths: ${written.join(", ")}`);
  }
  return { staged, written };
}

async function main(args: string[]): Promise<void> {
  const outputPath = argumentValue(args, "--write-baseline");
  const dispositionPath = resolve(argumentValue(args, "--dispositions"));
  const root = resolve(import.meta.dir, "../..");
  const dispositionSchemaPath = resolve(
    root,
    "schemas/v1-generated-unsafe-syntax-dispositions.schema.json",
  );
  const baselineSchemaPath = resolve(
    root,
    "schemas/v1-generated-unsafe-syntax-baseline.schema.json",
  );
  const policy = JSON.parse(readFileSync(dispositionPath, "utf8")) as UnsafeDispositionPolicy;
  validateArtifact(policy, dispositionSchemaPath, "Unsafe-syntax disposition policy");
  const baseline = buildBaseline(policy);
  validateArtifact(baseline, baselineSchemaPath, "Unsafe-syntax baseline");
  await writeBaselineWithTransaction(root, outputPath, serializeBaseline(baseline));
  console.log(`Wrote ${baseline.entries.length} unsafe occurrences to ${outputPath}`);
}

if (import.meta.main) await main(process.argv.slice(2));
