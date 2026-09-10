import { describe, expect, test } from "bun:test";
import { parseSync } from "oxc-parser";
import { singleWebUiFiles, webUiFiles } from "../../src/templates/apps/fragments/web-ui/index.js";
import type { TemplateFile } from "../../src/templates/shared.js";

function source(files: TemplateFile[], path: string): string {
  return files.find((entry) => entry.path === path)?.content ?? "";
}

const monorepoFiles = webUiFiles();
const singleFiles = singleWebUiFiles();

const fieldFiles = [
  "TextField.tsx",
  "TextAreaField.tsx",
  "PasswordField.tsx",
  "SelectField.tsx",
  "CheckboxField.tsx",
  "OtpField.tsx",
] as const;

describe("generated TanStack Form foundation", () => {
  test("creates one typed hook integration while retaining compatibility exports", () => {
    const context = source(monorepoFiles, "apps/web/src/components/ui/form-context.tsx");
    const form = source(monorepoFiles, "apps/web/src/components/ui/form.tsx");

    expect(context).toContain("createFormHookContexts");
    expect(context.match(/createFormHookContexts\(\)/g)).toHaveLength(1);
    expect(context).toContain("fieldContext");
    expect(context).toContain("formContext");
    expect(context).toContain("useFieldContext");
    expect(context).toContain("useFormContext");

    expect(form).toContain("createFormHook({");
    expect(form).toContain("useAppForm");
    expect(form).toContain("withForm");
    expect(form).toContain("export { TanStackField as Field, useForm, useStore }");
    expect(form).toContain("export function Form(");
    expect(form).toContain('from "./form-submit"');
    expect(source(monorepoFiles, "apps/web/src/components/ui/form-submit.tsx")).toContain(
      "export function SubmitButton(",
    );
    for (const component of [
      "AppTextField",
      "AppTextAreaField",
      "AppPasswordField",
      "AppSelectField",
      "AppCheckboxField",
      "AppOtpField",
    ]) {
      expect(form).toContain(component);
    }
  });

  test("composes subscribed submit state from Spinner and disabled semantics", () => {
    const form = source(monorepoFiles, "apps/web/src/components/ui/form-submit.tsx");

    expect(form).toContain("<form.Subscribe");
    expect(form).toContain("state.canSubmit");
    expect(form).toContain("state.isSubmitting");
    expect(form).toContain("disabled={disabled || !canSubmit || isSubmitting}");
    expect(form).toContain("aria-busy={isSubmitting}");
    expect(form).toContain('<Spinner data-icon="inline-start" />');
    expect(form).not.toContain("isPending");
  });

  test("wires every AppField control to stable accessible field composition", () => {
    const helpers = source(monorepoFiles, "apps/web/src/components/form-fields/field-helpers.tsx");
    expect(helpers).toContain("React.useId()");
    expect(helpers).toContain('controlId + "-description"');
    expect(helpers).toContain('controlId + "-error"');
    expect(helpers).toContain("function firstFieldError(");
    expect(helpers).not.toContain(": any");

    for (const fileName of fieldFiles) {
      const path = `apps/web/src/components/form-fields/${fileName}`;
      const field = source(monorepoFiles, path);
      expect(field).toContain("useFieldContext<");
      expect(field).toContain("<Field");
      expect(field).toContain("data-invalid={invalid}");
      expect(field).toContain("data-disabled={disabled || undefined}");
      expect(field).toContain("aria-invalid={invalid}");
      expect(field).toContain("aria-describedby={describedBy}");
      expect(field).toContain("aria-errormessage={invalid ? ids.errorId : undefined}");
      expect(field).toContain("ids.descriptionId");
      expect(field).toContain("ids.errorId");
      expect(field).not.toContain("space-y-");
      expect(field).not.toContain("<div");
      expect(field).not.toContain("as unknown as");
      expect(field).not.toContain(": any");
    }

    const text = source(monorepoFiles, "apps/web/src/components/form-fields/TextField.tsx");
    expect(text).not.toContain("useSurfaceTranslations");

    const password = source(monorepoFiles, "apps/web/src/components/form-fields/PasswordField.tsx");
    expect(password).toContain('import { useSurfaceTranslations } from "@/lib/translations";');
    expect(password).toContain("<InputGroup");
    expect(password).toContain("<InputGroupInput");
    expect(password).toContain("<InputGroupAddon>");
    expect(password.match(/React\.useState/g)).toHaveLength(1);

    const select = source(monorepoFiles, "apps/web/src/components/form-fields/SelectField.tsx");
    expect(select).toContain("<SelectGroup>");
    expect(select).toContain("<SelectItem");

    const checkbox = source(monorepoFiles, "apps/web/src/components/form-fields/CheckboxField.tsx");
    expect(checkbox).toContain('orientation="horizontal"');
    expect(checkbox).toContain("<FieldContent>");

    const otp = source(monorepoFiles, "apps/web/src/components/form-fields/OtpField.tsx");
    expect(otp).toContain('autoComplete = "one-time-code"');
    expect(otp).toContain('inputMode = "numeric"');
    expect(otp).toContain("onValueChange={field.handleChange}");
  });

  test("emits the same parseable foundation for single mode", () => {
    const relativePaths = [
      "components/ui/form-context.tsx",
      "components/ui/form.tsx",
      "components/form-fields/field-helpers.tsx",
      "components/form-fields/FormSection.tsx",
      "components/form-fields/index.ts",
      ...fieldFiles.map((fileName) => `components/form-fields/${fileName}`),
    ];

    for (const relativePath of relativePaths) {
      const monorepoPath = `apps/web/src/${relativePath}`;
      const singlePath = `src/${relativePath}`;
      const monorepoSource = source(monorepoFiles, monorepoPath);
      const singleSource = source(singleFiles, singlePath);
      expect(singleSource).toBe(monorepoSource);
      expect(parseSync(singlePath, singleSource).errors).toHaveLength(0);
      expect(singleSource).not.toContain("export *");
    }

    const section = source(monorepoFiles, "apps/web/src/components/form-fields/FormSection.tsx");
    expect(section).toContain("<FieldSet");
    expect(section).toContain("<FieldLegend>");
    expect(section).toContain("<FieldGroup");
    expect(section).not.toContain("<div");
    expect(section).not.toContain("space-y-");
  });
});
