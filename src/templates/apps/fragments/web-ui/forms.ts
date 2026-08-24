import { file, type TemplateFile } from "../../../shared.js";

export function formsFiles(): TemplateFile[] {
  return [
    file(
      "apps/web/src/components/ui/input.tsx",
      `"use client";

import * as React from "react";
import { cn } from "../../lib/utils.js";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        data-slot="input"
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-destructive/20",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
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
    file(
      "apps/web/src/components/ui/field.tsx",
      `"use client";

import * as React from "react";
import { cn } from "../../lib/utils.js";

export const FieldGroup = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="field-group"
      className={cn("@container/field-group flex flex-col gap-6", className)}
      {...props}
    />
  ),
);
FieldGroup.displayName = "FieldGroup";

export interface FieldProps extends React.HTMLAttributes<HTMLDivElement> {
  "data-invalid"?: boolean;
}

export const Field = React.forwardRef<HTMLDivElement, FieldProps>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="field"
    data-invalid={props["data-invalid"] ? "true" : undefined}
    className={cn("group/field flex w-full flex-col gap-2 data-[invalid=true]:text-destructive", className)}
    {...props}
  />
));
Field.displayName = "Field";

export const FieldContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} data-slot="field-content" className={cn("flex flex-1 flex-col gap-1.5", className)} {...props} />
  ),
);
FieldContent.displayName = "FieldContent";

export const FieldLabel = React.forwardRef<HTMLLabelElement, React.LabelHTMLAttributes<HTMLLabelElement>>(
  ({ className, ...props }, ref) => (
    <label
      ref={ref}
      data-slot="field-label"
      className={cn(
        "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 group-data-[invalid=true]/field:text-destructive",
        className,
      )}
      {...props}
    />
  ),
);
FieldLabel.displayName = "FieldLabel";

export const FieldDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p
      ref={ref}
      data-slot="field-description"
      className={cn("text-[0.8rem] text-muted-foreground group-data-[invalid=true]/field:text-destructive", className)}
      {...props}
    />
  ),
);
FieldDescription.displayName = "FieldDescription";

export const FieldError = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, children, ...props }, ref) => {
    if (!children) return null;
    return (
      <p
        ref={ref}
        data-slot="field-error"
        className={cn("text-[0.8rem] font-medium text-destructive", className)}
        {...props}
      >
        {children}
      </p>
    );
  },
);
FieldError.displayName = "FieldError";

export const FieldSet = React.forwardRef<HTMLFieldSetElement, React.FieldsetHTMLAttributes<HTMLFieldSetElement>>(
  ({ className, ...props }, ref) => (
    <fieldset ref={ref} data-slot="field-set" className={cn("flex flex-col gap-6", className)} {...props} />
  ),
);
FieldSet.displayName = "FieldSet";

export const FieldLegend = React.forwardRef<HTMLLegendElement, React.HTMLAttributes<HTMLLegendElement>>(
  ({ className, ...props }, ref) => (
    <legend ref={ref} data-slot="field-legend" className={cn("text-sm font-medium leading-none", className)} {...props} />
  ),
);
FieldLegend.displayName = "FieldLegend";

export const InputGroup = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="input-group"
      className={cn(
        "flex items-center rounded-md border border-input bg-background shadow-sm transition-colors focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:border-ring has-[[aria-invalid=true]]:border-destructive has-[[aria-invalid=true]]:ring-destructive/20",
        className,
      )}
      {...props}
    />
  ),
);
InputGroup.displayName = "InputGroup";

export const InputGroupInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      data-slot="input-group-input"
      className={cn(
        "flex h-9 w-full bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  ),
);
InputGroupInput.displayName = "InputGroupInput";

export const InputGroupAddon = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} data-slot="input-group-addon" className={cn("flex items-center px-3 text-sm text-muted-foreground", className)} {...props} />
  ),
);
InputGroupAddon.displayName = "InputGroupAddon";

export const ToggleGroup = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="toggle-group"
      className={cn("inline-flex items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground", className)}
      {...props}
    />
  ),
);
ToggleGroup.displayName = "ToggleGroup";

export const ToggleGroupItem = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { "data-state"?: "on" | "off" }
>(({ className, ...props }, ref) => (
  <button
    ref={ref}
    data-slot="toggle-group-item"
    className={cn(
      "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm data-[active]:bg-background data-[active]:text-foreground data-[active]:shadow-sm",
      className,
    )}
    {...props}
  />
));
ToggleGroupItem.displayName = "ToggleGroupItem";
`,
    ),
    file(
      "apps/web/src/components/ui/form.tsx",
      `"use client";

import * as React from "react";
import { Field, useForm } from "@tanstack/react-form";
import { Button, type ButtonProps } from "./button.js";
import { cn } from "../../lib/utils.js";

export { Field, useForm };

export interface FormController {
  handleSubmit(): Promise<void>;
}

export interface FormProps {
  form: FormController;
  onSubmit?: (event: React.FormEvent<HTMLFormElement>) => void;
  children: React.ReactNode;
  className?: string;
}

export function Form({
  form,
  onSubmit,
  children,
  className,
}: FormProps): React.JSX.Element {
  return (
    <form
      data-slot="form"
      className={cn("flex flex-col gap-6", className)}
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void form.handleSubmit();
        onSubmit?.(e);
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
  return <Button type="submit" ref={ref} data-slot="form-submit" {...props} />;
}
`,
    ),
  ];
}
