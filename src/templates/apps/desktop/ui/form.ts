import { desktopFormFieldFiles } from "./form-fields.js";
import { file, type TemplateFile } from "../../../shared.js";
import { desktopAccountControlFiles } from "./account-controls.js";
import { platformSurfaceTranslationFiles } from "../../fragments/platform-surface-translations.js";

export function desktopTranslationFiles(sourceRoot: string, hasI18n: boolean): TemplateFile[] {
  return platformSurfaceTranslationFiles(sourceRoot, hasI18n);
}

/** Electron shares one typed form context across focused field adapters. */
export function desktopFormFiles(
  sourceRoot: string,
  translationImport = "../../lib/translations",
): TemplateFile[] {
  return [
    ...desktopAccountControlFiles(sourceRoot, translationImport),
    ...desktopFormFieldFiles(sourceRoot),
    file(
      `${sourceRoot}/components/ui/form-context.tsx`,
      'import { createFormHookContexts } from "@tanstack/react-form";\nexport const { fieldContext, formContext, useFieldContext, useFormContext } = createFormHookContexts();\n',
    ),
    file(
      `${sourceRoot}/components/ui/form.tsx`,
      `import * as React from "react";
import { createFormHook, useForm, useStore } from "@tanstack/react-form";
import { Alert, AlertDescription } from "./alert";
import { Button, type ButtonProps } from "./button";
import { useSurfaceTranslations } from "${translationImport}";
import { fieldContext, formContext, useFormContext } from "./form-context";
import { TextField, PasswordField, OtpField } from "../form-fields/text-field";
import { TextAreaField } from "../form-fields/textarea-field";
import { SelectField } from "../form-fields/select-field";
import { CheckboxField } from "../form-fields/checkbox-field";
export { useForm, useStore };
export interface FormController { handleSubmit(): Promise<void> | void }
export function Form({ form, children, className }: { form: FormController; children: React.ReactNode; className?: string }): React.JSX.Element {
  const t = useSurfaceTranslations("errors");
  const [failed, setFailed] = React.useState(false);
  const pending = React.useRef(false);
  async function submit(): Promise<void> {
    if (pending.current) return;
    pending.current = true; setFailed(false);
    try { await form.handleSubmit(); } catch { setFailed(true); } finally { pending.current = false; }
  }
  return <form noValidate className={className} onSubmit={(event) => { event.preventDefault(); event.stopPropagation(); void submit(); }}>{children}{failed ? <Alert role="alert" variant="destructive"><AlertDescription>{t("genericDescription")}</AlertDescription></Alert> : null}</form>;
}
function SubmitButton({ pendingLabel, children, ...props }: ButtonProps & { pendingLabel?: React.ReactNode }): React.JSX.Element {
  const t = useSurfaceTranslations("common");
  const form = useFormContext();
  return <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting] as const}>{([canSubmit, isSubmitting]) => <Button {...props} type="submit" disabled={props.disabled || !canSubmit || isSubmitting} aria-busy={isSubmitting}>{isSubmitting ? pendingLabel ?? t("loading") : children}</Button>}</form.Subscribe>;
}
export const { useAppForm } = createFormHook({ fieldContext, formContext,
  fieldComponents: { TextField, TextAreaField, SelectField, PasswordField, OtpField, CheckboxField }, formComponents: { SubmitButton } });
`,
    ),
  ];
}
