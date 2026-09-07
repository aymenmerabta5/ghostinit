import { baseLayer, semanticThemeCssContent } from "../apps/fragments/css.js";
import { file, type TemplateFile } from "../shared.js";
import type { ResolvedUiLayout, UiAdapterId } from "./layout.js";

const webAdapters = new Set<UiAdapterId>(["next", "tanstack", "electron"]);

export type DesignStyleKind =
  | "tokens"
  | "utilities"
  | "semantic-states"
  | "web-base"
  | "native-base"
  | "composition"
  | "adapter";

export interface DesignStyleSource {
  readonly id: string;
  readonly kind: DesignStyleKind;
  readonly path: string;
  readonly importPath: string;
  readonly content: string;
  readonly adapter: UiAdapterId | null;
}

export function utilitiesCssContent(): string {
  return `@utility ui-surface {
  background-color: var(--background);
  color: var(--foreground);
}

@utility ui-surface-card {
  background-color: var(--card);
  border-color: var(--border);
  border-radius: var(--radius);
  border-width: 1px;
  color: var(--card-foreground);
}

@utility ui-text-muted {
  color: var(--muted-foreground);
}

@utility ui-focus-ring {
  outline-color: var(--ring);
  outline-offset: 2px;
  outline-style: solid;
  outline-width: 2px;
}
`;
}

/** Semantic interaction vocabulary only. DOM resets belong to web-base.css. */
export function baseContractCssContent(): string {
  return `@custom-variant ui-hover (&:where(.ui-hover, .ui-hover *));
@custom-variant ui-active (&:where(.ui-active, .ui-active *));
@custom-variant ui-selected (&:where(.ui-selected, .ui-selected *));
@custom-variant ui-disabled (&:where(.ui-disabled, .ui-disabled *));
@custom-variant ui-loading (&:where(.ui-loading, .ui-loading *));
@custom-variant ui-error (&:where(.ui-error, .ui-error *));

@theme inline {
  --ui-role-canvas: var(--background);
  --ui-role-content: var(--foreground);
  --ui-role-surface: var(--card);
  --ui-role-surface-content: var(--card-foreground);
  --ui-role-muted-content: var(--muted-foreground);
  --ui-role-action: var(--primary);
  --ui-role-action-content: var(--primary-foreground);
  --ui-role-danger: var(--destructive);
  --ui-role-focus: var(--ring);
}
`;
}

export function webBaseCssContent(): string {
  return `${baseLayer}\n`;
}

export function nativeBaseTsContent(): string {
  return `export const nativeBaseRoles = {
  canvas: "flex-1 bg-background",
  content: "text-base text-foreground",
  surface: "rounded-lg border border-border bg-card text-card-foreground",
  mutedContent: "text-muted-foreground",
  action: "bg-primary text-primary-foreground",
  danger: "bg-destructive text-destructive-foreground",
  focus: "border-ring",
} as const;

export const nativeInteractionStates = {
  active: "ui-active",
  disabled: "ui-disabled",
  error: "ui-error",
  hover: "ui-hover",
  loading: "ui-loading",
  selected: "ui-selected",
} as const;

export type NativeBaseRole = keyof typeof nativeBaseRoles;
export type NativeInteractionState = keyof typeof nativeInteractionStates;
`;
}

export function webCompositionCssContent(): string {
  return `@import "tailwindcss";
@import "@fontsource-variable/geist/wght.css";
@import "@fontsource-variable/geist-mono/wght.css";
@import "@fontsource-variable/noto-sans-arabic/wght.css";
@import "tw-animate-css";
@import "./theme.css";
@import "./utilities.css";
@import "./base.contract.css";
@import "./web-base.css";

@custom-variant dark (&:is(.dark *));
@custom-variant light (&:is(.light *));
`;
}

export function nativeCompositionCssContent(): string {
  return `@import "tailwindcss";
@import "./theme.css";
@import "./utilities.css";
@import "./base.contract.css";

@custom-variant dark (&:is(.dark *));
@custom-variant light (&:is(.light *));
`;
}

export function adapterCssContent(adapter: UiAdapterId): string {
  const composition = webAdapters.has(adapter) ? "web.css" : "native.css";
  return `/* GhostInit design adapter ${adapter}/v1. Platform rules stay in ${composition}. */
@import "../../${composition}";
`;
}

export function compatibilityThemeCssContent(): string {
  return `/* Compatibility entrypoint. The OKLCH --background tokens and @theme inline mapping live in styles/theme.css. */
@import "./styles/theme.css";
`;
}

export function designStyleSources(
  layout: ResolvedUiLayout,
  adapters: readonly UiAdapterId[],
): readonly DesignStyleSource[] {
  const selected = new Set(adapters);
  const hasWeb = adapters.some((adapter) => webAdapters.has(adapter));
  const hasNative = selected.has("expo");
  const sources: DesignStyleSource[] = [
    {
      id: "tokens.theme",
      kind: "tokens",
      path: `${layout.stylesRoot}/theme.css`,
      importPath: `${layout.stylesImport}/theme.css`,
      content: semanticThemeCssContent(),
      adapter: null,
    },
    {
      id: "utilities.portable",
      kind: "utilities",
      path: `${layout.stylesRoot}/utilities.css`,
      importPath: `${layout.stylesImport}/utilities.css`,
      content: utilitiesCssContent(),
      adapter: null,
    },
    {
      id: "states.base-contract",
      kind: "semantic-states",
      path: `${layout.stylesRoot}/base.contract.css`,
      importPath: `${layout.stylesImport}/base.contract.css`,
      content: baseContractCssContent(),
      adapter: null,
    },
  ];

  if (hasWeb) {
    sources.push(
      {
        id: "base.web",
        kind: "web-base",
        path: `${layout.stylesRoot}/web-base.css`,
        importPath: `${layout.stylesImport}/web-base.css`,
        content: webBaseCssContent(),
        adapter: null,
      },
      {
        id: "composition.web",
        kind: "composition",
        path: `${layout.stylesRoot}/web.css`,
        importPath: `${layout.stylesImport}/web.css`,
        content: webCompositionCssContent(),
        adapter: null,
      },
    );
  }

  if (hasNative) {
    sources.push(
      {
        id: "base.native",
        kind: "native-base",
        path: `${layout.stylesRoot}/native-base.ts`,
        importPath: `${layout.stylesImport}/native-base`,
        content: nativeBaseTsContent(),
        adapter: null,
      },
      {
        id: "composition.native",
        kind: "composition",
        path: `${layout.stylesRoot}/native.css`,
        importPath: `${layout.stylesImport}/native.css`,
        content: nativeCompositionCssContent(),
        adapter: null,
      },
    );
  }

  for (const adapter of adapters) {
    sources.push({
      id: `adapter.${adapter}.v1`,
      kind: "adapter",
      path: `${layout.stylesRoot}/adapters/${adapter}/v1.css`,
      importPath: `${layout.stylesImport}/adapters/${adapter}/v1.css`,
      content: adapterCssContent(adapter),
      adapter,
    });
  }

  return sources.sort((left, right) => left.path.localeCompare(right.path));
}

export function designStyleFiles(
  layout: ResolvedUiLayout,
  adapters: readonly UiAdapterId[],
): TemplateFile[] {
  return designStyleSources(layout, adapters).map((source) => file(source.path, source.content));
}
