import { formSubmitFile } from "./form-submit.js";
import { file, type TemplateFile } from "../../../shared.js";
import { fieldFiles } from "./field.js";

export function formsFiles(): TemplateFile[] {
  return [
    file(
      "apps/web/src/components/ui/input.tsx",
      `"use client";

import * as React from "react";
import { cn } from "../../lib/utils.js";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      data-slot="input"
      className={cn(
        "flex h-10 w-full min-w-0 rounded-md border border-input bg-card px-3 py-2 text-base leading-6 text-card-foreground shadow-control ring-offset-background transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-destructive/20 md:text-sm",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";
`,
    ),
    file(
      "apps/web/src/components/ui/label.tsx",
      `"use client";

import * as React from "react";
import { cn } from "../../lib/utils.js";

export interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {}

export const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, ...props }, ref) => (
    <label
      ref={ref}
      data-slot="label"
      className={cn(
        "text-sm font-medium leading-5 text-foreground peer-disabled:cursor-not-allowed peer-disabled:opacity-70 data-[invalid=true]:text-destructive",
        className,
      )}
      {...props}
    />
  ),
);
Label.displayName = "Label";
`,
    ),
    ...fieldFiles(),
    formSubmitFile(),
    file(
      "apps/web/src/components/ui/form-context.tsx",
      `"use client";

import { createFormHookContexts } from "@tanstack/react-form";

export const { fieldContext, formContext, useFieldContext, useFormContext } =
  createFormHookContexts();
`,
    ),
    file(
      "apps/web/src/components/ui/form.tsx",
      `"use client";

import * as React from "react";
import {
  createFormHook,
  Field as TanStackField,
  useForm,
  useStore,
} from "@tanstack/react-form";
import {
  AppCheckboxField,
  AppOtpField,
  AppPasswordField,
  AppSelectField,
  AppTextAreaField,
  AppTextField,
} from "../form-fields/index.js";
import { cn } from "../../lib/utils.js";
import { useSurfaceTranslations } from "../../lib/translations.js";
import { Alert, AlertDescription, AlertTitle } from "./alert.js";
import { Button } from "./button.js";
import { fieldContext, formContext } from "./form-context.js";
import { AppFormSubmitButton } from "./form-submit.js";
export { SubmitButton, AppFormSubmitButton, type SubmitButtonProps, type AppFormSubmitButtonProps } from "./form-submit.js";

export { TanStackField as Field, useForm, useStore };
export { useFieldContext, useFormContext } from "./form-context.js";

export interface FormController {
  handleSubmit(): Promise<void> | void;
}

export interface FormProps {
  form: FormController;
  onSubmit?: (event: React.FormEvent<HTMLFormElement>) => void;
  children: React.ReactNode;
  className?: string;
}

const subscribeToHydration = () => () => undefined;
const clientSnapshot = () => true;
const serverSnapshot = () => false;

export function Form({ form, onSubmit, children, className }: FormProps): React.JSX.Element {
  const t = useSurfaceTranslations("errors");
  const common = useSurfaceTranslations("common");
  const clientReady = React.useSyncExternalStore(subscribeToHydration, clientSnapshot, serverSnapshot);
  const inFlight = React.useRef(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [submitFailed, setSubmitFailed] = React.useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    if (!clientReady || inFlight.current) return;
    inFlight.current = true;
    setIsSubmitting(true);
    try {
      const outcomes = await Promise.allSettled([
        Promise.resolve().then(() => form.handleSubmit()),
        Promise.resolve().then(() => onSubmit?.(event)),
      ]);
      setSubmitFailed(outcomes.some((outcome) => outcome.status === "rejected"));
    } finally {
      inFlight.current = false;
      setIsSubmitting(false);
    }
  }

  return (
    <form
      method="post"
      noValidate
      data-slot="form"
      aria-busy={!clientReady || isSubmitting}
      className={cn("flex flex-col gap-6", className)}
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void submit(event);
      }}
    >
      {!clientReady ? <p role="status" className="text-sm text-muted-foreground">{common("formPreparing")}</p> : null}
      <noscript><p className="text-sm text-muted-foreground">{common("formJavaScriptRequired")}</p></noscript>
      <fieldset className="contents" disabled={!clientReady}>
      {children}
      {submitFailed ? <Alert role="alert" variant="destructive">
        <AlertTitle>{t("genericTitle")}</AlertTitle>
        <AlertDescription>{t("genericDescription")}</AlertDescription>
        <Button type="submit" variant="outline" size="sm" disabled={isSubmitting}>
          {isSubmitting ? common("loading") : t("retry")}
        </Button>
      </Alert> : null}
      </fieldset>
    </form>
  );
}

export const {
  extendForm,
  useAppForm,
  useTypedAppFormContext,
  withFieldGroup,
  withForm,
} = createFormHook({
  fieldContext,
  formContext,
  fieldComponents: {
    CheckboxField: AppCheckboxField,
    OtpField: AppOtpField,
    PasswordField: AppPasswordField,
    SelectField: AppSelectField,
    TextAreaField: AppTextAreaField,
    TextField: AppTextField,
  },
  formComponents: {
    SubmitButton: AppFormSubmitButton,
  },
});
`,
    ),
  ];
}
