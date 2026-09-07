import type { AppName, FrameworkName, ProjectMode } from "../../lib/addons.js";

export const uiAdapterIds = ["next", "tanstack", "electron", "expo"] as const;

export type UiAdapterId = (typeof uiAdapterIds)[number];

export interface ResolvedDesignSystemApp {
  readonly id: string;
  readonly target: UiAdapterId;
}

export interface ResolvedUiLayout {
  readonly mode: ProjectMode;
  readonly logicalModule: "@repo/ui" | "@/platform/ui";
  readonly moduleRoot: "packages/ui" | "src/platform/ui";
  readonly sourceRoot: "packages/ui/src" | "src/platform/ui";
  readonly stylesRoot: "packages/ui/src/styles" | "src/platform/ui/styles";
  readonly stylesImport: "@repo/ui/styles" | "@/platform/ui/styles";
  readonly contractPath: "packages/ui/src/contract.ts" | "src/platform/ui/contract.ts";
  readonly contractImport: "@repo/ui/contract" | "@/platform/ui/contract";
  readonly componentRegistryPath:
    | "packages/ui/src/component-registry.json"
    | "src/platform/ui/component-registry.json";
  readonly componentRegistryImport:
    | "@repo/ui/component-registry.json"
    | "@/platform/ui/component-registry.json";
}

const resolvedUiLayouts = {
  monorepo: {
    mode: "monorepo",
    logicalModule: "@repo/ui",
    moduleRoot: "packages/ui",
    sourceRoot: "packages/ui/src",
    stylesRoot: "packages/ui/src/styles",
    stylesImport: "@repo/ui/styles",
    contractPath: "packages/ui/src/contract.ts",
    contractImport: "@repo/ui/contract",
    componentRegistryPath: "packages/ui/src/component-registry.json",
    componentRegistryImport: "@repo/ui/component-registry.json",
  },
  single: {
    mode: "single",
    logicalModule: "@/platform/ui",
    moduleRoot: "src/platform/ui",
    sourceRoot: "src/platform/ui",
    stylesRoot: "src/platform/ui/styles",
    stylesImport: "@/platform/ui/styles",
    contractPath: "src/platform/ui/contract.ts",
    contractImport: "@/platform/ui/contract",
    componentRegistryPath: "src/platform/ui/component-registry.json",
    componentRegistryImport: "@/platform/ui/component-registry.json",
  },
} as const satisfies Record<ProjectMode, ResolvedUiLayout>;

/** Resolve the only two supported UI layouts. Unknown modes fail closed. */
export function resolveUiLayout(mode: ProjectMode): ResolvedUiLayout {
  const layout = resolvedUiLayouts[mode];
  if (!layout) {
    throw new Error(`Unsupported UI layout mode: ${String(mode)}`);
  }
  return layout;
}

/**
 * Convert the V1 app flags to explicit design targets before composition.
 * Keeping framework resolution outside `designSystemFiles` prevents a generic
 * `web` app from silently selecting the wrong adapter.
 */
export function resolveDesignSystemApps(
  apps: readonly AppName[],
  framework: FrameworkName,
): readonly ResolvedDesignSystemApp[] {
  const resolved = apps.map((app): ResolvedDesignSystemApp => {
    if (app === "mobile") return { id: app, target: "expo" };
    if (app === "desktop") return { id: app, target: "electron" };
    return { id: app, target: framework === "tanstack-start" ? "tanstack" : "next" };
  });
  return [...resolved].sort(
    (left, right) => left.id.localeCompare(right.id) || left.target.localeCompare(right.target),
  );
}

export function normalizeDesignSystemApps(
  apps: readonly ResolvedDesignSystemApp[],
): readonly ResolvedDesignSystemApp[] {
  if (apps.length === 0) throw new Error("At least one design-system app is required");

  const byId = new Map<string, UiAdapterId>();
  for (const app of apps) {
    if (!/^[a-z][a-z0-9-]*$/.test(app.id)) {
      throw new Error(`Invalid design-system app id: ${app.id}`);
    }
    if (!uiAdapterIds.includes(app.target)) {
      throw new Error(`Unsupported design-system target: ${String(app.target)}`);
    }
    const previous = byId.get(app.id);
    if (previous) {
      throw new Error(
        `Design-system app id ${app.id} is duplicated (${previous} and ${app.target})`,
      );
    }
    byId.set(app.id, app.target);
  }

  return [...apps].sort(
    (left, right) => left.id.localeCompare(right.id) || left.target.localeCompare(right.target),
  );
}
