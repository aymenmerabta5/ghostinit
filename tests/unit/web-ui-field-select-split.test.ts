import { describe, expect, test } from "bun:test";
import { parseSync } from "oxc-parser";
import { singleWebUiFiles, webUiFiles } from "../../src/templates/apps/fragments/web-ui/index.js";

type Mode = "monorepo" | "single";
type Framework = "nextjs" | "tanstack-start";

const modules = [
  "field.tsx",
  "input-group.tsx",
  "toggle-group.tsx",
  "select.tsx",
  "select-items.tsx",
] as const;

function sources(mode: Mode, framework: Framework): Map<string, string> {
  void framework;
  const root = mode === "monorepo" ? "apps/web/src" : "src";
  const generated = new Map(
    (mode === "monorepo" ? webUiFiles() : singleWebUiFiles()).map((file) => [
      file.path,
      file.content,
    ]),
  );
  return new Map(
    modules.map((name) => {
      const path = `${root}/components/ui/${name}`;
      return [name, generated.get(path) ?? ""];
    }),
  );
}

describe("generated field and select module splits", () => {
  test("all web variants emit the same parseable modules within 150 physical lines", () => {
    const baseline = sources("monorepo", "nextjs");
    for (const mode of ["monorepo", "single"] as const) {
      for (const framework of ["nextjs", "tanstack-start"] as const) {
        const actual = sources(mode, framework);
        expect(actual, `${mode} ${framework}`).toEqual(baseline);
        for (const [name, source] of actual) {
          expect(source, `${mode} ${framework} ${name}`).not.toBe("");
          expect(source.split(/\r?\n/).length, `${mode} ${framework} ${name}`).toBeLessThanOrEqual(
            150,
          );
          expect(parseSync(name, source).errors, `${mode} ${framework} ${name}`).toEqual([]);
        }
      }
    }
  });

  test("public entry points retain every field and select export", () => {
    const generated = sources("monorepo", "nextjs");
    const field = generated.get("field.tsx") ?? "";
    const select = generated.get("select.tsx") ?? "";

    for (const declaration of [
      "export const FieldGroup",
      "export interface FieldProps",
      "export const Field =",
      "export const FieldContent",
      "export const FieldLabel",
      "export const FieldDescription",
      "export const FieldError",
      "export const FieldSet",
      "export const FieldLegend",
    ]) {
      expect(field).toContain(declaration);
    }
    for (const name of [
      "InputGroup",
      "InputGroupAddon",
      "InputGroupInput",
      "InputGroupTextarea",
      "ToggleGroup",
      "ToggleGroupItem",
    ]) {
      expect(field).toMatch(new RegExp(`export \\{[\\s\\S]*\\b${name}\\b[\\s\\S]*\\} from`));
    }

    for (const declaration of [
      "export interface SelectOption",
      "export interface SelectProps",
      "export function Select(",
      "export interface SelectTriggerProps",
      "export function SelectTrigger(",
      "export interface SelectValueProps",
      "export function SelectValue(",
      "export interface SelectContentProps",
      "export function SelectContent(",
    ]) {
      expect(select).toContain(declaration);
    }
    for (const name of ["SelectGroup", "SelectItem", "SelectGroupProps", "SelectItemProps"]) {
      expect(select).toMatch(new RegExp(`export \\{[\\s\\S]*\\b${name}\\b[\\s\\S]*\\} from`));
    }
  });

  test("extracted controls keep logical RTL spacing", () => {
    const generated = sources("monorepo", "nextjs");
    const fieldControls = [
      generated.get("input-group.tsx") ?? "",
      generated.get("toggle-group.tsx") ?? "",
    ].join("\n");
    const selectItems = generated.get("select-items.tsx") ?? "";

    expect(fieldControls).not.toMatch(/\b(?:ml|mr|pl|pr|left|right)-/);
    expect(selectItems).toContain("py-2 ps-8 pe-2.5");
    expect(selectItems).toContain("min-h-9");
    expect(selectItems).toContain('className="absolute start-2');
    expect(selectItems).not.toMatch(/\b(?:ml|mr|pl|pr|left|right)-/);
  });
});
