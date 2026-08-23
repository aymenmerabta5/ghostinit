import { describe, expect, test } from "bun:test";
import { parseSync } from "oxc-parser";
import type { ProjectConfig } from "../../src/lib/config.js";
import { generateProjectFiles } from "../../src/templates/default.js";
import type { TemplateFile } from "../../src/templates/shared.js";

type PrimitiveCategory =
  | "field-composition"
  | "internal-icon-size"
  | "manual-overlay-z-index"
  | "nonfunctional-select"
  | "partial-notification-bell"
  | "pending-boolean-or-spinner"
  | "radix-as-child"
  | "raw-interactive-markup"
  | "ungrouped-select-item";

interface PrimitiveRecord {
  category: PrimitiveCategory;
  path: string;
  evidence: string;
}

interface GeneratedTarget {
  label: string;
  sourceRoot: string;
  manifestPath: string;
  files: TemplateFile[];
}

const config = (mode: "monorepo" | "single"): ProjectConfig => ({
  name: "primitive-contract",
  runtime: "bun",
  version: "0.1.0",
  mode,
  billing: [],
  features: [],
  database: "postgres",
  framework: "nextjs",
  apps: ["web"],
  preset: "saas",
});

const targets: GeneratedTarget[] = [
  {
    label: "next-monorepo",
    sourceRoot: "apps/web/src",
    manifestPath: "apps/web/package.json",
    files: generateProjectFiles(config("monorepo"), { dryRun: false }),
  },
  {
    label: "single-next",
    sourceRoot: "src",
    manifestPath: "package.json",
    files: generateProjectFiles(config("single"), { dryRun: false }),
  },
];

function source(target: GeneratedTarget, relativePath: string): string {
  const path = `${target.sourceRoot}/${relativePath}`;
  return target.files.find((file) => file.path === path)?.content ?? "";
}

function addMissingTokens(
  records: PrimitiveRecord[],
  category: PrimitiveCategory,
  path: string,
  content: string,
  tokens: string[],
): void {
  for (const token of tokens) {
    if (!content.includes(token)) records.push({ category, path, evidence: `missing ${token}` });
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function rawInteractiveElements(path: string, content: string): string[] {
  const parsed = parseSync(path, content);
  const raw: string[] = [];
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const entry of value) visit(entry);
      return;
    }
    if (!isObject(value)) return;
    if (value.type === "JSXOpeningElement" && isObject(value.name)) {
      const name = value.name.name;
      if (name === "button" || name === "input" || name === "select") raw.push(name);
    }
    for (const [key, child] of Object.entries(value)) {
      if (key !== "type" && key !== "start" && key !== "end") visit(child);
    }
  };
  visit(parsed.program);
  return raw;
}

function collectPrimitiveRecords(target: GeneratedTarget): PrimitiveRecord[] {
  const records: PrimitiveRecord[] = [];
  const ui = (name: string): [string, string] => {
    const path = `${target.sourceRoot}/components/ui/${name}`;
    return [path, target.files.find((file) => file.path === path)?.content ?? ""];
  };
  const selectFieldPath = `${target.sourceRoot}/components/form-fields/SelectField.tsx`;
  const passwordFieldPath = `${target.sourceRoot}/components/form-fields/PasswordField.tsx`;
  const notificationPath = `${target.sourceRoot}/components/NotificationBell.tsx`;
  const selectField = source(target, "components/form-fields/SelectField.tsx");
  const passwordField = source(target, "components/form-fields/PasswordField.tsx");
  const notification = source(target, "components/NotificationBell.tsx");
  const [selectPath, select] = ui("select.tsx");
  const [formPath, form] = ui("form.tsx");

  addMissingTokens(records, "field-composition", selectFieldPath, selectField, [
    "<Field",
    "<FieldLabel",
    "<FieldDescription",
    "aria-describedby={describedBy}",
    "<Select items={options}",
    "<SelectGroup>",
  ]);
  addMissingTokens(records, "field-composition", passwordFieldPath, passwordField, [
    "<Field",
    "<FieldLabel",
    "<InputGroup>",
    "<InputGroupInput",
    "<InputGroupAddon",
  ]);

  for (const [path, content] of [
    [passwordFieldPath, passwordField],
    [notificationPath, notification],
    ui("checkbox.tsx"),
    [selectPath, select],
    ui("dialog.tsx"),
    ui("dropdown-menu.tsx"),
    ui("sheet.tsx"),
  ] as Array<[string, string]>) {
    for (const match of content.matchAll(
      /<(?:Bell|Check|Eye|EyeOff|X|ChevronRight)\b[^>]*\bclassName=[^>]*(?:size-|\bh-|\bw-)/g,
    )) {
      records.push({ category: "internal-icon-size", path, evidence: match[0] });
    }
  }

  for (const name of [
    "alert-dialog.tsx",
    "dialog.tsx",
    "dropdown-menu.tsx",
    "popover.tsx",
    "select.tsx",
    "sheet.tsx",
    "surface-styles.ts",
    "tooltip.tsx",
  ]) {
    const [path, content] = ui(name);
    for (const match of content.matchAll(/\bz-(?:\d+|auto|\[[^\]]+\])/g)) {
      records.push({ category: "manual-overlay-z-index", path, evidence: match[0] });
    }
  }

  for (const name of ["button.tsx", "dialog.tsx", "dropdown-menu.tsx", "sheet.tsx"]) {
    const [path, content] = ui(name);
    for (const match of content.matchAll(/\basChild\b/g)) {
      records.push({ category: "radix-as-child", path, evidence: match[0] });
    }
  }

  addMissingTokens(records, "nonfunctional-select", selectPath, select, [
    'from "@base-ui/react/select"',
    "<BaseSelect.Root",
    "items={resolvedItems}",
    "onValueChange={handleValueChange}",
    "<BaseSelect.Portal>",
    "<BaseSelect.Positioner",
    "<BaseSelect.Popup",
    "<BaseSelect.List>",
  ]);
  addMissingTokens(records, "partial-notification-bell", notificationPath, notification, [
    "<Popover>",
    "<PopoverTrigger",
    "<PopoverTitle>Notifications</PopoverTitle>",
    "<PopoverDescription>",
    "<Empty>",
    "formatNotification(notification.type, notification.payload)",
    "onClick={() => onMarkRead?.(notification.id)}",
  ]);

  for (const forbidden of ["isPending?:", "isPending={", "border-t-transparent"]) {
    if (form.includes(forbidden)) {
      records.push({ category: "pending-boolean-or-spinner", path: formPath, evidence: forbidden });
    }
  }
  for (const file of target.files.filter(({ path }) => path.startsWith(`${target.sourceRoot}/`))) {
    if (file.content.includes("isPending={")) {
      records.push({
        category: "pending-boolean-or-spinner",
        path: file.path,
        evidence: "stale isPending binding",
      });
    }
    if (file.content.includes("<form.Subscribe")) {
      for (const token of ["<Spinner data-icon=", "disabled={!canSubmit || isSubmitting}"]) {
        if (!file.content.includes(token)) {
          records.push({
            category: "pending-boolean-or-spinner",
            path: file.path,
            evidence: `missing ${token}`,
          });
        }
      }
    }
  }
  if (selectField.includes("<SelectContent>{options.map")) {
    records.push({
      category: "ungrouped-select-item",
      path: selectFieldPath,
      evidence: "SelectItem rendered directly in SelectContent",
    });
  }

  for (const [path, content] of [
    [selectFieldPath, selectField],
    [passwordFieldPath, passwordField],
    [notificationPath, notification],
    [selectPath, select],
  ] as Array<[string, string]>) {
    for (const element of rawInteractiveElements(path, content)) {
      records.push({ category: "raw-interactive-markup", path, evidence: `<${element}>` });
    }
  }

  return records;
}

describe("generated shared frontend primitives", () => {
  for (const target of targets) {
    test(`${target.label} reviewed shared TSX parses`, () => {
      const diagnostics = target.files
        .filter(
          ({ path }) =>
            path.startsWith(`${target.sourceRoot}/components/`) && path.endsWith(".tsx"),
        )
        .flatMap(({ path, content }) =>
          parseSync(path, content).errors.map((error) => `${path}: ${error.message}`),
        );
      expect(diagnostics).toEqual([]);
    });

    test(`${target.label} has zero Task 3 primitive inventory records`, () => {
      const records = collectPrimitiveRecords(target);
      const counts = Object.fromEntries(
        [
          "field-composition",
          "internal-icon-size",
          "manual-overlay-z-index",
          "nonfunctional-select",
          "partial-notification-bell",
          "pending-boolean-or-spinner",
          "radix-as-child",
          "raw-interactive-markup",
          "ungrouped-select-item",
        ].map((category) => [
          category,
          records.filter((record) => record.category === category).length,
        ]),
      );
      expect(counts, JSON.stringify(records, null, 2)).toEqual({
        "field-composition": 0,
        "internal-icon-size": 0,
        "manual-overlay-z-index": 0,
        "nonfunctional-select": 0,
        "partial-notification-bell": 0,
        "pending-boolean-or-spinner": 0,
        "radix-as-child": 0,
        "raw-interactive-markup": 0,
        "ungrouped-select-item": 0,
      });
    });

    test(`${target.label} declares the configured icon and server-only dependencies`, () => {
      const manifestSource =
        target.files.find((file) => file.path === target.manifestPath)?.content ?? "{}";
      const manifest = JSON.parse(manifestSource) as {
        dependencies?: Record<string, string>;
      };
      expect(manifest.dependencies?.["lucide-react"]).toBe("1.33.0");
      expect(manifest.dependencies?.["server-only"]).toBe("0.0.1");
    });
  }
});
