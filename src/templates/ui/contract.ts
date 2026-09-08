import { createHash } from "node:crypto";
import { file, type TemplateFile } from "../shared.js";
import { contractFoundation } from "./contract-foundation.js";
import type { ResolvedDesignSystemApp, ResolvedUiLayout, UiAdapterId } from "./layout.js";
import { designStyleSources, type DesignStyleSource } from "./styles.js";

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function adapterPlatform(adapter: UiAdapterId): "web" | "native" {
  return adapter === "expo" ? "native" : "web";
}

function adapterMappings(adapter: UiAdapterId): readonly string[] {
  return adapter === "expo"
    ? ["tokens", "utilities", "semantic-states", "native-base"]
    : ["tokens", "utilities", "semantic-states", "web-base"];
}

function sourceById(sources: readonly DesignStyleSource[], id: string): DesignStyleSource {
  const source = sources.find((candidate) => candidate.id === id);
  if (!source) throw new Error(`Missing design-system style source: ${id}`);
  return source;
}

function fixtureForSource(
  source: DesignStyleSource,
  kind: "tokens" | "utilities" | "interaction-variants" | "adapter-css" | "native-style",
  assertions: readonly string[],
): Record<string, unknown> {
  const versionSuffix = source.kind === "adapter" ? "" : ".v1";
  return {
    id: `fixture.${source.id}${versionSuffix}`,
    version: 1,
    kind,
    status: "applicable",
    adapter: source.adapter,
    source: source.path,
    sourceHash: sha256(source.content),
    assertions: [...assertions],
  };
}

export function buildDesignSystemContract(
  layout: ResolvedUiLayout,
  apps: readonly ResolvedDesignSystemApp[],
  adapters: readonly UiAdapterId[],
): Record<string, unknown> {
  const sources = designStyleSources(layout, adapters);
  const fixtures: Record<string, unknown>[] = [
    fixtureForSource(sourceById(sources, "tokens.theme"), "tokens", [
      "tokens.complete",
      "tokens.oklch",
      "tokens.primary-contrast",
    ]),
    fixtureForSource(sourceById(sources, "utilities.portable"), "utilities", [
      "utilities.portable",
      "utilities.semantic-only",
    ]),
    fixtureForSource(sourceById(sources, "states.base-contract"), "interaction-variants", [
      "states.complete",
      "states.element-free",
    ]),
  ];

  const adapterContracts = adapters.map((adapter) => {
    const source = sourceById(sources, `adapter.${adapter}.v1`);
    const fixtureKind = adapter === "expo" ? "native-style" : "adapter-css";
    const fixture = fixtureForSource(source, fixtureKind, [
      `adapter.${adapter}.imports-composition`,
      `adapter.${adapter}.adds-no-semantic-rule`,
    ]);
    fixtures.push(fixture);
    return {
      id: adapter,
      version: 1,
      status: "applicable",
      platform: adapterPlatform(adapter),
      entrypoint: source.importPath,
      source: source.path,
      mappings: adapterMappings(adapter),
      fixtures: [fixture.id],
    };
  });

  const sourceImports = Object.fromEntries(
    sources
      .filter((source) => source.kind !== "adapter")
      .map((source) => [source.id, source.importPath]),
  );

  return {
    $schema: "https://ghostinit.dev/schemas/design-system-contract.schema.json",
    schemaVersion: 1,
    contractVersion: "1.1.0",
    layout,
    layoutIdentity: `${layout.mode}:${layout.logicalModule}`,
    apps: apps.map((app) => ({ id: app.id, target: app.target, adapter: app.target })),
    styles: sourceImports,
    ...contractFoundation,
    componentImports: {
      registry: layout.componentRegistryImport,
      utilities: `${layout.logicalModule}/lib/utils`,
      web: "@/components/ui/{component}",
      electron: "@/components/ui/{component}",
      native: "@/components/ui/{component}",
    },
    adapters: adapterContracts,
    fixtures: fixtures.sort((left, right) => String(left.id).localeCompare(String(right.id))),
    policies: {
      maintainedSource: "https://ghostinit.dev/schemas/maintained-source-globs.schema.json",
      componentSize: "https://ghostinit.dev/schemas/component-size-policy.schema.json",
    },
  };
}

export function designSystemContractJsonContent(contract: Record<string, unknown>): string {
  return `${JSON.stringify(contract, null, 2)}\n`;
}

export function designSystemContractModuleContent(contract: Record<string, unknown>): string {
  const serialized = JSON.stringify(contract, null, 2);
  return `/**
 * Typed mirror of .ghostinit/design-system-contract.json.
 * Embedded deliberately: package project references may not import JSON outside
 * their rootDir, and the generator emits both artifacts from the same value.
 */
export const designSystemContract = ${serialized} as const;
export type DesignSystemContract = typeof designSystemContract;
export const designSystemContractVersion = designSystemContract.contractVersion;
export default designSystemContract;
`;
}

export function designSystemContractFiles(
  layout: ResolvedUiLayout,
  contract: Record<string, unknown>,
): TemplateFile[] {
  return [
    file(".ghostinit/design-system-contract.json", designSystemContractJsonContent(contract)),
    file(layout.contractPath, designSystemContractModuleContent(contract)),
  ];
}
