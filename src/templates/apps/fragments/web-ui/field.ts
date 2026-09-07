import { file, type TemplateFile } from "../../../shared.js";

export function fieldFiles(): TemplateFile[] {
  return [
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
  orientation?: "horizontal" | "vertical";
  "data-disabled"?: boolean;
  "data-invalid"?: boolean;
}

export const Field = React.forwardRef<HTMLDivElement, FieldProps>(
  (
    {
      className,
      orientation = "vertical",
      "data-disabled": disabled,
      "data-invalid": invalid,
      ...props
    },
    ref,
  ) => (
    <div
      ref={ref}
      data-slot="field"
      data-orientation={orientation}
      data-disabled={disabled || undefined}
      data-invalid={invalid || undefined}
      className={cn(
        "group/field flex w-full min-w-0 flex-col gap-2 data-[orientation=horizontal]:flex-row data-[orientation=horizontal]:items-start data-[orientation=horizontal]:gap-3 data-[disabled=true]:opacity-70 data-[invalid=true]:text-destructive",
        className,
      )}
      {...props}
    />
  ),
);
Field.displayName = "Field";

export const FieldContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="field-content"
      className={cn("flex min-w-0 flex-1 flex-col gap-1.5", className)}
      {...props}
    />
  ),
);
FieldContent.displayName = "FieldContent";

export const FieldLabel = React.forwardRef<
  HTMLLabelElement,
  React.LabelHTMLAttributes<HTMLLabelElement>
>(({ className, ...props }, ref) => (
  <label
    ref={ref}
    data-slot="field-label"
    className={cn(
      "text-sm font-medium leading-5 text-foreground peer-disabled:cursor-not-allowed peer-disabled:opacity-70 group-data-[disabled=true]/field:cursor-not-allowed group-data-[invalid=true]/field:text-destructive",
      className,
    )}
    {...props}
  />
));
FieldLabel.displayName = "FieldLabel";

export const FieldDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    data-slot="field-description"
    className={cn("text-sm leading-6 text-muted-foreground", className)}
    {...props}
  />
));
FieldDescription.displayName = "FieldDescription";

export const FieldError = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, children, ...props }, ref) => {
  if (!children) return null;
  return (
    <p
      ref={ref}
      data-slot="field-error"
      aria-live="polite"
      className={cn("text-sm font-medium leading-5 text-destructive", className)}
      {...props}
    >
      {children}
    </p>
  );
});
FieldError.displayName = "FieldError";

export const FieldSet = React.forwardRef<
  HTMLFieldSetElement,
  React.FieldsetHTMLAttributes<HTMLFieldSetElement>
>(({ className, ...props }, ref) => (
  <fieldset
    ref={ref}
    data-slot="field-set"
    className={cn("flex flex-col gap-6", className)}
    {...props}
  />
));
FieldSet.displayName = "FieldSet";

export const FieldLegend = React.forwardRef<
  HTMLLegendElement,
  React.HTMLAttributes<HTMLLegendElement>
>(({ className, ...props }, ref) => (
  <legend
    ref={ref}
    data-slot="field-legend"
    className={cn("text-base font-semibold leading-6", className)}
    {...props}
  />
));
FieldLegend.displayName = "FieldLegend";

export {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupTextarea,
} from "./input-group.js";
export { ToggleGroup, ToggleGroupItem } from "./toggle-group.js";
`,
    ),
    file(
      "apps/web/src/components/ui/input-group.tsx",
      `"use client";

import * as React from "react";
import { cn } from "../../lib/utils.js";

export const InputGroup = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="input-group"
      className={cn(
        "flex min-w-0 items-center rounded-md border border-input bg-card text-card-foreground shadow-control ring-offset-background transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 has-[[aria-invalid=true]]:border-destructive has-[[aria-invalid=true]]:ring-destructive/20 data-[disabled=true]:cursor-not-allowed data-[disabled=true]:opacity-50",
        className,
      )}
      {...props}
    />
  ),
);
InputGroup.displayName = "InputGroup";

export const InputGroupInput = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    data-slot="input-group-input"
    className={cn(
      "flex h-10 w-full min-w-0 bg-transparent px-3 py-2 text-base leading-6 placeholder:text-muted-foreground focus-visible:outline-none disabled:cursor-not-allowed md:text-sm",
      className,
    )}
    {...props}
  />
));
InputGroupInput.displayName = "InputGroupInput";

export const InputGroupTextarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    data-slot="input-group-textarea"
    className={cn(
      "flex min-h-28 w-full min-w-0 resize-y bg-transparent px-3 py-2.5 text-base leading-6 placeholder:text-muted-foreground focus-visible:outline-none disabled:cursor-not-allowed md:text-sm",
      className,
    )}
    {...props}
  />
));
InputGroupTextarea.displayName = "InputGroupTextarea";

export const InputGroupAddon = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="input-group-addon"
    className={cn("flex shrink-0 items-center px-1 text-sm text-muted-foreground [&>[data-slot=button]]:size-8", className)}
    {...props}
  />
));
InputGroupAddon.displayName = "InputGroupAddon";
`,
    ),
    file(
      "apps/web/src/components/ui/toggle-group.tsx",
      `"use client";

import * as React from "react";
import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup as BaseToggleGroup } from "@base-ui/react/toggle-group";
import { cn } from "../../lib/utils.js";

export interface ToggleGroupProps extends React.ComponentPropsWithoutRef<typeof BaseToggleGroup> {
  spacing?: number;
}

export const ToggleGroup = React.forwardRef<HTMLDivElement, ToggleGroupProps>(
  ({ className, spacing = 1, style, ...props }, ref) => (
    <BaseToggleGroup
      ref={ref}
      data-slot="toggle-group"
      style={{ gap: spacing * 4, ...style }}
      className={cn(
        "inline-flex max-w-full items-center justify-center rounded-lg border border-border bg-muted p-1 text-muted-foreground",
        className,
      )}
      {...props}
    />
  ),
);
ToggleGroup.displayName = "ToggleGroup";

export const ToggleGroupItem = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<typeof Toggle>
>(({ className, ...props }, ref) => (
  <Toggle
    ref={ref}
    data-slot="toggle-group-item"
    className={cn(
      "inline-flex min-h-9 items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ring-offset-background transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-control data-[active]:bg-card data-[active]:text-foreground data-[active]:shadow-control",
      className,
    )}
    {...props}
  />
));
ToggleGroupItem.displayName = "ToggleGroupItem";
`,
    ),
  ];
}
