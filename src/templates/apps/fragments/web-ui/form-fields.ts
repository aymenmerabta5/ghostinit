import { file, type TemplateFile } from "../../../shared.js";

// Stagio: form-fields composition over raw ui primitives — TanStack Form friendly
export function formFieldsFiles(base = "apps/web/src"): TemplateFile[] {
  const textField = `"use client";
import * as React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export interface TextFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  description?: string;
}

export const TextField = React.forwardRef<HTMLInputElement, TextFieldProps>(({ label, error, description, className, id, ...props }, ref) => {
  const autoId = React.useId();
  const fieldId = id ?? autoId;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label && <Label htmlFor={fieldId} data-invalid={!!error}>{label}</Label>}
      <Input id={fieldId} ref={ref} aria-invalid={!!error} aria-describedby={description ? \`\${fieldId}-desc\` : undefined} {...props} />
      {description && !error && <p id={\`\${fieldId}-desc\`} className="text-xs text-muted-foreground">{description}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
});
TextField.displayName = "TextField";
`;

  const textArea = `"use client";
import * as React from "react";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export interface TextAreaFieldProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  description?: string;
}

export const TextAreaField = React.forwardRef<HTMLTextAreaElement, TextAreaFieldProps>(({ label, error, description, className, id, ...props }, ref) => {
  const autoId = React.useId();
  const fieldId = id ?? autoId;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label && <Label htmlFor={fieldId} data-invalid={!!error}>{label}</Label>}
      <Textarea id={fieldId} ref={ref} aria-invalid={!!error} {...props} />
      {description && !error && <p className="text-xs text-muted-foreground">{description}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
});
TextAreaField.displayName = "TextAreaField";
`;

  const selectField = `"use client";
import * as React from "react";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";

export interface SelectFieldProps {
  label?: string;
  error?: string;
  description?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  options: ReadonlyArray<{ value: string; label: string; disabled?: boolean }>;
  className?: string;
  id?: string;
  disabled?: boolean;
}

export function SelectField({ label, error, description, value, onValueChange, placeholder, options, className, id, disabled }: SelectFieldProps) {
  const autoId = React.useId();
  const fieldId = id ?? autoId;
  const descriptionId = \`\${fieldId}-description\`;
  const errorId = \`\${fieldId}-error\`;
  const describedBy = [description ? descriptionId : null, error ? errorId : null]
    .filter((value): value is string => value !== null)
    .join(" ") || undefined;
  return (
    <Field className={className} data-invalid={Boolean(error)} data-disabled={disabled || undefined}>
      {label ? <FieldLabel htmlFor={fieldId}>{label}</FieldLabel> : null}
      <Select items={options} value={value} onValueChange={onValueChange} disabled={disabled} placeholder={placeholder}>
        <SelectTrigger id={fieldId} aria-invalid={Boolean(error)} aria-describedby={describedBy}>
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
      {description ? <FieldDescription id={descriptionId}>{description}</FieldDescription> : null}
      {error ? <FieldDescription id={errorId}>{error}</FieldDescription> : null}
    </Field>
  );
}
`;

  const passwordField = `"use client";
import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel, InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/field";

export interface PasswordFieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: string;
  error?: string;
  description?: string;
  ref?: React.Ref<HTMLInputElement>;
}

export function PasswordField({ label, error, description, className, id, ref, ...props }: PasswordFieldProps): React.JSX.Element {
  const [show, setShow] = React.useState(false);
  const autoId = React.useId();
  const fieldId = id ?? autoId;
  const descriptionId = \`\${fieldId}-description\`;
  const errorId = \`\${fieldId}-error\`;
  const describedBy = [description ? descriptionId : null, error ? errorId : null]
    .filter((value): value is string => value !== null)
    .join(" ") || undefined;
  return (
    <Field className={className} data-invalid={Boolean(error)}>
      {label ? <FieldLabel htmlFor={fieldId}>{label}</FieldLabel> : null}
      <InputGroup>
        <InputGroupInput
          id={fieldId}
          ref={ref}
          type={show ? "text" : "password"}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          {...props}
        />
        <InputGroupAddon>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setShow((visible) => !visible)}
            aria-label={show ? "Hide password" : "Show password"}
          >
            {show ? <EyeOff data-icon="inline-start" aria-hidden /> : <Eye data-icon="inline-start" aria-hidden />}
          </Button>
        </InputGroupAddon>
      </InputGroup>
      {description ? <FieldDescription id={descriptionId}>{description}</FieldDescription> : null}
      {error ? <FieldDescription id={errorId}>{error}</FieldDescription> : null}
    </Field>
  );
}
`;

  const checkboxField = `"use client";
import * as React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export interface CheckboxFieldProps {
  label?: string;
  error?: string;
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  className?: string;
  id?: string;
  description?: string;
}

export function CheckboxField({ label, error, checked, onCheckedChange, className, id, description }: CheckboxFieldProps) {
  const autoId = React.useId();
  const fieldId = id ?? autoId;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-center gap-2">
        <Checkbox id={fieldId} checked={checked} onCheckedChange={(v) => onCheckedChange?.(v === true)} aria-invalid={!!error} />
        {label && <Label htmlFor={fieldId} className="font-normal cursor-pointer">{label}</Label>}
      </div>
      {description && !error && <p className="text-xs text-muted-foreground ms-6">{description}</p>}
      {error && <p className="text-xs text-destructive ms-6">{error}</p>}
    </div>
  );
}
`;

  const formSection = `import * as React from "react";
import { cn } from "@/lib/utils";

export function FormSection({ title, description, children, className }: { title?: string; description?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("space-y-4 rounded-lg border p-4", className)}>
      {(title || description) && (
        <div className="space-y-1">
          {title && <h3 className="font-semibold leading-none tracking-tight">{title}</h3>}
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
      )}
      <div className="space-y-4">{children}</div>
    </section>
  );
}
`;

  const index = `export { TextField } from "./TextField";
export { TextAreaField } from "./TextAreaField";
export { SelectField } from "./SelectField";
export { PasswordField } from "./PasswordField";
export { CheckboxField } from "./CheckboxField";
export { FormSection } from "./FormSection";
`;

  return [
    file(`${base}/components/form-fields/TextField.tsx`, textField),
    file(`${base}/components/form-fields/TextAreaField.tsx`, textArea),
    file(`${base}/components/form-fields/SelectField.tsx`, selectField),
    file(`${base}/components/form-fields/PasswordField.tsx`, passwordField),
    file(`${base}/components/form-fields/CheckboxField.tsx`, checkboxField),
    file(`${base}/components/form-fields/FormSection.tsx`, formSection),
    file(`${base}/components/form-fields/index.ts`, index),
  ];
}
