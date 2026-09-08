// @allow-long 715: one renderer emits seven small form-field modules with a shared accessibility contract
import { file, type TemplateFile } from "../../../shared.js";

export function formFieldsFiles(base = "apps/web/src"): TemplateFile[] {
  const fieldHelpers = `"use client";

import * as React from "react";
import { FieldDescription, FieldError } from "@/components/ui/field";

export interface FieldIds {
  controlId: string;
  descriptionId: string;
  errorId: string;
}

export function useFieldIds(id?: string): FieldIds {
  const generatedId = React.useId();
  const controlId = id ?? "field-" + generatedId.replaceAll(":", "");
  return {
    controlId,
    descriptionId: controlId + "-description",
    errorId: controlId + "-error",
  };
}

export function firstFieldError(errors: readonly unknown[]): string | undefined {
  for (const error of errors) {
    if (typeof error === "string" && error.length > 0) return error;
    if (error instanceof Error && error.message.length > 0) return error.message;
    if (typeof error === "object" && error !== null) {
      const message = Reflect.get(error, "message");
      if (typeof message === "string" && message.length > 0) return message;
    }
  }
  return undefined;
}

export interface FieldMessagesProps {
  description?: React.ReactNode;
  descriptionId: string;
  error?: React.ReactNode;
  errorId: string;
}

export function FieldMessages({
  description,
  descriptionId,
  error,
  errorId,
}: FieldMessagesProps): React.JSX.Element {
  return (
    <>
      {description ? (
        <FieldDescription id={descriptionId}>{description}</FieldDescription>
      ) : null}
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
    </>
  );
}

export function fieldDescriptionIds(
  ids: FieldIds,
  hasDescription: boolean,
  hasError: boolean,
): string | undefined {
  const describedBy = [hasDescription ? ids.descriptionId : undefined, hasError ? ids.errorId : undefined]
    .filter((value): value is string => value !== undefined)
    .join(" ");
  return describedBy.length > 0 ? describedBy : undefined;
}
`;

  const textField = `"use client";

import * as React from "react";
import { Field, FieldLabel } from "@/components/ui/field";
import { useFieldContext } from "@/components/ui/form-context";
import { Input } from "@/components/ui/input";
import {
  FieldMessages,
  fieldDescriptionIds,
  firstFieldError,
  useFieldIds,
} from "./field-helpers";

export interface TextFieldProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "className"> {
  className?: string;
  description?: React.ReactNode;
  error?: React.ReactNode;
  label?: React.ReactNode;
}

export const TextField = React.forwardRef<HTMLInputElement, TextFieldProps>(
  ({ className, description, disabled, error, id, label, ...props }, ref) => {
    const ids = useFieldIds(id);
    const invalid = Boolean(error);
    const describedBy = fieldDescriptionIds(ids, Boolean(description), invalid);
    return (
      <Field className={className} data-disabled={disabled || undefined} data-invalid={invalid}>
        {label ? <FieldLabel htmlFor={ids.controlId}>{label}</FieldLabel> : null}
        <Input
          {...props}
          ref={ref}
          id={ids.controlId}
          disabled={disabled}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          aria-errormessage={invalid ? ids.errorId : undefined}
        />
        <FieldMessages
          description={description}
          descriptionId={ids.descriptionId}
          error={error}
          errorId={ids.errorId}
        />
      </Field>
    );
  },
);
TextField.displayName = "TextField";

export type AppTextFieldProps = Omit<
  TextFieldProps,
  "defaultValue" | "error" | "name" | "onBlur" | "onChange" | "value"
>;

export function AppTextField(props: AppTextFieldProps): React.JSX.Element {
  const field = useFieldContext<string>();
  return (
    <TextField
      {...props}
      name={field.name}
      value={field.state.value}
      error={firstFieldError(field.state.meta.errors)}
      onBlur={field.handleBlur}
      onChange={(event) => field.handleChange(event.target.value)}
    />
  );
}
`;

  const textArea = `"use client";

import * as React from "react";
import { Field, FieldLabel } from "@/components/ui/field";
import { useFieldContext } from "@/components/ui/form-context";
import { Textarea } from "@/components/ui/textarea";
import {
  FieldMessages,
  fieldDescriptionIds,
  firstFieldError,
  useFieldIds,
} from "./field-helpers";

export interface TextAreaFieldProps
  extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "className"> {
  className?: string;
  description?: React.ReactNode;
  error?: React.ReactNode;
  label?: React.ReactNode;
}

export const TextAreaField = React.forwardRef<HTMLTextAreaElement, TextAreaFieldProps>(
  ({ className, description, disabled, error, id, label, ...props }, ref) => {
    const ids = useFieldIds(id);
    const invalid = Boolean(error);
    const describedBy = fieldDescriptionIds(ids, Boolean(description), invalid);
    return (
      <Field className={className} data-disabled={disabled || undefined} data-invalid={invalid}>
        {label ? <FieldLabel htmlFor={ids.controlId}>{label}</FieldLabel> : null}
        <Textarea
          {...props}
          ref={ref}
          id={ids.controlId}
          disabled={disabled}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          aria-errormessage={invalid ? ids.errorId : undefined}
        />
        <FieldMessages
          description={description}
          descriptionId={ids.descriptionId}
          error={error}
          errorId={ids.errorId}
        />
      </Field>
    );
  },
);
TextAreaField.displayName = "TextAreaField";

export type AppTextAreaFieldProps = Omit<
  TextAreaFieldProps,
  "defaultValue" | "error" | "name" | "onBlur" | "onChange" | "value"
>;

export function AppTextAreaField(props: AppTextAreaFieldProps): React.JSX.Element {
  const field = useFieldContext<string>();
  return (
    <TextAreaField
      {...props}
      name={field.name}
      value={field.state.value}
      error={firstFieldError(field.state.meta.errors)}
      onBlur={field.handleBlur}
      onChange={(event) => field.handleChange(event.target.value)}
    />
  );
}
`;

  const selectField = `"use client";

import * as React from "react";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { useFieldContext } from "@/components/ui/form-context";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  fieldDescriptionIds,
  firstFieldError,
  useFieldIds,
} from "./field-helpers";

export interface SelectFieldOption {
  disabled?: boolean;
  label: string;
  value: string;
}

export interface SelectFieldProps {
  className?: string;
  description?: React.ReactNode;
  disabled?: boolean;
  error?: React.ReactNode;
  id?: string;
  label?: React.ReactNode;
  name?: string;
  onBlur?: React.FocusEventHandler<HTMLButtonElement>;
  onValueChange?: (value: string) => void;
  options: readonly SelectFieldOption[];
  placeholder?: string;
  ref?: React.Ref<HTMLButtonElement>;
  value?: string;
}

export function SelectField({
  className,
  description,
  disabled,
  error,
  id,
  label,
  name,
  onBlur,
  onValueChange,
  options,
  placeholder,
  ref,
  value,
}: SelectFieldProps): React.JSX.Element {
  const ids = useFieldIds(id);
  const invalid = Boolean(error);
  const describedBy = fieldDescriptionIds(ids, Boolean(description), invalid);
  return (
    <Field className={className} data-disabled={disabled || undefined} data-invalid={invalid}>
      {label ? <FieldLabel htmlFor={ids.controlId}>{label}</FieldLabel> : null}
      <Select items={options}
        name={name}
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        placeholder={placeholder}
      >
        <SelectTrigger
          ref={ref}
          id={ids.controlId}
          onBlur={onBlur}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          aria-errormessage={invalid ? ids.errorId : undefined}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value} disabled={option.disabled}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      {description ? (
        <FieldDescription id={ids.descriptionId}>{description}</FieldDescription>
      ) : null}
      {error ? <FieldError id={ids.errorId}>{error}</FieldError> : null}
    </Field>
  );
}

export type AppSelectFieldProps = Omit<
  SelectFieldProps,
  "error" | "name" | "onBlur" | "onValueChange" | "value"
>;

export function AppSelectField(props: AppSelectFieldProps): React.JSX.Element {
  const field = useFieldContext<string>();
  return (
    <SelectField
      {...props}
      name={field.name}
      value={field.state.value}
      error={firstFieldError(field.state.meta.errors)}
      onBlur={field.handleBlur}
      onValueChange={field.handleChange}
    />
  );
}
`;

  const passwordField = `"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldLabel,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/field";
import { useFieldContext } from "@/components/ui/form-context";
import { useSurfaceTranslations } from "@/lib/translations";
import {
  FieldMessages,
  fieldDescriptionIds,
  firstFieldError,
  useFieldIds,
} from "./field-helpers";

export interface PasswordFieldProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "className" | "type"> {
  className?: string;
  description?: React.ReactNode;
  error?: React.ReactNode;
  label?: React.ReactNode;
  ref?: React.Ref<HTMLInputElement>;
}

export function PasswordField({ label, error, description, className, id, disabled, ref, ...props }: PasswordFieldProps): React.JSX.Element {
  const t = useSurfaceTranslations("common");
  const [show, setShow] = React.useState(false);
  const ids = useFieldIds(id);
  const invalid = Boolean(error);
  const describedBy = fieldDescriptionIds(ids, Boolean(description), invalid);
  return (
    <Field className={className} data-invalid={invalid} data-disabled={disabled || undefined}>
      {label ? <FieldLabel htmlFor={ids.controlId}>{label}</FieldLabel> : null}
      <InputGroup data-disabled={disabled || undefined}>
        <InputGroupInput
          {...props}
          id={ids.controlId}
          ref={ref}
          type={show ? "text" : "password"}
          disabled={disabled}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          aria-errormessage={invalid ? ids.errorId : undefined}
        />
        <InputGroupAddon>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={disabled}
            aria-controls={ids.controlId}
            aria-label={show ? t("hidePassword") : t("showPassword")}
            aria-pressed={show}
            onClick={() => setShow((visible) => !visible)}
          >
            {show ? (
              <EyeOff data-icon="inline-start" aria-hidden />
            ) : (
              <Eye data-icon="inline-start" aria-hidden />
            )}
          </Button>
        </InputGroupAddon>
      </InputGroup>
      <FieldMessages
        description={description}
        descriptionId={ids.descriptionId}
        error={error}
        errorId={ids.errorId}
      />
    </Field>
  );
}

export type AppPasswordFieldProps = Omit<
  PasswordFieldProps,
  "defaultValue" | "error" | "name" | "onBlur" | "onChange" | "value"
>;

export function AppPasswordField(props: AppPasswordFieldProps): React.JSX.Element {
  const field = useFieldContext<string>();
  return (
    <PasswordField
      {...props}
      name={field.name}
      value={field.state.value}
      error={firstFieldError(field.state.meta.errors)}
      onBlur={field.handleBlur}
      onChange={(event) => field.handleChange(event.target.value)}
    />
  );
}
`;

  const checkboxField = `"use client";

import * as React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldContent, FieldLabel } from "@/components/ui/field";
import { useFieldContext } from "@/components/ui/form-context";
import {
  FieldMessages,
  fieldDescriptionIds,
  firstFieldError,
  useFieldIds,
} from "./field-helpers";

export interface CheckboxFieldProps {
  checked?: boolean;
  className?: string;
  description?: React.ReactNode;
  disabled?: boolean;
  error?: React.ReactNode;
  id?: string;
  label?: React.ReactNode;
  name?: string;
  onBlur?: React.ComponentPropsWithoutRef<typeof Checkbox>["onBlur"];
  onCheckedChange?: (checked: boolean) => void;
  ref?: React.Ref<HTMLButtonElement>;
  required?: boolean;
  value?: string;
}

export function CheckboxField({
  checked,
  className,
  description,
  disabled,
  error,
  id,
  label,
  name,
  onBlur,
  onCheckedChange,
  ref,
  required,
  value,
}: CheckboxFieldProps): React.JSX.Element {
  const ids = useFieldIds(id);
  const invalid = Boolean(error);
  const describedBy = fieldDescriptionIds(ids, Boolean(description), invalid);
  return (
    <Field
      className={className}
      orientation="horizontal"
      data-disabled={disabled || undefined}
      data-invalid={invalid}
    >
      <Checkbox
        ref={ref}
        id={ids.controlId}
        name={name}
        value={value}
        checked={checked}
        required={required}
        disabled={disabled}
        onBlur={onBlur}
        onCheckedChange={onCheckedChange}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        aria-errormessage={invalid ? ids.errorId : undefined}
      />
      {label || description || error ? (
        <FieldContent>
          {label ? <FieldLabel htmlFor={ids.controlId}>{label}</FieldLabel> : null}
          <FieldMessages
            description={description}
            descriptionId={ids.descriptionId}
            error={error}
            errorId={ids.errorId}
          />
        </FieldContent>
      ) : null}
    </Field>
  );
}

export type AppCheckboxFieldProps = Omit<
  CheckboxFieldProps,
  "checked" | "error" | "name" | "onBlur" | "onCheckedChange"
>;

export function AppCheckboxField(props: AppCheckboxFieldProps): React.JSX.Element {
  const field = useFieldContext<boolean>();
  return (
    <CheckboxField
      {...props}
      name={field.name}
      checked={field.state.value}
      error={firstFieldError(field.state.meta.errors)}
      onBlur={field.handleBlur}
      onCheckedChange={field.handleChange}
    />
  );
}
`;

  const otpField = `"use client";

import * as React from "react";
import { Field, FieldLabel } from "@/components/ui/field";
import { useFieldContext } from "@/components/ui/form-context";
import { Input } from "@/components/ui/input";
import {
  FieldMessages,
  fieldDescriptionIds,
  firstFieldError,
  useFieldIds,
} from "./field-helpers";

export interface OtpFieldProps
  extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    "className" | "maxLength" | "onChange" | "type" | "value"
  > {
  className?: string;
  description?: React.ReactNode;
  error?: React.ReactNode;
  label?: React.ReactNode;
  length?: number;
  onValueChange?: (value: string) => void;
  ref?: React.Ref<HTMLInputElement>;
  value?: string;
}

export function OtpField({
  autoComplete = "one-time-code",
  className,
  description,
  disabled,
  error,
  id,
  inputMode = "numeric",
  label,
  length = 6,
  onValueChange,
  pattern = "[0-9]*",
  ref,
  value,
  ...props
}: OtpFieldProps): React.JSX.Element {
  const ids = useFieldIds(id);
  const invalid = Boolean(error);
  const describedBy = fieldDescriptionIds(ids, Boolean(description), invalid);
  return (
    <Field className={className} data-disabled={disabled || undefined} data-invalid={invalid}>
      {label ? <FieldLabel htmlFor={ids.controlId}>{label}</FieldLabel> : null}
      <Input
        {...props}
        ref={ref}
        id={ids.controlId}
        type="text"
        inputMode={inputMode}
        pattern={pattern}
        autoComplete={autoComplete}
        maxLength={length}
        value={value}
        disabled={disabled}
        onChange={(event) => onValueChange?.(event.target.value)}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        aria-errormessage={invalid ? ids.errorId : undefined}
        className="font-mono text-center tracking-[0.32em]"
      />
      <FieldMessages
        description={description}
        descriptionId={ids.descriptionId}
        error={error}
        errorId={ids.errorId}
      />
    </Field>
  );
}

export type AppOtpFieldProps = Omit<
  OtpFieldProps,
  "defaultValue" | "error" | "name" | "onBlur" | "onValueChange" | "value"
>;

export function AppOtpField(props: AppOtpFieldProps): React.JSX.Element {
  const field = useFieldContext<string>();
  return (
    <OtpField
      {...props}
      name={field.name}
      value={field.state.value}
      error={firstFieldError(field.state.meta.errors)}
      onBlur={field.handleBlur}
      onValueChange={field.handleChange}
    />
  );
}
`;

  const formSection = `import * as React from "react";
import {
  FieldDescription,
  FieldGroup,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { cn } from "@/lib/utils";

export interface FormSectionProps {
  children: React.ReactNode;
  className?: string;
  description?: React.ReactNode;
  title?: React.ReactNode;
}

export function FormSection({
  children,
  className,
  description,
  title,
}: FormSectionProps): React.JSX.Element {
  return (
    <FieldSet className={cn("gap-5 border-t border-border pt-5", className)}>
      {title ? <FieldLegend>{title}</FieldLegend> : null}
      {description ? <FieldDescription>{description}</FieldDescription> : null}
      <FieldGroup className="gap-4">{children}</FieldGroup>
    </FieldSet>
  );
}
`;

  const index = `export {
  AppTextField,
  TextField,
  type AppTextFieldProps,
  type TextFieldProps,
} from "./TextField";
export {
  AppTextAreaField,
  TextAreaField,
  type AppTextAreaFieldProps,
  type TextAreaFieldProps,
} from "./TextAreaField";
export {
  AppSelectField,
  SelectField,
  type AppSelectFieldProps,
  type SelectFieldOption,
  type SelectFieldProps,
} from "./SelectField";
export {
  AppPasswordField,
  PasswordField,
  type AppPasswordFieldProps,
  type PasswordFieldProps,
} from "./PasswordField";
export {
  AppCheckboxField,
  CheckboxField,
  type AppCheckboxFieldProps,
  type CheckboxFieldProps,
} from "./CheckboxField";
export {
  AppOtpField,
  OtpField,
  type AppOtpFieldProps,
  type OtpFieldProps,
} from "./OtpField";
export { FormSection, type FormSectionProps } from "./FormSection";
`;

  return [
    file(`${base}/components/form-fields/field-helpers.tsx`, fieldHelpers),
    file(`${base}/components/form-fields/TextField.tsx`, textField),
    file(`${base}/components/form-fields/TextAreaField.tsx`, textArea),
    file(`${base}/components/form-fields/SelectField.tsx`, selectField),
    file(`${base}/components/form-fields/PasswordField.tsx`, passwordField),
    file(`${base}/components/form-fields/CheckboxField.tsx`, checkboxField),
    file(`${base}/components/form-fields/OtpField.tsx`, otpField),
    file(`${base}/components/form-fields/FormSection.tsx`, formSection),
    file(`${base}/components/form-fields/index.ts`, index),
  ];
}
