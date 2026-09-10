import { file, type TemplateFile } from "../../../shared.js";

export function desktopFormFieldFiles(sourceRoot: string): TemplateFile[] {
  return [
    file(
      `${sourceRoot}/components/form-fields/field-shared.ts`,
      `import type * as React from "react";
export interface FieldLabelProps { label: React.ReactNode; description?: React.ReactNode }
export function firstError(errors: readonly unknown[]): string | undefined {
  for (const error of errors) {
    if (typeof error === "string" && error) return error;
    if (error instanceof Error) return error.message;
    if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
  }
  return undefined;
}
`,
    ),
    file(
      `${sourceRoot}/components/form-fields/text-field.tsx`,
      `import * as React from "react";
import { useFieldContext } from "../ui/form-context";
import { Field, FieldDescription, FieldError, FieldLabel } from "../ui/field";
import { firstError, type FieldLabelProps } from "./field-shared";
import { Input } from "../ui/input";
export function TextField({ label, description, ...props }: FieldLabelProps & Omit<React.ComponentProps<typeof Input>, "value" | "onChange" | "onBlur">): React.JSX.Element {
  const field = useFieldContext<string>();
  const generatedId = React.useId();
  const id = props.id ?? generatedId;
  const error = firstError(field.state.meta.errors);
  return <Field data-invalid={Boolean(error)}><FieldLabel htmlFor={id}>{label}</FieldLabel><Input {...props} id={id} name={field.name} value={field.state.value} onChange={(event) => field.handleChange(event.target.value)} onBlur={field.handleBlur} aria-invalid={Boolean(error)} aria-describedby={description ? id + "-description" : undefined} aria-errormessage={error ? id + "-error" : undefined} />{description ? <FieldDescription id={id + "-description"}>{description}</FieldDescription> : null}<FieldError id={id + "-error"}>{error}</FieldError></Field>;
}
export function PasswordField(props: FieldLabelProps & Omit<React.ComponentProps<typeof Input>, "value" | "onChange" | "onBlur">): React.JSX.Element {
  return <TextField {...props} type="password" />;
}
export function OtpField({ length = 6, ...props }: FieldLabelProps & Omit<React.ComponentProps<typeof Input>, "value" | "onChange" | "onBlur"> & { length?: number }): React.JSX.Element {
  return <TextField {...props} inputMode="numeric" autoComplete="one-time-code" minLength={length} maxLength={length} />;
}
`,
    ),
    file(
      `${sourceRoot}/components/form-fields/textarea-field.tsx`,
      `import * as React from "react";
import { useFieldContext } from "../ui/form-context";
import { Field, FieldDescription, FieldError, FieldLabel } from "../ui/field";
import { firstError, type FieldLabelProps } from "./field-shared";
import { Textarea } from "../ui/textarea";
export function TextAreaField({ label, description, ...props }: FieldLabelProps & Omit<React.ComponentProps<typeof Textarea>, "value" | "onChange" | "onBlur">): React.JSX.Element {
  const field = useFieldContext<string>();
  const generatedId = React.useId();
  const id = props.id ?? generatedId;
  const error = firstError(field.state.meta.errors);
  return <Field data-invalid={Boolean(error)}><FieldLabel htmlFor={id}>{label}</FieldLabel><Textarea {...props} id={id} name={field.name} value={field.state.value} onChange={(event) => field.handleChange(event.target.value)} onBlur={field.handleBlur} aria-invalid={Boolean(error)} aria-describedby={description ? id + "-description" : undefined} aria-errormessage={error ? id + "-error" : undefined} />{description ? <FieldDescription id={id + "-description"}>{description}</FieldDescription> : null}<FieldError id={id + "-error"}>{error}</FieldError></Field>;
}
`,
    ),
    file(
      `${sourceRoot}/components/form-fields/select-field.tsx`,
      `import * as React from "react";
import { useFieldContext } from "../ui/form-context";
import { Field, FieldDescription, FieldError, FieldLabel } from "../ui/field";
import { firstError, type FieldLabelProps } from "./field-shared";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
export function SelectField({ label, description, options, disabled }: FieldLabelProps & { options: readonly { value: string; label: string }[]; disabled?: boolean }): React.JSX.Element {
  const field = useFieldContext<string>();
  const id = React.useId();
  const error = firstError(field.state.meta.errors);
  return <Field data-invalid={Boolean(error)}><FieldLabel id={id + "-label"}>{label}</FieldLabel><Select items={options} value={field.state.value} onValueChange={(value) => { if (typeof value === "string") field.handleChange(value); }} disabled={disabled}><SelectTrigger aria-labelledby={id + "-label"} aria-invalid={Boolean(error)} onBlur={field.handleBlur}><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectGroup></SelectContent></Select>{description ? <FieldDescription>{description}</FieldDescription> : null}<FieldError>{error}</FieldError></Field>;
}
`,
    ),
    file(
      `${sourceRoot}/components/form-fields/checkbox-field.tsx`,
      `import * as React from "react";
import { useFieldContext } from "../ui/form-context";
import { Checkbox } from "../ui/checkbox";
import { Field, FieldDescription, FieldError, FieldLabel } from "../ui/field";
import { firstError, type FieldLabelProps } from "./field-shared";
export function CheckboxField({ label, description, disabled }: FieldLabelProps & { disabled?: boolean }): React.JSX.Element {
  const field = useFieldContext<boolean>();
  const id = React.useId();
  const error = firstError(field.state.meta.errors);
  return <Field><div className="flex items-center gap-2"><Checkbox id={id} name={field.name} checked={field.state.value} disabled={disabled} onCheckedChange={(checked) => field.handleChange(checked)} onBlur={field.handleBlur} aria-invalid={Boolean(error)} /><FieldLabel htmlFor={id}>{label}</FieldLabel></div>{description ? <FieldDescription>{description}</FieldDescription> : null}<FieldError>{error}</FieldError></Field>;
}

`,
    ),
  ];
}
