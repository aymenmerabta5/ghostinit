import type { TemplateFile } from "../../src/templates/shared.js";

export const EXPECTED_LAYERS = {
  navigation: 20,
  overlay: 40,
  modal: 50,
  popover: 60,
  tooltip: 70,
  toast: 80,
} as const;

type LayerName = keyof typeof EXPECTED_LAYERS;
const approvedClasses = new Set(
  Object.keys(EXPECTED_LAYERS).map((name) => `z-[var(--layer-${name})]`),
);
const layerClasses = /\bz-(?:\d+|auto|\[[^\]]+\])|\[z-index:[^\]]+\]/g;

export function invalidLayerUses(content: string): string[] {
  return [
    ...[...content.matchAll(layerClasses)]
      .map((match) => match[0])
      .filter((value) => !approvedClasses.has(value)),
    ...[...content.matchAll(/\bzIndex\s*:/g)].map((match) => match[0]),
  ];
}

export function invalidLayerDeclarations(content: string): string[] {
  const entries = [...content.matchAll(/--layer-([\w-]+)\s*:\s*([^;{}]+);/g)];
  const errors: string[] = [];
  for (const [name, value] of Object.entries(EXPECTED_LAYERS)) {
    const actual = entries.filter((match) => match[1] === name);
    if (actual.length !== 1 || actual[0]?.[2]?.trim() !== String(value))
      errors.push(`--layer-${name} must be declared once as ${value}`);
  }
  for (const entry of entries) {
    if (!Object.hasOwn(EXPECTED_LAYERS, entry[1] ?? ""))
      errors.push(`unknown layer --layer-${entry[1]}`);
  }
  return errors;
}

interface LayerBinding {
  file: string;
  selector: RegExp;
  layer: LayerName;
  minimum?: number;
}

const requiredBindings: readonly LayerBinding[] = [
  { file: "components/header.tsx", selector: /<header\b[^>]*>/g, layer: "navigation" },
  { file: "components/workspace-sidebar.tsx", selector: /<aside\b[^>]*>/g, layer: "navigation" },
  {
    file: "components/ui/alert-dialog.tsx",
    selector: /<BaseAlertDialog\.Backdrop\b[^>]*>/g,
    layer: "overlay",
  },
  {
    file: "components/ui/alert-dialog.tsx",
    selector: /<BaseAlertDialog\.Popup\b[^>]*>/g,
    layer: "modal",
  },
  {
    file: "components/ui/dialog.tsx",
    selector: /<BaseDialog\.Backdrop\b[^>]*>/g,
    layer: "overlay",
  },
  { file: "components/ui/dialog.tsx", selector: /<BaseDialog\.Popup\b[^>]*>/g, layer: "modal" },
  {
    file: "components/ui/dropdown-menu.tsx",
    selector: /<BaseMenu\.Positioner\b[^>]*>/g,
    layer: "popover",
    minimum: 2,
  },
  {
    file: "components/ui/popover.tsx",
    selector: /<BasePopover\.Positioner\b[^>]*>/g,
    layer: "popover",
  },
  {
    file: "components/ui/select.tsx",
    selector: /<BaseSelect\.Positioner\b[^>]*>/g,
    layer: "popover",
  },
  { file: "components/ui/sheet.tsx", selector: /<BaseDialog\.Backdrop\b[^>]*>/g, layer: "overlay" },
  {
    file: "components/ui/sheet.tsx",
    selector: /const sheetVariants = cva\(\s*"[^"]*"/g,
    layer: "modal",
  },
  {
    file: "components/ui/tooltip.tsx",
    selector: /<BaseTooltip\.Positioner\b[^>]*>/g,
    layer: "tooltip",
  },
  { file: "components/ui/sonner.tsx", selector: /<SonnerToaster\b[^>]*>/g, layer: "toast" },
];

export function generatedLayerViolations(target: {
  mode: "single" | "monorepo";
  sourceRoot: string;
  files: TemplateFile[];
}): { path: string; evidence: string }[] {
  const byPath = new Map(target.files.map(({ path, content }) => [path, content]));
  const records: { path: string; evidence: string }[] = [];
  const themePath =
    target.mode === "monorepo"
      ? "packages/ui/src/styles/theme.css"
      : "src/platform/ui/styles/theme.css";
  for (const evidence of invalidLayerDeclarations(byPath.get(themePath) ?? ""))
    records.push({ path: themePath, evidence });
  const scanned = new Set([
    ...requiredBindings.map(({ file }) => file),
    "components/ui/surface-styles.ts",
  ]);
  for (const relative of scanned) {
    const path = `${target.sourceRoot}/${relative}`;
    for (const evidence of invalidLayerUses(byPath.get(path) ?? ""))
      records.push({ path, evidence });
  }
  for (const { file, selector, layer, minimum = 1 } of requiredBindings) {
    const path = `${target.sourceRoot}/${file}`;
    const matches = [...(byPath.get(path) ?? "").matchAll(selector)];
    if (matches.length < minimum)
      records.push({ path, evidence: `missing ${layer} component binding` });
    for (const match of matches) {
      const classes = [...match[0].matchAll(layerClasses)].map((entry) => entry[0]);
      if (classes.length !== 1 || classes[0] !== `z-[var(--layer-${layer})]`)
        records.push({ path, evidence: `expected only ${layer} on ${match[0]}` });
    }
  }
  return records;
}
