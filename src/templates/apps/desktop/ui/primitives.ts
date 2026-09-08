import type { DesktopMode } from "../model.js";

function desktopUiUtilitiesSpecifier(mode: DesktopMode): string {
  return mode === "monorepo" ? "@repo/ui/lib/utils" : "@/platform/ui/lib/utils";
}

export function desktopUiButtonContent(mode: DesktopMode = "monorepo"): string {
  return `import * as React from "react";
import { Button as BaseButton } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "${desktopUiUtilitiesSpecifier(mode)}";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium leading-5 ring-offset-background transition-[background-color,color,border-color,box-shadow] duration-150 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:translate-y-px motion-reduce:active:translate-y-0 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "border border-primary bg-primary text-primary-foreground shadow-control hover:bg-primary/90",
        destructive: "border border-destructive/40 bg-card text-destructive shadow-control hover:border-destructive hover:bg-destructive hover:text-destructive-foreground",
        outline: "border border-border bg-card text-card-foreground shadow-control hover:border-input hover:bg-muted",
        secondary: "border border-transparent bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground",
        ghost: "border border-transparent text-muted-foreground hover:bg-accent hover:text-accent-foreground",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 px-3 text-sm",
        icon: "size-10 p-0",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ComponentPropsWithoutRef<typeof BaseButton>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
  ref?: React.Ref<HTMLButtonElement>;
}

export function Button({ className, disabled, loading = false, ref, size, variant, ...props }: ButtonProps): React.JSX.Element {
  return (
    <BaseButton
      {...props}
      ref={ref}
      data-slot="button"
      data-loading={loading || undefined}
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      className={cn(buttonVariants({ className, size, variant }))}
    />
  );
}
`;
}

export function desktopUiCardContent(mode: DesktopMode = "monorepo"): string {
  return `import * as React from "react";
import { cn } from "${desktopUiUtilitiesSpecifier(mode)}";

export type CardProps = React.HTMLAttributes<HTMLDivElement>;

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, ...props }, ref) => (
    <div ref={ref} data-slot="card" className={cn("rounded-lg border border-border bg-card text-card-foreground shadow-surface", className)} {...props} />
  ),
);
Card.displayName = "Card";

export const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} data-slot="card-header" className={cn("flex flex-col gap-2 p-5 sm:p-6", className)} {...props} />
  ),
);
CardHeader.displayName = "CardHeader";

export interface CardTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {
  as?: "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
}

export const CardTitle = React.forwardRef<HTMLHeadingElement, CardTitleProps>(
  ({ as: Heading = "h3", className, ...props }, ref) => (
    <Heading ref={ref} data-slot="card-title" className={cn("text-lg font-semibold leading-snug tracking-tight", className)} {...props} />
  ),
);
CardTitle.displayName = "CardTitle";

export const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} data-slot="card-description" className={cn("text-sm leading-relaxed text-muted-foreground", className)} {...props} />
  ),
);
CardDescription.displayName = "CardDescription";

export const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} data-slot="card-content" className={cn("p-5 pt-0 sm:p-6 sm:pt-0", className)} {...props} />
  ),
);
CardContent.displayName = "CardContent";

export const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} data-slot="card-footer" className={cn("flex flex-wrap items-center gap-3 p-5 pt-0 sm:p-6 sm:pt-0", className)} {...props} />
  ),
);
CardFooter.displayName = "CardFooter";
`;
}

export function desktopUiInputContent(mode: DesktopMode = "monorepo"): string {
  return `import * as React from "react";
import { cn } from "${desktopUiUtilitiesSpecifier(mode)}";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      data-slot="input"
      className={cn(
        "flex h-10 w-full min-w-0 rounded-md border border-input bg-card px-3 py-2 text-sm ring-offset-background shadow-control transition-colors motion-reduce:transition-none placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-destructive/20",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";
`;
}

export function desktopUiLabelContent(mode: DesktopMode = "monorepo"): string {
  return `import * as React from "react";
import { cn } from "${desktopUiUtilitiesSpecifier(mode)}";

export interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {}

export const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, ...props }, ref) => (
    <label
      ref={ref}
      data-slot="label"
      className={cn("text-sm font-medium leading-5 data-[invalid=true]:text-destructive", className)}
      {...props}
    />
  ),
);
Label.displayName = "Label";
`;
}

export function desktopUiFieldContent(mode: DesktopMode = "monorepo"): string {
  return `import * as React from "react";
import { cn } from "${desktopUiUtilitiesSpecifier(mode)}";
import { Label, type LabelProps } from "./label";

export const FieldGroup = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} data-slot="field-group" className={cn("flex w-full min-w-0 flex-col gap-6", className)} {...props} />
  ),
);
FieldGroup.displayName = "FieldGroup";

export interface FieldProps extends React.HTMLAttributes<HTMLDivElement> {
  "data-invalid"?: boolean;
}

export const Field = React.forwardRef<HTMLDivElement, FieldProps>(
  ({ className, ...props }, ref) => (
    <div ref={ref} data-slot="field" className={cn("flex w-full min-w-0 flex-col gap-2", className)} {...props} />
  ),
);
Field.displayName = "Field";

export const FieldLabel = React.forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, ...props }, ref) => (
    <Label ref={ref} data-slot="field-label" className={cn("group-data-[invalid=true]/field:text-destructive", className)} {...props} />
  ),
);
FieldLabel.displayName = "FieldLabel";

export const FieldDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} data-slot="field-description" className={cn("text-sm leading-relaxed text-muted-foreground", className)} {...props} />
  ),
);
FieldDescription.displayName = "FieldDescription";

export const FieldError = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, children, ...props }, ref) => {
    if (!children) return null;
    return (
      <p ref={ref} data-slot="field-error" role="alert" aria-live="polite" className={cn("text-sm font-medium leading-relaxed text-destructive", className)} {...props}>
        {children}
      </p>
    );
  },
);
FieldError.displayName = "FieldError";
`;
}
