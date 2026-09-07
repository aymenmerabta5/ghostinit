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
        "flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-destructive/20",
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
        "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 data-[invalid=true]:text-destructive",
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
import { Button, type ButtonProps } from "./button.js";
import { fieldContext, formContext, useFormContext } from "./form-context.js";
import { Spinner } from "./spinner.js";

export { TanStackField as Field, useForm };
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

export function Form({ form, onSubmit, children, className }: FormProps): React.JSX.Element {
  return (
    <form
      data-slot="form"
      className={cn("flex flex-col gap-6", className)}
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
        onSubmit?.(event);
      }}
    >
      {children}
    </form>
  );
}

export interface SubmitButtonProps extends ButtonProps {
  ref?: React.Ref<HTMLButtonElement>;
}

export function SubmitButton({ ref, ...props }: SubmitButtonProps): React.JSX.Element {
  return <Button ref={ref} type="submit" data-slot="form-submit" {...props} />;
}

export interface AppFormSubmitButtonProps extends Omit<SubmitButtonProps, "disabled"> {
  pendingLabel?: React.ReactNode;
}

export function AppFormSubmitButton({
  children,
  pendingLabel = "Submitting…",
  ...props
}: AppFormSubmitButtonProps): React.JSX.Element {
  const form = useFormContext();
  return (
    <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting] as const}>
      {([canSubmit, isSubmitting]) => (
        <SubmitButton
          disabled={!canSubmit || isSubmitting}
          aria-busy={isSubmitting}
          {...props}
        >
          {isSubmitting ? <Spinner data-icon="inline-start" /> : null}
          {isSubmitting ? pendingLabel : children}
        </SubmitButton>
      )}
    </form.Subscribe>
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
